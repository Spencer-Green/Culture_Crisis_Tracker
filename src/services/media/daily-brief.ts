import "server-only";

import { getBFIFilmData } from "@/services/film/bfi";
import { getUSBoxOfficeData } from "@/services/film/us-box-office";
import { getGamingData } from "@/services/gaming/analytics";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";
import { getMusicSectorData } from "@/services/music/music";
import {
  buildDailyCultureBriefCore,
  deriveBriefMediaFreshness,
  type BriefSector,
} from "@/services/media/daily-brief-core";
import { getMediaArticlesPublishedBetween } from "@/services/media/media";
import {
  getCurrentSchedulerFreshness,
  getSchedulerFreshness,
} from "@/services/scheduler/freshness";
import { getBroadwayMarketData } from "@/services/theatre/theatre";
import { getPersistedStorySyntheses } from "@/services/media/production-story-synthesis-read";
import { synthesisRecord } from "@/services/media/production-story-synthesis-presentation";

const HOUR_MS = 60 * 60 * 1_000;

export type BriefMarketContext = {
  id: string;
  sector: BriefSector;
  label: string;
  value: string;
  change: string | null;
  period: string;
  frequency: string;
  source: string;
  caveat: string | null;
};

function percent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function compactMoney(value: number, currency: "USD" | "GBP"): string {
  const symbol = currency === "USD" ? "$" : "£";
  if (Math.abs(value) >= 1_000_000_000)
    return `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000)
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  return `${symbol}${Math.round(value).toLocaleString("en-AU")}`;
}

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function buildMarketContext(now: Date): Promise<BriefMarketContext[]> {
  const [music, musicSupply, usFilm, ukFilm, broadway, theatreSupply, gaming] =
    await Promise.allSettled([
      getMusicSectorData(),
      getTicketmasterSupply({
        days: 90,
        countryCode: "US",
        segmentName: "Music",
      }),
      getUSBoxOfficeData(),
      getBFIFilmData(),
      getBroadwayMarketData(),
      getTicketmasterSupply({
        days: 90,
        countryCode: "US",
        segmentName: "Arts & Theatre",
      }),
      getGamingData(),
    ]);
  const values: BriefMarketContext[] = [];

  if (music.status === "fulfilled") {
    const trend = music.value.beaDemand?.streamingReal;
    if (trend) {
      values.push({
        id: "music-bea-real-streaming",
        sector: "music",
        label: "Real audio streaming & radio PCE",
        value: compactMoney(Number(trend.current.value) * 1_000_000, "USD"),
        change: percent(trend.yearOverYearChange),
        period: dateLabel(trend.current.periodStart),
        frequency: `Monthly · ${trend.current.unit}`,
        source: "BEA PCE",
        caveat: "Household expenditure, not recorded-music industry revenue.",
      });
    }
  }
  if (
    musicSupply.status === "fulfilled" &&
    musicSupply.value.summary.events > 0
  ) {
    values.push({
      id: "music-ticketmaster-90d",
      sector: "music",
      label: "US forward live-music supply",
      value: `${musicSupply.value.summary.events.toLocaleString("en-AU")} events`,
      change: `${musicSupply.value.summary.venues.toLocaleString("en-AU")} active venues`,
      period: `90 days from ${dateLabel(now)}`,
      frequency: "Current persisted snapshot",
      source: "Ticketmaster Music",
      caveat:
        "Forward listings, not realized demand or the complete live market.",
    });
  }
  if (usFilm.status === "fulfilled" && usFilm.value.analytics) {
    const analytics = usFilm.value.analytics;
    values.push({
      id: "film-us-weekend",
      sector: "film",
      label: "US domestic weekend box office",
      value: compactMoney(analytics.latest.totalGrossUsd, "USD"),
      change: percent(analytics.yoyPct),
      period: `Weekend ending ${dateLabel(analytics.latest.weekendEnd)}`,
      frequency: "Weekly · nominal USD",
      source: "Kaggle provisional dataset",
      caveat: "Community-maintained, Box Office Mojo-derived research source.",
    });
  }
  if (ukFilm.status === "fulfilled" && ukFilm.value.analytics) {
    const analytics = ukFilm.value.analytics;
    values.push({
      id: "film-uk-weekend",
      sector: "film",
      label: "UK reported weekend box office",
      value: compactMoney(analytics.latest.reportedGrossGbp, "GBP"),
      change: percent(analytics.yoyPct),
      period: `Weekend ending ${dateLabel(analytics.latest.weekendEnd)}`,
      frequency: "Weekly · nominal GBP",
      source: "BFI",
      caveat:
        "Reported workbook coverage; no FX comparison with the US series.",
    });
  }
  if (broadway.status === "fulfilled" && broadway.value.analytics) {
    const analytics = broadway.value.analytics;
    values.push({
      id: "theatre-broadway-attendance",
      sector: "theatre",
      label: "Broadway weekly attendance",
      value: analytics.latest.attendance.toLocaleString("en-AU"),
      change: percent(analytics.attendanceYoyPct),
      period: `Week ending ${dateLabel(analytics.latest.weekEnding)}`,
      frequency: "Weekly · Broadway NYC",
      source: "Broadway Business",
      caveat: `Gross was ${percent(analytics.grossYoyPct) ?? "not comparable"} year over year; nominal revenue and attendance are distinct.`,
    });
  }
  if (
    theatreSupply.status === "fulfilled" &&
    theatreSupply.value.summary.events > 0
  ) {
    values.push({
      id: "theatre-ticketmaster-90d",
      sector: "theatre",
      label: "US forward Arts & Theatre supply",
      value: `${theatreSupply.value.summary.events.toLocaleString("en-AU")} events`,
      change: `${theatreSupply.value.summary.venues.toLocaleString("en-AU")} active venues`,
      period: `90 days from ${dateLabel(now)}`,
      frequency: "Current persisted snapshot",
      source: "Ticketmaster Arts & Theatre",
      caveat: "Broader than Broadway and not a complete theatre census.",
    });
  }
  if (gaming.status === "fulfilled" && gaming.value.analytics) {
    const analytics = gaming.value.analytics;
    values.push({
      id: "gaming-release-supply",
      sector: "gaming",
      label: "Tracked game release supply",
      value: `${analytics.latestTwelveMonthReleases.toLocaleString("en-AU")} releases`,
      change: `${analytics.upcoming.days90.toLocaleString("en-AU")} listed next 90D`,
      period: `Rolling 12 months through ${dateLabel(now)}`,
      frequency: "Current IGDB coverage",
      source: "IGDB",
      caveat:
        "Tracked release records; farther-out listings may be incomplete.",
    });
  }
  return values;
}

export async function getDailyCultureBrief(input?: {
  now?: Date;
  includeMarketContext?: boolean;
  includeStorySyntheses?: boolean;
}) {
  const now = input?.now ?? new Date();
  const start = new Date(now.getTime() - 72 * HOUR_MS);
  const briefPromise = Promise.all([
    getMediaArticlesPublishedBetween({ start, end: now }),
    input?.now ? getSchedulerFreshness(now) : getCurrentSchedulerFreshness(),
  ]).then(([articles, freshness]) => ({
    ...buildDailyCultureBriefCore({ articles, now }),
    ...deriveBriefMediaFreshness({
      databaseAvailable: freshness.databaseStatus === "available",
      sources: freshness.sources,
    }),
    schedulerFreshness: {
      databaseStatus: freshness.databaseStatus,
      summary: freshness.summary,
    },
  }));
  const marketContextPromise =
    input?.includeMarketContext === false
      ? Promise.resolve([])
      : buildMarketContext(now);
  const [brief, marketContext] = await Promise.all([
    briefPromise,
    marketContextPromise,
  ]);
  const synthesisClusters = [
    ...new Map(
      Object.values(brief.fullPageSections)
        .flat()
        .map((cluster) => [cluster.clusterId, cluster]),
    ).values(),
  ];
  const storySyntheses = input?.includeStorySyntheses
    ? synthesisRecord(await getPersistedStorySyntheses(synthesisClusters))
    : {};
  return {
    ...brief,
    marketContext,
    storySyntheses,
  };
}

export type DailyCultureBrief = Awaited<
  ReturnType<typeof getDailyCultureBrief>
>;
