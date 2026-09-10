import type { ResearchTaskV1 } from "@/services/research/research-types";

export const RESEARCH_SCHEDULER_SOURCE_ID = "research-agent";
export const RESEARCH_SCHEDULER_INSPECTION_CADENCE_MINUTES = 12 * 60;
export const RESEARCH_SCHEDULER_MAX_TASKS_PER_CYCLE = 1;
export const RESEARCH_SCHEDULER_ROLLING_EXECUTION_LIMIT = 2;
export const RESEARCH_SCHEDULER_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type ScheduledResearchTask = {
  task: ResearchTaskV1;
  enabled: boolean;
  cadenceMinutes: number;
  priority: number;
};

export type ResearchTaskRunHistory = {
  researchTaskId: string;
  researchTaskVersion: string;
  status: "SUCCEEDED" | "FAILED";
  startedAt: Date;
  completedAt: Date;
};

export type ResearchRollingRunHistory = ResearchTaskRunHistory & {
  id: string;
};

export type ResearchSchedulerSkipReason =
  "DISABLED" | "MISSING_API_KEY" | "ROLLING_EXECUTION_LIMIT" | "NO_TASK_DUE";

export type ResearchTaskDueState = {
  task: ScheduledResearchTask;
  lastRun: ResearchTaskRunHistory | null;
  nextDueAt: Date;
  due: boolean;
};

export type ResearchSchedulerDecision = {
  enabled: boolean;
  forceTaskCadenceRequested: boolean;
  cadenceBypassed: boolean;
  forceRollingLimitRequested: boolean;
  rollingLimitBypassed: boolean;
  taskCount: number;
  rollingRunCount: number;
  rollingRunLimit: number;
  rollingRuns: ResearchRollingRunHistory[];
  tasks: ResearchTaskDueState[];
  selectedTask: ScheduledResearchTask | null;
  skipReason: ResearchSchedulerSkipReason | null;
  lastRun: ResearchTaskRunHistory | null;
  nextDueAt: Date | null;
};

function latestRunForTask(
  task: ScheduledResearchTask,
  history: readonly ResearchTaskRunHistory[],
): ResearchTaskRunHistory | null {
  return (
    history
      .filter(
        (run) =>
          run.researchTaskId === task.task.id &&
          run.researchTaskVersion === task.task.version,
      )
      .sort(
        (left, right) =>
          right.completedAt.getTime() - left.completedAt.getTime(),
      )[0] ?? null
  );
}

export function evaluateResearchScheduler(input: {
  enabled: boolean;
  apiKeyConfigured: boolean;
  now: Date;
  tasks: readonly ScheduledResearchTask[];
  history: readonly ResearchTaskRunHistory[];
  rollingRunCount: number;
  rollingRunLimit?: number;
  rollingRuns?: readonly ResearchRollingRunHistory[];
  forceTaskCadence?: boolean;
  forceRollingLimit?: boolean;
}): ResearchSchedulerDecision {
  const rollingRunLimit =
    input.rollingRunLimit ?? RESEARCH_SCHEDULER_ROLLING_EXECUTION_LIMIT;
  const tasks = input.tasks
    .filter((task) => task.enabled)
    .map((task) => {
      const lastRun = latestRunForTask(task, input.history);
      const nextDueAt = lastRun
        ? new Date(lastRun.completedAt.getTime() + task.cadenceMinutes * 60_000)
        : input.now;
      return {
        task,
        lastRun,
        nextDueAt,
        due: nextDueAt.getTime() <= input.now.getTime(),
      };
    })
    .sort(
      (left, right) =>
        right.task.priority - left.task.priority ||
        left.nextDueAt.getTime() - right.nextDueAt.getTime() ||
        left.task.task.id.localeCompare(right.task.task.id),
    );
  const lastRun =
    [...input.history].sort(
      (left, right) => right.completedAt.getTime() - left.completedAt.getTime(),
    )[0] ?? null;
  const nextDueAt =
    [...tasks].sort(
      (left, right) => left.nextDueAt.getTime() - right.nextDueAt.getTime(),
    )[0]?.nextDueAt ?? null;
  const forceTaskCadenceRequested = input.forceTaskCadence ?? false;
  const forceRollingLimitRequested = input.forceRollingLimit ?? false;
  const dueTask = tasks.find((task) => task.due)?.task ?? null;
  let skipReason: ResearchSchedulerSkipReason | null = null;
  if (!input.enabled) skipReason = "DISABLED";
  else if (!input.apiKeyConfigured) skipReason = "MISSING_API_KEY";
  else if (
    input.rollingRunCount >= rollingRunLimit &&
    !forceRollingLimitRequested
  ) {
    skipReason = "ROLLING_EXECUTION_LIMIT";
  } else if (!dueTask && !(forceTaskCadenceRequested && tasks.length > 0)) {
    skipReason = "NO_TASK_DUE";
  }
  const cadenceBypassed = Boolean(
    forceTaskCadenceRequested && !skipReason && !dueTask && tasks.length > 0,
  );
  const rollingLimitBypassed = Boolean(
    forceRollingLimitRequested &&
    !skipReason &&
    input.rollingRunCount >= rollingRunLimit,
  );
  const selectedTask = skipReason
    ? null
    : (dueTask ?? (cadenceBypassed ? (tasks[0]?.task ?? null) : null));
  return {
    enabled: input.enabled,
    forceTaskCadenceRequested,
    cadenceBypassed,
    forceRollingLimitRequested,
    rollingLimitBypassed,
    taskCount: tasks.length,
    rollingRunCount: input.rollingRunCount,
    rollingRunLimit,
    rollingRuns: [...(input.rollingRuns ?? [])],
    tasks,
    selectedTask,
    skipReason,
    lastRun,
    nextDueAt,
  };
}

export function researchSchedulerInspectionLines(
  decision: ResearchSchedulerDecision,
  lock: { running: boolean; expiresAt: Date | null },
): string[] {
  return [
    `  research tasks: ${decision.taskCount}`,
    `  due research task: ${decision.selectedTask?.task.id ?? "none"}`,
    `  last research run: ${decision.lastRun?.completedAt.toISOString() ?? "never"}`,
    `  last research status: ${decision.lastRun?.status ?? "never"}`,
    `  next task due: ${decision.nextDueAt?.toISOString() ?? "not scheduled"}`,
    `  rolling 24h executions: ${decision.rollingRunCount}/${decision.rollingRunLimit}`,
    `  research skip reason: ${decision.skipReason ?? "none"}`,
    `  lock: ${lock.running ? `active until ${lock.expiresAt?.toISOString() ?? "unknown"}` : "available"}`,
  ];
}
