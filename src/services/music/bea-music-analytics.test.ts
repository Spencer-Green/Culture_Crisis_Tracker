import { describe, expect, it } from "vitest";

import {
  BEA_MUSIC_SLUGS,
  buildBeaMusicAnalytics,
} from "@/services/music/bea-music-analytics";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

function observation(
  metricSlug: string,
  period: string,
  value: number,
): ConsumerSpendingObservation {
  const periodStart = `${period}-01T00:00:00.000Z`;
  return {
    sourceSlug: "bea",
    countryCode: "US",
    metricSlug,
    metricName: metricSlug,
    unit: metricSlug.endsWith("-real")
      ? "chained 2017 USD millions SAAR"
      : "USD millions SAAR",
    frequency: "monthly",
    periodStart,
    periodEnd: periodStart,
    value: String(value),
    retrievedAt: "2026-08-14T00:00:00.000Z",
  };
}

describe("BEA recorded-music PCE analytics", () => {
  it("calculates monthly, yearly, indexed, and compatible nominal shares", () => {
    const observations = [
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2019-01", 100),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2019-01", 100),
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2025-05", 180),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2025-05", 60),
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2025-06", 200),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2025-06", 50),
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2026-05", 240),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2026-05", 45),
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2026-06", 250),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2026-06", 40),
      observation(BEA_MUSIC_SLUGS.streamingReal, "2025-06", 190),
      observation(BEA_MUSIC_SLUGS.streamingReal, "2026-05", 210),
      observation(BEA_MUSIC_SLUGS.streamingReal, "2026-06", 220),
      observation(BEA_MUSIC_SLUGS.ownedReal, "2025-06", 55),
      observation(BEA_MUSIC_SLUGS.ownedReal, "2026-05", 44),
      observation(BEA_MUSIC_SLUGS.ownedReal, "2026-06", 42),
    ];

    const result = buildBeaMusicAnalytics(observations);

    expect(result.streamingNominal?.periodChange).toBeCloseTo(4.1667, 3);
    expect(result.streamingNominal?.yearOverYearChange).toBe(25);
    expect(result.ownedNominal?.periodChange).toBeCloseTo(-11.1111, 3);
    expect(result.ownedNominal?.yearOverYearChange).toBe(-20);
    expect(result.streamingReal?.yearOverYearChange).toBeCloseTo(15.7895, 3);
    expect(result.share).toMatchObject({
      periodStart: "2026-06-01T00:00:00.000Z",
    });
    expect(result.share?.streamingPct).toBeCloseTo(86.2069, 3);
    expect(result.share?.ownedPct).toBeCloseTo(13.7931, 3);
    expect(
      result.chart.find(
        (point) => point.periodStart === "2019-01-01T00:00:00.000Z",
      ),
    ).toMatchObject({ streamingIndex: 100, ownedIndex: 100 });
    expect(
      result.chart.find(
        (point) => point.periodStart === "2026-06-01T00:00:00.000Z",
      ),
    ).toMatchObject({ streamingIndex: 250, ownedIndex: 40 });
  });

  it("does not interpolate absent months or calculate invalid shares", () => {
    const result = buildBeaMusicAnalytics([
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2019-01", 100),
      observation(BEA_MUSIC_SLUGS.streamingNominal, "2019-03", 120),
      observation(BEA_MUSIC_SLUGS.ownedNominal, "2019-03", -120),
    ]);

    expect(result.chart.map((point) => point.periodStart)).toEqual([
      "2019-01-01T00:00:00.000Z",
      "2019-03-01T00:00:00.000Z",
    ]);
    expect(result.chart[0].ownedNominal).toBeNull();
    expect(result.share).toBeNull();
  });
});
