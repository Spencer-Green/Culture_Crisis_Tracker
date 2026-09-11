import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { runSchedulerWorker } from "@/services/scheduler/scheduler-service";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--research-only"))
  throw new Error(
    "Only --research-only is supported; operator cadence overrides are never accepted by the worker.",
  );
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

runSchedulerWorker({
  signal: controller.signal,
  automaticSourceIds: args.includes("--research-only")
    ? ["research-agent"]
    : undefined,
})
  .catch(() => {
    console.error("Scheduler worker stopped after an operational failure.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
