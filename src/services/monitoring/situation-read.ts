import "server-only";
import { cache } from "react";
import { buildMarketContext } from "@/services/media/daily-brief";
import { getCurrentSchedulerFreshness } from "@/services/scheduler/freshness";
import { getMusicSectorData } from "@/services/music/music";
import { getLPAPerformanceData } from "@/services/theatre/theatre";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";
import { readResearch } from "./research-read";
import { readDevelopments } from "./developments-read";
import type { MonitorFilters } from "./core";

const BASELINE_SCOPE: Record<
  string,
  { sourceId: string; country: string | null; proxy: boolean }
> = {
  "music-bea-real-streaming": { sourceId: "bea", country: "US", proxy: false },
  "music-ticketmaster-90d": {
    sourceId: "ticketmaster",
    country: "US",
    proxy: true,
  },
  "film-us-weekend": { sourceId: "us-box-office", country: "US", proxy: false },
  "film-uk-weekend": { sourceId: "bfi", country: "GB", proxy: false },
  "theatre-broadway-attendance": {
    sourceId: "broadway-business",
    country: "US",
    proxy: false,
  },
  "theatre-ticketmaster-90d": {
    sourceId: "ticketmaster",
    country: "US",
    proxy: true,
  },
  "gaming-release-supply": { sourceId: "igdb", country: null, proxy: true },
  "music-mvt-venues": { sourceId: "mvt", country: "GB", proxy: false },
  "theatre-lpa-attendance": { sourceId: "lpa", country: "AU", proxy: false },
};

export const readBaselines = cache(async (country?: string) => {
  try {
    const [values, music, lpa] = await Promise.all([
      buildMarketContext(new Date()),
      getMusicSectorData().catch(() => null),
      getLPAPerformanceData().catch(() => null),
    ]);
    const pct = (value: number | null) =>
      value === null ? null : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
    if (
      music?.analytics?.latest.venueCount !== null &&
      music?.analytics?.latest.venueCount !== undefined
    )
      values.push({
        id: "music-mvt-venues",
        sector: "music",
        label: "UK grassroots venues in MVT coverage",
        value: `${music.analytics.latest.venueCount.toLocaleString("en-AU")} venues`,
        change: pct(music.analytics.venueCountYoyPct),
        period: String(music.analytics.latest.year),
        frequency: "Annual · MVT coverage",
        source: "Music Venue Trust",
        caveat:
          "UK grassroots venue coverage, not all UK music venues or Australian live-music conditions.",
      });
    const theatre = lpa?.analytics?.combined;
    if (theatre && theatre.latest.attendance !== null)
      values.push({
        id: "theatre-lpa-attendance",
        sector: "theatre",
        label: "Australian theatre and musical-theatre attendance",
        value: `${theatre.latest.attendance.toLocaleString("en-AU")} attendances`,
        change:
          theatre.previous?.year === theatre.latest.year - 1
            ? pct(theatre.attendanceChangePct)
            : null,
        period: String(theatre.latest.year),
        frequency: "Annual · Theatre + Musical Theatre",
        source: "Live Performance Australia",
        caveat:
          "Combined category attendance; does not cover the complete cultural sector. Comparison shown only for consecutive years.",
      });
    const readings = values.flatMap((value) => {
      const scope = BASELINE_SCOPE[value.id];
      return scope ? [{ ...value, ...scope }] : [];
    });
    if (country && country !== "US") {
      const segments = [
        { sector: "music" as const, segmentName: "Music" },
        { sector: "theatre" as const, segmentName: "Arts & Theatre" },
      ];
      const supplies = await Promise.allSettled(
        segments.map((segment) =>
          getTicketmasterSupply({
            countryCode: country,
            segmentName: segment.segmentName,
            days: 90,
          }),
        ),
      );
      supplies.forEach((result, index) => {
        if (result.status !== "fulfilled" || result.value.summary.events === 0)
          return;
        const segment = segments[index];
        readings.push({
          id: `${segment.sector}-ticketmaster-${country}-90d`,
          sector: segment.sector,
          label: `${country} forward ${segment.segmentName} supply`,
          value: `${result.value.summary.events.toLocaleString("en-AU")} events`,
          change: `${result.value.summary.venues.toLocaleString("en-AU")} active venues`,
          period: `90 days from ${new Date().toISOString().slice(0, 10)}`,
          frequency: "Current query of persisted listings",
          source: "Ticketmaster",
          sourceId: "ticketmaster",
          country,
          proxy: true,
          caveat:
            "Forward listings in recorded Ticketmaster coverage, not realized demand or a complete venue census.",
        });
      });
    }
    return { available: true, values: readings };
  } catch {
    return { available: false, values: [] };
  }
});
export const readCollectionStatus = cache(async () => {
  try {
    return await getCurrentSchedulerFreshness();
  } catch {
    return { databaseStatus: "unavailable" as const, sources: [] };
  }
});
export async function readSituation(filters: MonitorFilters) {
  const now = new Date();
  const [baseline, research, developments, collection] = await Promise.all([
    readBaselines(filters.country),
    readResearch({ ...filters, quarantine: false, recent: true, page: 1 }, now),
    readDevelopments(filters, now),
    readCollectionStatus(),
  ]);
  return {
    now,
    baseline: {
      ...baseline,
      values: baseline.values.filter(
        (v) =>
          (!filters.sector || v.sector === filters.sector) &&
          (!filters.country || v.country === filters.country),
      ),
    },
    research,
    developments,
    collection,
  };
}
