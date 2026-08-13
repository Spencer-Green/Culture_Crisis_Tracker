import type { TicketmasterCountryCode } from "@/data-sources/entertainment/ticketmaster-types";

export const TICKETMASTER_SNAPSHOT_WINDOWS = [7, 30, 90] as const;
export type TicketmasterSnapshotWindow =
  (typeof TICKETMASTER_SNAPSHOT_WINDOWS)[number];

export const TICKETMASTER_SNAPSHOT_SEGMENTS = [
  "ALL CULTURAL",
  "Music",
  "Arts & Theatre",
  "Film",
] as const;
export type TicketmasterSnapshotSegment =
  (typeof TICKETMASTER_SNAPSHOT_SEGMENTS)[number];

export type TicketmasterSnapshotEvent = {
  ticketmasterId: string;
  countryCode: string;
  segmentName: string;
  localDate: string;
  venue: { ticketmasterId: string } | null;
  status: string;
  priceMin: string | null;
  priceMax: string | null;
  testEvent: boolean;
};

export type TicketmasterSupplySnapshotData = {
  ingestionRunId: string;
  capturedAt: Date;
  windowDays: TicketmasterSnapshotWindow;
  countryCode: TicketmasterCountryCode;
  segmentName: TicketmasterSnapshotSegment;
  uniqueEventCount: number;
  activeVenueCount: number;
  eventsPerVenue: number | null;
  onsaleCount: number;
  offsaleCount: number;
  cancelledCount: number;
  canceledCount: number;
  postponedCount: number;
  rescheduledCount: number;
  priceRangeAvailableCount: number;
  priceCoveragePct: number | null;
  statusCounts: Record<string, number>;
};

export type TicketmasterStatusTransitionData = {
  sourceEventId: string;
  countryCode: string;
  segmentName: string;
  previousStatus: string;
  newStatus: string;
  changedAt: Date;
  observedAt: Date;
};

export type ComparableTicketmasterSnapshot = Omit<
  TicketmasterSupplySnapshotData,
  "ingestionRunId" | "statusCounts" | "countryCode"
> & { id?: string; countryCode: string };

export type TicketmasterSnapshotComparison = {
  latest: ComparableTicketmasterSnapshot;
  previous: ComparableTicketmasterSnapshot;
  eventCountChange: number;
  eventCountPctChange: number | null;
  activeVenueChange: number;
  activeVenuePctChange: number | null;
  eventsPerVenueChange: number | null;
  eventsPerVenuePctChange: number | null;
  statusCountChanges: {
    onsale: number;
    offsale: number;
    cancelled: number;
    canceled: number;
    postponed: number;
    rescheduled: number;
  };
};

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function statusCounts(events: readonly TicketmasterSnapshotEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort());
}

export function buildTicketmasterSupplySnapshots(input: {
  ingestionRunId: string;
  capturedAt: Date;
  startDate: Date;
  runWindowDays: number;
  events: readonly TicketmasterSnapshotEvent[];
}): TicketmasterSupplySnapshotData[] {
  const supportedWindows = TICKETMASTER_SNAPSHOT_WINDOWS.filter(
    (windowDays) => windowDays <= input.runWindowDays,
  );
  const snapshots: TicketmasterSupplySnapshotData[] = [];
  for (const windowDays of supportedWindows) {
    const endDate = addUtcDays(input.startDate, windowDays);
    const endDateKey = endDate.toISOString().slice(0, 10);
    const startDateKey = input.startDate.toISOString().slice(0, 10);
    const windowEvents = input.events.filter(
      (event) =>
        !event.testEvent &&
        event.localDate >= startDateKey &&
        event.localDate < endDateKey,
    );
    for (const countryCode of ["AU", "US", "GB", "CA"] as const) {
      const countryEvents = windowEvents.filter(
        (event) => event.countryCode === countryCode,
      );
      for (const segmentName of TICKETMASTER_SNAPSHOT_SEGMENTS) {
        const events =
          segmentName === "ALL CULTURAL"
            ? countryEvents
            : countryEvents.filter(
                (event) => event.segmentName === segmentName,
              );
        const venues = new Set(
          events.map((event) => event.venue?.ticketmasterId).filter(Boolean),
        );
        const priced = events.filter(
          (event) => event.priceMin !== null || event.priceMax !== null,
        ).length;
        const statuses = statusCounts(events);
        snapshots.push({
          ingestionRunId: input.ingestionRunId,
          capturedAt: input.capturedAt,
          windowDays,
          countryCode,
          segmentName,
          uniqueEventCount: events.length,
          activeVenueCount: venues.size,
          eventsPerVenue: venues.size > 0 ? events.length / venues.size : null,
          onsaleCount: statuses.onsale ?? 0,
          offsaleCount: statuses.offsale ?? 0,
          cancelledCount: statuses.cancelled ?? 0,
          canceledCount: statuses.canceled ?? 0,
          postponedCount: statuses.postponed ?? 0,
          rescheduledCount: statuses.rescheduled ?? 0,
          priceRangeAvailableCount: priced,
          priceCoveragePct:
            events.length > 0 ? (priced / events.length) * 100 : null,
          statusCounts: statuses,
        });
      }
    }
  }
  return snapshots;
}

export function deriveTicketmasterStatusTransition(input: {
  sourceEventId: string;
  countryCode: string;
  segmentName: string;
  previousStatus: string | null;
  newStatus: string;
  observedAt: Date;
}): TicketmasterStatusTransitionData | null {
  if (!input.previousStatus || input.previousStatus === input.newStatus) {
    return null;
  }
  return {
    sourceEventId: input.sourceEventId,
    countryCode: input.countryCode,
    segmentName: input.segmentName,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    changedAt: input.observedAt,
    observedAt: input.observedAt,
  };
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function sameDimension(
  left: ComparableTicketmasterSnapshot,
  right: ComparableTicketmasterSnapshot,
): boolean {
  return (
    left.countryCode === right.countryCode &&
    left.segmentName === right.segmentName &&
    left.windowDays === right.windowDays
  );
}

export function compareTicketmasterSupplySnapshots(
  latest: ComparableTicketmasterSnapshot,
  previous: ComparableTicketmasterSnapshot,
): TicketmasterSnapshotComparison | null {
  if (
    !sameDimension(latest, previous) ||
    latest.capturedAt <= previous.capturedAt
  )
    return null;
  const latestDensity = latest.eventsPerVenue;
  const previousDensity = previous.eventsPerVenue;
  return {
    latest,
    previous,
    eventCountChange: latest.uniqueEventCount - previous.uniqueEventCount,
    eventCountPctChange: percentageChange(
      latest.uniqueEventCount,
      previous.uniqueEventCount,
    ),
    activeVenueChange: latest.activeVenueCount - previous.activeVenueCount,
    activeVenuePctChange: percentageChange(
      latest.activeVenueCount,
      previous.activeVenueCount,
    ),
    eventsPerVenueChange:
      latestDensity === null || previousDensity === null
        ? null
        : latestDensity - previousDensity,
    eventsPerVenuePctChange:
      latestDensity === null || previousDensity === null
        ? null
        : percentageChange(latestDensity, previousDensity),
    statusCountChanges: {
      onsale: latest.onsaleCount - previous.onsaleCount,
      offsale: latest.offsaleCount - previous.offsaleCount,
      cancelled: latest.cancelledCount - previous.cancelledCount,
      canceled: latest.canceledCount - previous.canceledCount,
      postponed: latest.postponedCount - previous.postponedCount,
      rescheduled: latest.rescheduledCount - previous.rescheduledCount,
    },
  };
}

export function selectLatestPreviousTicketmasterSnapshots(
  snapshots: readonly ComparableTicketmasterSnapshot[],
): {
  latest: ComparableTicketmasterSnapshot;
  previous: ComparableTicketmasterSnapshot;
} | null {
  const sorted = [...snapshots].sort(
    (left, right) => right.capturedAt.getTime() - left.capturedAt.getTime(),
  );
  const latest = sorted[0];
  if (!latest) return null;
  const previous = sorted.find(
    (candidate, index) => index > 0 && sameDimension(latest, candidate),
  );
  return previous ? { latest, previous } : null;
}

export function selectTicketmasterSnapshotNearDaysAgo(
  snapshots: readonly ComparableTicketmasterSnapshot[],
  daysAgo: 7 | 30,
): ComparableTicketmasterSnapshot | null {
  const sorted = [...snapshots].sort(
    (left, right) => right.capturedAt.getTime() - left.capturedAt.getTime(),
  );
  const latest = sorted[0];
  if (!latest) return null;
  const target = latest.capturedAt.getTime() - daysAgo * 86_400_000;
  const tolerance = (daysAgo === 7 ? 2 : 3) * 86_400_000;
  const candidates = sorted.filter(
    (candidate, index) =>
      index > 0 &&
      sameDimension(latest, candidate) &&
      Math.abs(candidate.capturedAt.getTime() - target) <= tolerance,
  );
  return (
    candidates.sort(
      (left, right) =>
        Math.abs(left.capturedAt.getTime() - target) -
        Math.abs(right.capturedAt.getTime() - target),
    )[0] ?? null
  );
}

export function countTicketmasterTransitions(
  transitions: readonly TicketmasterStatusTransitionData[],
  input: {
    startAt: Date;
    endAt: Date;
    countryCode?: string;
    segmentName?: string;
  },
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const transition of transitions) {
    if (
      transition.observedAt < input.startAt ||
      transition.observedAt >= input.endAt ||
      (input.countryCode && transition.countryCode !== input.countryCode) ||
      (input.segmentName && transition.segmentName !== input.segmentName)
    ) {
      continue;
    }
    const key = `${transition.previousStatus} → ${transition.newStatus}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort());
}
