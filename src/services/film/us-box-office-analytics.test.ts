import { describe, expect, it } from "vitest";

import {
  buildUSBoxOfficeAnalytics,
  equivalentYearToDateGross,
  rollingGross,
  trailingGross,
  type BoxOfficeWeekendInput,
} from "@/services/film/us-box-office-analytics";

function record(
  sourceYear: number,
  weekNumber: number,
  gross: number,
): BoxOfficeWeekendInput {
  const weekendEnd = new Date(
    Date.UTC(sourceYear, 0, 4 + (weekNumber - 1) * 7),
  );
  return {
    sourceYear,
    weekNumber,
    weekendStart: new Date(weekendEnd.getTime() - 2 * 86_400_000),
    weekendEnd,
    totalGrossUsd: gross,
    top10GrossUsd: gross * 0.9,
    sourceWowChangePct: null,
    sourceWowChangeLabel: null,
    releaseCount: 50,
    topFilm: "Film",
  };
}

describe("US box-office analytics", () => {
  it("calculates four-week rolling gross without mutating input", () => {
    const input = [
      record(2026, 1, 10),
      record(2026, 2, 20),
      record(2026, 3, 30),
      record(2026, 4, 40),
    ];
    const snapshot = input.map((item) => item.totalGrossUsd);
    expect(rollingGross(input, 4)).toBe(100);
    expect(input.map((item) => item.totalGrossUsd)).toEqual(snapshot);
  });

  it("does not manufacture a rolling value across missing weekends", () => {
    expect(
      rollingGross(
        [
          record(2026, 1, 10),
          record(2026, 2, 20),
          record(2026, 4, 30),
          record(2026, 5, 40),
        ],
        4,
      ),
    ).toBeNull();
  });

  it("calculates trailing 52-week gross by dates", () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      record(2025, index + 1, 1),
    );
    expect(trailingGross(records, records.at(-1)!.weekendEnd, 52)).toBe(52);
  });

  it("limits prior-year and 2019 YTD to equivalent elapsed week numbers", () => {
    const records = [
      ...Array.from({ length: 52 }, (_, index) => record(2019, index + 1, 10)),
      ...Array.from({ length: 52 }, (_, index) => record(2025, index + 1, 20)),
      ...Array.from({ length: 10 }, (_, index) => record(2026, index + 1, 30)),
    ];
    expect(equivalentYearToDateGross(records, 2019, 10)).toBe(100);
    const analytics = buildUSBoxOfficeAnalytics(records)!;
    expect(analytics.ytdGrossUsd).toBe(300);
    expect(analytics.previousYearEquivalentYtdGrossUsd).toBe(200);
    expect(analytics.equivalent2019YtdGrossUsd).toBe(100);
    expect(analytics.ytdVsPreviousYearPct).toBe(50);
    expect(analytics.ytdVs2019Pct).toBe(200);
  });

  it("uses equivalent source week for latest YoY", () => {
    const analytics = buildUSBoxOfficeAnalytics([
      record(2025, 31, 100),
      record(2025, 32, 125),
      record(2026, 31, 180),
      record(2026, 32, 200),
    ])!;
    expect(analytics.yoyPct).toBe(60);
    expect(analytics.wowPct).toBeCloseTo(11.111, 3);
  });
});
