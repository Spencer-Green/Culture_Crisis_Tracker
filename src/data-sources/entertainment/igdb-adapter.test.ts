import { describe, expect, it } from "vitest";

import { IgdbDataSourceAdapter } from "@/data-sources/entertainment/igdb-adapter";

describe("IGDB adapter", () => {
  it("requires the official URL plus client ID and secret", () => {
    expect(
      new IgdbDataSourceAdapter({
        getBaseUrl: () => "https://api.igdb.com/v4",
        getClientId: () => "id",
        getClientSecret: () => undefined,
      }).isConfigured(),
    ).toBe(false);
    expect(
      new IgdbDataSourceAdapter({
        getBaseUrl: () => "https://example.com/v4",
        getClientId: () => "id",
        getClientSecret: () => "secret",
      }).isConfigured(),
    ).toBe(false);
    expect(
      new IgdbDataSourceAdapter({
        getBaseUrl: () => "https://api.igdb.com/v4",
        getClientId: () => "id",
        getClientSecret: () => "secret",
      }).isConfigured(),
    ).toBe(true);
  });

  it("does not pretend structured game records are metric observations", async () => {
    const adapter = new IgdbDataSourceAdapter({
      getBaseUrl: () => "https://api.igdb.com/v4",
      getClientId: () => "id",
      getClientSecret: () => "secret",
    });
    await expect(adapter.fetchAvailableMetrics()).resolves.toEqual([]);
    await expect(
      adapter.fetchObservations({
        metricSlug: "not-applicable",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-02"),
      }),
    ).rejects.toThrow("structured game records");
  });
});
