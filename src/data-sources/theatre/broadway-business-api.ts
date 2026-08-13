import { z } from "zod";

import { fetchText, type FetchImplementation } from "@/lib/http";
import {
  BROADWAY_BUSINESS_ACCESS_CLASSIFICATION,
  BROADWAY_BUSINESS_UNDERLYING_SOURCE,
  type BroadwayBusinessDataset,
  type BroadwayMarketWeekRecord,
} from "@/data-sources/theatre/broadway-business-types";

const chartWeekSchema = z.object({
  number: z.number().int().positive(),
  end: z.iso.date(),
  gross: z.object({ total: z.number().nonnegative() }),
  attendance: z.object({
    total: z.number().int().nonnegative(),
    potential: z.number().nonnegative().nullable().optional(),
  }),
});

const currentStatsSchema = z.object({
  gross: z.number().nonnegative(),
  attendance: z.number().int().nonnegative(),
  shows: z.number().int().nonnegative(),
  capacity_percentage: z.number().nonnegative().nullable().optional(),
  ticket_average: z.number().nonnegative().nullable().optional(),
  performances: z.number().int().nonnegative().nullable().optional(),
  previews: z.number().int().nonnegative().nullable().optional(),
});

const pagePayloadSchema = z.object({
  initialData: z.object({
    home: z.object({
      currentWeek: z.object({
        id: z.number().int().positive(),
        number: z.number().int().positive(),
        start: z.iso.date(),
        end: z.iso.date(),
        notes: z.string().nullable().optional(),
        grosses: z.object({
          data: z.array(z.unknown()),
        }),
        stats: z.object({
          this_week: currentStatsSchema,
          last_week: currentStatsSchema,
          last_season: currentStatsSchema,
        }),
      }),
    }),
  }),
  upToDate: z.boolean().optional(),
});

export class BroadwayBusinessResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BroadwayBusinessResponseError";
  }
}

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "broadwaybusiness.com") {
    throw new BroadwayBusinessResponseError(
      "Broadway Business must use its official HTTPS host.",
    );
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url;
}

export function buildBroadwayBusinessUrls(baseUrl: string) {
  const sourceUrl = normalizeBaseUrl(baseUrl);
  const chartUrl = new URL("api/week/stats/chart", sourceUrl);
  chartUrl.searchParams.set("uptodate", "1");
  return { sourceUrl, chartUrl };
}

export function parseBroadwayBusinessPage(html: string) {
  const marker = "window.broadwayBusiness = ";
  const start = html.indexOf(marker);
  if (start < 0)
    throw new BroadwayBusinessResponseError(
      "Broadway Business page did not include its structured payload.",
    );
  const jsonStart = start + marker.length;
  const scriptEnd = html.indexOf("</script>", jsonStart);
  if (scriptEnd < 0)
    throw new BroadwayBusinessResponseError(
      "Broadway Business structured payload was incomplete.",
    );
  const serialized = html.slice(jsonStart, scriptEnd).trim().replace(/;$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new BroadwayBusinessResponseError(
      "Broadway Business structured payload was invalid JSON.",
    );
  }
  const result = pagePayloadSchema.safeParse(parsed);
  if (!result.success)
    throw new BroadwayBusinessResponseError(
      "Broadway Business structured payload had an unexpected shape.",
    );
  return result.data;
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function parseBroadwayBusinessChart(body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new BroadwayBusinessResponseError(
      "Broadway Business chart response was invalid JSON.",
    );
  }
  const result = z.array(chartWeekSchema).safeParse(parsed);
  if (!result.success || result.data.length === 0)
    throw new BroadwayBusinessResponseError(
      "Broadway Business chart response had an unexpected shape.",
    );
  const unique = new Map<string, BroadwayMarketWeekRecord>();
  for (const week of result.data) {
    const weekEnding = utcDate(week.end);
    unique.set(week.end, {
      sourceWeekId: Number(week.end.replaceAll("-", "")),
      seasonWeekNumber: week.number,
      weekStart: addUtcDays(weekEnding, -6),
      weekEnding,
      grossUsd: week.gross.total / 100,
      attendance: week.attendance.total,
      showCount: null,
      capacityPct:
        week.attendance.potential == null
          ? null
          : week.attendance.potential / 100,
      averageTicketPriceUsd: null,
      performanceCount: null,
      previewCount: null,
      metadata: { aggregateChart: true },
    });
  }
  return [...unique.values()].sort(
    (left, right) => left.weekEnding.getTime() - right.weekEnding.getTime(),
  );
}

function pageRecords(html: string) {
  const payload = parseBroadwayBusinessPage(html);
  const week = payload.initialData.home.currentWeek;
  const stats = week.stats.this_week;
  const latest: BroadwayMarketWeekRecord = {
    sourceWeekId: week.id,
    seasonWeekNumber: week.number,
    weekStart: utcDate(week.start),
    weekEnding: utcDate(week.end),
    grossUsd: stats.gross / 100,
    attendance: stats.attendance,
    showCount: stats.shows,
    capacityPct:
      stats.capacity_percentage == null
        ? null
        : stats.capacity_percentage / 100,
    averageTicketPriceUsd:
      stats.ticket_average == null ? null : stats.ticket_average / 100,
    performanceCount: stats.performances ?? null,
    previewCount: stats.previews ?? null,
    metadata: {
      aggregateChart: true,
      latestPage: true,
      showRows: week.grosses.data.length,
      notes: week.notes ?? null,
      upToDate: payload.upToDate ?? null,
    },
  };
  return {
    latest,
    lastWeekStats: week.stats.last_week,
    lastSeasonStats: week.stats.last_season,
  };
}

function enrichRecord(
  record: BroadwayMarketWeekRecord,
  stats: z.infer<typeof currentStatsSchema>,
  metadata: Record<string, unknown>,
): BroadwayMarketWeekRecord {
  return {
    ...record,
    grossUsd: stats.gross / 100,
    attendance: stats.attendance,
    showCount: stats.shows,
    capacityPct:
      stats.capacity_percentage == null
        ? record.capacityPct
        : stats.capacity_percentage / 100,
    averageTicketPriceUsd:
      stats.ticket_average == null
        ? record.averageTicketPriceUsd
        : stats.ticket_average / 100,
    performanceCount: stats.performances ?? null,
    previewCount: stats.previews ?? null,
    metadata: { ...record.metadata, ...metadata },
  };
}

function headerNumber(headers: Headers, name: string): number | null {
  const value = Number(headers.get(name));
  return Number.isFinite(value) ? value : null;
}

export async function fetchBroadwayBusinessDataset(
  baseUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<BroadwayBusinessDataset> {
  const { sourceUrl, chartUrl } = buildBroadwayBusinessUrls(baseUrl);
  const page = await fetchText(sourceUrl, {
    accept: "text/html",
    acceptedContentTypes: ["text/html"],
    timeoutMs: options.timeoutMs,
    maxResponseBytes: 1_000_000,
    fetchImplementation: options.fetchImplementation,
  });
  const chart = await fetchText(chartUrl, {
    accept: "application/json",
    acceptedContentTypes: ["application/json"],
    timeoutMs: options.timeoutMs,
    maxResponseBytes: 250_000,
    fetchImplementation: options.fetchImplementation,
  });
  const details = pageRecords(page.body);
  const latest = details.latest;
  const byDate = new Map(
    parseBroadwayBusinessChart(chart.body).map((record) => [
      record.weekEnding.toISOString().slice(0, 10),
      record,
    ]),
  );
  byDate.set(latest.weekEnding.toISOString().slice(0, 10), latest);
  const lastWeekKey = addUtcDays(latest.weekEnding, -7)
    .toISOString()
    .slice(0, 10);
  const lastWeek = byDate.get(lastWeekKey);
  if (lastWeek)
    byDate.set(
      lastWeekKey,
      enrichRecord(lastWeek, details.lastWeekStats, {
        currentPageComparison: "last_week",
      }),
    );
  const lastSeason = [...byDate.values()]
    .filter(
      (record) =>
        record.seasonWeekNumber === latest.seasonWeekNumber &&
        record.weekEnding < latest.weekEnding,
    )
    .sort(
      (left, right) => right.weekEnding.getTime() - left.weekEnding.getTime(),
    )[0];
  if (lastSeason) {
    const key = lastSeason.weekEnding.toISOString().slice(0, 10);
    byDate.set(
      key,
      enrichRecord(lastSeason, details.lastSeasonStats, {
        currentPageComparison: "last_season",
      }),
    );
  }
  return {
    records: [...byDate.values()].sort(
      (left, right) => left.weekEnding.getTime() - right.weekEnding.getTime(),
    ),
    requestCount: 2,
    latestPageWeek: latest,
    safeSourceUrl: sourceUrl.toString(),
    safeChartUrl: chartUrl.toString(),
    rateLimit: {
      limit: headerNumber(chart.headers, "x-ratelimit-limit"),
      remaining: headerNumber(chart.headers, "x-ratelimit-remaining"),
    },
  };
}

export function broadwayBusinessProvenance() {
  return {
    provider: "Broadway Business",
    underlyingSource: BROADWAY_BUSINESS_UNDERLYING_SOURCE,
    accessClassification: BROADWAY_BUSINESS_ACCESS_CLASSIFICATION,
    status: "provisional-private-research",
  };
}
