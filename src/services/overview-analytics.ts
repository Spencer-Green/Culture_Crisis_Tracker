import "server-only";

import { cache } from "react";

import { getBFIFilmData } from "@/services/film/bfi";
import { getUSBoxOfficeData } from "@/services/film/us-box-office";
import { getGamingData } from "@/services/gaming/analytics";
import { getTicketmasterCrossSectorTrends } from "@/services/industry-events/ticketmaster-longitudinal";
import { getMediaArticlesPublishedBetween } from "@/services/media/media";
import { getMusicSectorData } from "@/services/music/music";
import {
  assessMiddleTierHealth,
  buildAiDisruptionIndicator,
  buildIndustryViability,
  buildSectorViability,
  operationalFreshness,
  type AnalyticalFreshness,
  type SectorViability,
  type ViabilityComponentInput,
} from "@/services/overview-analytics-core";
import { getCurrentSchedulerFreshness } from "@/services/scheduler/freshness";
import {
  getBroadwayMarketData,
  getLPAPerformanceData,
} from "@/services/theatre/theatre";

const DAY_MS = 24 * 60 * 60 * 1_000;

function signedPercent(value: number | null): string {
  if (value === null) return "comparison unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function sourceFreshness(
  statuses: Map<string, string>,
  sourceId: string,
): AnalyticalFreshness {
  return operationalFreshness(statuses.get(sourceId));
}

function ticketmasterComponent(input: {
  sourceStatus: AnalyticalFreshness;
  segmentName: string;
  latestEvents: number | null;
  eventChangePct: number | null;
}): ViabilityComponentInput {
  return {
    id: `ticketmaster-${input.segmentName.toLowerCase().replaceAll(" ", "-")}`,
    sourceId: "ticketmaster",
    label: "Ticketmaster forward supply",
    geography: "AU / US / GB / CA coverage",
    frequency: "90-day snapshot",
    detail:
      input.eventChangePct === null
        ? `${input.latestEvents?.toLocaleString() ?? "No"} forward events · collecting comparable history`
        : `${signedPercent(input.eventChangePct)} in 90-day forward events`,
    freshness: input.sourceStatus,
    measures: [
      {
        label: "90-day forward event supply",
        valuePct: input.eventChangePct,
        neutralBandPct: 2,
      },
    ],
  };
}

export const getOverviewAnalytics = cache(async () => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 7 * DAY_MS);
  const previousStart = new Date(now.getTime() - 14 * DAY_MS);
  const aiDisruptionPromise = Promise.all([
    getMediaArticlesPublishedBetween({ start: currentStart, end: now }),
    getMediaArticlesPublishedBetween({
      start: previousStart,
      end: currentStart,
    }),
  ]).then(([currentArticles, previousArticles]) =>
    buildAiDisruptionIndicator({
      now,
      currentArticles,
      previousArticles,
    }),
  );
  const [
    music,
    usBoxOffice,
    bfi,
    broadway,
    lpa,
    gaming,
    ticketmaster,
    scheduler,
    aiDisruption,
  ] = await Promise.all([
    getMusicSectorData(),
    getUSBoxOfficeData(),
    getBFIFilmData(),
    getBroadwayMarketData(),
    getLPAPerformanceData(),
    getGamingData(),
    getTicketmasterCrossSectorTrends(),
    getCurrentSchedulerFreshness(),
    aiDisruptionPromise,
  ]);
  const statuses = new Map(
    scheduler.sources.map((source) => [source.sourceId, source.status]),
  );
  const ticketmasterBySegment = new Map(
    ticketmaster.sectors.map((sector) => [sector.segmentName, sector]),
  );
  const musicComponents: ViabilityComponentInput[] = [];
  if (music.beaDemand?.streamingReal && music.beaDemand.ownedReal) {
    musicComponents.push({
      id: "bea-music-real-pce",
      sourceId: "bea",
      label: "US recorded-music consumer demand",
      geography: "United States",
      frequency: "monthly · real PCE · SAAR",
      detail: `Streaming ${signedPercent(music.beaDemand.streamingReal.yearOverYearChange)} · owned media ${signedPercent(music.beaDemand.ownedReal.yearOverYearChange)} YoY`,
      freshness: sourceFreshness(statuses, "bea"),
      measures: [
        {
          label: "Real streaming and radio PCE",
          valuePct: music.beaDemand.streamingReal.yearOverYearChange,
          neutralBandPct: 2,
        },
        {
          label: "Real owned recorded-media PCE",
          valuePct: music.beaDemand.ownedReal.yearOverYearChange,
          neutralBandPct: 2,
        },
      ],
    });
  }
  if (music.analytics) {
    musicComponents.push({
      id: "mvt-grassroots",
      sourceId: "mvt",
      label: "UK grassroots venue viability",
      geography: "United Kingdom",
      frequency: "annual",
      detail: `Audience ${signedPercent(music.analytics.audienceYoyPct)} · employment ${signedPercent(music.analytics.employmentYoyPct)} · venues ${signedPercent(music.analytics.venueCountYoyPct)}`,
      freshness: sourceFreshness(statuses, "mvt"),
      measures: [
        {
          label: "Audience visits",
          valuePct: music.analytics.audienceYoyPct,
          neutralBandPct: 2,
        },
        {
          label: "Employment",
          valuePct: music.analytics.employmentYoyPct,
          neutralBandPct: 2,
        },
        {
          label: "Venue count",
          valuePct: music.analytics.venueCountYoyPct,
          neutralBandPct: 2,
        },
      ],
    });
  }
  const musicTicketmaster = ticketmasterBySegment.get("Music");
  musicComponents.push(
    ticketmasterComponent({
      sourceStatus: sourceFreshness(statuses, "ticketmaster"),
      segmentName: "Music",
      latestEvents: musicTicketmaster?.latest?.uniqueEventCount ?? null,
      eventChangePct:
        musicTicketmaster?.comparison?.eventCountPctChange ?? null,
    }),
  );

  const filmComponents: ViabilityComponentInput[] = [];
  if (usBoxOffice.analytics) {
    filmComponents.push({
      id: "us-box-office",
      sourceId: "us-box-office",
      label: "US domestic box office",
      geography: "United States",
      frequency: "weekly · equivalent-period YTD",
      detail: `${signedPercent(usBoxOffice.analytics.ytdVsPreviousYearPct)} vs prior year · ${signedPercent(usBoxOffice.analytics.ytdVs2019Pct)} vs 2019 · provisional community dataset`,
      freshness: sourceFreshness(statuses, "us-box-office"),
      measures: [
        {
          label: "Equivalent-period YTD gross",
          valuePct: usBoxOffice.analytics.ytdVsPreviousYearPct,
          neutralBandPct: 3,
        },
      ],
    });
  }
  if (bfi.analytics) {
    filmComponents.push({
      id: "bfi-box-office",
      sourceId: "bfi",
      label: "UK reported weekend box office",
      geography: "United Kingdom",
      frequency: "weekly · equivalent-period YTD",
      detail: `${signedPercent(bfi.analytics.ytdVsPreviousYearPct)} vs prior year · ${signedPercent(bfi.analytics.ytdVs2019Pct)} vs 2019`,
      freshness: sourceFreshness(statuses, "bfi"),
      measures: [
        {
          label: "Equivalent-period YTD reported gross",
          valuePct: bfi.analytics.ytdVsPreviousYearPct,
          neutralBandPct: 3,
        },
      ],
    });
  }
  const filmTicketmaster = ticketmasterBySegment.get("Film");
  filmComponents.push(
    ticketmasterComponent({
      sourceStatus: sourceFreshness(statuses, "ticketmaster"),
      segmentName: "Film",
      latestEvents: filmTicketmaster?.latest?.uniqueEventCount ?? null,
      eventChangePct: filmTicketmaster?.comparison?.eventCountPctChange ?? null,
    }),
  );

  const theatreComponents: ViabilityComponentInput[] = [];
  if (broadway.analytics) {
    theatreComponents.push({
      id: "broadway-market",
      sourceId: "broadway-business",
      label: "Broadway weekly market",
      geography: "Broadway NYC",
      frequency: "weekly",
      detail: `Attendance ${signedPercent(broadway.analytics.attendanceYoyPct)} · nominal gross ${signedPercent(broadway.analytics.grossYoyPct)} YoY`,
      freshness: sourceFreshness(statuses, "broadway-business"),
      measures: [
        {
          label: "Attendance",
          valuePct: broadway.analytics.attendanceYoyPct,
          neutralBandPct: 2,
        },
        {
          label: "Nominal gross",
          valuePct: broadway.analytics.grossYoyPct,
          neutralBandPct: 3,
        },
      ],
    });
  }
  if (lpa.analytics?.combined) {
    theatreComponents.push({
      id: "lpa-theatre-combined",
      sourceId: "lpa",
      label: "Australian theatre market",
      geography: "Australia · Theatre + Musical Theatre",
      frequency: "annual",
      detail: `Attendance ${signedPercent(lpa.analytics.combined.attendanceChangePct)} · nominal revenue ${signedPercent(lpa.analytics.combined.revenueChangePct)} vs prior comparable year`,
      freshness: sourceFreshness(statuses, "lpa"),
      measures: [
        {
          label: "Attendance",
          valuePct: lpa.analytics.combined.attendanceChangePct,
          neutralBandPct: 2,
        },
        {
          label: "Nominal revenue",
          valuePct: lpa.analytics.combined.revenueChangePct,
          neutralBandPct: 3,
        },
      ],
    });
  }
  const theatreTicketmaster = ticketmasterBySegment.get("Arts & Theatre");
  theatreComponents.push(
    ticketmasterComponent({
      sourceStatus: sourceFreshness(statuses, "ticketmaster"),
      segmentName: "Arts & Theatre",
      latestEvents: theatreTicketmaster?.latest?.uniqueEventCount ?? null,
      eventChangePct:
        theatreTicketmaster?.comparison?.eventCountPctChange ?? null,
    }),
  );

  const gamingComponents: ViabilityComponentInput[] = [];
  if (gaming.analytics) {
    gamingComponents.push({
      id: "igdb-release-activity",
      sourceId: "igdb",
      label: "Tracked game-release activity",
      geography: "IGDB-covered market",
      frequency: "rolling 12 months",
      detail: `${gaming.analytics.latestTwelveMonthReleases.toLocaleString()} releases · ${signedPercent(gaming.analytics.latestTwelveMonthChangePct)} vs prior 12 months · ${gaming.analytics.upcoming.days90.toLocaleString()} upcoming 90D`,
      freshness: sourceFreshness(statuses, "igdb"),
      measures: [
        {
          label: "Rolling 12-month releases",
          valuePct: gaming.analytics.latestTwelveMonthChangePct,
          neutralBandPct: 3,
        },
      ],
    });
  }

  const sectors: SectorViability[] = [
    buildSectorViability({
      sector: "music",
      label: "Music",
      components: musicComponents,
    }),
    buildSectorViability({
      sector: "film",
      label: "Film",
      components: filmComponents,
    }),
    buildSectorViability({
      sector: "theatre",
      label: "Theatre",
      components: theatreComponents,
    }),
    buildSectorViability({
      sector: "gaming",
      label: "Gaming release activity",
      basis: "activity-proxy",
      components: gamingComponents,
    }),
  ];
  const mediaFreshness = ["rss", "thenewsapi"].map((sourceId) =>
    sourceFreshness(statuses, sourceId),
  );
  return {
    generatedAt: now.toISOString(),
    industryViability: buildIndustryViability(sectors),
    aiDisruption,
    aiFreshness: mediaFreshness.every((value) => value === "current")
      ? ("current" as const)
      : ("degraded" as const),
    gaming: gaming.analytics
      ? {
          direction: sectors.find((sector) => sector.sector === "gaming")!
            .direction,
          latestTwelveMonthReleases: gaming.analytics.latestTwelveMonthReleases,
          changePct: gaming.analytics.latestTwelveMonthChangePct,
          upcoming90: gaming.analytics.upcoming.days90,
          freshness: sourceFreshness(statuses, "igdb"),
        }
      : null,
    middleTier: assessMiddleTierHealth({
      hasEntityScale: false,
      hasOwnershipClassification: false,
      hasEconomicDistribution: false,
      hasLongitudinalDistribution: true,
      sectorCoverage: 2,
      availableEvidence: [
        "Ticketmaster events per venue and future supply snapshots",
        "IGDB publisher/developer release-supply concentration",
        "BFI title-level weekend concentration",
      ],
    }),
  };
});
