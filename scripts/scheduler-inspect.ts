import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { getResearchSchedulerInspection } from "@/services/research/research-scheduler";
import { researchSchedulerInspectionLines } from "@/services/research/research-scheduler-core";
import {
  loadScheduleEvaluations,
  schedulerInventory,
} from "@/services/scheduler/scheduler-registry";

async function main() {
  const now = new Date();
  const [evaluations, research] = await Promise.all([
    loadScheduleEvaluations(now),
    getResearchSchedulerInspection(now),
  ]);
  const inventory = new Map(
    schedulerInventory().map((definition) => [definition.sourceId, definition]),
  );
  console.log("Central scheduler dry run — no network requests");
  console.log("Timezone: UTC");
  for (const evaluation of evaluations) {
    const details = inventory.get(evaluation.definition.sourceId)!;
    console.log("");
    console.log(`${evaluation.definition.sourceId}`);
    console.log(`  enabled: ${evaluation.enabled}`);
    console.log(`  class: ${evaluation.definition.schedulingClass}`);
    console.log(
      `  cadence: ${evaluation.definition.cadenceMinutes === null ? "none" : `${evaluation.definition.cadenceMinutes} minutes`}`,
    );
    console.log(
      `  last success: ${evaluation.state?.lastSuccessAt?.toISOString() ?? evaluation.source?.lastSuccessfulSyncAt?.toISOString() ?? "never"}`,
    );
    console.log(
      `  next due: ${evaluation.nextScheduledAt?.toISOString() ?? "not scheduled"}`,
    );
    console.log(`  currently due: ${evaluation.due}`);
    console.log(`  freshness: ${evaluation.freshnessStatus}`);
    console.log(`  action: ${evaluation.action}`);
    console.log(`  routine scope: ${details.routineScope}`);
    console.log(`  request intensity: ${details.requestIntensity}`);
    if (evaluation.definition.sourceId === "research-agent") {
      for (const line of researchSchedulerInspectionLines(research, {
        running: evaluation.running,
        expiresAt: evaluation.state?.lockExpiresAt ?? null,
      })) {
        console.log(line);
      }
    }
  }
}

main()
  .catch(() => {
    console.error("Scheduler inspection could not load operational state.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
