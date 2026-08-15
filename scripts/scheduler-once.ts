import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { runSchedulerOnce } from "@/services/scheduler/scheduler-service";

function parseSource(args: readonly string[]) {
  let sourceId: string | undefined;
  for (const argument of args) {
    if (!argument.startsWith("--source="))
      throw new Error(`Unknown scheduler argument "${argument}".`);
    sourceId = argument.slice("--source=".length);
  }
  return sourceId;
}

async function main() {
  const result = await runSchedulerOnce({
    sourceId: parseSource(process.argv.slice(2)),
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
