import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { SCREEN_AUSTRALIA_WIDGET_URL } from "@/data-sources/film/screen-australia-types";
import type { ScreenAustraliaIngestionStore } from "@/services/film/screen-australia-ingestion-core";

function identity(record: {
  reportDate: Date;
  periodType: string;
  rank: number;
  normalizedTitle: string;
}) {
  return `${record.reportDate.toISOString().slice(0, 10)}:${record.periodType}:${record.rank}:${record.normalizedTitle}`;
}

export class PrismaScreenAustraliaIngestionStore implements ScreenAustraliaIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<ScreenAustraliaIngestionStore["createRun"]>[0],
  ) {
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

  async markSourceAttempted(sourceId: string, attemptedAt: Date) {
    await this.prisma.dataSource.update({
      where: { id: sourceId },
      data: { lastAttemptedSyncAt: attemptedAt },
    });
  }

  async persistObservations(
    input: Parameters<ScreenAustraliaIngestionStore["persistObservations"]>[0],
  ) {
    const existing =
      await this.prisma.screenAustraliaBoxOfficeObservation.findMany({
        where: {
          sourceId: input.sourceId,
          OR: input.records.map((record) => ({
            reportDate: record.reportDate,
            periodType: record.periodType,
            rank: record.rank,
            normalizedTitle: record.normalizedTitle,
          })),
        },
        select: {
          reportDate: true,
          periodType: true,
          rank: true,
          normalizedTitle: true,
        },
      });
    const existingKeys = new Set(existing.map(identity));
    const groups = new Map<string, (typeof input.records)[number][]>();
    for (const record of input.records) {
      const key = `${record.reportDate.toISOString().slice(0, 10)}:${record.periodType}`;
      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    }
    for (const records of groups.values()) {
      const first = records[0];
      await this.prisma.screenAustraliaBoxOfficeObservation.deleteMany({
        where: {
          sourceId: input.sourceId,
          reportDate: first.reportDate,
          periodType: first.periodType,
          NOT: {
            OR: records.map((record) => ({
              rank: record.rank,
              normalizedTitle: record.normalizedTitle,
            })),
          },
        },
      });
    }
    for (const record of input.records) {
      const data = {
        title: record.title,
        periodGrossAud: record.periodGrossAud,
        cumulativeGrossAud: record.cumulativeGrossAud,
        releaseWeeks: record.releaseWeeks,
        sourceUrl: SCREEN_AUSTRALIA_WIDGET_URL,
        retrievedAt: input.retrievedAt,
        lastSeenAt: input.retrievedAt,
        metadata: {
          provider: "Screen Australia",
          access: "public-widget-html",
          status: "provisional-private-research",
          fullMarketTotal: false,
          historicalBackfill: false,
        } as Prisma.InputJsonValue,
      };
      await this.prisma.screenAustraliaBoxOfficeObservation.upsert({
        where: {
          sourceId_reportDate_periodType_rank_normalizedTitle: {
            sourceId: input.sourceId,
            reportDate: record.reportDate,
            periodType: record.periodType,
            rank: record.rank,
            normalizedTitle: record.normalizedTitle,
          },
        },
        update: data,
        create: {
          ...data,
          sourceId: input.sourceId,
          reportDate: record.reportDate,
          periodType: record.periodType,
          rank: record.rank,
          title: record.title,
          normalizedTitle: record.normalizedTitle,
          firstSeenAt: input.retrievedAt,
        },
      });
    }
    return {
      recordsCreated: input.records.length - existingKeys.size,
      recordsUpdated: existingKeys.size,
    };
  }

  async completeRun(
    input: Parameters<ScreenAustraliaIngestionStore["completeRun"]>[0],
  ) {
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
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      }),
      this.prisma.dataSource.update({
        where: { id: input.sourceId },
        data: { lastSuccessfulSyncAt: input.completedAt },
      }),
    ]);
  }

  async failRun(
    input: Parameters<ScreenAustraliaIngestionStore["failRun"]>[0],
  ) {
    await this.prisma.ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.recordsRead,
        errorMessage: input.errorMessage,
      },
    });
  }
}
