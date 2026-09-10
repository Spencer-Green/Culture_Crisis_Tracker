import "dotenv/config";
import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { writeFile } from "node:fs/promises";
import { getPrisma, disconnectPrisma } from "@/lib/prisma";
import { runSchedulerOnce } from "@/services/scheduler/scheduler-service";
import {
  runScheduledResearch,
  PrismaResearchSchedulerHistoryStore,
} from "@/services/research/research-scheduler";
import {
  buildDeepSeekNativeResearchRequest,
  mapDeepSeekNativeResearchResponse,
  sanitizeResearchTraceValue,
  sanitizeResearchDiagnostic,
  DeepSeekResearchResponseError,
} from "@/services/research/deepseek-research-provider";

// Explicit diagnostic only. Uses the normal source lock and records a failed
// research run so probes count toward rolling history. Never admits candidates.
async function main() {
  const args = process.argv.slice(2);
  const model = args.includes("--pro")
    ? "deepseek-v4-pro"
    : "deepseek-v4-flash";
  const choice = args.includes("--required")
    ? "required"
    : { type: "web_search" as const };
  if (
    args.some(
      (arg) =>
        ![
          "--pro",
          "--required",
          "--force-task",
          "--force-rolling-limit",
        ].includes(arg),
    )
  )
    throw new Error("Unknown probe option");
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required");
  const prisma = getPrisma();
  const result = await runSchedulerOnce({
    sourceId: "research-agent",
    forceResearchTaskCadence: args.includes("--force-task"),
    forceResearchRollingLimit: args.includes("--force-rolling-limit"),
    executor: async ({ startedAt }) => {
      await runScheduledResearch({
        prisma,
        historyStore: new PrismaResearchSchedulerHistoryStore(prisma),
        enabled: true,
        apiKey,
        now: startedAt,
        forceTaskCadence: args.includes("--force-task"),
        forceRollingLimit: args.includes("--force-rolling-limit"),
        onCadenceOverride: console.log,
        onRollingLimitOverride: console.log,
        providerFactory: () => ({
          researchWithNativeWeb: async (request) => {
            const client = new OpenAI({
              apiKey,
              baseURL: "https://api.deepseek.com",
              maxRetries: 0,
              timeout: 180_000,
            });
            const start = Date.now();
            const response = await client.responses.create({
              ...buildDeepSeekNativeResearchRequest(request),
              model,
              tool_choice: choice,
            } as unknown as ResponseCreateParamsNonStreaming);
            const diagnostic = {
              model,
              choice,
              latencyMs: Date.now() - start,
              status: response.status,
              usage: response.usage,
              output: response.output
                .filter((item) => item.type !== "reasoning")
                .map((item) =>
                  sanitizeResearchTraceValue(item, { secrets: [apiKey] }),
                ),
              finalText: sanitizeResearchDiagnostic(
                response.output_text ?? "",
                [apiKey],
                12_000,
              ),
            };
            const path = `/tmp/research-probe-${response.id}.json`;
            await writeFile(path, JSON.stringify(diagnostic, null, 2), {
              mode: 0o600,
            });
            console.log(
              JSON.stringify({ diagnosticPath: path, ...diagnostic }),
            );
            const mapped = mapDeepSeekNativeResearchResponse(
              response,
              Date.now() - start,
              [apiKey],
            );
            throw new DeepSeekResearchResponseError(
              "CAPABILITY_PROBE_ONLY: no candidate admission",
              {
                providerRequestId: mapped.providerRequestId,
                model: mapped.model,
                status: mapped.status,
                nativeSearchTrace: mapped.nativeSearchTrace,
                responseDiagnostics: mapped.responseDiagnostics,
                usage: mapped.usage,
                latencyMs: mapped.latencyMs,
              },
              "EXECUTION_FAILURE",
            );
          },
        }),
      });
      return { recordsCreated: 0, recordsUpdated: 0 };
    },
  });
  console.log(JSON.stringify(result.results));
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Probe failed");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
