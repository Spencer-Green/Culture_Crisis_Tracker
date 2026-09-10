import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  createDeepSeekResearchProvider,
  DEEPSEEK_RESEARCH_MODEL,
  DEEPSEEK_RESEARCH_PROVIDER,
} from "@/services/research/deepseek-research-provider";
import {
  evaluateResearchScheduler,
  RESEARCH_SCHEDULER_ROLLING_WINDOW_MS,
  RESEARCH_SCHEDULER_SOURCE_ID,
  type ResearchRollingRunHistory,
  type ResearchSchedulerDecision,
  type ResearchTaskRunHistory,
  type ScheduledResearchTask,
} from "@/services/research/research-scheduler-core";
import {
  buildFailedResearchRunDraft,
  buildSuccessfulResearchRunDraft,
} from "@/services/research/research-staging-core";
import {
  persistResearchRunDraft,
  reserveResearchRun,
  type PersistedResearchRunResult,
} from "@/services/research/research-staging-store";
import { runResearchOnce } from "@/services/research/research-runner";
import { SCHEDULED_RESEARCH_TASKS } from "@/services/research/research-tasks";
import type { ResearchProvider } from "@/services/research/research-types";
import type { ScheduledSourceExecutor } from "@/services/scheduler/scheduler-core";

export type ResearchSchedulerHistoryStore = {
  loadHistory(input: {
    tasks: readonly ScheduledResearchTask[];
    rollingSince: Date;
  }): Promise<{
    runs: ResearchTaskRunHistory[];
    rollingRunCount: number;
    rollingRuns: ResearchRollingRunHistory[];
  }>;
};

export type ScheduledResearchResult = {
  status: "EXECUTED" | "SKIPPED";
  taskId: string | null;
  skipReason: ResearchSchedulerDecision["skipReason"];
  cadenceBypassed: boolean;
  rollingLimitBypassed: boolean;
  persisted: PersistedResearchRunResult | null;
};

export class PrismaResearchSchedulerHistoryStore implements ResearchSchedulerHistoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async loadHistory(input: {
    tasks: readonly ScheduledResearchTask[];
    rollingSince: Date;
  }) {
    const taskVersions = input.tasks.map(({ task }) => ({
      researchTaskId: task.id,
      researchTaskVersion: task.version,
    }));
    const [runs, rollingRunCount, rollingRuns] = await Promise.all([
      this.prisma.researchRun.findMany({
        where: {
          OR: taskVersions,
        },
        orderBy: { completedAt: "desc" },
        take: Math.max(20, input.tasks.length * 10),
        select: {
          researchTaskId: true,
          researchTaskVersion: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.researchRun.count({
        where: {
          OR: [
            { completedAt: { gte: input.rollingSince } },
            { completedAt: null, startedAt: { gte: input.rollingSince } },
          ],
        },
      }),
      this.prisma.researchRun.findMany({
        where: {
          OR: [
            { completedAt: { gte: input.rollingSince } },
            { completedAt: null, startedAt: { gte: input.rollingSince } },
          ],
        },
        orderBy: { completedAt: "asc" },
        select: {
          id: true,
          researchTaskId: true,
          researchTaskVersion: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);
    return {
      runs: runs.map((run) => ({
        ...run,
        status:
          run.status === "SUCCEEDED"
            ? ("SUCCEEDED" as const)
            : ("FAILED" as const),
        completedAt: run.completedAt ?? run.startedAt,
      })),
      rollingRunCount,
      rollingRuns: rollingRuns.map((run) => ({
        ...run,
        status:
          run.status === "SUCCEEDED"
            ? ("SUCCEEDED" as const)
            : ("FAILED" as const),
        completedAt: run.completedAt ?? run.startedAt,
      })),
    };
  }
}

export async function loadResearchSchedulerDecision(input: {
  historyStore: ResearchSchedulerHistoryStore;
  enabled: boolean;
  apiKeyConfigured: boolean;
  now: Date;
  tasks?: readonly ScheduledResearchTask[];
  forceTaskCadence?: boolean;
  forceRollingLimit?: boolean;
}): Promise<ResearchSchedulerDecision> {
  const tasks = input.tasks ?? SCHEDULED_RESEARCH_TASKS;
  const history = await input.historyStore.loadHistory({
    tasks,
    rollingSince: new Date(
      input.now.getTime() - RESEARCH_SCHEDULER_ROLLING_WINDOW_MS,
    ),
  });
  return evaluateResearchScheduler({
    enabled: input.enabled,
    apiKeyConfigured: input.apiKeyConfigured,
    now: input.now,
    tasks,
    history: history.runs,
    rollingRunCount: history.rollingRunCount,
    rollingRuns: history.rollingRuns,
    forceTaskCadence: input.forceTaskCadence,
    forceRollingLimit: input.forceRollingLimit,
  });
}

export async function runScheduledResearch(input: {
  prisma: PrismaClient;
  historyStore: ResearchSchedulerHistoryStore;
  enabled: boolean;
  apiKey?: string;
  now: Date;
  tasks?: readonly ScheduledResearchTask[];
  forceTaskCadence?: boolean;
  forceRollingLimit?: boolean;
  onCadenceOverride?: (message: string) => void;
  onRollingLimitOverride?: (message: string) => void;
  providerFactory?: (apiKey: string) => ResearchProvider;
  executeResearch?: typeof runResearchOnce;
  persistDraft?: typeof persistResearchRunDraft;
  reserveRun?: typeof reserveResearchRun;
}): Promise<ScheduledResearchResult> {
  const tasks = input.tasks ?? SCHEDULED_RESEARCH_TASKS;
  const apiKey = input.apiKey?.trim();
  const decision = await loadResearchSchedulerDecision({
    historyStore: input.historyStore,
    enabled: input.enabled,
    apiKeyConfigured: Boolean(apiKey),
    now: input.now,
    tasks,
    forceTaskCadence: input.forceTaskCadence,
    forceRollingLimit: input.forceRollingLimit,
  });
  if (decision.skipReason === "MISSING_API_KEY") {
    throw new Error(
      "Scheduled research is enabled but DEEPSEEK_API_KEY is missing.",
    );
  }
  if (!decision.selectedTask) {
    return {
      status: "SKIPPED",
      taskId: null,
      skipReason: decision.skipReason,
      cadenceBypassed: false,
      rollingLimitBypassed: false,
      persisted: null,
    };
  }

  if (decision.cadenceBypassed) {
    input.onCadenceOverride?.(
      "normal task cadence said NO_TASK_DUE; explicit operator --force-task bypassed cadence only; enablement, API key, source lock, rolling limit, one-task limit, provider limits, validation, persistence boundaries, and zero-retry policy remain enforced",
    );
  }

  if (decision.rollingLimitBypassed) {
    const rollingRuns = decision.rollingRuns
      .map((run) => `${run.id}@${run.completedAt.toISOString()}(${run.status})`)
      .join(", ");
    input.onRollingLimitOverride?.(
      `observed rolling executions ${decision.rollingRunCount}/${decision.rollingRunLimit}; in-window runs: ${rollingRuns || "none listed"}; ROLLING_EXECUTION_LIMIT would normally block execution; explicit operator --force-rolling-limit bypassed only the rolling ceiling; enablement, API key, source lock, active-run protection, one-task limit, provider limit, zero retries, validation, staging boundaries, and canonical/review/ingestion prohibitions remain enforced`,
    );
  }

  const task = decision.selectedTask.task;
  const startedAt = input.now;
  const executeResearch = input.executeResearch ?? runResearchOnce;
  const persistDraft = input.persistDraft ?? persistResearchRunDraft;
  const providerFactory =
    input.providerFactory ?? createDeepSeekResearchProvider;
  // A crash or ambiguous provider timeout must still consume execution history.
  // Reservation failure prevents dispatch. The source lock surrounds this path.
  const runId = await (input.reserveRun ?? reserveResearchRun)(
    input.prisma,
    buildFailedResearchRunDraft({
      task,
      providerId: DEEPSEEK_RESEARCH_PROVIDER,
      modelId: DEEPSEEK_RESEARCH_MODEL,
      error: new Error("Execution not completed"),
      startedAt,
      completedAt: startedAt,
    }),
  );
  try {
    const run = await executeResearch({
      taskId: task.id,
      apiKey,
      provider: providerFactory(apiKey!),
      now: startedAt,
    });
    const persisted = await persistDraft(input.prisma, {
      ...buildSuccessfulResearchRunDraft(run),
      runId,
    });
    return {
      status: "EXECUTED",
      taskId: task.id,
      skipReason: null,
      cadenceBypassed: decision.cadenceBypassed,
      rollingLimitBypassed: decision.rollingLimitBypassed,
      persisted,
    };
  } catch (error) {
    const persisted = await persistDraft(input.prisma, {
      ...buildFailedResearchRunDraft({
        task,
        providerId: DEEPSEEK_RESEARCH_PROVIDER,
        modelId: DEEPSEEK_RESEARCH_MODEL,
        error,
        startedAt,
        completedAt: new Date(),
        secrets: [apiKey ?? ""],
      }),
      runId,
    });
    const failureKind =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "STAGE1_EXECUTION_FAILURE";
    throw new Error(
      `Scheduled research task ${task.id} failed (${failureKind}); failure run ${persisted.runId} was staged.`,
    );
  }
}

export function createResearchSchedulerExecutor(input?: {
  prisma?: PrismaClient;
  enabled?: boolean;
  apiKey?: string;
  now?: () => Date;
  forceTaskCadence?: boolean;
  forceRollingLimit?: boolean;
  onCadenceOverride?: (message: string) => void;
  onRollingLimitOverride?: (message: string) => void;
}): ScheduledSourceExecutor {
  const prisma = input?.prisma ?? getPrisma();
  const historyStore = new PrismaResearchSchedulerHistoryStore(prisma);
  return async ({ definition, startedAt }) => {
    if (definition.sourceId !== RESEARCH_SCHEDULER_SOURCE_ID) {
      throw new Error("Research executor received a non-research source.");
    }
    const result = await runScheduledResearch({
      prisma,
      historyStore,
      enabled: input?.enabled ?? env.LLM_RESEARCHER_ENABLED,
      apiKey: input?.apiKey ?? env.DEEPSEEK_API_KEY,
      now: input?.now?.() ?? startedAt,
      forceTaskCadence: input?.forceTaskCadence,
      forceRollingLimit: input?.forceRollingLimit,
      onCadenceOverride: input?.onCadenceOverride,
      onRollingLimitOverride: input?.onRollingLimitOverride,
    });
    return {
      recordsCreated: result.persisted?.candidateIds.length ?? 0,
      recordsUpdated: result.persisted?.sourceDocumentIds.length ?? 0,
    };
  };
}

export async function getResearchSchedulerInspection(
  now = new Date(),
): Promise<ResearchSchedulerDecision> {
  return loadResearchSchedulerDecision({
    historyStore: new PrismaResearchSchedulerHistoryStore(getPrisma()),
    enabled: env.LLM_RESEARCHER_ENABLED,
    apiKeyConfigured: Boolean(env.DEEPSEEK_API_KEY?.trim()),
    now,
  });
}
