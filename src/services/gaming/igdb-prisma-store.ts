import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { IgdbIngestionStore } from "@/services/gaming/igdb-ingestion-core";

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function gameData(
  game: Parameters<IgdbIngestionStore["persistGames"]>[0]["games"][number],
  sourceId: string,
  retrievedAt: Date,
) {
  return {
    sourceId,
    name: game.name,
    slug: game.slug,
    firstReleaseDate: game.firstReleaseDate,
    gameTypeId: game.gameType.igdbId,
    gameTypeName: game.gameType.name,
    gameStatusId: game.gameStatus?.igdbId ?? null,
    gameStatusName: game.gameStatus?.name ?? null,
    parentIgdbId: game.parentIgdbId,
    versionParentIgdbId: game.versionParentIgdbId,
    steamAppId: game.steamAppId,
    igdbCreatedAt: game.igdbCreatedAt,
    igdbUpdatedAt: game.igdbUpdatedAt,
    lastSeenAt: retrievedAt,
    retrievedAt,
    metadata: {
      themes: game.themes,
      inclusionPolicy:
        "Company-attributed IGDB game types 0, 4, 8, and 9; cancelled, rumored, and version-parent records excluded",
      steamMappingMethod: game.steamAppId
        ? "IGDB external game source 1"
        : null,
    } as Prisma.InputJsonValue,
  };
}

export class PrismaIgdbIngestionStore implements IgdbIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<IgdbIngestionStore["createRun"]>[0],
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

  async persistGames(input: Parameters<IgdbIngestionStore["persistGames"]>[0]) {
    const existing = new Map<number, string>();
    for (const batch of chunks(
      input.games.map((game) => game.igdbId),
      500,
    )) {
      const records = await this.prisma.game.findMany({
        where: { igdbId: { in: batch } },
        select: { id: true, igdbId: true },
      });
      for (const record of records) existing.set(record.igdbId, record.id);
    }

    const companyRecords = new Map<
      number,
      Parameters<
        IgdbIngestionStore["persistGames"]
      >[0]["games"][number]["companies"][number]
    >();
    for (const company of input.games.flatMap((game) => game.companies)) {
      companyRecords.set(company.igdbId, company);
    }
    const existingCompanies = new Map<number, { id: string; name: string }>();
    for (const batch of chunks([...companyRecords.keys()], 500)) {
      const records = await this.prisma.gameCompany.findMany({
        where: { igdbId: { in: batch } },
        select: { id: true, igdbId: true, name: true },
      });
      for (const record of records)
        existingCompanies.set(record.igdbId, record);
    }
    for (const batch of chunks(
      [...companyRecords.values()].filter(
        (company) => !existingCompanies.has(company.igdbId),
      ),
      1_000,
    )) {
      await this.prisma.gameCompany.createMany({
        data: batch.map((company) => ({
          igdbId: company.igdbId,
          name: company.name,
          firstSeenAt: input.retrievedAt,
          lastSeenAt: input.retrievedAt,
        })),
        skipDuplicates: true,
      });
    }
    for (const company of companyRecords.values()) {
      const current = existingCompanies.get(company.igdbId);
      if (current && current.name !== company.name) {
        await this.prisma.gameCompany.update({
          where: { id: current.id },
          data: { name: company.name },
        });
      }
    }
    for (const batch of chunks([...companyRecords.keys()], 1_000)) {
      await this.prisma.gameCompany.updateMany({
        where: { igdbId: { in: batch } },
        data: { lastSeenAt: input.retrievedAt },
      });
    }
    const companies = new Map<number, string>();
    for (const batch of chunks([...companyRecords.keys()], 500)) {
      const records = await this.prisma.gameCompany.findMany({
        where: { igdbId: { in: batch } },
        select: { id: true, igdbId: true },
      });
      for (const record of records) companies.set(record.igdbId, record.id);
    }

    for (const batch of chunks(input.games, 250)) {
      const newGames = batch.filter((game) => !existing.has(game.igdbId));
      if (newGames.length > 0) {
        await this.prisma.game.createMany({
          data: newGames.map((game) => ({
            igdbId: game.igdbId,
            firstSeenAt: input.retrievedAt,
            ...gameData(game, input.sourceId, input.retrievedAt),
          })),
          skipDuplicates: true,
        });
      }
      for (const game of batch) {
        if (existing.has(game.igdbId)) {
          await this.prisma.game.update({
            where: { igdbId: game.igdbId },
            data: gameData(game, input.sourceId, input.retrievedAt),
          });
        }
      }
      const persistedGames = await this.prisma.game.findMany({
        where: { igdbId: { in: batch.map((game) => game.igdbId) } },
        select: { id: true, igdbId: true },
      });
      const gameIds = new Map(
        persistedGames.map((record) => [record.igdbId, record.id]),
      );
      const persistedIds = persistedGames.map((record) => record.id);
      await this.prisma.$transaction(async (transaction) => {
        await Promise.all([
          transaction.gameCompanyRole.deleteMany({
            where: { gameId: { in: persistedIds } },
          }),
          transaction.gameGenre.deleteMany({
            where: { gameId: { in: persistedIds } },
          }),
          transaction.gamePlatform.deleteMany({
            where: { gameId: { in: persistedIds } },
          }),
          transaction.gameRelease.deleteMany({
            where: { gameId: { in: persistedIds } },
          }),
          transaction.gameExternalId.deleteMany({
            where: { gameId: { in: persistedIds } },
          }),
        ]);
        const companyRoles = batch.flatMap((game) =>
          game.companies.map((company) => ({
            gameId: gameIds.get(game.igdbId)!,
            companyId: companies.get(company.igdbId)!,
            developer: company.developer,
            publisher: company.publisher,
          })),
        );
        const genres = batch.flatMap((game) =>
          game.genres.map((genre) => ({
            gameId: gameIds.get(game.igdbId)!,
            igdbGenreId: genre.igdbId,
            name: genre.name,
          })),
        );
        const platforms = batch.flatMap((game) =>
          game.platforms.map((platform) => ({
            gameId: gameIds.get(game.igdbId)!,
            igdbPlatformId: platform.igdbId,
            name: platform.name,
          })),
        );
        const releases = batch.flatMap((game) =>
          game.releases.map((release) => ({
            gameId: gameIds.get(game.igdbId)!,
            igdbReleaseDateId: release.igdbId,
            releaseDate: release.releaseDate,
            dateCategory: release.dateCategory,
            regionId: release.regionId,
            platformIgdbId: release.platform?.igdbId ?? null,
            platformName: release.platform?.name ?? null,
            statusId: release.statusId,
          })),
        );
        const externalIds = batch.flatMap((game) =>
          game.externalIds.map((external) => ({
            gameId: gameIds.get(game.igdbId)!,
            category: external.category,
            uid: external.uid,
            name: external.name,
            sourceUrl: external.sourceUrl,
          })),
        );
        if (companyRoles.length > 0) {
          await transaction.gameCompanyRole.createMany({ data: companyRoles });
        }
        if (genres.length > 0) {
          await transaction.gameGenre.createMany({ data: genres });
        }
        if (platforms.length > 0) {
          await transaction.gamePlatform.createMany({ data: platforms });
        }
        for (const records of chunks(releases, 2_000)) {
          await transaction.gameRelease.createMany({
            data: records,
            skipDuplicates: true,
          });
        }
        for (const records of chunks(externalIds, 2_000)) {
          await transaction.gameExternalId.createMany({
            data: records,
            skipDuplicates: true,
          });
        }
      });
    }
    return {
      recordsCreated: input.games.length - existing.size,
      recordsUpdated: existing.size,
    };
  }

  async completeRun(
    input: Parameters<IgdbIngestionStore["completeRun"]>[0],
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
    input: Parameters<IgdbIngestionStore["failRun"]>[0],
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
