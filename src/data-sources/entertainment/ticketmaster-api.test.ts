import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildTicketmasterClassificationsUrl,
  buildTicketmasterEventsUrl,
  sanitiseTicketmasterUrl,
  TicketmasterClient,
  TicketmasterResponseError,
} from "@/data-sources/entertainment/ticketmaster-api";
import {
  getTicketmasterSegment,
  TICKETMASTER_SEGMENTS,
} from "@/data-sources/entertainment/ticketmaster-classifications";

const fixtureUrl = new URL(
  "./__fixtures__/ticketmaster-events.json",
  import.meta.url,
);

describe("Ticketmaster Discovery API", () => {
  it("uses exact live-validated cultural segment mappings", () => {
    expect(TICKETMASTER_SEGMENTS).toEqual([
      expect.objectContaining({
        id: "KZFzniwnSyZfZ7v7nJ",
        name: "Music",
        sectorSlug: "music",
      }),
      expect.objectContaining({
        id: "KZFzniwnSyZfZ7v7na",
        name: "Arts & Theatre",
        sectorSlug: "theatre",
      }),
      expect.objectContaining({
        id: "KZFzniwnSyZfZ7v7nn",
        name: "Film",
        sectorSlug: "film",
      }),
    ]);
  });

  it("builds deterministic bounded queries and redacts the API key", () => {
    const secret = "ticketmaster-secret-value";
    const url = buildTicketmasterEventsUrl(
      "https://app.ticketmaster.com/discovery/v2/",
      secret,
      {
        countryCode: "AU",
        segment: getTicketmasterSegment("music")!,
        startDate: new Date("2026-08-12T00:00:00Z"),
        endDateExclusive: new Date("2026-08-19T00:00:00Z"),
        page: 2,
      },
    );

    expect(url.pathname).toBe("/discovery/v2/events.json");
    expect(url.searchParams.get("countryCode")).toBe("AU");
    expect(url.searchParams.get("segmentId")).toBe("KZFzniwnSyZfZ7v7nJ");
    expect(url.searchParams.get("startDateTime")).toBe("2026-08-12T00:00:00Z");
    expect(url.searchParams.get("endDateTime")).toBe("2026-08-18T23:59:59Z");
    expect(url.searchParams.get("size")).toBe("200");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("sort")).toBe("date,asc");
    expect(url.searchParams.get("apikey")).toBe(secret);
    expect(sanitiseTicketmasterUrl(url)).not.toContain(secret);
    expect(sanitiseTicketmasterUrl(url)).not.toContain("apikey");
  });

  it("parses structured events while preserving optional values and price missingness", async () => {
    const body = await readFile(fixtureUrl, "utf8");
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "rate-limit-available": "4975",
        },
      }),
    );
    const client = new TicketmasterClient(
      "https://app.ticketmaster.com/discovery/v2/",
      "secret",
      { fetchImplementation, sleep: async () => undefined },
    );
    const result = await client.fetchPage(
      buildTicketmasterClassificationsUrl(
        "https://app.ticketmaster.com/discovery/v2/",
        "secret",
      ),
    );

    expect(result.page.events).toHaveLength(2);
    expect(result.page.events[0]).toMatchObject({
      ticketmasterId: "Z698xZb_Z16v7e",
      status: "onsale",
      countryCode: "AU",
      sectorSlug: "music",
      priceMin: "55.00",
      priceMax: "125.50",
      priceCurrency: "AUD",
      promoterName: "Example Promoter",
      locale: "en-au",
      testEvent: false,
      venue: {
        ticketmasterId: "KovZpZAJ6tIA",
        city: "Melbourne",
        region: "Victoria",
      },
      attractions: [{ id: "K8vZ9178abc", name: "Example Artist" }],
    });
    expect(result.page.events[1]).toMatchObject({
      ticketmasterId: "vvG1FZb1234",
      status: "postponed",
      countryCode: "CA",
      sectorSlug: "theatre",
      eventDateTime: null,
      priceMin: null,
      priceMax: null,
    });
    expect(result.rateLimit.dailyRemaining).toBe(4975);
  });

  it("retries rate limits with bounded backoff and keeps secrets out of errors", async () => {
    const secret = "never-leak-this-key";
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain", "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"_embedded":{"events":[]},"page":{"size":200,"totalElements":0,"totalPages":0,"number":0}}',
          {
            headers: { "content-type": "application/json" },
          },
        ),
      );
    const sleep = vi.fn(async () => undefined);
    const client = new TicketmasterClient(
      "https://app.ticketmaster.com/discovery/v2/",
      secret,
      { fetchImplementation, sleep, maxRetries: 1 },
    );
    await expect(
      client.fetchPage(
        buildTicketmasterClassificationsUrl(
          "https://app.ticketmaster.com/discovery/v2/",
          secret,
        ),
      ),
    ).resolves.toMatchObject({ page: { events: [] } });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);

    const failingClient = new TicketmasterClient(
      "https://app.ticketmaster.com/discovery/v2/",
      secret,
      {
        fetchImplementation: vi
          .fn<typeof fetch>()
          .mockRejectedValue(new Error(`failed ${secret}`)),
        sleep: async () => undefined,
      },
    );
    const failure = await failingClient
      .fetchPage(
        buildTicketmasterClassificationsUrl(
          "https://app.ticketmaster.com/discovery/v2/",
          secret,
        ),
      )
      .catch((error: unknown) => error);
    expect(String(failure)).not.toContain(secret);
  });

  it("rejects insecure endpoints and invalid windows", () => {
    expect(() =>
      buildTicketmasterClassificationsUrl("http://example.com", "secret"),
    ).toThrow("official HTTPS");
    expect(() =>
      buildTicketmasterClassificationsUrl("https://example.com", "secret"),
    ).toThrow("official HTTPS");
    expect(() =>
      buildTicketmasterEventsUrl("https://example.com", "secret", {
        countryCode: "US",
        segment: getTicketmasterSegment("film")!,
        startDate: new Date("2026-08-20T00:00:00Z"),
        endDateExclusive: new Date("2026-08-19T00:00:00Z"),
        page: 0,
      }),
    ).toThrow(TicketmasterResponseError);
  });
});
