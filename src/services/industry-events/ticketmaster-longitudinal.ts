import "server-only";

import { cache } from "react";

import type { Prisma } from "@/generated/prisma/client";
import type { TicketmasterCountryCode } from "@/data-sources/entertainment/ticketmaster-types";
import { getPrisma } from "@/lib/prisma";
import {
  buildTicketmasterSupplySnapshots,
  compareTicketmasterSupplySnapshots,
  countTicketmasterTransitions,
  selectLatestPreviousTicketmasterSnapshots,
  TICKETMASTER_SNAPSHOT_SEGMENTS,
  type ComparableTicketmasterSnapshot,
  type TicketmasterSnapshotSegment,
  type TicketmasterSnapshotWindow,
  type TicketmasterStatusTransitionData,
} from "@/services/industry-events/ticketmaster-longitudinal-core";
import { isCompleteTicketmasterSnapshotMetadata } from "@/services/industry-events/ticketmaster-supply-core";

const COUNTRIES = ["AU", "US", "GB", "CA"] as const;

function numberValue(
  value: { toString(): string } | number | null,
): number | null {
  if (value === null) return null;
  const result = Number(value.toString());
  return Number.isFinite(result) ? result : null;
}

function snapshotRecord(value: {
  id: string;
  capturedAt: Date;
  windowDays: number;
  countryCode: string;
  segmentName: string;
  uniqueEventCount: number;
  activeVenueCount: number;
  eventsPerVenue: { toString(): string } | number | null;
  onsaleCount: number;
  offsaleCount: number;
  cancelledCount: number;
  canceledCount: number;
  postponedCount: number;
  rescheduledCount: number;
  priceRangeAvailableCount: number;
  priceCoveragePct: { toString(): string } | number | null;
}): ComparableTicketmasterSnapshot {
  return {
    id: value.id,
    capturedAt: value.capturedAt,
    windowDays: value.windowDays as TicketmasterSnapshotWindow,
    countryCode: value.countryCode as TicketmasterCountryCode,
    segmentName: value.segmentName as TicketmasterSnapshotSegment,
    uniqueEventCount: value.uniqueEventCount,
    activeVenueCount: value.activeVenueCount,
    eventsPerVenue: numberValue(value.eventsPerVenue),
    onsaleCount: value.onsaleCount,
    offsaleCount: value.offsaleCount,
    cancelledCount: value.cancelledCount,
    canceledCount: value.canceledCount,
    postponedCount: value.postponedCount,
    rescheduledCount: value.rescheduledCount,
    priceRangeAvailableCount: value.priceRangeAvailableCount,
    priceCoveragePct: numberValue(value.priceCoveragePct),
  };
}

export async function getTicketmasterSupplyTrends(input: {
  windowDays: TicketmasterSnapshotWindow;
  countryCode?: string;
  segmentName?: string;
}) {
  const prisma = getPrisma();
  const segmentName = (input.segmentName ??
    "ALL CULTURAL") as TicketmasterSnapshotSegment;
  const countries = input.countryCode
    ? [input.countryCode as TicketmasterCountryCode]
    : [...COUNTRIES];
  const records = await prisma.ticketmasterSupplySnapshot.findMany({
    where: {
      windowDays: input.windowDays,
      countryCode: { in: countries },
      segmentName,
    },
    orderBy: [{ countryCode: "asc" }, { capturedAt: "desc" }],
  });
  const entries = [];
  for (const countryCode of countries) {
    const snapshots = records
      .filter((record) => record.countryCode === countryCode)
      .map(snapshotRecord);
    const pair = selectLatestPreviousTicketmasterSnapshots(snapshots);
    const comparison = pair
      ? compareTicketmasterSupplySnapshots(pair.latest, pair.previous)
      : null;
    let transitionCounts: Record<string, number> | null = null;
    if (pair) {
      const transitions = await prisma.ticketmasterEventStatusChange.findMany({
        where: {
          countryCode,
          segmentName: segmentName === "ALL CULTURAL" ? undefined : segmentName,
          observedAt: {
            gt: pair.previous.capturedAt,
            lte: pair.latest.capturedAt,
          },
        },
        select: {
          sourceEventId: true,
          countryCode: true,
          segmentName: true,
          previousStatus: true,
          newStatus: true,
          changedAt: true,
          observedAt: true,
        },
      });
      transitionCounts = countTicketmasterTransitions(
        transitions as TicketmasterStatusTransitionData[],
        {
          startAt: new Date(pair.previous.capturedAt.getTime() + 1),
          endAt: new Date(pair.latest.capturedAt.getTime() + 1),
          countryCode,
          segmentName: segmentName === "ALL CULTURAL" ? undefined : segmentName,
        },
      );
    }
    entries.push({
      countryCode,
      latest: snapshots[0] ?? null,
      previous: pair?.previous ?? null,
      comparison,
      transitionCounts,
      newListings: null,
    });
  }
  return {
    windowDays: input.windowDays,
    segmentName,
    entries,
    hasSnapshots: entries.some((entry) => entry.latest !== null),
    hasComparableHistory: entries.some((entry) => entry.comparison !== null),
  };
}

export const getTicketmasterCrossSectorTrends = cache(async () => {
  const prisma = getPrisma();
  const snapshots = await prisma.ticketmasterSupplySnapshot.findMany({
    where: {
      windowDays: 90,
      segmentName: { in: ["Music", "Arts & Theatre", "Film"] },
    },
    orderBy: { capturedAt: "desc" },
    take: 200,
  });
  const sectors = TICKETMASTER_SNAPSHOT_SEGMENTS.filter(
    (segment) => segment !== "ALL CULTURAL",
  ).map((segmentName) => {
    const records = snapshots
      .filter((snapshot) => snapshot.segmentName === segmentName)
      .map(snapshotRecord);
    const captures = new Map<number, ComparableTicketmasterSnapshot[]>();
    for (const record of records) {
      const key = record.capturedAt.getTime();
      captures.set(key, [...(captures.get(key) ?? []), record]);
    }
    const completeCaptures = [...captures.values()]
      .filter(
        (capture) =>
          new Set(capture.map((record) => record.countryCode)).size === 4,
      )
      .sort(
        (left, right) =>
          right[0].capturedAt.getTime() - left[0].capturedAt.getTime(),
      );
    const aggregate = (
      capture: ComparableTicketmasterSnapshot[],
    ): ComparableTicketmasterSnapshot => {
      const events = capture.reduce(
        (sum, record) => sum + record.uniqueEventCount,
        0,
      );
      const venues = capture.reduce(
        (sum, record) => sum + record.activeVenueCount,
        0,
      );
      return {
        ...capture[0],
        countryCode: "ALL",
        uniqueEventCount: events,
        activeVenueCount: venues,
        eventsPerVenue: venues > 0 ? events / venues : null,
        onsaleCount: capture.reduce(
          (sum, record) => sum + record.onsaleCount,
          0,
        ),
        offsaleCount: capture.reduce(
          (sum, record) => sum + record.offsaleCount,
          0,
        ),
        cancelledCount: capture.reduce(
          (sum, record) => sum + record.cancelledCount,
          0,
        ),
        canceledCount: capture.reduce(
          (sum, record) => sum + record.canceledCount,
          0,
        ),
        postponedCount: capture.reduce(
          (sum, record) => sum + record.postponedCount,
          0,
        ),
        rescheduledCount: capture.reduce(
          (sum, record) => sum + record.rescheduledCount,
          0,
        ),
        priceRangeAvailableCount: capture.reduce(
          (sum, record) => sum + record.priceRangeAvailableCount,
          0,
        ),
        priceCoveragePct: null,
      };
    };
    const latest = completeCaptures[0] ? aggregate(completeCaptures[0]) : null;
    const previous = completeCaptures[1]
      ? aggregate(completeCaptures[1])
      : null;
    return {
      segmentName,
      latest,
      comparison:
        latest && previous
          ? compareTicketmasterSupplySnapshots(latest, previous)
          : null,
    };
  });
  return {
    sectors,
    hasSnapshots: sectors.some((sector) => sector.latest !== null),
    hasComparableHistory: sectors.some((sector) => sector.comparison !== null),
  };
});

type CompleteRunMetadata = {
  days: number;
  startDate: string;
  retrievedAt: string | null;
};

function completeRunMetadata(value: unknown): CompleteRunMetadata | null {
  if (!isCompleteTicketmasterSnapshotMetadata(value)) return null;
  if (
    typeof value.days !== "number" ||
    typeof (value as Record<string, unknown>).startDate !== "string"
  ) {
    return null;
  }
  return {
    days: value.days,
    startDate: (value as Record<string, unknown>).startDate as string,
    retrievedAt:
      typeof value.retrievedAt === "string" ? value.retrievedAt : null,
  };
}

export async function createTicketmasterLongitudinalBaseline() {
  const prisma = getPrisma();
  const runs = await prisma.ingestionRun.findMany({
    where: { source: { slug: "ticketmaster" }, status: "succeeded" },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      metadata: true,
    },
  });
  let snapshotsCreated = 0;
  for (const windowDays of [7, 30, 90] as const) {
    const run = runs.find((candidate) => {
      const metadata = completeRunMetadata(candidate.metadata);
      return metadata !== null && metadata.days >= windowDays;
    });
    if (!run) continue;
    const metadata = completeRunMetadata(run.metadata)!;
    let capturedAt = metadata.retrievedAt
      ? new Date(metadata.retrievedAt)
      : null;
    if (!capturedAt && run.completedAt) {
      capturedAt = (
        await prisma.ticketmasterEvent.aggregate({
          where: {
            retrievedAt: { gte: run.startedAt, lte: run.completedAt },
          },
          _max: { retrievedAt: true },
        })
      )._max.retrievedAt;
    }
    const startDate = new Date(metadata.startDate);
    if (
      !capturedAt ||
      Number.isNaN(capturedAt.getTime()) ||
      Number.isNaN(startDate.getTime())
    ) {
      continue;
    }
    const endDate = new Date(startDate.getTime() + windowDays * 86_400_000);
    const events = await prisma.ticketmasterEvent.findMany({
      where: {
        localDate: {
          gte: startDate.toISOString().slice(0, 10),
          lt: endDate.toISOString().slice(0, 10),
        },
        retrievedAt: { gte: capturedAt },
        testEvent: false,
      },
      select: {
        ticketmasterId: true,
        countryCode: true,
        segmentName: true,
        localDate: true,
        status: true,
        priceMin: true,
        priceMax: true,
        testEvent: true,
        venue: { select: { ticketmasterId: true } },
      },
    });
    const snapshots = buildTicketmasterSupplySnapshots({
      ingestionRunId: run.id,
      capturedAt,
      startDate,
      runWindowDays: windowDays,
      events: events.map((event) => ({
        ...event,
        priceMin: event.priceMin?.toString() ?? null,
        priceMax: event.priceMax?.toString() ?? null,
      })),
    }).filter((snapshot) => snapshot.windowDays === windowDays);
    const created = await prisma.ticketmasterSupplySnapshot.createMany({
      data: snapshots.map((snapshot) => ({
        ...snapshot,
        statusCounts: snapshot.statusCounts as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    snapshotsCreated += created.count;
  }

  let transitionsBackfilled = 0;
  const candidates = await prisma.ticketmasterEvent.findMany({
    where: {
      previousStatus: { not: null },
      statusChangedAt: { not: null },
    },
    select: {
      id: true,
      ticketmasterId: true,
      countryCode: true,
      segmentName: true,
      previousStatus: true,
      status: true,
      statusChangedAt: true,
    },
  });
  for (const event of candidates) {
    if (!event.previousStatus || !event.statusChangedAt) continue;
    const run = runs.find(
      (candidate) =>
        candidate.completedAt !== null &&
        candidate.startedAt <= event.statusChangedAt! &&
        candidate.completedAt >= event.statusChangedAt!,
    );
    if (!run) continue;
    const created = await prisma.ticketmasterEventStatusChange.createMany({
      data: [
        {
          ticketmasterEventId: event.id,
          ingestionRunId: run.id,
          sourceEventId: event.ticketmasterId,
          countryCode: event.countryCode,
          segmentName: event.segmentName,
          previousStatus: event.previousStatus,
          newStatus: event.status,
          changedAt: event.statusChangedAt,
          observedAt: event.statusChangedAt,
          metadata: {
            backfilledFromReliableLatestTransition: true,
            disappearanceTransition: false,
          },
        },
      ],
      skipDuplicates: true,
    });
    transitionsBackfilled += created.count;
  }
  return { snapshotsCreated, transitionsBackfilled };
}
