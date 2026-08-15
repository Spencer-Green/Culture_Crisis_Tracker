import type {
  FreshnessStatus,
  ScheduleEvaluation,
} from "@/services/scheduler/types";

export type LatestSourceObservation = {
  period: string | null;
  observedAt: string | null;
};

export type SourceOperationalFreshness = {
  sourceId: string;
  schedulingClass: string;
  cadenceMinutes: number | null;
  status: FreshnessStatus;
  enabled: boolean;
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextScheduledAt: string | null;
  latestObservationPeriod: string | null;
  latestObservationAt: string | null;
  lastRunStatus: string;
  lastCreatedCount: number;
  lastUpdatedCount: number;
  consecutiveFailures: number;
  action: string;
};

function newest(...values: (Date | null | undefined)[]) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value || (latest && value <= latest)) return latest;
    return value;
  }, null);
}

export function buildOperationalFreshness(input: {
  evaluation: ScheduleEvaluation;
  latestObservation: LatestSourceObservation;
  latestIngestionRun?: {
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    recordsCreated: number;
    recordsUpdated: number;
  } | null;
}): SourceOperationalFreshness {
  const { evaluation, latestIngestionRun } = input;
  const lastAttempt = newest(
    evaluation.state?.lastAttemptAt,
    evaluation.source?.lastAttemptedSyncAt,
    latestIngestionRun?.startedAt,
  );
  const lastSuccess = newest(
    evaluation.state?.lastSuccessAt,
    evaluation.source?.lastSuccessfulSyncAt,
    latestIngestionRun?.status === "succeeded"
      ? latestIngestionRun.completedAt
      : null,
  );
  return {
    sourceId: evaluation.definition.sourceId,
    schedulingClass: evaluation.definition.schedulingClass,
    cadenceMinutes: evaluation.definition.cadenceMinutes,
    status: evaluation.freshnessStatus,
    enabled: evaluation.enabled,
    running: evaluation.running,
    lastAttemptAt: lastAttempt?.toISOString() ?? null,
    lastSuccessAt: lastSuccess?.toISOString() ?? null,
    lastFailureAt: evaluation.state?.lastFailureAt?.toISOString() ?? null,
    nextScheduledAt: evaluation.nextScheduledAt?.toISOString() ?? null,
    latestObservationPeriod: input.latestObservation.period,
    latestObservationAt: input.latestObservation.observedAt,
    lastRunStatus:
      evaluation.state?.lastRunStatus ?? latestIngestionRun?.status ?? "never",
    lastCreatedCount:
      evaluation.state?.lastCreatedCount ??
      latestIngestionRun?.recordsCreated ??
      0,
    lastUpdatedCount:
      evaluation.state?.lastUpdatedCount ??
      latestIngestionRun?.recordsUpdated ??
      0,
    consecutiveFailures: evaluation.state?.consecutiveFailures ?? 0,
    action: evaluation.action,
  };
}

export function summarizeFreshness(
  sources: readonly SourceOperationalFreshness[],
) {
  const counts = Object.fromEntries(
    [
      "CURRENT",
      "DUE_SOON",
      "STALE",
      "OVERDUE",
      "BLOCKED",
      "MANUAL",
      "STRUCTURAL",
      "DISABLED",
      "RUNNING",
      "FAILED_RECENTLY",
    ].map((status) => [status, 0]),
  ) as Record<FreshnessStatus, number>;
  for (const source of sources) counts[source.status] += 1;
  return counts;
}
