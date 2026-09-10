import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { parseSchedulerOnceOptions } from "@/services/scheduler/scheduler-cli-core";
import { runSchedulerOnce } from "@/services/scheduler/scheduler-service";

async function main() {
  const options = parseSchedulerOnceOptions(process.argv.slice(2));
  const result = await runSchedulerOnce({
    sourceId: options.sourceId,
    forceResearchTaskCadence: options.forceResearchTaskCadence,
    forceResearchRollingLimit: options.forceResearchRollingLimit,
  });
  console.log(`Scheduler cycle evaluated: ${result.evaluatedAt.toISOString()}`);
  console.log(`Sources selected: ${result.selected}`);
  console.log(
    `Succeeded: ${result.results.filter((item) => item.status === "succeeded").length}`,
  );
  console.log(
    `Failed: ${result.results.filter((item) => item.status === "failed").length}`,
  );
  if (result.results.some((item) => item.status === "failed"))
    process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Scheduler cycle failed.",
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
