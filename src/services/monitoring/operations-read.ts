import "server-only";
import { getPrisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { SCHEDULED_RESEARCH_TASKS } from "@/services/research/research-tasks";

export async function readResearchOperations() {
  const configuration = {
    researchEnabled: env.LLM_RESEARCHER_ENABLED,
    passageSelectionEnabled: env.RESEARCH_AUDITOR_ENABLED,
  };
  try {
    const db = getPrisma();
    const tasks = await Promise.all(
      SCHEDULED_RESEARCH_TASKS.map(async (definition) => {
        const where = { researchTaskId: definition.task.id };
        const [lastAttempt, lastCompleted] = await Promise.all([
          db.researchRun.findFirst({
            where,
            orderBy: { startedAt: "desc" },
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              failureKind: true,
            },
          }),
          db.researchRun.findFirst({
            where: { ...where, status: "SUCCEEDED" },
            orderBy: { completedAt: "desc" },
            select: { completedAt: true },
          }),
        ]);
        return {
          id: definition.task.id,
          sector: definition.task.sector,
          geography: definition.task.geography,
          cadenceMinutes: definition.cadenceMinutes,
          enabled: definition.enabled,
          lastAttempt,
          lastCompleted,
        };
      }),
    );
    const audits = await db.researchAuditRun.findMany({
      where: { researchRunId: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        researchRunId: true,
        modelId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });
    return { available: true, configuration, tasks, audits };
  } catch {
    return { available: false, configuration, tasks: [], audits: [] };
  }
}
