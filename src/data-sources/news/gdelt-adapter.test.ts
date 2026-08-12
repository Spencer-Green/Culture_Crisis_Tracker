import { describe, expect, it, vi } from "vitest";

import { GdeltDataSourceAdapter } from "@/data-sources/news/gdelt-adapter";

describe("GDELT adapter", () => {
  it("is configured only with a valid public HTTPS URL", () => {
    expect(
      new GdeltDataSourceAdapter({
        getBaseUrl: () => undefined,
      }).isConfigured(),
    ).toBe(false);
    expect(
      new GdeltDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
      }).isConfigured(),
    ).toBe(false);
    expect(
      new GdeltDataSourceAdapter({
        getBaseUrl: () => "https://api.gdeltproject.org",
      }).isConfigured(),
    ).toBe(true);
  });

  it("exposes candidate access without pretending GDELT is a metric source", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"articles":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = new GdeltDataSourceAdapter({
      getBaseUrl: () => "https://api.gdeltproject.org",
      fetchImplementation,
    });

    expect(await adapter.fetchAvailableMetrics()).toEqual([]);
    await expect(
      adapter.fetchObservations({
        metricSlug: "not-applicable",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-02"),
      }),
    ).rejects.toThrow("article candidates");
    await expect(
      adapter.fetchArticles({
        query: '"music venue" closure',
        queryFamily: "venue-closure",
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-02T00:00:00Z"),
        maxRecords: 5,
      }),
    ).resolves.toMatchObject({ articles: [] });
  });
});
