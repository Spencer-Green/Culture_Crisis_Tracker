import { describe, expect, it } from "vitest";

import {
  buildTicketmasterSupplySnapshots,
  compareTicketmasterSupplySnapshots,
  countTicketmasterTransitions,
  deriveTicketmasterStatusTransition,
  selectLatestPreviousTicketmasterSnapshots,
  selectTicketmasterSnapshotNearDaysAgo,
  type ComparableTicketmasterSnapshot,
  type TicketmasterSnapshotEvent,
  type TicketmasterStatusTransitionData,
} from "@/services/industry-events/ticketmaster-longitudinal-core";

function event(
  id: string,
  overrides: Partial<TicketmasterSnapshotEvent> = {},
): TicketmasterSnapshotEvent {
  return {
    ticketmasterId: id,
    countryCode: "AU",
    segmentName: "Music",
    localDate: "2026-08-15",
    venue: { ticketmasterId: "venue-1" },
    status: "onsale",
    priceMin: null,
    priceMax: null,
    testEvent: false,
    ...overrides,
  };
}

function snapshot(
  capturedAt: string,
  overrides: Partial<ComparableTicketmasterSnapshot> = {},
): ComparableTicketmasterSnapshot {
  return {
    capturedAt: new Date(capturedAt),
    windowDays: 90,
    countryCode: "US",
    segmentName: "Music",
    uniqueEventCount: 100,
    activeVenueCount: 20,
    eventsPerVenue: 5,
    onsaleCount: 90,
    offsaleCount: 2,
    cancelledCount: 4,
    canceledCount: 0,
    postponedCount: 1,
    rescheduledCount: 3,
    priceRangeAvailableCount: 50,
    priceCoveragePct: 50,
    ...overrides,
  };
}

describe("Ticketmaster longitudinal snapshots", () => {
  it("builds complete 7D, 30D, and 90D country and segment aggregates", () => {
    const snapshots = buildTicketmasterSupplySnapshots({
      ingestionRunId: "run-1",
      capturedAt: new Date("2026-08-12T12:00:00Z"),
      startDate: new Date("2026-08-12T00:00:00Z"),
      runWindowDays: 90,
      events: [
        event("music-priced", { priceMin: "20.00" }),
        event("music-cancelled", {
          venue: { ticketmasterId: "venue-2" },
          status: "cancelled",
        }),
        event("theatre", {
          segmentName: "Arts & Theatre",
          venue: { ticketmasterId: "venue-2" },
        }),
        event("film-30d", {
          segmentName: "Film",
          localDate: "2026-09-01",
          venue: null,
          status: "postponed",
        }),
        event("us-90d", {
          countryCode: "US",
          localDate: "2026-10-01",
          venue: { ticketmasterId: "venue-us" },
          status: "rescheduled",
        }),
        event("outside", { localDate: "2026-12-01" }),
        event("test", { testEvent: true }),
      ],
    });

    expect(snapshots).toHaveLength(48);
    const sevenDayAustralia = snapshots.find(
      (item) =>
        item.windowDays === 7 &&
        item.countryCode === "AU" &&
        item.segmentName === "ALL CULTURAL",
    );
    expect(sevenDayAustralia).toMatchObject({
      uniqueEventCount: 3,
      activeVenueCount: 2,
      eventsPerVenue: 1.5,
      onsaleCount: 2,
      cancelledCount: 1,
      priceRangeAvailableCount: 1,
      statusCounts: { cancelled: 1, onsale: 2 },
    });
    expect(sevenDayAustralia?.priceCoveragePct).toBeCloseTo(100 / 3);
    expect(
      snapshots.find(
        (item) =>
          item.windowDays === 30 &&
          item.countryCode === "AU" &&
          item.segmentName === "Film",
      ),
    ).toMatchObject({
      uniqueEventCount: 1,
      activeVenueCount: 0,
      eventsPerVenue: null,
      postponedCount: 1,
    });
    expect(
      snapshots.find(
        (item) =>
          item.windowDays === 90 &&
          item.countryCode === "US" &&
          item.segmentName === "Music",
      ),
    ).toMatchObject({ uniqueEventCount: 1, rescheduledCount: 1 });
  });

  it("only creates snapshot windows covered by the completed run", () => {
    const seven = buildTicketmasterSupplySnapshots({
      ingestionRunId: "run-7",
      capturedAt: new Date("2026-08-12T12:00:00Z"),
      startDate: new Date("2026-08-12T00:00:00Z"),
      runWindowDays: 7,
      events: [],
    });
    const thirty = buildTicketmasterSupplySnapshots({
      ingestionRunId: "run-30",
      capturedAt: new Date("2026-08-12T12:00:00Z"),
      startDate: new Date("2026-08-12T00:00:00Z"),
      runWindowDays: 30,
      events: [],
    });

    expect(seven).toHaveLength(16);
    expect(new Set(seven.map((item) => item.windowDays))).toEqual(new Set([7]));
    expect(thirty).toHaveLength(32);
    expect(new Set(thirty.map((item) => item.windowDays))).toEqual(
      new Set([7, 30]),
    );
  });
});

describe("Ticketmaster status transitions", () => {
  it.each([
    ["onsale", "cancelled"],
    ["onsale", "postponed"],
    ["postponed", "rescheduled"],
    ["rescheduled", "onsale"],
  ])("preserves the exact %s → %s source transition", (from, to) => {
    expect(
      deriveTicketmasterStatusTransition({
        sourceEventId: "event-1",
        countryCode: "GB",
        segmentName: "Arts & Theatre",
        previousStatus: from,
        newStatus: to,
        observedAt: new Date("2026-08-20T00:00:00Z"),
      }),
    ).toMatchObject({ previousStatus: from, newStatus: to });
  });

  it("does not create first-seen, unchanged, or disappearance transitions", () => {
    expect(
      deriveTicketmasterStatusTransition({
        sourceEventId: "first-seen",
        countryCode: "AU",
        segmentName: "Music",
        previousStatus: null,
        newStatus: "onsale",
        observedAt: new Date(),
      }),
    ).toBeNull();
    expect(
      deriveTicketmasterStatusTransition({
        sourceEventId: "unchanged",
        countryCode: "AU",
        segmentName: "Music",
        previousStatus: "onsale",
        newStatus: "onsale",
        observedAt: new Date(),
      }),
    ).toBeNull();
    const previouslySeenButNowAbsent = [event("aged-out")];
    const newlyObserved: TicketmasterSnapshotEvent[] = [];
    expect(previouslySeenButNowAbsent).toHaveLength(1);
    expect(newlyObserved.flatMap(() => [])).toEqual([]);
  });

  it("allows the same transition again at a genuinely later observation", () => {
    const first = deriveTicketmasterStatusTransition({
      sourceEventId: "event-1",
      countryCode: "US",
      segmentName: "Music",
      previousStatus: "onsale",
      newStatus: "postponed",
      observedAt: new Date("2026-08-13T00:00:00Z"),
    });
    const later = deriveTicketmasterStatusTransition({
      sourceEventId: "event-1",
      countryCode: "US",
      segmentName: "Music",
      previousStatus: "onsale",
      newStatus: "postponed",
      observedAt: new Date("2026-09-13T00:00:00Z"),
    });
    expect(first?.observedAt).not.toEqual(later?.observedAt);
  });

  it("filters transition counts by interval, country, and segment", () => {
    const transitions: TicketmasterStatusTransitionData[] = [
      {
        sourceEventId: "one",
        countryCode: "US",
        segmentName: "Music",
        previousStatus: "onsale",
        newStatus: "cancelled",
        changedAt: new Date("2026-08-15T00:00:00Z"),
        observedAt: new Date("2026-08-15T00:00:00Z"),
      },
      {
        sourceEventId: "two",
        countryCode: "US",
        segmentName: "Music",
        previousStatus: "onsale",
        newStatus: "postponed",
        changedAt: new Date("2026-08-16T00:00:00Z"),
        observedAt: new Date("2026-08-16T00:00:00Z"),
      },
      {
        sourceEventId: "three",
        countryCode: "CA",
        segmentName: "Music",
        previousStatus: "postponed",
        newStatus: "rescheduled",
        changedAt: new Date("2026-08-16T00:00:00Z"),
        observedAt: new Date("2026-08-16T00:00:00Z"),
      },
    ];
    expect(
      countTicketmasterTransitions(transitions, {
        startAt: new Date("2026-08-14T00:00:00Z"),
        endAt: new Date("2026-08-17T00:00:00Z"),
        countryCode: "US",
        segmentName: "Music",
      }),
    ).toEqual({ "onsale → cancelled": 1, "onsale → postponed": 1 });
  });
});

describe("Ticketmaster snapshot comparison", () => {
  it("compares only matching country, segment, and window snapshots", () => {
    const previous = snapshot("2026-08-01T00:00:00Z");
    const latest = snapshot("2026-08-08T00:00:00Z", {
      uniqueEventCount: 110,
      activeVenueCount: 22,
      eventsPerVenue: 5.5,
      cancelledCount: 7,
    });
    expect(compareTicketmasterSupplySnapshots(latest, previous)).toMatchObject({
      eventCountChange: 10,
      eventCountPctChange: 10,
      activeVenueChange: 2,
      activeVenuePctChange: 10,
      eventsPerVenueChange: 0.5,
      eventsPerVenuePctChange: 10,
      statusCountChanges: { cancelled: 3 },
    });
    expect(
      compareTicketmasterSupplySnapshots(
        { ...latest, countryCode: "CA" },
        previous,
      ),
    ).toBeNull();
  });

  it("guards zero denominators and reports insufficient history", () => {
    const latest = snapshot("2026-08-08T00:00:00Z", {
      uniqueEventCount: 10,
      activeVenueCount: 2,
      eventsPerVenue: 5,
    });
    const zero = snapshot("2026-08-01T00:00:00Z", {
      uniqueEventCount: 0,
      activeVenueCount: 0,
      eventsPerVenue: null,
    });
    expect(compareTicketmasterSupplySnapshots(latest, zero)).toMatchObject({
      eventCountPctChange: null,
      activeVenuePctChange: null,
      eventsPerVenuePctChange: null,
    });
    expect(selectLatestPreviousTicketmasterSnapshots([latest])).toBeNull();
  });

  it("selects the immediately previous and appropriately near historical snapshots", () => {
    const latest = snapshot("2026-09-01T00:00:00Z");
    const previous = snapshot("2026-08-25T00:00:00Z");
    const monthAgo = snapshot("2026-08-02T00:00:00Z");
    const snapshots = [monthAgo, latest, previous];
    expect(selectLatestPreviousTicketmasterSnapshots(snapshots)).toEqual({
      latest,
      previous,
    });
    expect(selectTicketmasterSnapshotNearDaysAgo(snapshots, 7)).toEqual(
      previous,
    );
    expect(selectTicketmasterSnapshotNearDaysAgo(snapshots, 30)).toEqual(
      monthAgo,
    );
  });
});
