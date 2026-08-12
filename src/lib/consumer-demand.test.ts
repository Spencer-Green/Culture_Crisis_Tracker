import { describe, expect, it } from "vitest";

import {
  buildNominalDemandSeries,
  buildRealDemandSeries,
  normalizeIndexedSeries,
  prepareMixedFrequencyChart,
  type DemandSeriesDefinition,
} from "@/lib/consumer-demand";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

const definition: DemandSeriesDefinition = {
  id: "australia",
  country: "Australia",
  source: "ABS",
  metricSlug: "test-metric",
  basis: "nominal",
  color: "#fff",
  annualized: false,
};

function observation(
  periodStart: string,
  value: string,
  frequency = "monthly",
  metricSlug = "test-metric",
): ConsumerSpendingObservation {
  return {
    sourceSlug: "abs",
    countryCode: "AU",
    metricSlug,
    metricName: "Test metric",
    unit: "AUD millions",
    frequency,
    periodStart,
    periodEnd: periodStart,
    value,
    retrievedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("consumer-demand analysis", () => {
  it("sets the first valid observation at or after 2019 to 100", () => {
    const series = normalizeIndexedSeries(
      [
        observation("2018-12-01T00:00:00.000Z", "40"),
        observation("2019-01-01T00:00:00.000Z", "50"),
        observation("2019-02-01T00:00:00.000Z", "75"),
      ],
      definition,
    );

    expect(series.baselinePeriod).toBe("2019-01-01T00:00:00.000Z");
    expect(series.points.map((point) => point.indexedValue)).toEqual([
      100, 150,
    ]);
  });

  it("skips missing baseline values and uses the next valid observation", () => {
    const series = normalizeIndexedSeries(
      [
        observation("2019-01-01T00:00:00.000Z", "."),
        observation("2019-02-01T00:00:00.000Z", "0"),
        observation("2019-03-01T00:00:00.000Z", "25"),
      ],
      definition,
    );

    expect(series.baselinePeriod).toBe("2019-03-01T00:00:00.000Z");
    expect(series.points).toHaveLength(1);
    expect(series.points[0].indexedValue).toBe(100);
  });

  it("returns an unavailable series when no valid baseline exists", () => {
    const series = normalizeIndexedSeries(
      [observation("2019-01-01T00:00:00.000Z", ".")],
      definition,
    );

    expect(series.baselinePeriod).toBeNull();
    expect(series.points).toEqual([]);
  });

  it("preserves monthly observations as monthly points", () => {
    const series = normalizeIndexedSeries(
      [
        observation("2019-01-01T00:00:00.000Z", "10"),
        observation("2019-02-01T00:00:00.000Z", "11"),
      ],
      definition,
    );

    expect(series.points).toHaveLength(2);
    expect(series.points.every((point) => point.frequency === "monthly")).toBe(
      true,
    );
  });

  it("preserves quarterly observations and original quarter labels", () => {
    const series = normalizeIndexedSeries(
      [
        observation("2019-01-01T00:00:00.000Z", "10", "quarterly"),
        observation("2019-04-01T00:00:00.000Z", "12", "quarterly"),
      ],
      definition,
    );

    expect(series.points.map((point) => point.originalPeriod)).toEqual([
      "2019 Q1",
      "2019 Q2",
    ]);
    expect(
      series.points.every((point) => point.frequency === "quarterly"),
    ).toBe(true);
  });

  it("combines mixed frequencies without manufacturing observations", () => {
    const monthly = normalizeIndexedSeries(
      [
        observation("2019-01-01T00:00:00.000Z", "10"),
        observation("2019-02-01T00:00:00.000Z", "11"),
        observation("2019-03-01T00:00:00.000Z", "12"),
      ],
      definition,
    );
    const quarterly = normalizeIndexedSeries(
      [
        observation("2019-01-01T00:00:00.000Z", "20", "quarterly"),
        observation("2019-04-01T00:00:00.000Z", "21", "quarterly"),
      ],
      {
        ...definition,
        id: "united-kingdom",
        country: "United Kingdom",
        source: "ONS",
      },
    );
    const chart = prepareMixedFrequencyChart([monthly, quarterly]);

    expect(chart).toHaveLength(4);
    expect(chart[1].values).toEqual({ australia: 110 });
    expect(chart[1].points["united-kingdom"]).toBeUndefined();
    expect(
      chart.filter((datum) => datum.points["united-kingdom"]),
    ).toHaveLength(2);
  });

  it("does not mutate raw observations", () => {
    const observations = [
      observation("2019-02-01T00:00:00.000Z", "12"),
      observation("2019-01-01T00:00:00.000Z", "10"),
    ];
    const before = structuredClone(observations);

    normalizeIndexedSeries(observations, definition);

    expect(observations).toEqual(before);
  });

  it("selects the established ABS, ONS, and BEA metrics without using FRED spending", () => {
    const observations = [
      observation(
        "2019-01-01T00:00:00.000Z",
        "10",
        "monthly",
        "au-recreation-culture-spending-current-price-sa",
      ),
      observation(
        "2019-01-01T00:00:00.000Z",
        "20",
        "quarterly",
        "uk-recreation-culture-spending-current-price-sa",
      ),
      observation(
        "2019-01-01T00:00:00.000Z",
        "30",
        "monthly",
        "us-recreation-services-pce-current-price",
      ),
      observation(
        "2019-01-01T00:00:00.000Z",
        "999",
        "monthly",
        "us-total-consumer-credit-sa",
      ),
    ];

    const nominal = buildNominalDemandSeries(observations);
    const real = buildRealDemandSeries(observations);

    expect(nominal.map((series) => series.source)).toEqual([
      "ABS",
      "ONS",
      "BEA",
    ]);
    expect(nominal.map((series) => series.points.length)).toEqual([1, 1, 1]);
    expect(real[0]).toMatchObject({
      country: "Australia",
      baselinePeriod: null,
      points: [],
    });
  });
});
