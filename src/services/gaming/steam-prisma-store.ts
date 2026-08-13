import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { SteamIngestionStore } from "@/services/gaming/steam-ingestion-core";

export class PrismaSteamIngestionStore implements SteamIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<SteamIngestionStore["createRun"]>[0],
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

  async loadMappedGames(input: { limit: number; offset: number }) {
    const records = await this.prisma.game.findMany({
      where: { steamAppId: { not: null } },
      orderBy: [{ steamAppId: "asc" }, { igdbId: "asc" }],
      distinct: ["steamAppId"],
      skip: input.offset,
      take: input.limit,
      select: { id: true, igdbId: true, name: true, steamAppId: true },
    });
    return records.map((record) => ({
      ...record,
      steamAppId: record.steamAppId!,
    }));
  }

  async persistSnapshots(
    input: Parameters<SteamIngestionStore["persistSnapshots"]>[0],
  ) {
    const existing = await this.prisma.steamGameSnapshot.count({
      where: {
        capturedAt: input.capturedAt,
        gameId: { in: input.observations.map(({ game }) => game.id) },
      },
    });
    for (const { game, observation } of input.observations) {
      const data = {
        sourceId: input.sourceId,
        ingestionRunId: input.runId,
        steamAppId: observation.steamAppId,
        retrievedAt: observation.retrievedAt,
        storeAvailable: observation.storeAvailable,
        currentPlayers: observation.currentPlayers,
        totalReviews: observation.totalReviews,
        positiveReviews: observation.positiveReviews,
        positivePercent: observation.positivePercent,
        reviewScore: observation.reviewScore,
        reviewScoreLabel: observation.reviewScoreLabel,
        currentPrice: observation.currentPrice,
        originalPrice: observation.originalPrice,
        discountPercent: observation.discountPercent,
        currency: observation.currency,
        freeToPlay: observation.freeToPlay,
        storeReleaseDate: observation.releaseDate,
        metadata: {
          storeType: observation.type,
          storeName: observation.name,
          developers: observation.developers,
          publishers: observation.publishers,
          genres: observation.genres,
          comingSoon: observation.comingSoon,
          playerCountSemantics:
            "concurrent players currently connected to Steam",
          reviewCountIsNotSales: true,
          authenticatedRequestUrlPersisted: false,
        } as Prisma.InputJsonValue,
      };
      await this.prisma.steamGameSnapshot.upsert({
        where: {
          gameId_capturedAt: { gameId: game.id, capturedAt: input.capturedAt },
        },
        update: data,
        create: { gameId: game.id, capturedAt: input.capturedAt, ...data },
      });
    }
    return {
      recordsCreated: input.observations.length - existing,
      recordsUpdated: existing,
    };
  }

  async completeRun(
    input: Parameters<SteamIngestionStore["completeRun"]>[0],
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
    input: Parameters<SteamIngestionStore["failRun"]>[0],
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
