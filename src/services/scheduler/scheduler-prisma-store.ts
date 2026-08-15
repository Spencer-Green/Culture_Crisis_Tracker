import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ScheduledSourceDefinition,
  SchedulerRuntimeSource,
  SchedulerStateRecord,
} from "@/services/scheduler/types";
import type { SchedulerExecutionStore } from "@/services/scheduler/scheduler-core";

function nextRun(definition: ScheduledSourceDefinition, completedAt: Date) {
  return definition.cadenceMinutes === null
    ? null
    : new Date(completedAt.getTime() + definition.cadenceMinutes * 60_000);
}

export class PrismaSchedulerStore implements SchedulerExecutionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listStates(): Promise<SchedulerStateRecord[]> {
    const records = await this.prisma.schedulerSourceState.findMany();
    return records.map((record) => ({
      sourceId: record.sourceId,
      schedulingClass:
        record.schedulingClass as SchedulerStateRecord["schedulingClass"],
      cadenceMinutes: record.cadenceMinutes,
      lastAttemptAt: record.lastAttemptAt,
      lastSuccessAt: record.lastSuccessAt,
      lastFailureAt: record.lastFailureAt,
      nextScheduledAt: record.nextScheduledAt,
      lastRunStatus: record.lastRunStatus,
      lastRunId: record.lastRunId,
      lastCreatedCount: record.lastCreatedCount,
      lastUpdatedCount: record.lastUpdatedCount,
      consecutiveFailures: record.consecutiveFailures,
      lastErrorMessage: record.lastErrorMessage,
      activeRunId: record.activeRunId,
      lockAcquiredAt: record.lockAcquiredAt,
      lockExpiresAt: record.lockExpiresAt,
    }));
  }

  async ensureState(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    nextScheduledAt: Date | null;
  }) {
    await this.prisma.schedulerSourceState.upsert({
      where: { sourceId: input.source.id },
      update: {
        schedulingClass: input.definition.schedulingClass,
        cadenceMinutes: input.definition.cadenceMinutes,
      },
      create: {
        sourceId: input.source.id,
        schedulingClass: input.definition.schedulingClass,
        cadenceMinutes: input.definition.cadenceMinutes,
        nextScheduledAt: input.nextScheduledAt,
      },
    });
  }

  async acquire(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    now: Date;
    lockExpiresAt: Date;
  }) {
    await this.ensureState({
      definition: input.definition,
      source: input.source,
      nextScheduledAt: input.now,
    });
    return this.prisma.$transaction(async (transaction) => {
      const recentProviderRun = await transaction.ingestionRun.findFirst({
        where: {
          sourceId: input.source.id,
          status: "running",
          startedAt: {
            gt: new Date(input.now.getTime() - 180 * 60_000),
          },
        },
        select: { id: true },
      });
      if (recentProviderRun) return false;
      const acquired = await transaction.schedulerSourceState.updateMany({
        where: {
          sourceId: input.source.id,
          OR: [
            { activeRunId: null },
            { lockExpiresAt: null },
            { lockExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          schedulingClass: input.definition.schedulingClass,
          cadenceMinutes: input.definition.cadenceMinutes,
          activeRunId: input.runId,
          lockAcquiredAt: input.now,
          lockExpiresAt: input.lockExpiresAt,
          lastAttemptAt: input.now,
          lastRunStatus: "running",
          lastErrorMessage: null,
        },
      });
      return acquired.count === 1;
    });
  }

  async complete(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    completedAt: Date;
    recordsCreated: number;
    recordsUpdated: number;
  }) {
    await this.prisma.schedulerSourceState.updateMany({
      where: { sourceId: input.source.id, activeRunId: input.runId },
      data: {
        lastSuccessAt: input.completedAt,
        nextScheduledAt: nextRun(input.definition, input.completedAt),
        lastRunStatus: "succeeded",
        lastRunId: input.runId,
        lastCreatedCount: input.recordsCreated,
        lastUpdatedCount: input.recordsUpdated,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        activeRunId: null,
        lockAcquiredAt: null,
        lockExpiresAt: null,
      },
    });
  }

  async fail(input: {
    definition: ScheduledSourceDefinition;
    source: SchedulerRuntimeSource;
    runId: string;
    completedAt: Date;
    errorMessage: string;
  }) {
    await this.prisma.schedulerSourceState.updateMany({
      where: { sourceId: input.source.id, activeRunId: input.runId },
      data: {
        lastFailureAt: input.completedAt,
        nextScheduledAt: nextRun(input.definition, input.completedAt),
        lastRunStatus: "failed",
        lastRunId: input.runId,
        lastCreatedCount: 0,
        lastUpdatedCount: 0,
        consecutiveFailures: { increment: 1 },
        lastErrorMessage: input.errorMessage,
        activeRunId: null,
        lockAcquiredAt: null,
        lockExpiresAt: null,
      },
    });
  }

  async ingestionCounts(sourceId: string, startedAt: Date) {
    const runs = await this.prisma.ingestionRun.findMany({
      where: { sourceId, startedAt: { gte: startedAt } },
      select: {
        status: true,
        recordsCreated: true,
        recordsUpdated: true,
      },
    });
    const failed = runs.find((run) => run.status === "failed");
    if (failed) throw new Error("Scheduled provider ingestion failed.");
    if (runs.length === 0)
      throw new Error("Scheduled provider did not record an ingestion run.");
    return runs.reduce(
      (total, run) => ({
        recordsCreated: total.recordsCreated + run.recordsCreated,
        recordsUpdated: total.recordsUpdated + run.recordsUpdated,
      }),
      { recordsCreated: 0, recordsUpdated: 0 },
    );
  }
}
