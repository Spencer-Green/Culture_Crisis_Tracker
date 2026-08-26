import "server-only";

import { cache } from "react";

import { getRssFeed } from "@/data-sources/news/rss-registry";
import { getPrisma } from "@/lib/prisma";
import {
  buildOperationalFreshness,
  summarizeFreshness,
  type LatestSourceObservation,
} from "@/services/scheduler/freshness-core";
import { loadScheduleEvaluations } from "@/services/scheduler/scheduler-registry";

function datePeriod(start: Date, end = start) {
  const startLabel = start.toISOString().slice(0, 10);
  const endLabel = end.toISOString().slice(0, 10);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

async function latestObservation(
  sourceId: string,
): Promise<LatestSourceObservation> {
  const prisma = getPrisma();
  const metric = await prisma.metricObservation.findFirst({
    where: { metricDefinition: { source: { slug: sourceId } } },
    orderBy: { periodEnd: "desc" },
    select: { periodStart: true, periodEnd: true },
  });
  if (metric)
    return {
      period: datePeriod(metric.periodStart, metric.periodEnd),
      observedAt: metric.periodEnd.toISOString(),
    };
  if (
    sourceId === "rss" ||
    sourceId === "thenewsapi" ||
    getRssFeed(sourceId)?.dataSourceSlug === sourceId
  ) {
    const source = await prisma.dataSource.findUnique({
      where: { slug: sourceId },
      select: { id: true },
    });
    if (source) {
      const article = await prisma.mediaArticle.findFirst({
        where: {
          OR: [
            { sourceId: source.id },
            { sourceMatches: { some: { sourceId: source.id } } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      });
      if (article)
        return {
          period: datePeriod(article.publishedAt),
          observedAt: article.publishedAt.toISOString(),
        };
    }
  }
  if (sourceId === "ticketmaster") {
    const value = await prisma.ticketmasterSupplySnapshot.findFirst({
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });
    if (value)
      return {
        period: datePeriod(value.capturedAt),
        observedAt: value.capturedAt.toISOString(),
      };
  }
  if (sourceId === "steam") {
    const value = await prisma.steamGameSnapshot.findFirst({
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });
    if (value)
      return {
        period: datePeriod(value.capturedAt),
        observedAt: value.capturedAt.toISOString(),
      };
  }
  if (sourceId === "igdb") {
    const value = await prisma.game.findFirst({
      where: { firstReleaseDate: { not: null } },
      orderBy: { firstReleaseDate: "desc" },
      select: { firstReleaseDate: true },
    });
    if (value?.firstReleaseDate)
      return {
        period: datePeriod(value.firstReleaseDate),
        observedAt: value.firstReleaseDate.toISOString(),
      };
  }
  if (sourceId === "us-box-office") {
    const value = await prisma.uSBoxOfficeWeekend.findFirst({
      orderBy: { weekendEnd: "desc" },
      select: { weekendEnd: true },
    });
    if (value)
      return {
        period: `Weekend ending ${datePeriod(value.weekendEnd)}`,
        observedAt: value.weekendEnd.toISOString(),
      };
  }
  if (sourceId === "bfi") {
    const value = await prisma.bFIWeekendBoxOffice.findFirst({
      orderBy: { weekendEnd: "desc" },
      select: { weekendEnd: true },
    });
    if (value)
      return {
        period: `Weekend ending ${datePeriod(value.weekendEnd)}`,
        observedAt: value.weekendEnd.toISOString(),
      };
  }
  if (sourceId === "screen-australia") {
    const value = await prisma.screenAustraliaBoxOfficeObservation.findFirst({
      orderBy: { reportDate: "desc" },
      select: { reportDate: true },
    });
    if (value)
      return {
        period: `Source report ${datePeriod(value.reportDate)}`,
        observedAt: value.reportDate.toISOString(),
      };
  }
  if (sourceId === "broadway-business") {
    const value = await prisma.broadwayMarketWeek.findFirst({
      orderBy: { weekEnding: "desc" },
      select: { weekEnding: true },
    });
    if (value)
      return {
        period: `Week ending ${datePeriod(value.weekEnding)}`,
        observedAt: value.weekEnding.toISOString(),
      };
  }
  const annual =
    sourceId === "lpa"
      ? await prisma.lPAPerformanceMarketYear.findFirst({
          orderBy: { year: "desc" },
          select: { year: true },
        })
      : sourceId === "mvt"
        ? await prisma.mVTGrassrootsMusicYear.findFirst({
            orderBy: { year: "desc" },
            select: { year: true },
          })
        : sourceId === "census"
          ? await prisma.censusRecordIndustryYear.findFirst({
              orderBy: { year: "desc" },
              select: { year: true },
            })
          : null;
  if (annual) {
    const observedAt = new Date(Date.UTC(annual.year, 11, 31));
    return {
      period: `${annual.year} · annual`,
      observedAt: observedAt.toISOString(),
    };
  }
  return { period: null, observedAt: null };
}

export async function getSchedulerFreshness(now = new Date()) {
  try {
    const evaluations = await loadScheduleEvaluations(now);
    const prisma = getPrisma();
    const sources = await Promise.all(
      evaluations.map(async (evaluation) => {
        const latestRun = evaluation.source
          ? await prisma.ingestionRun.findFirst({
              where: { sourceId: evaluation.source.id },
              orderBy: { startedAt: "desc" },
              select: {
                status: true,
                startedAt: true,
                completedAt: true,
                recordsCreated: true,
                recordsUpdated: true,
              },
            })
          : null;
        return buildOperationalFreshness({
          evaluation,
          latestObservation: await latestObservation(
            evaluation.definition.sourceId,
          ),
          latestIngestionRun: latestRun,
        });
      }),
    );
    return {
      databaseStatus: "available" as const,
      sources,
      summary: summarizeFreshness(sources),
    };
  } catch {
    return {
      databaseStatus: "unavailable" as const,
      sources: [],
      summary: summarizeFreshness([]),
    };
  }
}

export const getCurrentSchedulerFreshness = cache(() =>
  getSchedulerFreshness(new Date()),
);
