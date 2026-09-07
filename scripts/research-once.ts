import "dotenv/config";

import { createDeepSeekResearchProvider } from "@/services/research/deepseek-research-provider";
import { disconnectPrisma } from "@/lib/prisma";
import {
  DEEPSEEK_RESEARCH_MODEL,
  DEEPSEEK_RESEARCH_PROVIDER,
} from "@/services/research/deepseek-research-provider";
import {
  parseResearchOnceOptions,
  persistResearchResultWhenRequested,
} from "@/services/research/research-cli-core";
import {
  formatResearchFailure,
  formatResearchRun,
} from "@/services/research/research-cli-output";
import {
  ResearchExecutionError,
  runResearchOnce,
} from "@/services/research/research-runner";
import {
  buildFailedResearchRunDraft,
  buildSuccessfulResearchRunDraft,
} from "@/services/research/research-staging-core";
import { persistResearchRun } from "@/services/research/research-staging-store";
import { getResearchTask } from "@/services/research/research-tasks";

async function main() {
  const options = parseResearchOnceOptions(process.argv.slice(2));
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const startedAt = new Date();
  try {
    if (!apiKey) {
      throw new ResearchExecutionError(
        "DEEPSEEK_API_KEY is required before live research can be sent.",
      );
    }
    const run = await runResearchOnce({
      taskId: options.taskId,
      apiKey,
      provider: createDeepSeekResearchProvider(apiKey),
      now: startedAt,
    });
    const persisted = await persistResearchResultWhenRequested({
      persist: options.persist,
      value: buildSuccessfulResearchRunDraft(run),
      writer: persistResearchRun,
    });
    console.log(formatResearchRun(run, [apiKey], persisted));
  } catch (error) {
    let persistedRunId: string | null = null;
    if (options.persist) {
      try {
        const persisted = await persistResearchRun(
          buildFailedResearchRunDraft({
            task: getResearchTask(options.taskId),
            providerId: DEEPSEEK_RESEARCH_PROVIDER,
            modelId: DEEPSEEK_RESEARCH_MODEL,
            error,
            startedAt,
            completedAt: new Date(),
            secrets: [apiKey ?? ""],
          }),
        );
        persistedRunId = persisted.runId;
      } catch (persistenceError) {
        console.error(
          `Research failure could not be staged: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
        );
      }
    }
    console.error(formatResearchFailure(error, [apiKey ?? ""]));
    if (persistedRunId) console.error(`STAGING RUN: ${persistedRunId}`);
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

main();
