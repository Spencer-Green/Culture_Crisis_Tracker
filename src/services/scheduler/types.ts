import type { SourceSlug } from "@/data-sources/catalog";

export const SCHEDULING_CLASSES = [
  "HIGH_FREQUENCY",
  "DAILY",
  "RELEASE_AWARE",
  "WEEKLY",
  "MONTHLY_CHECK",
  "STRUCTURAL_STATIC",
  "MANUAL_ONLY",
  "DISABLED_OR_BLOCKED",
] as const;

export type SchedulingClass = (typeof SCHEDULING_CLASSES)[number];

export const FRESHNESS_STATUSES = [
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
] as const;

export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export type ScheduledCommand = {
  label: string;
  script: string;
  args: string[];
};

export type ScheduledSourceDefinition = {
  sourceId: SourceSlug;
  schedulingClass: SchedulingClass;
  cadenceMinutes: number | null;
  automatic: boolean;
  networkKind: "networked" | "local-static" | "none";
  publicationFrequency: string;
  requestIntensity: string;
  routineScope: string;
  commands: (now: Date) => ScheduledCommand[];
  blockedReason?: string;
  notes?: string;
};

export type SchedulerRuntimeSource = {
  id: string;
  slug: string;
  enabled: boolean;
  configured: boolean;
  implemented: boolean;
  lastAttemptedSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
};

export type SchedulerStateRecord = {
  sourceId: string;
  schedulingClass: SchedulingClass;
  cadenceMinutes: number | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  nextScheduledAt: Date | null;
  lastRunStatus: string;
  lastRunId: string | null;
  lastCreatedCount: number;
  lastUpdatedCount: number;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
  activeRunId: string | null;
  lockAcquiredAt: Date | null;
  lockExpiresAt: Date | null;
};

export type ScheduleEvaluation = {
  definition: ScheduledSourceDefinition;
  source: SchedulerRuntimeSource | null;
  state: SchedulerStateRecord | null;
  enabled: boolean;
  due: boolean;
  running: boolean;
  nextScheduledAt: Date | null;
  freshnessStatus: FreshnessStatus;
  action: string;
};

export type ScheduledRunResult = {
  sourceId: SourceSlug;
  runId: string | null;
  status: "succeeded" | "failed" | "skipped_locked";
  startedAt: Date;
  completedAt: Date;
  recordsCreated: number;
  recordsUpdated: number;
  errorMessage: string | null;
  durationMs: number;
};
