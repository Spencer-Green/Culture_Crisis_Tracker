import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { OnsDataSourceAdapter } from "@/data-sources/macro/ons-adapter";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";

const searchFixture = readFileSync(
  fileURLToPath(
    new URL("./__fixtures__/ons-search-zakv.json", import.meta.url),
  ),
  "utf8",
);
const dataFixture = readFileSync(
  fileURLToPath(new URL("./__fixtures__/ons-data-zakv.json", import.meta.url)),
  "utf8",
);

function jsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

describe("ONS adapter", () => {
  it("is configured by a valid public v1 URL without credentials", () => {
    expect(
      new OnsDataSourceAdapter({
        getBaseUrl: () => "https://api.beta.ons.gov.uk/v1",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new OnsDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
      }).isConfigured(),
    ).toBe(false);
  });

  it("exposes only the four implemented quarterly metrics", async () => {
    const adapter = new OnsDataSourceAdapter({
      getBaseUrl: () => "https://api.beta.ons.gov.uk/v1",
    });

    await expect(adapter.fetchAvailableMetrics()).resolves.toEqual(
      ONS_METRICS.map(({ slug, name, description, unit, frequency }) => ({
        slug,
        name,
        description,
        unit,
        frequency,
      })),
    );
  });

  it("uses discovery then data and returns only requested quarters", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchFixture))
      .mockResolvedValueOnce(jsonResponse(dataFixture));
    const adapter = new OnsDataSourceAdapter({
      getBaseUrl: () => "https://api.beta.ons.gov.uk/v1",
      fetchImplementation,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    const observations = await adapter.fetchObservations({
      metricSlug: ONS_METRICS[0].slug,
      countryCode: "GB",
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      value: "451764",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(String(fetchImplementation.mock.calls[0][0])).toContain(
      "/v1/search?content_type=timeseries&cdids=ZAKV",
    );
    expect(String(fetchImplementation.mock.calls[1][0])).toContain(
      "/v1/data?uri=%2Feconomy%2Fnationalaccounts",
    );
  });

  it("performs a small discovery-only health check", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(searchFixture));
    const adapter = new OnsDataSourceAdapter({
      getBaseUrl: () => "https://api.beta.ons.gov.uk/v1",
      fetchImplementation,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    await expect(adapter.healthCheck()).resolves.toMatchObject({
      status: "healthy",
      checkedAt: "2026-08-11T00:00:00.000Z",
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(String(fetchImplementation.mock.calls[0][0])).toContain(
      "/v1/search",
    );
  });
});
