import { describe, expect, it } from "vitest";

import {
  alignMonthlySeries,
  buildDerivedHistoricalContext,
  buildNormalizedCreditAnalytics,
  calculateCreditToDisposableIncome,
  calculatePerCapitaCredit,
  deflateCreditWithCpi,
  NORMALIZED_CREDIT_METRICS,
} from "@/lib/normalized-credit";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

function observation(
  metricSlug: string,
  periodStart: string,
  value: string,
): ConsumerSpendingObservation {
  return {
    sourceSlug: "fred",
    countryCode: "US",
    metricSlug,
    metricName: metricSlug,
    unit: "fixture unit",
    frequency: "monthly",
    periodStart,
    periodEnd: periodStart,
    value,
    retrievedAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("normalized consumer credit", () => {
  it("joins only exact aligned monthly dates without interpolation", () => {
    const aligned = alignMonthlySeries(
      [
        observation("credit", "2026-01-01T00:00:00.000Z", "100"),
        observation("credit", "2026-02-01T00:00:00.000Z", "110"),
        observation("cpi", "2026-01-01T00:00:00.000Z", "200"),
        observation("cpi", "2026-03-01T00:00:00.000Z", "220"),
      ],
      "credit",
      "cpi",
    );

    expect(aligned).toEqual([
      {
        periodStart: "2026-01-01T00:00:00.000Z",
        numerator: 100,
        denominator: 200,
      },
    ]);
  });

  it("deflates aligned credit into latest-aligned-period dollars", () => {
    const result = deflateCreditWithCpi([
      {
        periodStart: "2025-01-01T00:00:00.000Z",
        numerator: 100,
        denominator: 200,
      },
      {
        periodStart: "2026-01-01T00:00:00.000Z",
        numerator: 120,
        denominator: 240,
      },
    ]);

    expect(result.reference).toEqual({
      periodStart: "2026-01-01T00:00:00.000Z",
      value: 240,
    });
    expect(result.points.map((point) => point.value)).toEqual([120, 120]);
  });

  it("skips missing or invalid CPI rather than filling it", () => {
    expect(
      deflateCreditWithCpi([
        {
          periodStart: "2026-01-01T00:00:00.000Z",
          numerator: 100,
          denominator: 0,
        },
      ]),
    ).toEqual({ reference: null, points: [] });
  });

  it("converts USD millions and population thousands to USD per person", () => {
    expect(
      calculatePerCapitaCredit([
        {
          periodStart: "2026-01-01T00:00:00.000Z",
          numerator: 1_000,
          denominator: 200,
        },
      ])[0].value,
    ).toBe(5_000);
  });

  it("guards missing and zero population for total and revolving credit", () => {
    expect(
      calculatePerCapitaCredit([
        {
          periodStart: "2026-01-01T00:00:00.000Z",
          numerator: 1_000,
          denominator: 0,
        },
        {
          periodStart: "2026-02-01T00:00:00.000Z",
          numerator: 500,
          denominator: NaN,
        },
      ]),
    ).toEqual([]);
  });

  it("compares USD-million credit stock with USD-billion annualized DSPI", () => {
    const result = calculateCreditToDisposableIncome([
      {
        periodStart: "2026-01-01T00:00:00.000Z",
        numerator: 5_000_000,
        denominator: 25_000,
      },
    ]);

    expect(result[0].value).toBe(20);
  });

  it("does not divide DSPI SAAR by twelve and skips missing aligned months", () => {
    const aligned = alignMonthlySeries(
      [
        observation("credit", "2026-01-01T00:00:00.000Z", "5000000"),
        observation("credit", "2026-02-01T00:00:00.000Z", "5100000"),
        observation("dspi", "2026-01-01T00:00:00.000Z", "25000"),
      ],
      "credit",
      "dspi",
    );

    expect(calculateCreditToDisposableIncome(aligned)).toHaveLength(1);
    expect(calculateCreditToDisposableIncome(aligned)[0].value).toBe(20);
  });

  it("calculates normalized percentile contexts and exact YoY changes", () => {
    const context = buildDerivedHistoricalContext([
      {
        periodStart: "2025-01-01T00:00:00.000Z",
        numerator: 1,
        denominator: 1,
        value: 100,
      },
      {
        periodStart: "2025-06-01T00:00:00.000Z",
        numerator: 1,
        denominator: 1,
        value: 120,
      },
      {
        periodStart: "2026-01-01T00:00:00.000Z",
        numerator: 1,
        denominator: 1,
        value: 110,
      },
    ]);

    expect(context).toMatchObject({
      median: 110,
      maximum: 120,
      percentileRank: 50,
    });
    expect(context?.yearOverYearChange?.percent).toBe(10);
  });

  it("builds total and revolving analytics without mutating raw observations", () => {
    const observations = [
      observation(
        NORMALIZED_CREDIT_METRICS.totalCredit,
        "2026-01-01T00:00:00.000Z",
        "1000",
      ),
      observation(
        NORMALIZED_CREDIT_METRICS.revolvingCredit,
        "2026-01-01T00:00:00.000Z",
        "300",
      ),
      observation(
        NORMALIZED_CREDIT_METRICS.cpi,
        "2026-01-01T00:00:00.000Z",
        "200",
      ),
      observation(
        NORMALIZED_CREDIT_METRICS.population,
        "2026-01-01T00:00:00.000Z",
        "100",
      ),
      observation(
        NORMALIZED_CREDIT_METRICS.disposableIncome,
        "2026-01-01T00:00:00.000Z",
        "5",
      ),
    ];
    const before = structuredClone(observations);
    const analytics = buildNormalizedCreditAnalytics(observations);

    expect(analytics.totalReal?.current.value).toBe(1_000);
    expect(analytics.totalPerCapita?.current.value).toBe(10_000);
    expect(analytics.revolvingPerCapita?.current.value).toBe(3_000);
    expect(analytics.totalToDisposableIncome?.current.value).toBe(20);
    expect(observations).toEqual(before);
  });
});
