import { describe, expect, it, vi } from "vitest";

import { TicketmasterDataSourceAdapter } from "@/data-sources/entertainment/ticketmaster-adapter";

describe("Ticketmaster adapter", () => {
  it("requires the official URL and an API key", () => {
    expect(
      new TicketmasterDataSourceAdapter({
        getBaseUrl: () => "https://app.ticketmaster.com/discovery/v2",
        getApiKey: () => undefined,
      }).isConfigured(),
    ).toBe(false);
    expect(
      new TicketmasterDataSourceAdapter({
        getBaseUrl: () => "https://example.com/discovery/v2",
        getApiKey: () => "secret",
      }).isConfigured(),
    ).toBe(false);
    expect(
      new TicketmasterDataSourceAdapter({
        getBaseUrl: () => "https://app.ticketmaster.com/discovery/v2",
        getApiKey: () => "secret",
      }).isConfigured(),
    ).toBe(true);
  });

  it("health checks classifications without exposing its credential", async () => {
    const secret = "private-ticketmaster-key";
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"_embedded":{"classifications":[]}}', {
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = new TicketmasterDataSourceAdapter({
      getBaseUrl: () => "https://app.ticketmaster.com/discovery/v2",
      getApiKey: () => secret,
      fetchImplementation,
      sleep: async () => undefined,
      nowDate: () => new Date("2026-08-12T00:00:00Z"),
    });

    const health = await adapter.healthCheck();
    expect(health).toMatchObject({
      status: "healthy",
      checkedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(JSON.stringify(health)).not.toContain(secret);
  });

  it("does not pretend structured event supply is a metric source", async () => {
    const adapter = new TicketmasterDataSourceAdapter({
      getBaseUrl: () => "https://app.ticketmaster.com/discovery/v2",
      getApiKey: () => "secret",
    });
    await expect(adapter.fetchAvailableMetrics()).resolves.toEqual([]);
    await expect(
      adapter.fetchObservations({
        metricSlug: "not-applicable",
        startDate: new Date("2026-08-12"),
        endDate: new Date("2026-08-13"),
      }),
    ).rejects.toThrow("structured events");
  });
});
