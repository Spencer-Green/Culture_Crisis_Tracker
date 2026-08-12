import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  BeaDataSourceAdapter,
  UnsupportedBeaMetricError,
} from "@/data-sources/macro/bea-adapter";
import { parseBeaJson, sanitiseBeaUrl } from "@/data-sources/macro/bea-api";
import { BEA_METRICS } from "@/data-sources/macro/bea-metrics";
import { parseBeaObservations } from "@/data-sources/macro/bea-response";

const nominalFixture = readFileSync(
  new URL("./__fixtures__/bea-t20805.json", import.meta.url),
  "utf8",
);
const realFixture = readFileSync(
  new URL("./__fixtures__/bea-t20806.json", import.meta.url),
  "utf8",
);

describe("BEA adapter", () => {
  it("requires both a valid base URL and API key", () => {
    expect(
      new BeaDataSourceAdapter({
        getBaseUrl: () => "https://apps.bea.gov/api/data",
        getApiKey: () => "test-key",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new BeaDataSourceAdapter({
        getBaseUrl: () => "https://apps.bea.gov/api/data",
        getApiKey: () => undefined,
      }).isConfigured(),
    ).toBe(false);
  });

  it("parses nominal monthly SAAR observations, skips missing values, and deduplicates", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(nominalFixture, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const adapter = new BeaDataSourceAdapter({
      getBaseUrl: () => "https://apps.bea.gov/api/data",
      getApiKey: () => "test-key",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });

    await expect(adapter.fetchAvailableMetrics()).resolves.toHaveLength(4);
    const total = await adapter.fetchObservations({
      metricSlug: "us-pce-total-current-price",
      countryCode: "US",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-02-01T00:00:00.000Z"),
    });
    const recreation = await adapter.fetchObservations({
      metricSlug: "us-recreation-services-pce-current-price",
      countryCode: "US",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(total).toHaveLength(2);
    expect(total[0]).toMatchObject({
      value: "21111111",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-31T23:59:59.999Z"),
      metadata: {
        dataset: "NIPA",
        tableName: "T20805",
        lineNumber: "1",
        seriesCode: "DPCERC",
        unit: "USD millions SAAR",
        adjustment: "Seasonally adjusted at annual rates (SAAR)",
      },
    });
    expect(recreation).toHaveLength(1);
    expect(total[0].sourceUrl).not.toContain("test-key");
    expect(total[0].sourceUrl).not.toContain("UserID");
  });

  it("keeps real chained-dollar semantics distinct", () => {
    const observations = parseBeaObservations(
      parseBeaJson(realFixture),
      BEA_METRICS[3],
      "https://apps.bea.gov/api/data?method=GetData&TableName=T20806",
      new Date("2026-08-12T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(observations[0]).toMatchObject({
      value: "640001",
      metadata: {
        tableName: "T20806",
        lineNumber: "18",
        seriesCode: "DRCARX",
        unit: "chained 2017 USD millions SAAR",
        priceBasis: "chained-2017-dollars",
      },
    });
  });

  it("sanitises authenticated URLs and authentication errors", () => {
    const url = new URL(
      "https://apps.bea.gov/api/data?UserID=must-not-leak&method=GetData",
    );
    expect(sanitiseBeaUrl(url)).not.toContain("must-not-leak");
    expect(() =>
      parseBeaJson(
        JSON.stringify({
          BEAAPI: {
            Results: {
              Error: {
                APIErrorCode: "1",
                APIErrorDescription: "Invalid UserID must-not-leak",
              },
            },
          },
        }),
      ),
    ).toThrow("BEA authentication failed");
  });

  it("rejects reversed ranges and unsupported metrics", async () => {
    const adapter = new BeaDataSourceAdapter({
      getBaseUrl: () => "https://apps.bea.gov/api/data",
      getApiKey: () => "test-key",
    });
    await expect(
      adapter.fetchObservations({
        metricSlug: BEA_METRICS[0].slug,
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("must not precede");
    await expect(
      adapter.fetchObservations({
        metricSlug: "unknown",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(UnsupportedBeaMetricError);
  });
});
