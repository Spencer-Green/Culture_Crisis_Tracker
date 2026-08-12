import "server-only";

import { cache } from "react";

import { resolveTicketmasterWindow } from "@/data-sources/entertainment/ticketmaster-cli";
import { getPrisma } from "@/lib/prisma";
import {
  groupTicketmasterEventsByWeek,
  isCompleteTicketmasterSnapshotMetadata,
  summarizeTicketmasterSupply,
  ticketmasterCountrySummaries,
} from "@/services/industry-events/ticketmaster-supply-core";

export async function getTicketmasterSupply(input: {
  days: 7 | 30 | 90;
  countryCode?: string;
  segmentName?: string;
}) {
  const window = resolveTicketmasterWindow(input.days, new Date());
  const prisma = getPrisma();
  const recentRuns = await prisma.ingestionRun.findMany({
    where: { source: { slug: "ticketmaster" }, status: "succeeded" },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      startedAt: true,
      completedAt: true,
      metadata: true,
    },
  });
  const latestCompleteRun = recentRuns.find(
    (run) =>
      isCompleteTicketmasterSnapshotMetadata(run.metadata) &&
      typeof run.metadata.days === "number" &&
      run.metadata.days >= input.days,
  );
  let snapshotRetrievedAt: Date | null = null;
  if (latestCompleteRun) {
    const metadata = latestCompleteRun.metadata as Record<string, unknown>;
    if (typeof metadata.retrievedAt === "string") {
      const candidate = new Date(metadata.retrievedAt);
      if (!Number.isNaN(candidate.getTime())) snapshotRetrievedAt = candidate;
    }
    if (!snapshotRetrievedAt && latestCompleteRun.completedAt) {
      snapshotRetrievedAt = (
        await prisma.ticketmasterEvent.aggregate({
          where: {
            retrievedAt: {
              gte: latestCompleteRun.startedAt,
              lte: latestCompleteRun.completedAt,
            },
          },
          _max: { retrievedAt: true },
        })
      )._max.retrievedAt;
    }
  }
  const records = await prisma.ticketmasterEvent.findMany({
    where: {
      localDate: {
        gte: window.startDate.toISOString().slice(0, 10),
        lt: window.endDateExclusive.toISOString().slice(0, 10),
      },
      countryCode: input.countryCode || undefined,
      segmentName: input.segmentName || undefined,
      testEvent: false,
      retrievedAt: snapshotRetrievedAt
        ? { gte: snapshotRetrievedAt }
        : undefined,
    },
    select: {
      ticketmasterId: true,
      countryCode: true,
      sectorSlug: true,
      segmentName: true,
      genreName: true,
      status: true,
      localDate: true,
      eventDateTime: true,
      venueId: true,
      priceMin: true,
      priceMax: true,
    },
  });
  return {
    window,
    records,
    summary: summarizeTicketmasterSupply(records),
    countries: ticketmasterCountrySummaries(records),
    weeks: groupTicketmasterEventsByWeek(records),
    snapshotRetrievedAt,
  };
}

export const getTicketmasterSupplyOverview = cache(async () => {
  try {
    return {
      databaseStatus: "available" as const,
      ...(await getTicketmasterSupply({ days: 30 })),
    };
  } catch {
    return {
      databaseStatus: "unavailable" as const,
      summary: summarizeTicketmasterSupply([]),
      countries: ticketmasterCountrySummaries([]),
      weeks: [],
      records: [],
      window: resolveTicketmasterWindow(30, new Date()),
    };
  }
});
