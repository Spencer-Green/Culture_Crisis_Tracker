CREATE TABLE "SchedulerSourceState" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "schedulingClass" TEXT NOT NULL,
    "cadenceMinutes" INTEGER,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastFailureAt" TIMESTAMPTZ(3),
    "nextScheduledAt" TIMESTAMPTZ(3),
    "lastRunStatus" TEXT NOT NULL DEFAULT 'never',
    "lastRunId" UUID,
    "lastCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "activeRunId" UUID,
    "lockAcquiredAt" TIMESTAMPTZ(3),
    "lockExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SchedulerSourceState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulerSourceState_sourceId_key" ON "SchedulerSourceState"("sourceId");
CREATE UNIQUE INDEX "SchedulerSourceState_activeRunId_key" ON "SchedulerSourceState"("activeRunId");
CREATE INDEX "SchedulerSourceState_nextScheduledAt_idx" ON "SchedulerSourceState"("nextScheduledAt");
CREATE INDEX "SchedulerSourceState_lastRunStatus_idx" ON "SchedulerSourceState"("lastRunStatus");
CREATE INDEX "SchedulerSourceState_lockExpiresAt_idx" ON "SchedulerSourceState"("lockExpiresAt");

ALTER TABLE "SchedulerSourceState"
ADD CONSTRAINT "SchedulerSourceState_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
