import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { buildBroadwayAnalytics } from "@/services/theatre/broadway-analytics";

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

export class TheatreLoadError extends Error {
  constructor(cause: unknown) {
    super("Theatre data could not be loaded.", { cause });
    this.name = "TheatreLoadError";
  }
}

export async function getBroadwayMarketData() {
  try {
    const rows = await getPrisma().broadwayMarketWeek.findMany({
      orderBy: { weekEnding: "asc" },
    });
    return {
      databaseStatus: "available" as const,
      retrievedAt: rows.at(-1)?.retrievedAt ?? null,
      analytics: buildBroadwayAnalytics(
        rows.map((row) => ({
          weekEnding: row.weekEnding,
          seasonWeekNumber: row.seasonWeekNumber,
          grossUsd: Number(row.grossUsd),
          attendance: row.attendance,
          showCount: row.showCount,
          capacityPct:
            row.capacityPct === null ? null : Number(row.capacityPct),
          averageTicketPriceUsd:
            row.averageTicketPriceUsd === null
              ? null
              : Number(row.averageTicketPriceUsd),
        })),
      ),
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        retrievedAt: null,
        analytics: null,
      };
    throw new TheatreLoadError(error);
  }
}
