import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  CompleteIngestionRunInput,
  IngestionStore,
  PersistObservationsResult,
} from "@/services/ingestion/types";

function observationKey(periodStart: Date, periodEnd: Date): string {
  return `${periodStart.toISOString()}|${periodEnd.toISOString()}`;
}

export class PrismaIngestionStore implements IngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string> {
    const run = await this.prisma.ingestionRun.create({
      data: {
        sourceId: input.sourceId,
        status: "running",
        startedAt: input.startedAt,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return run.id;
  }

  async markSourceAttempted(
    sourceId: string,
    attemptedAt: Date,
  ): Promise<void> {
    await this.prisma.dataSource.update({
      where: { id: sourceId },
      data: { lastAttemptedSyncAt: attemptedAt },
    });
  }

  async persistMetricObservations(
    input: Parameters<IngestionStore["persistMetricObservations"]>[0],
  ): Promise<PersistObservationsResult> {
    const metricDefinition = await this.prisma.metricDefinition.upsert({
      where: { slug: input.metric.slug },
      update: {
        name: input.metric.name,
        description: input.metric.description,
        unit: input.metric.unit,
        frequency: input.metric.frequency,
        sourceId: input.sourceId,
        countryCode: input.countryCode,
        sectorSlug: input.sectorSlug,
      },
      create: {
        slug: input.metric.slug,
        name: input.metric.name,
        description: input.metric.description,
        unit: input.metric.unit,
        frequency: input.metric.frequency,
        sourceId: input.sourceId,
        countryCode: input.countryCode,
        sectorSlug: input.sectorSlug,
      },
      select: { id: true },
    });

    if (input.observations.length === 0) {
      return { recordsCreated: 0, recordsUpdated: 0 };
    }

    const existing = await this.prisma.metricObservation.findMany({
      where: {
        metricDefinitionId: metricDefinition.id,
        OR: input.observations.map((observation) => ({
          periodStart: observation.periodStart,
          periodEnd: observation.periodEnd,
        })),
      },
      select: {
        periodStart: true,
        periodEnd: true,
      },
    });
    const existingKeys = new Set(
      existing.map((observation) =>
        observationKey(observation.periodStart, observation.periodEnd),
      ),
    );
    const recordsUpdated = input.observations.filter((observation) =>
      existingKeys.has(
        observationKey(observation.periodStart, observation.periodEnd),
      ),
    ).length;

    await this.prisma.$transaction(
      input.observations.map((observation) =>
        this.prisma.metricObservation.upsert({
          where: {
            metricDefinitionId_periodStart_periodEnd: {
              metricDefinitionId: metricDefinition.id,
              periodStart: observation.periodStart,
              periodEnd: observation.periodEnd,
            },
          },
          update: {
            value: observation.value,
            previousValue: observation.previousValue ?? null,
            prePandemicBaseline: observation.prePandemicBaseline ?? null,
            sourceUrl: observation.sourceUrl ?? null,
            retrievedAt: observation.retrievedAt,
            metadata: observation.metadata as Prisma.InputJsonValue,
          },
          create: {
            metricDefinitionId: metricDefinition.id,
            periodStart: observation.periodStart,
            periodEnd: observation.periodEnd,
            value: observation.value,
            previousValue: observation.previousValue ?? null,
            prePandemicBaseline: observation.prePandemicBaseline ?? null,
            sourceUrl: observation.sourceUrl ?? null,
            retrievedAt: observation.retrievedAt,
            metadata: observation.metadata as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    return {
      recordsCreated: input.observations.length - recordsUpdated,
      recordsUpdated,
    };
  }

  async completeRun(input: CompleteIngestionRunInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: input.runId },
        data: {
          status: "succeeded",
          completedAt: input.completedAt,
          recordsRead: input.recordsRead,
          recordsCreated: input.recordsCreated,
          recordsUpdated: input.recordsUpdated,
          errorMessage: null,
        },
      }),
      this.prisma.dataSource.update({
        where: { id: input.sourceId },
        data: { lastSuccessfulSyncAt: input.completedAt },
      }),
    ]);
  }

  async failRun(
    input: Parameters<IngestionStore["failRun"]>[0],
  ): Promise<void> {
    await this.prisma.ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.recordsRead,
        recordsCreated: input.recordsCreated,
        recordsUpdated: input.recordsUpdated,
        errorMessage: input.errorMessage,
      },
    });
  }
}
