import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { broadwayBusinessProvenance } from "@/data-sources/theatre/broadway-business-api";
import type { BroadwayBusinessIngestionStore } from "@/services/theatre/broadway-business-ingestion-core";

export class PrismaBroadwayBusinessIngestionStore implements BroadwayBusinessIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<BroadwayBusinessIngestionStore["createRun"]>[0],
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

  async persistWeeks(
    input: Parameters<BroadwayBusinessIngestionStore["persistWeeks"]>[0],
  ) {
    const existing = await this.prisma.broadwayMarketWeek.findMany({
      where: {
        sourceId: input.sourceId,
        weekEnding: { in: input.records.map((record) => record.weekEnding) },
      },
      select: { weekEnding: true },
    });
    const existingKeys = new Set(
      existing.map((record) => record.weekEnding.toISOString()),
    );
    for (const record of input.records) {
      const metadata = {
        ...record.metadata,
        ...broadwayBusinessProvenance(),
        safeChartUrl: input.chartUrl,
        grossSemantics: "Nominal USD weekly Broadway gross",
        attendanceSemantics: "Realized weekly Broadway attendance",
      } as Prisma.InputJsonValue;
      const data = {
        sourceWeekId: record.sourceWeekId,
        seasonWeekNumber: record.seasonWeekNumber,
        weekStart: record.weekStart,
        grossUsd: record.grossUsd,
        attendance: record.attendance,
        showCount: record.showCount,
        capacityPct: record.capacityPct,
        averageTicketPriceUsd: record.averageTicketPriceUsd,
        performanceCount: record.performanceCount,
        previewCount: record.previewCount,
        sourceUrl: input.sourceUrl,
        retrievedAt: input.retrievedAt,
        lastSeenAt: input.retrievedAt,
        metadata,
      };
      await this.prisma.broadwayMarketWeek.upsert({
        where: {
          sourceId_weekEnding: {
            sourceId: input.sourceId,
            weekEnding: record.weekEnding,
          },
        },
        update: data,
        create: {
          ...data,
          sourceId: input.sourceId,
          weekEnding: record.weekEnding,
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
    input: Parameters<BroadwayBusinessIngestionStore["completeRun"]>[0],
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
    input: Parameters<BroadwayBusinessIngestionStore["failRun"]>[0],
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
