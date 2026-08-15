import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { runSchedulerWorker } from "@/services/scheduler/scheduler-service";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

runSchedulerWorker({ signal: controller.signal })
  .catch(() => {
    console.error("Scheduler worker stopped after an operational failure.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
