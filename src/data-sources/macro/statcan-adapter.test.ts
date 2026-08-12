import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  StatCanDataSourceAdapter,
  UnsupportedStatCanMetricError,
} from "@/data-sources/macro/statcan-adapter";
import {
  parseStatCanSeriesInfo,
  StatCanResponseError,
  validateStatCanSeriesInfo,
} from "@/data-sources/macro/statcan-api";
import { STATCAN_METRICS } from "@/data-sources/macro/statcan-metrics";
import { parseStatCanObservations } from "@/data-sources/macro/statcan-response";

const seriesFixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/statcan-series-info.json", import.meta.url),
    "utf8",
  ),
);
const dataFixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/statcan-vector-data.json", import.meta.url),
    "utf8",
  ),
);

function seriesPayload(metric: (typeof STATCAN_METRICS)[number]) {
  const payload = structuredClone(seriesFixture);
  const object = payload[0].object;
  object.coordinate = metric.coordinate;
  object.vectorId = metric.vectorId;
  object.SeriesTitleEn = [
    "Canada",
    metric.priceLabel,
    metric.seasonalAdjustment,
    metric.categoryLabel,
  ].join(";");
  return payload;
}

function dataPayload(metric: (typeof STATCAN_METRICS)[number]) {
  const payload = structuredClone(dataFixture);
  payload[0].object.coordinate = metric.coordinate;
  payload[0].object.vectorId = metric.vectorId;
  return payload;
}

describe("Statistics Canada adapter", () => {
  it("requires only a valid public WDS URL", () => {
    expect(
      new StatCanDataSourceAdapter({
        getBaseUrl: () => "https://www150.statcan.gc.ca/t1/wds",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new StatCanDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
      }).isConfigured(),
    ).toBe(false);
  });

  it("exposes exactly four quarterly headline metrics", async () => {
    const adapter = new StatCanDataSourceAdapter({
      getBaseUrl: () => "https://www150.statcan.gc.ca/t1/wds",
    });
    await expect(adapter.fetchAvailableMetrics()).resolves.toHaveLength(4);
    expect(new Set(STATCAN_METRICS.map((metric) => metric.vectorId)).size).toBe(
      4,
    );
  });

  it.each(STATCAN_METRICS)(
    "validates the exact vector, coordinate, category, and price mapping for $slug",
    (metric) => {
      const series = parseStatCanSeriesInfo(seriesPayload(metric));
      expect(() => validateStatCanSeriesInfo(series, metric)).not.toThrow();
      expect(series).toMatchObject({
        vectorId: metric.vectorId,
        coordinate: metric.coordinate,
        frequencyCode: 9,
        scalarFactorCode: 6,
        memberUomCode: 81,
      });
    },
  );

  it("rejects an accidental vector/category mismatch", () => {
    const payload = seriesPayload(STATCAN_METRICS[2]);
    payload[0].object.SeriesTitleEn = payload[0].object.SeriesTitleEn.replace(
      "Recreation and culture",
      "Education",
    );
    expect(() =>
      validateStatCanSeriesInfo(
        parseStatCanSeriesInfo(payload),
        STATCAN_METRICS[2],
      ),
    ).toThrow(StatCanResponseError);
  });

  it("parses quarterly values, source semantics, nulls, ordering, and duplicates", () => {
    const metric = STATCAN_METRICS[0];
    const payload = dataPayload(metric);
    payload[0].object.vectorDataPoint.reverse();
    payload[0].object.vectorDataPoint.push(
      structuredClone(payload[0].object.vectorDataPoint[1]),
    );
    const before = structuredClone(payload);
    const observations = parseStatCanObservations(
      payload,
      metric,
      parseStatCanSeriesInfo(seriesPayload(metric)),
      "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange?vectorIds=%2262700456%22",
      new Date("2026-08-12T00:00:00.000Z"),
      new Date("2025-10-01T00:00:00.000Z"),
      new Date("2026-03-31T23:59:59.999Z"),
    );
    expect(observations).toHaveLength(2);
    expect(payload).toEqual(before);
    expect(observations[1]).toMatchObject({
      value: "452296",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
      metadata: {
        vectorId: 62700456,
        geography: "Canada",
        priceLabel: "Current prices",
        seasonalAdjustment: "Seasonally adjusted at quarterly rates",
        quarterlyRate: true,
        sourceUnit: "Dollars",
        scalarFactor: "millions",
        releaseTime: "2026-05-29T08:30",
      },
    });
  });

  it("fetches metadata then a narrow vector range and rejects unsupported metrics", async () => {
    const metric = STATCAN_METRICS[2];
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(seriesPayload(metric)))
      .mockResolvedValueOnce(Response.json(dataPayload(metric)));
    const adapter = new StatCanDataSourceAdapter({
      getBaseUrl: () => "https://www150.statcan.gc.ca/t1/wds",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const observations = await adapter.fetchObservations({
      metricSlug: metric.slug,
      countryCode: "CA",
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(observations).toHaveLength(2);
    const dataUrl = new URL(String(fetchImplementation.mock.calls[1][0]));
    expect(dataUrl.searchParams.get("vectorIds")).toBe(`"${metric.vectorId}"`);
    expect(dataUrl.searchParams.get("startRefPeriod")).toBe("2025-10-01");
    expect(dataUrl.searchParams.get("endReferencePeriod")).toBe("2026-03-31");
    await expect(
      adapter.fetchObservations({
        metricSlug: "unknown",
        startDate: new Date("2025-10-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T23:59:59.999Z"),
      }),
    ).rejects.toThrow(UnsupportedStatCanMetricError);
  });
});
