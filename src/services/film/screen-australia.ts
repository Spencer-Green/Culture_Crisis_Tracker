import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import type { ScreenAustraliaPeriodType } from "@/data-sources/film/screen-australia-types";
import { getPrisma } from "@/lib/prisma";
import {
  screenAustraliaNextScheduledAt,
  screenAustraliaReportAge,
} from "@/services/film/screen-australia-core";

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

const VIEW_ORDER: readonly ScreenAustraliaPeriodType[] = [
  "WEEKLY_TOP_5",
  "AUSTRALIAN_YTD",
  "MONTHLY_TOP_20",
  "OVERALL_YTD_TOP_50",
];

function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export const getScreenAustraliaFilmData = cache(async () => {
  try {
    const prisma = getPrisma();
    const source = await prisma.dataSource.findUnique({
      where: { slug: "screen-australia" },
      select: {
        id: true,
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
        schedulerState: {
          select: {
            nextScheduledAt: true,
            lastRunStatus: true,
          },
        },
        ingestionRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
    });
    if (!source)
      return {
        databaseStatus: "available" as const,
        views: [],
        lastAttemptedAt: null,
        lastSuccessfulAt: null,
        nextScheduledAt: null,
        lastRunStatus: null,
        lastRunFailed: false,
      };
    const views = await Promise.all(
      VIEW_ORDER.map(async (periodType) => {
        const latest =
          await prisma.screenAustraliaBoxOfficeObservation.findFirst({
            where: { sourceId: source.id, periodType },
            orderBy: [{ reportDate: "desc" }, { retrievedAt: "desc" }],
            select: { reportDate: true },
          });
        if (!latest) return null;
        const rows = await prisma.screenAustraliaBoxOfficeObservation.findMany({
          where: {
            sourceId: source.id,
            periodType,
            reportDate: latest.reportDate,
          },
          orderBy: { rank: "asc" },
          select: {
            rank: true,
            title: true,
            periodGrossAud: true,
            cumulativeGrossAud: true,
            releaseWeeks: true,
            retrievedAt: true,
          },
        });
        const freshness = screenAustraliaReportAge(latest.reportDate);
        return {
          periodType: periodType as ScreenAustraliaPeriodType,
          reportDate: latest.reportDate.toISOString(),
          ageDays: freshness.ageDays,
          stale: freshness.stale,
          retrievedAt: rows.at(-1)?.retrievedAt.toISOString() ?? null,
          rows: rows.map((row) => ({
            rank: row.rank,
            title: row.title,
            periodGrossAud: row.periodGrossAud?.toNumber() ?? null,
            cumulativeGrossAud: row.cumulativeGrossAud?.toNumber() ?? null,
            releaseWeeks: row.releaseWeeks,
          })),
        };
      }),
    );
    return {
      databaseStatus: "available" as const,
      views: views.filter((view) => view !== null),
      lastAttemptedAt: source.lastAttemptedSyncAt?.toISOString() ?? null,
      lastSuccessfulAt: source.lastSuccessfulSyncAt?.toISOString() ?? null,
      nextScheduledAt:
        screenAustraliaNextScheduledAt(
          source.lastSuccessfulSyncAt,
          source.schedulerState?.nextScheduledAt ?? null,
        )?.toISOString() ?? null,
      lastRunStatus:
        source.schedulerState?.lastRunStatus ??
        source.ingestionRuns[0]?.status ??
        null,
      lastRunFailed:
        source.schedulerState?.lastRunStatus === "failed" ||
        source.ingestionRuns[0]?.status === "failed",
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        views: [],
        lastAttemptedAt: null,
        lastSuccessfulAt: null,
        nextScheduledAt: null,
        lastRunStatus: null,
        lastRunFailed: false,
      };
    throw error;
  }
});
