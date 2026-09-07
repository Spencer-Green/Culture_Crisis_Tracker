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
  }>;
};

export type ScheduledResearchResult = {
  status: "EXECUTED" | "SKIPPED";
  taskId: string | null;
  skipReason: ResearchSchedulerDecision["skipReason"];
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
    const [runs, rollingRunCount] = await Promise.all([
      this.prisma.researchRun.findMany({
        where: {
          completedAt: { not: null },
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
        where: { completedAt: { gte: input.rollingSince } },
      }),
    ]);
    return {
      runs: runs.map((run) => ({
        ...run,
        completedAt: run.completedAt!,
      })),
      rollingRunCount,
    };
  }
}

export async function loadResearchSchedulerDecision(input: {
  historyStore: ResearchSchedulerHistoryStore;
  enabled: boolean;
  apiKeyConfigured: boolean;
  now: Date;
  tasks?: readonly ScheduledResearchTask[];
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
  });
}

export async function runScheduledResearch(input: {
  prisma: PrismaClient;
  historyStore: ResearchSchedulerHistoryStore;
  enabled: boolean;
  apiKey?: string;
  now: Date;
  tasks?: readonly ScheduledResearchTask[];
  providerFactory?: (apiKey: string) => ResearchProvider;
  executeResearch?: typeof runResearchOnce;
  persistDraft?: typeof persistResearchRunDraft;
}): Promise<ScheduledResearchResult> {
  const tasks = input.tasks ?? SCHEDULED_RESEARCH_TASKS;
  const apiKey = input.apiKey?.trim();
  const decision = await loadResearchSchedulerDecision({
    historyStore: input.historyStore,
    enabled: input.enabled,
    apiKeyConfigured: Boolean(apiKey),
    now: input.now,
    tasks,
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
      persisted: null,
    };
  }

  const task = decision.selectedTask.task;
  const startedAt = input.now;
  const executeResearch = input.executeResearch ?? runResearchOnce;
  const persistDraft = input.persistDraft ?? persistResearchRunDraft;
  const providerFactory =
    input.providerFactory ?? createDeepSeekResearchProvider;
  try {
    const run = await executeResearch({
      taskId: task.id,
      apiKey,
      provider: providerFactory(apiKey!),
      now: startedAt,
    });
    const persisted = await persistDraft(
      input.prisma,
      buildSuccessfulResearchRunDraft(run),
    );
    return {
      status: "EXECUTED",
      taskId: task.id,
      skipReason: null,
      persisted,
    };
  } catch (error) {
    const persisted = await persistDraft(
      input.prisma,
      buildFailedResearchRunDraft({
        task,
        providerId: DEEPSEEK_RESEARCH_PROVIDER,
        modelId: DEEPSEEK_RESEARCH_MODEL,
        error,
        startedAt,
        completedAt: new Date(),
        secrets: [apiKey ?? ""],
      }),
    );
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
