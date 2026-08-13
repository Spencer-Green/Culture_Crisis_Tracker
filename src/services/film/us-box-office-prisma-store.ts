import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  US_BOX_OFFICE_DATASET_PAGE,
  US_BOX_OFFICE_DATASET_SLUG,
  US_BOX_OFFICE_PROVENANCE,
} from "@/data-sources/film/us-box-office-types";
import type { USBoxOfficeIngestionStore } from "@/services/film/us-box-office-ingestion-core";

export class PrismaUSBoxOfficeIngestionStore implements USBoxOfficeIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<USBoxOfficeIngestionStore["createRun"]>[0],
  ): Promise<string> {
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

  async persistWeekends(
    input: Parameters<USBoxOfficeIngestionStore["persistWeekends"]>[0],
  ) {
    const existing = await this.prisma.uSBoxOfficeWeekend.findMany({
      where: {
        sourceId: input.sourceId,
        OR: input.records.map((record) => ({
          sourceYear: record.sourceYear,
          weekNumber: record.weekNumber,
        })),
      },
      select: { sourceYear: true, weekNumber: true },
    });
    const existingKeys = new Set(
      existing.map((record) => `${record.sourceYear}:${record.weekNumber}`),
    );
    for (const record of input.records) {
      const data = {
        weekendStart: record.weekendStart,
        weekendEnd: record.weekendEnd,
        sourceDateLabel: record.sourceDateLabel,
        occasion: record.occasion,
        totalGrossUsd: record.totalGrossUsd,
        top10GrossUsd: record.top10GrossUsd,
        overallWowChangePct: record.overallWowChangePct,
        top10WowChangePct: record.top10WowChangePct,
        overallWowChangeLabel: record.overallWowChangeLabel,
        top10WowChangeLabel: record.top10WowChangeLabel,
        releaseCount: record.releaseCount,
        topFilm: record.topFilm,
        datasetSlug: US_BOX_OFFICE_DATASET_SLUG,
        datasetUpdatedAt: input.datasetUpdatedAt,
        sourceUrl: US_BOX_OFFICE_DATASET_PAGE,
        retrievedAt: input.retrievedAt,
        lastSeenAt: input.retrievedAt,
        metadata: {
          sourceFile: record.sourceFile,
          provider: "Kaggle community dataset",
          underlyingProvenance: US_BOX_OFFICE_PROVENANCE,
          status: "provisional-research",
          canonicalSelection: "shortest-duration summary for source year/week",
        } as Prisma.InputJsonValue,
      };
      await this.prisma.uSBoxOfficeWeekend.upsert({
        where: {
          sourceId_sourceYear_weekNumber: {
            sourceId: input.sourceId,
            sourceYear: record.sourceYear,
            weekNumber: record.weekNumber,
          },
        },
        update: data,
        create: {
          ...data,
          sourceId: input.sourceId,
          sourceYear: record.sourceYear,
          weekNumber: record.weekNumber,
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
    input: Parameters<USBoxOfficeIngestionStore["completeRun"]>[0],
  ): Promise<void> {
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
    input: Parameters<USBoxOfficeIngestionStore["failRun"]>[0],
  ): Promise<void> {
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
