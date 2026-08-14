import { describe, expect, it } from "vitest";

import {
  buildMVTAnalytics,
  type MVTYearValue,
} from "@/services/music/mvt-analytics";

function year(overrides: Partial<MVTYearValue> = {}): MVTYearValue {
  return {
    year: 2024,
    venueCount: 810,
    permanentClosures: 46,
    venuesNoLongerOperating: 40,
    venuesUnprofitablePct: 43.8,
    unprofitabilityDefinition: "reported-loss",
    averageProfitMarginPct: 0.48,
    eventCount: 162_092,
    ticketedLiveMusicEvents: 91_149,
    audienceVisits: 19_410_840,
    totalSectorRevenueGbp: 525_570_734,
    liveMusicIncomeGbp: 113_634_865,
    employment: 30_865,
    jobsLost: null,
    townsWithoutRegularTouring: null,
    ...overrides,
  };
}

describe("MVT annual analytics", () => {
  it("sorts input and calculates comparable year changes", () => {
    const result = buildMVTAnalytics([
      year({
        year: 2025,
        venueCount: 801,
        eventCount: 174_552,
        audienceVisits: 21_683_552,
        totalSectorRevenueGbp: 558_525_252,
        employment: 24_742,
        venuesUnprofitablePct: 44.8,
      }),
      year(),
    ])!;
    expect(result.latest.year).toBe(2025);
    expect(result.venueCountYoyPct).toBeCloseTo(-1.1111);
    expect(result.eventCountYoyPct).toBeCloseTo(7.6869);
    expect(result.unprofitabilityYoyPp).toBeCloseTo(1);
    expect(result.chart.map((point) => point.year)).toEqual([2024, 2025]);
  });

  it("guards changed definitions and missing adjacent years", () => {
    const changed = buildMVTAnalytics([
      year(),
      year({
        year: 2025,
        venuesUnprofitablePct: 53.8,
        unprofitabilityDefinition: "reported-no-profit",
      }),
    ])!;
    expect(changed.unprofitabilityComparable).toBe(false);
    expect(changed.unprofitabilityYoyPp).toBeNull();
    expect(
      buildMVTAnalytics([year({ year: 2023 }), year({ year: 2025 })])!
        .venueCountYoyPct,
    ).toBeNull();
  });

  it("does not mutate raw annual observations", () => {
    const input = [year({ year: 2025 }), year({ year: 2024 })];
    const original = input.map((record) => record.year);
    buildMVTAnalytics(input);
    expect(input.map((record) => record.year)).toEqual(original);
  });
});
