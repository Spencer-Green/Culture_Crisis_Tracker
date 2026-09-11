import type {
  FreshnessStatus,
  ScheduleEvaluation,
  ScheduledRunResult,
  ScheduledSourceDefinition,
  SchedulerRuntimeSource,
  SchedulerStateRecord,
} from "@/services/scheduler/types";

const MINUTE_MS = 60_000;

function latestDate(...values: (Date | null | undefined)[]) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value || (latest && value <= latest)) return latest;
    return value;
  }, null);
}

export function lockCanBeAcquired(
  state: Pick<SchedulerStateRecord, "activeRunId" | "lockExpiresAt"> | null,
  now: Date,
) {
  return (
    !state?.activeRunId ||
    !state.lockExpiresAt ||
    state.lockExpiresAt.getTime() <= now.getTime()
  );
}

function initialDelayMinutes(sourceId: string) {
  return (
    15 +
    ([...sourceId].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) %
      45)
  );
}

export function calculateNextScheduledAt(input: {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource | null;
  state: SchedulerStateRecord | null;
  now: Date;
}) {
  if (!input.definition.automatic || input.definition.cadenceMinutes === null)
    return null;
  if (input.state?.nextScheduledAt) return input.state.nextScheduledAt;
  const lastSuccess = latestDate(
    input.state?.lastSuccessAt,
    input.source?.lastSuccessfulSyncAt,
  );
  if (lastSuccess) {
    return new Date(
      lastSuccess.getTime() + input.definition.cadenceMinutes * MINUTE_MS,
    );
  }
  return new Date(
    input.now.getTime() +
      initialDelayMinutes(input.definition.sourceId) * MINUTE_MS,
  );
}

export function deriveFreshnessStatus(input: {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource | null;
  state: SchedulerStateRecord | null;
  now: Date;
}): FreshnessStatus {
  const { definition, source, state, now } = input;
  if (definition.schedulingClass === "STRUCTURAL_STATIC") return "STRUCTURAL";
  if (definition.schedulingClass === "MANUAL_ONLY") return "MANUAL";
  if (definition.schedulingClass === "DISABLED_OR_BLOCKED") {
    return definition.blockedReason?.includes("429") ? "BLOCKED" : "DISABLED";
  }
  if (!source?.implemented || !source.enabled || !source.configured)
    return "DISABLED";
  if (state?.activeRunId && state.lockExpiresAt && state.lockExpiresAt > now)
    return "RUNNING";
  if (
    state?.lastRunStatus === "failed" &&
    state.lastFailureAt &&
    state.lastFailureAt >=
      (latestDate(state.lastSuccessAt, source.lastSuccessfulSyncAt) ??
        new Date(0))
  )
    return "FAILED_RECENTLY";
  if (definition.cadenceMinutes === null) return "MANUAL";
  const lastSuccess = latestDate(
    state?.lastSuccessAt,
    source.lastSuccessfulSyncAt,
  );
  if (!lastSuccess) return "STALE";
  const ageMinutes = (now.getTime() - lastSuccess.getTime()) / MINUTE_MS;
  if (ageMinutes < definition.cadenceMinutes * 0.75) return "CURRENT";
  if (ageMinutes < definition.cadenceMinutes) return "DUE_SOON";
  if (ageMinutes < definition.cadenceMinutes * 2) return "STALE";
  return "OVERDUE";
}

export function evaluateScheduledSource(input: {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource | null;
  state: SchedulerStateRecord | null;
  now: Date;
}): ScheduleEvaluation {
  const nextScheduledAt = calculateNextScheduledAt(input);
  const freshnessStatus = deriveFreshnessStatus(input);
  const running = freshnessStatus === "RUNNING";
  const enabled = Boolean(
    input.definition.automatic &&
    input.source?.implemented &&
    input.source.enabled &&
    input.source.configured,
  );
  const due = Boolean(
    enabled &&
    !running &&
    nextScheduledAt &&
    nextScheduledAt.getTime() <= input.now.getTime(),
  );
  let action = due ? "run" : "wait";
  if (running) action = "already running";
  if (freshnessStatus === "STRUCTURAL") action = "structural; no routine run";
  if (freshnessStatus === "MANUAL") action = "manual only";
  if (freshnessStatus === "BLOCKED") action = "blocked; manual retry only";
  if (freshnessStatus === "DISABLED") action = "disabled";
  if (!input.state && !input.source?.lastSuccessfulSyncAt && enabled)
    action = "initialize with staggered first run";
  return {
    definition: input.definition,
    source: input.source,
    state: input.state,
    enabled,
    due,
    running,
    nextScheduledAt,
    freshnessStatus,
    action,
  };
}

export function selectScheduleEvaluations(
  evaluations: readonly ScheduleEvaluation[],
  sourceId?: string,
  automaticSourceIds?: readonly string[],
) {
  if (sourceId && automaticSourceIds)
    throw new Error(
      "Automatic source scope cannot be combined with an operator source override.",
    );
  if (!sourceId)
    return evaluations.filter(
      (evaluation) =>
        evaluation.due &&
        (!automaticSourceIds ||
          automaticSourceIds.includes(evaluation.definition.sourceId)),
    );
  const known = evaluations.find(
    (evaluation) => evaluation.definition.sourceId === sourceId,
  );
  if (!known) throw new Error(`Unknown scheduler source ${sourceId}.`);
  if (!known.enabled || known.running) {
    throw new Error(
      `Source ${sourceId} is not eligible for automatic execution (${known.action}).`,
    );
  }
  return [known];
}

export interface SchedulerExecutionStore {
  acquire(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    now: Date;
    lockExpiresAt: Date;
  }): Promise<boolean>;
  complete(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    completedAt: Date;
    recordsCreated: number;
    recordsUpdated: number;
  }): Promise<void>;
  fail(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    completedAt: Date;
    errorMessage: string;
  }): Promise<void>;
}

export type ScheduledSourceExecutor = (input: {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource;
  runId: string;
  startedAt: Date;
}) => Promise<{ recordsCreated: number; recordsUpdated: number }>;

export async function executeScheduledSource(input: {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource;
  store: SchedulerExecutionStore;
  executor: ScheduledSourceExecutor;
  runId: string;
  now: () => Date;
  lockMinutes?: number;
}): Promise<ScheduledRunResult> {
  const startedAt = input.now();
  const acquired = await input.store.acquire({
    definition: input.definition,
    source: input.source,
    runId: input.runId,
    now: startedAt,
    lockExpiresAt: new Date(
      startedAt.getTime() + (input.lockMinutes ?? 180) * MINUTE_MS,
    ),
  });
  if (!acquired) {
    return {
      sourceId: input.definition.sourceId,
      runId: null,
      status: "skipped_locked",
      startedAt,
      completedAt: startedAt,
      recordsCreated: 0,
      recordsUpdated: 0,
      errorMessage: null,
      durationMs: 0,
    };
  }
  try {
    const counts = await input.executor({
      definition: input.definition,
      source: input.source,
      runId: input.runId,
      startedAt,
    });
    const completedAt = input.now();
    await input.store.complete({
      definition: input.definition,
      source: input.source,
      runId: input.runId,
      completedAt,
      ...counts,
    });
    return {
      sourceId: input.definition.sourceId,
      runId: input.runId,
      status: "succeeded",
      startedAt,
      completedAt,
      ...counts,
      errorMessage: null,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const completedAt = input.now();
    const errorMessage =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Scheduled ingestion failed.";
    await input.store.fail({
      definition: input.definition,
      source: input.source,
      runId: input.runId,
      completedAt,
      errorMessage,
    });
    return {
      sourceId: input.definition.sourceId,
      runId: input.runId,
      status: "failed",
      startedAt,
      completedAt,
      recordsCreated: 0,
      recordsUpdated: 0,
      errorMessage,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }
}

export async function runWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}
