import { describe, expect, it, vi } from "vitest";

import type { TicketmasterClient } from "@/data-sources/entertainment/ticketmaster-api";
import { getTicketmasterSegment } from "@/data-sources/entertainment/ticketmaster-classifications";
import {
  eventFallsWithinWindow,
  searchTicketmasterWindow,
  splitTicketmasterWindow,
} from "@/data-sources/entertainment/ticketmaster-search";
import type { TicketmasterEventRecord } from "@/data-sources/entertainment/ticketmaster-types";

function event(id: string, dateTime: string): TicketmasterEventRecord {
  return {
    ticketmasterId: id,
    name: id,
    sourceUrl: `https://www.ticketmaster.com/${id}`,
    sourcePlatform: "Ticketmaster Discovery API v2",
    countryCode: "US",
    sectorSlug: "music",
    localDate: dateTime.slice(0, 10),
    localTime: null,
    eventDateTime: new Date(dateTime),
    timezone: "America/New_York",
    status: "onsale",
    segmentId: "KZFzniwnSyZfZ7v7nJ",
    segmentName: "Music",
    genreId: null,
    genreName: null,
    subGenreId: null,
    subGenreName: null,
    promoterId: null,
    promoterName: null,
    publicOnsaleStartAt: null,
    publicOnsaleEndAt: null,
    priceMin: null,
    priceMax: null,
    priceCurrency: null,
    priceType: null,
    locale: "en-us",
    testEvent: false,
    venue: null,
    attractions: [],
  };
}

const window = {
  startDate: new Date("2026-08-12T00:00:00Z"),
  endDateExclusive: new Date("2026-08-20T00:00:00Z"),
};

describe("Ticketmaster partitioned search", () => {
  it("splits adjacent windows at one exact half-open boundary", () => {
    const [left, right] = splitTicketmasterWindow(window);
    expect(left.startDate).toEqual(window.startDate);
    expect(left.endDateExclusive).toEqual(right.startDate);
    expect(right.endDateExclusive).toEqual(window.endDateExclusive);
    const boundary = event("boundary", right.startDate.toISOString());
    expect(eventFallsWithinWindow(boundary, left)).toBe(false);
    expect(eventFallsWithinWindow(boundary, right)).toBe(true);
  });

  it("automatically partitions dense searches instead of deep paging", async () => {
    const fetchPage = vi.fn(async (url: URL) => {
      const start = url.searchParams.get("startDateTime")!;
      const end = url.searchParams.get("endDateTime")!;
      const isParent =
        start === "2026-08-12T00:00:00Z" && end.startsWith("2026-08-19");
      return {
        page: {
          events: isParent
            ? []
            : [event(start.startsWith("2026-08-12") ? "left" : "right", start)],
          page: 0,
          size: 200,
          totalElements: isParent ? 1_001 : 1,
          totalPages: isParent ? 6 : 1,
        },
        rateLimit: { dailyRemaining: 4_900, perSecondRemaining: null },
      };
    });
    const result = await searchTicketmasterWindow({
      client: { fetchPage } as unknown as TicketmasterClient,
      baseUrl: "https://app.ticketmaster.com/discovery/v2/",
      apiKey: "secret",
      countryCode: "US",
      segment: getTicketmasterSegment("music")!,
      window,
    });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.splitCount).toBe(1);
    expect(result.windowsQueried).toHaveLength(2);
    expect(result.events.map((item) => item.ticketmasterId)).toEqual([
      "left",
      "right",
    ]);
  });

  it("paginates under the boundary, filters upstream range anomalies, and deduplicates IDs", async () => {
    const fetchPage = vi.fn(async (url: URL) => {
      const page = Number(url.searchParams.get("page"));
      return {
        page: {
          events:
            page === 0
              ? [
                  event("in-range", "2026-08-13T10:00:00Z"),
                  event("upstream-anomaly", "2026-08-01T10:00:00Z"),
                ]
              : [
                  event("in-range", "2026-08-13T10:00:00Z"),
                  event("second", "2026-08-19T10:00:00Z"),
                ],
          page,
          size: 200,
          totalElements: 400,
          totalPages: 2,
        },
        rateLimit: { dailyRemaining: 4_800, perSecondRemaining: null },
      };
    });
    const result = await searchTicketmasterWindow({
      client: { fetchPage } as unknown as TicketmasterClient,
      baseUrl: "https://app.ticketmaster.com/discovery/v2/",
      apiKey: "secret",
      countryCode: "US",
      segment: getTicketmasterSegment("music")!,
      window,
    });

    expect(result.events.map((item) => item.ticketmasterId)).toEqual([
      "in-range",
      "second",
    ]);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.recordsReturned).toBe(4);
    expect(result.outsideWindowRemoved).toBe(1);
    expect(result.splitProbeRecordsDiscarded).toBe(0);
  });
});
