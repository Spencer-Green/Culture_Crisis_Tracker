import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { buildUSBoxOfficeAnalytics } from "@/services/film/us-box-office-analytics";

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

function isDatabaseUnavailable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export class USBoxOfficeLoadError extends Error {
  constructor(cause: unknown) {
    super("US box-office data could not be loaded.", { cause });
    this.name = "USBoxOfficeLoadError";
  }
}

export const getUSBoxOfficeData = cache(async () => {
  try {
    const rows = await getPrisma().uSBoxOfficeWeekend.findMany({
      where: { sourceYear: { gte: 2015 } },
      orderBy: { weekendEnd: "asc" },
      select: {
        sourceYear: true,
        weekNumber: true,
        weekendStart: true,
        weekendEnd: true,
        totalGrossUsd: true,
        top10GrossUsd: true,
        overallWowChangePct: true,
        overallWowChangeLabel: true,
        releaseCount: true,
        topFilm: true,
        retrievedAt: true,
        datasetUpdatedAt: true,
      },
    });
    const analytics = buildUSBoxOfficeAnalytics(
      rows.map((row) => ({
        ...row,
        totalGrossUsd: row.totalGrossUsd.toNumber(),
        top10GrossUsd: row.top10GrossUsd?.toNumber() ?? null,
        sourceWowChangePct: row.overallWowChangePct?.toNumber() ?? null,
        sourceWowChangeLabel: row.overallWowChangeLabel,
      })),
    );
    return {
      databaseStatus: "available" as const,
      analytics,
      retrievedAt: rows.at(-1)?.retrievedAt ?? null,
      datasetUpdatedAt: rows.at(-1)?.datasetUpdatedAt ?? null,
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        analytics: null,
        retrievedAt: null,
        datasetUpdatedAt: null,
      };
    throw new USBoxOfficeLoadError(error);
  }
});
