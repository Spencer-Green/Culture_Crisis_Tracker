import "server-only";

import { cache } from "react";

import { getPrisma } from "@/lib/prisma";
import {
  buildGdeltCorpusStats,
  filterIndustryEventCandidates,
  toIndustryEventCandidate,
  type IndustryEventFilters,
} from "@/services/industry-events/events-core";

const EVENT_SELECT = {
  id: true,
  eventType: true,
  title: true,
  summary: true,
  countryCode: true,
  sectorSlug: true,
  eventDate: true,
  sourceUrl: true,
  sourceName: true,
  confidence: true,
  metadata: true,
} as const;

export async function getIndustryEventCandidates(
  filters: IndustryEventFilters,
) {
  const since = filters.days
    ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000)
    : undefined;
  const records = await getPrisma().industryEvent.findMany({
    where: {
      eventDate: since ? { gte: since } : undefined,
      countryCode: filters.countryCode || undefined,
      sectorSlug: filters.sectorSlug || undefined,
      eventType: filters.eventType || undefined,
    },
    orderBy: { eventDate: "desc" },
    take: 500,
    select: EVENT_SELECT,
  });
  const candidates = records
    .map(toIndustryEventCandidate)
    .filter((candidate) => candidate !== null);
  return filterIndustryEventCandidates(candidates, filters);
}

export const getGdeltCorpusOverview = cache(async () => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
    const records = await getPrisma().industryEvent.findMany({
      where: { eventDate: { gte: since } },
      orderBy: { eventDate: "desc" },
      take: 500,
      select: EVENT_SELECT,
    });
    const candidates = records
      .map(toIndustryEventCandidate)
      .filter((candidate) => candidate !== null);
    return {
      databaseStatus: "available" as const,
      stats: buildGdeltCorpusStats(candidates),
      latest: candidates.slice(0, 5),
    };
  } catch {
    return {
      databaseStatus: "unavailable" as const,
      stats: buildGdeltCorpusStats([]),
      latest: [],
    };
  }
});
