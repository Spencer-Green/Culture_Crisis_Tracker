import { describe, expect, it } from "vitest";

import {
  buildHistoricalMetricContext,
  classifyHistoricalPercentile,
  maximum,
  median,
  minimum,
  percentile,
  percentileRank,
  previousPeriodChange,
  yearOverYearChange,
} from "@/lib/historical-statistics";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

function observation(
  periodStart: string,
  value: string,
  frequency: "monthly" | "quarterly" = "monthly",
): ConsumerSpendingObservation {
  return {
    sourceSlug: "fred",
    countryCode: "US",
    metricSlug: "credit",
    metricName: "Credit",
    unit: frequency === "monthly" ? "USD millions" : "percent",
    frequency,
    periodStart,
    periodEnd: periodStart,
    value,
    retrievedAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("historical statistics", () => {
  it("calculates min, max, median, and type-7 percentiles from unsorted input", () => {
    const values = [40, 10, 30, 20];
    expect(minimum(values)).toBe(10);
    expect(maximum(values)).toBe(40);
    expect(median(values)).toBe(25);
    expect(percentile(values, 25)).toBe(17.5);
    expect(percentile(values, 75)).toBe(32.5);
    expect(percentile(values, 90)).toBeCloseTo(37);
    expect(percentile(values, 97.5)).toBeCloseTo(39.25);
  });

  it("handles missing values, repeated values, and short series", () => {
    expect(median([null, ".", undefined, "", 4])).toBe(4);
    expect(percentile([2, 2, 2], 97.5)).toBe(2);
    expect(percentileRank([1, 2, 2, 3], 2)).toBe(50);
    expect(percentile([], 50)).toBeNull();
  });

  it("uses exact classification boundaries", () => {
    expect(classifyHistoricalPercentile(24.999)).toBe("Low");
    expect(classifyHistoricalPercentile(25)).toBe("Typical");
    expect(classifyHistoricalPercentile(75)).toBe("Elevated");
    expect(classifyHistoricalPercentile(90)).toBe("High");
    expect(classifyHistoricalPercentile(97.5)).toBe("Extreme");
  });

  it("calculates previous-period and year-over-year changes", () => {
    expect(previousPeriodChange(110, 100)).toEqual({
      absolute: 10,
      percent: 10,
    });
    expect(yearOverYearChange(90, 100)).toEqual({
      absolute: -10,
      percent: -10,
    });
    expect(previousPeriodChange(10, 0)).toEqual({
      absolute: 10,
      percent: null,
    });
  });

  it("uses exact prior month and prior-year observations", () => {
    const context = buildHistoricalMetricContext(
      [
        observation("2025-06-01T00:00:00.000Z", "100"),
        observation("2026-05-01T00:00:00.000Z", "108"),
        observation("2026-06-01T00:00:00.000Z", "110"),
      ],
      "credit",
      "monthly",
    );

    expect(context?.previous?.value).toBe("108");
    expect(context?.yearAgo?.value).toBe("100");
    expect(context?.previousChange?.percent).toBeCloseTo(1.85185);
    expect(context?.yearOverYearChange?.percent).toBe(10);
  });

  it("uses exact prior quarter and prior-year observations", () => {
    const context = buildHistoricalMetricContext(
      [
        observation("2025-01-01T00:00:00.000Z", "2.4", "quarterly"),
        observation("2025-10-01T00:00:00.000Z", "2.8", "quarterly"),
        observation("2026-01-01T00:00:00.000Z", "2.9", "quarterly"),
      ],
      "credit",
      "quarterly",
    );

    expect(context?.previous?.value).toBe("2.8");
    expect(context?.yearAgo?.value).toBe("2.4");
    expect(context?.previousChange?.absolute).toBeCloseTo(0.1);
    expect(context?.yearOverYearChange?.absolute).toBeCloseTo(0.5);
  });

  it("returns missing comparisons when exact history is insufficient", () => {
    const context = buildHistoricalMetricContext(
      [observation("2026-06-01T00:00:00.000Z", "110")],
      "credit",
      "monthly",
    );

    expect(context?.previous).toBeNull();
    expect(context?.yearAgo).toBeNull();
    expect(context?.previousChange).toBeNull();
    expect(context?.yearOverYearChange).toBeNull();
  });

  it("does not mutate raw observations", () => {
    const observations = [
      observation("2026-06-01T00:00:00.000Z", "110"),
      observation("2026-05-01T00:00:00.000Z", "108"),
    ];
    const before = structuredClone(observations);

    buildHistoricalMetricContext(observations, "credit", "monthly");

    expect(observations).toEqual(before);
  });
});
