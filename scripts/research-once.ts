import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { parseResearchOnceOptions } from "@/services/research/research-cli-core";
import { getResearchTask } from "@/services/research/research-tasks";
import { runSchedulerOnce } from "@/services/scheduler/scheduler-service";
import {
  formatResearchInspection,
  getResearchInspection,
} from "@/services/research/research-staging-read";
import { sanitizeResearchTraceValue } from "@/services/research/deepseek-research-provider";

async function main() {
  const options = parseResearchOnceOptions(process.argv.slice(2));
  getResearchTask(options.taskId);
  // --persist remains accepted for compatibility. All live executions now have
  // durable attempt accounting, including interrupted runs; no untracked CLI path.
  console.log(
    "Live research uses scheduler enablement, locking, cadence and rolling limits. Results are shadow-staged, never canonical or automatically approved.",
  );
  const cycle = await runSchedulerOnce({ sourceId: "research-agent" });
  if (cycle.results.some((result) => result.status === "failed"))
    process.exitCode = 1;
  const inspection = await getResearchInspection({
    taskId: options.taskId,
    limit: 1,
  });
  console.log(formatResearchInspection(inspection));
  if (options.debugSearchTrace) {
    console.log(
      JSON.stringify(
        inspection.runs.map((run) => ({
          runId: run.id,
          trace: sanitizeResearchTraceValue(run.nativeSearchTrace, {
            secrets: [process.env.DEEPSEEK_API_KEY ?? ""],
          }),
        })),
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Research execution failed",
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
