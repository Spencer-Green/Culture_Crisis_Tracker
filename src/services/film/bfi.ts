import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { buildBFIAnalytics } from "@/services/film/bfi-analytics";

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

function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export class BFILoadError extends Error {
  constructor(cause: unknown) {
    super("BFI film data could not be loaded.", { cause });
    this.name = "BFILoadError";
  }
}

export const getBFIFilmData = cache(async () => {
  try {
    const [weekly, structural] = await Promise.all([
      getPrisma().bFIWeekendBoxOffice.findMany({
        orderBy: { weekendEnd: "asc" },
        select: {
          weekendStart: true,
          weekendEnd: true,
          reportedGrossGbp: true,
          top15GrossGbp: true,
          releaseCount: true,
          topFilm: true,
          topFilmGrossGbp: true,
          top3GrossGbp: true,
          top5GrossGbp: true,
          top10GrossGbp: true,
          retrievedAt: true,
          sourcePublishedAt: true,
        },
      }),
      getPrisma().bFIFilmMarketYear.findMany({
        orderBy: { year: "asc" },
        select: {
          year: true,
          cinemaAdmissionsMillions: true,
          ukBoxOfficeGrossGbpM: true,
          releaseCount: true,
          filmProductionSpendGbpM: true,
          filmProductionCount: true,
        },
      }),
    ]);
    const analytics = buildBFIAnalytics(
      weekly.map((record) => ({
        ...record,
        reportedGrossGbp: record.reportedGrossGbp.toNumber(),
        top15GrossGbp: record.top15GrossGbp.toNumber(),
        topFilmGrossGbp: record.topFilmGrossGbp?.toNumber() ?? null,
        top3GrossGbp: record.top3GrossGbp?.toNumber() ?? null,
        top5GrossGbp: record.top5GrossGbp?.toNumber() ?? null,
        top10GrossGbp: record.top10GrossGbp?.toNumber() ?? null,
      })),
      structural.map((record) => ({
        ...record,
        cinemaAdmissionsMillions:
          record.cinemaAdmissionsMillions?.toNumber() ?? null,
        ukBoxOfficeGrossGbpM: record.ukBoxOfficeGrossGbpM?.toNumber() ?? null,
        filmProductionSpendGbpM:
          record.filmProductionSpendGbpM?.toNumber() ?? null,
      })),
    );
    return {
      databaseStatus: "available" as const,
      analytics,
      retrievedAt: weekly.at(-1)?.retrievedAt ?? null,
      publishedAt: weekly.at(-1)?.sourcePublishedAt ?? null,
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        analytics: null,
        retrievedAt: null,
        publishedAt: null,
      };
    throw new BFILoadError(error);
  }
});
