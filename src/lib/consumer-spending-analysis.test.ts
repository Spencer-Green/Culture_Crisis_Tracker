import { describe, expect, it } from "vitest";

import {
  alignedNominalRealGrowthGap,
  buildMetricTrend,
  buildRecreationShareTrend,
  latestPeriodComparison,
  nominalRealGrowthGap,
} from "@/lib/consumer-spending-analysis";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

function observation(
  metricSlug: string,
  periodStart: string,
  value: string,
  frequency: "monthly" | "quarterly" = "monthly",
): ConsumerSpendingObservation {
  return {
    sourceSlug: "test",
    countryCode: "US",
    metricSlug,
    metricName: metricSlug,
    unit: "USD millions",
    frequency,
    periodStart,
    periodEnd: periodStart,
    value,
    retrievedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("consumer spending analysis", () => {
  it("calculates exact monthly previous-period and year-over-year changes", () => {
    const trend = buildMetricTrend(
      [
        observation("metric", "2025-06-01T00:00:00.000Z", "100"),
        observation("metric", "2026-05-01T00:00:00.000Z", "108"),
        observation("metric", "2026-06-01T00:00:00.000Z", "110"),
      ],
      "metric",
      "monthly",
    );

    expect(trend?.periodChange).toBeCloseTo(1.85185);
    expect(trend?.yearOverYearChange).toBe(10);
  });

  it("calculates exact quarterly changes without filling missing quarters", () => {
    const observations = [
      observation("metric", "2025-01-01T00:00:00.000Z", "80", "quarterly"),
      observation("metric", "2025-10-01T00:00:00.000Z", "90", "quarterly"),
      observation("metric", "2026-01-01T00:00:00.000Z", "100", "quarterly"),
    ];
    const trend = buildMetricTrend(observations, "metric", "quarterly");

    expect(trend?.periodChange).toBeCloseTo(11.1111);
    expect(trend?.yearOverYearChange).toBe(25);
    expect(observations).toHaveLength(3);
  });

  it("returns missing comparisons and protects zero denominators", () => {
    const trend = buildMetricTrend(
      [
        observation("metric", "2025-06-01T00:00:00.000Z", "0"),
        observation("metric", "2026-06-01T00:00:00.000Z", "10"),
      ],
      "metric",
      "monthly",
    );

    expect(trend?.periodChange).toBeNull();
    expect(trend?.yearOverYearChange).toBeNull();
  });

  it("calculates nominal recreation share and its year-over-year point change", () => {
    const observations = [
      observation("recreation", "2025-06-01T00:00:00.000Z", "10"),
      observation("total", "2025-06-01T00:00:00.000Z", "200"),
      observation("recreation", "2026-05-01T00:00:00.000Z", "11"),
      observation("total", "2026-05-01T00:00:00.000Z", "200"),
      observation("recreation", "2026-06-01T00:00:00.000Z", "12"),
      observation("total", "2026-06-01T00:00:00.000Z", "200"),
    ];
    const before = structuredClone(observations);
    const share = buildRecreationShareTrend(
      observations,
      "recreation",
      "total",
      "monthly",
    );

    expect(share).toMatchObject({ current: 6, previous: 5.5, yearAgo: 5 });
    expect(share?.yearOverYearPointChange).toBe(1);
    expect(observations).toEqual(before);
  });

  it("returns no share when aligned inputs are missing or total is zero", () => {
    expect(
      buildRecreationShareTrend(
        [observation("recreation", "2026-06-01T00:00:00.000Z", "10")],
        "recreation",
        "total",
        "monthly",
      ),
    ).toBeNull();
    expect(
      buildRecreationShareTrend(
        [
          observation("recreation", "2026-06-01T00:00:00.000Z", "10"),
          observation("total", "2026-06-01T00:00:00.000Z", "0"),
        ],
        "recreation",
        "total",
        "monthly",
      ),
    ).toBeNull();
  });

  it("compares nominal and real growth rates without subtracting levels", () => {
    expect(nominalRealGrowthGap(5.2, 1.1)).toBeCloseTo(4.1);
    expect(nominalRealGrowthGap(5.2, null)).toBeNull();
  });

  it("does not compare nominal and real growth from different source periods", () => {
    const nominal = buildMetricTrend(
      [
        observation("nominal", "2025-06-01T00:00:00.000Z", "100"),
        observation("nominal", "2026-06-01T00:00:00.000Z", "110"),
      ],
      "nominal",
      "monthly",
    );
    const real = buildMetricTrend(
      [
        observation("real", "2025-04-01T00:00:00.000Z", "100", "quarterly"),
        observation("real", "2026-04-01T00:00:00.000Z", "105", "quarterly"),
      ],
      "real",
      "quarterly",
    );

    expect(alignedNominalRealGrowthGap(nominal, real)).toBeNull();
  });

  it("selects the latest period without mutating input", () => {
    const values = [
      { periodStart: "2026-01-01T00:00:00.000Z", value: 1 },
      { periodStart: "2026-03-01T00:00:00.000Z", value: 3 },
      { periodStart: "2026-02-01T00:00:00.000Z", value: 2 },
    ];
    const before = structuredClone(values);
    expect(latestPeriodComparison(values)?.value).toBe(3);
    expect(values).toEqual(before);
  });
});
