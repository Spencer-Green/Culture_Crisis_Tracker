import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  buildGamingAnalytics,
  type GamingAnalytics,
} from "@/services/gaming/analytics-core";

export type GamingPageData =
  | { databaseStatus: "available"; analytics: GamingAnalytics }
  | { databaseStatus: "unavailable"; analytics: null };

const DATABASE_UNAVAILABLE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
]);

export class GamingLoadError extends Error {
  constructor(cause: unknown) {
    super("Gaming data could not be loaded.", { cause });
    this.name = "GamingLoadError";
  }
}

function isDatabaseUnavailableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export const getGamingData = cache(async (): Promise<GamingPageData> => {
  try {
    const prisma = getPrisma();
    const [games, snapshots] = await Promise.all([
      prisma.game.findMany({
        where: {
          firstReleaseDate: { gte: new Date("2019-01-01T00:00:00.000Z") },
        },
        select: {
          id: true,
          name: true,
          firstReleaseDate: true,
          gameTypeName: true,
          steamAppId: true,
          genres: { select: { name: true } },
          platforms: { select: { name: true } },
          companies: {
            select: {
              developer: true,
              publisher: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.steamGameSnapshot.findMany({
        orderBy: { capturedAt: "desc" },
        select: {
          gameId: true,
          capturedAt: true,
          storeAvailable: true,
          currentPlayers: true,
          totalReviews: true,
          positivePercent: true,
          currentPrice: true,
          discountPercent: true,
          freeToPlay: true,
          currency: true,
        },
      }),
    ]);
    return {
      databaseStatus: "available",
      analytics: buildGamingAnalytics({
        now: new Date(),
        games: games.map((game) => ({
          ...game,
          genres: game.genres.map((genre) => genre.name),
          platforms: game.platforms.map((platform) => platform.name),
          companies: game.companies.map((role) => ({
            id: role.company.id,
            name: role.company.name,
            developer: role.developer,
            publisher: role.publisher,
          })),
        })),
        snapshots: snapshots.map((snapshot) => ({
          ...snapshot,
          positivePercent: snapshot.positivePercent?.toNumber() ?? null,
        })),
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseStatus: "unavailable", analytics: null };
    }

    throw new GamingLoadError(error);
  }
});

export const getGamingOverview = cache(async () => {
  try {
    const prisma = getPrisma();
    const [trackedGames, steamMappedGames, steamSnapshots] = await Promise.all([
      prisma.game.count(),
      prisma.game.count({ where: { steamAppId: { not: null } } }),
      prisma.steamGameSnapshot.count(),
    ]);
    return {
      databaseStatus: "available" as const,
      trackedGames,
      steamMappedGames,
      steamSnapshots,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseStatus: "unavailable" as const,
        trackedGames: 0,
        steamMappedGames: 0,
        steamSnapshots: 0,
      };
    }

    throw new GamingLoadError(error);
  }
});
