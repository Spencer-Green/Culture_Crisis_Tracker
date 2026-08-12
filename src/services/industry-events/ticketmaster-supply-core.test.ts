import { describe, expect, it } from "vitest";

import {
  groupTicketmasterEventsByWeek,
  isCompleteTicketmasterSnapshotMetadata,
  summarizeTicketmasterSupply,
  ticketmasterCountrySummaries,
  type TicketmasterSupplyRecord,
} from "@/services/industry-events/ticketmaster-supply-core";

function record(
  id: string,
  overrides: Partial<TicketmasterSupplyRecord> = {},
): TicketmasterSupplyRecord {
  return {
    ticketmasterId: id,
    countryCode: "AU",
    sectorSlug: "music",
    segmentName: "Music",
    genreName: "Rock",
    status: "onsale",
    localDate: "2026-08-15",
    eventDateTime: new Date("2026-08-15T10:00:00Z"),
    venueId: "venue-1",
    priceMin: null,
    priceMax: null,
    ...overrides,
  };
}

describe("Ticketmaster supply analytics", () => {
  const records = [
    record("one", { priceMin: 45 }),
    record("two", { status: "cancelled", venueId: "venue-2" }),
    record("three", {
      countryCode: "GB",
      segmentName: "Arts & Theatre",
      sectorSlug: "theatre",
      venueId: "venue-3",
      localDate: "2026-08-24",
      eventDateTime: null,
    }),
  ];

  it("calculates raw supply, venue, status, segment, and price coverage", () => {
    const summary = summarizeTicketmasterSupply(records);
    expect(summary).toMatchObject({
      events: 3,
      venues: 3,
      eventsPerVenue: 1,
      priceRangeEvents: 1,
      statuses: { cancelled: 1, onsale: 2 },
      segments: { "Arts & Theatre": 1, Music: 2 },
      genres: { Rock: 3 },
    });
    expect(summary.priceCoveragePercent).toBeCloseTo(100 / 3);
  });

  it("segments countries without treating offsale as canceled", () => {
    const summaries = ticketmasterCountrySummaries([
      ...records,
      record("offsale", { status: "offsale" }),
    ]);
    expect(summaries.AU.statuses).toEqual({
      cancelled: 1,
      offsale: 1,
      onsale: 1,
    });
    expect(summaries.GB.events).toBe(1);
    expect(summaries.US.events).toBe(0);
    expect(summaries.CA.events).toBe(0);
  });

  it("groups the forward calendar by week without manufacturing events", () => {
    expect(groupTicketmasterEventsByWeek(records)).toEqual([
      { weekStart: "2026-08-10", events: 2 },
      { weekStart: "2026-08-24", events: 1 },
    ]);
    expect(records).toHaveLength(3);
  });

  it("identifies only complete four-market cultural snapshots", () => {
    expect(
      isCompleteTicketmasterSnapshotMetadata({
        countries: ["AU", "US", "GB", "CA"],
        segments: ["music", "arts-theatre", "film"],
      }),
    ).toBe(true);
    expect(
      isCompleteTicketmasterSnapshotMetadata({
        countries: ["AU"],
        segments: ["music", "arts-theatre", "film"],
      }),
    ).toBe(false);
  });
});
