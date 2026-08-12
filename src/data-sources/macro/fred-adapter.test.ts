import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  FredDataSourceAdapter,
  UnsupportedFredMetricError,
} from "@/data-sources/macro/fred-adapter";
import {
  fetchFredSeriesMetadata,
  parseFredJson,
  sanitiseFredUrl,
} from "@/data-sources/macro/fred-api";
import { FRED_METRICS } from "@/data-sources/macro/fred-metrics";
import { parseFredObservations } from "@/data-sources/macro/fred-response";

const seriesFixtures = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/fred-series.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Record<string, unknown>>;
const observationsFixture = readFileSync(
  new URL("./__fixtures__/fred-observations.json", import.meta.url),
  "utf8",
);

function jsonResponse(payload: unknown): Response {
  return new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("FRED adapter", () => {
  it("requires both a valid base URL and API key", () => {
    expect(
      new FredDataSourceAdapter({
        getBaseUrl: () => "https://api.stlouisfed.org/fred",
        getApiKey: () => "test-key",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new FredDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
        getApiKey: () => "test-key",
      }).isConfigured(),
    ).toBe(false);
  });

  it("validates metadata for all four target series", async () => {
    for (const metric of FRED_METRICS) {
      const result = await fetchFredSeriesMetadata(
        "https://api.stlouisfed.org/fred",
        "test-key",
        metric,
        {
          fetchImplementation: vi.fn<typeof fetch>(async () =>
            jsonResponse(seriesFixtures[metric.seriesId]),
          ),
        },
      );
      expect(result.metadata).toMatchObject({
        id: metric.seriesId,
        title: metric.expectedTitle,
        frequency: metric.expectedFrequency,
        units: metric.expectedUnits,
        seasonalAdjustment: "Seasonally Adjusted",
      });
    }
  });

  it("normalises monthly dates, missing values, decimals, and duplicates", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(seriesFixtures.TOTALSL))
      .mockResolvedValueOnce(jsonResponse(observationsFixture));
    const adapter = new FredDataSourceAdapter({
      getBaseUrl: () => "https://api.stlouisfed.org/fred",
      getApiKey: () => "test-key",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const observations = await adapter.fetchObservations({
      metricSlug: "us-total-consumer-credit-sa",
      countryCode: "US",
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      value: "5080455.38",
      periodStart: new Date("2025-10-01T00:00:00.000Z"),
      periodEnd: new Date("2025-10-31T23:59:59.999Z"),
      metadata: {
        seriesId: "TOTALSL",
        frequency: "Monthly",
        units: "Millions of U.S. Dollars",
        seasonalAdjustment: "Seasonally Adjusted",
        originalObservationDate: "2025-10-01",
        measureType: "credit-balance",
      },
    });
    expect(observations[0].sourceUrl).not.toContain("api_key");
    expect(observations[0].sourceUrl).not.toContain("test-key");
  });

  it("preserves quarterly boundaries and stress-rate semantics", () => {
    const payload = parseFredJson(observationsFixture);
    payload.observations = [
      {
        realtime_start: "2026-08-11",
        realtime_end: "2026-08-11",
        date: "2026-01-01",
        value: "3.84",
      },
    ];
    const metric = FRED_METRICS[3];
    const record = (
      seriesFixtures.CORCCACBS.seriess as Record<string, string>[]
    )[0];
    const observations = parseFredObservations(
      payload,
      metric,
      {
        id: record.id,
        title: record.title,
        frequency: record.frequency,
        units: record.units,
        seasonalAdjustment: record.seasonal_adjustment,
        observationStart: record.observation_start,
        observationEnd: record.observation_end,
        lastUpdated: record.last_updated,
        notes: record.notes,
      },
      "https://api.stlouisfed.org/fred/series/observations?series_id=CORCCACBS",
      new Date("2026-08-12T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-03-31T00:00:00.000Z"),
    );
    expect(observations[0]).toMatchObject({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
      metadata: {
        seriesId: "CORCCACBS",
        measureType: "credit-stress-rate",
        sourceSemantics:
          "Seasonally adjusted quarterly rate, annualized and net of recoveries",
      },
    });
  });

  it("sanitises URLs and authentication errors", () => {
    const url = new URL(
      "https://api.stlouisfed.org/fred/series?series_id=TOTALSL&api_key=must-not-leak",
    );
    expect(sanitiseFredUrl(url)).not.toContain("must-not-leak");
    expect(() =>
      parseFredJson(
        JSON.stringify({
          error_code: 400,
          error_message:
            "The value for variable api_key is not registered: must-not-leak",
        }),
      ),
    ).toThrow("FRED authentication failed");
  });

  it("rejects reversed ranges and unsupported metrics", async () => {
    const adapter = new FredDataSourceAdapter({
      getBaseUrl: () => "https://api.stlouisfed.org/fred",
      getApiKey: () => "test-key",
    });
    await expect(
      adapter.fetchObservations({
        metricSlug: FRED_METRICS[0].slug,
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
    ).rejects.toThrow(UnsupportedFredMetricError);
  });
});
