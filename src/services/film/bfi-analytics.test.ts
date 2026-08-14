import { describe, expect, it } from "vitest";

import {
  bfiRollingGross,
  buildBFIAnalytics,
  equivalentBFIYtdGross,
  type BFIWeekendInput,
} from "@/services/film/bfi-analytics";

function week(date: string, gross: number): BFIWeekendInput {
  const weekendEnd = new Date(`${date}T00:00:00Z`);
  return {
    weekendStart: new Date(weekendEnd.getTime() - 2 * 86_400_000),
    weekendEnd,
    reportedGrossGbp: gross,
    top15GrossGbp: gross * 0.95,
    releaseCount: 20,
    topFilm: "Film",
    topFilmGrossGbp: gross * 0.4,
    top3GrossGbp: gross * 0.7,
    top5GrossGbp: gross * 0.8,
    top10GrossGbp: gross * 0.9,
  };
}

describe("BFI analytics", () => {
  it("calculates weekly, rolling, YoY and concentration without mutation", () => {
    const input = [
      week("2025-08-03", 100),
      week("2025-08-10", 100),
      week("2026-07-19", 100),
      week("2026-07-26", 100),
      week("2026-08-02", 100),
      week("2026-08-09", 120),
    ];
    const dates = input.map((record) => record.weekendEnd.toISOString());
    const analytics = buildBFIAnalytics(input, [])!;
    expect(analytics.wowPct).toBe(20);
    expect(analytics.yoyPct).toBe(20);
    expect(analytics.rolling4WeekGrossGbp).toBe(420);
    expect(analytics.topFilmSharePct).toBe(40);
    expect(input.map((record) => record.weekendEnd.toISOString())).toEqual(
      dates,
    );
  });

  it("does not bridge missing weekends for rolling values", () => {
    expect(
      bfiRollingGross(
        [
          week("2026-07-12", 1),
          week("2026-07-19", 1),
          week("2026-08-02", 1),
          week("2026-08-09", 1),
        ],
        4,
      ),
    ).toBeNull();
  });

  it("uses equivalent elapsed ISO weeks for YTD comparisons", () => {
    const input = [week("2019-01-06", 10), week("2019-01-13", 10)];
    expect(equivalentBFIYtdGross(input, 2019, 2)).toBe(20);
  });

  it("keeps annual admissions and film production separate", () => {
    const analytics = buildBFIAnalytics(
      [week("2026-08-09", 100)],
      [
        {
          year: 2019,
          cinemaAdmissionsMillions: 176.1,
          ukBoxOfficeGrossGbpM: 1254,
          releaseCount: 764,
          filmProductionSpendGbpM: 2173.7,
          filmProductionCount: 399,
        },
        {
          year: 2023,
          cinemaAdmissionsMillions: 123.6,
          ukBoxOfficeGrossGbpM: 980,
          releaseCount: 900,
          filmProductionSpendGbpM: 1356.9,
          filmProductionCount: 207,
        },
      ],
    )!;
    expect(analytics.structural?.admissionsVs2019Pct).toBeCloseTo(-29.8126, 3);
    expect(analytics.structural?.latest.filmProductionCount).toBe(207);
  });
});
