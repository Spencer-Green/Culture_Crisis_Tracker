import { describe, expect, it } from "vitest";

import {
  buildBroadwayAnalytics,
  type BroadwayWeekValue,
} from "@/services/theatre/broadway-analytics";

function week(
  date: string,
  seasonWeekNumber: number,
  grossUsd: number,
  attendance = grossUsd,
): BroadwayWeekValue {
  return {
    weekEnding: new Date(`${date}T00:00:00Z`),
    seasonWeekNumber,
    grossUsd,
    attendance,
    showCount: 10,
    capacityPct: 80,
    averageTicketPriceUsd: null,
  };
}

describe("Broadway analytics", () => {
  it("calculates WoW, season-week YoY, rolling values, and per-show context", () => {
    const analytics = buildBroadwayAnalytics([
      week("2025-08-10", 11, 100, 50),
      week("2026-07-19", 8, 10, 5),
      week("2026-07-26", 9, 20, 10),
      week("2026-08-02", 10, 30, 15),
      week("2026-08-09", 11, 40, 20),
    ])!;
    expect(analytics.grossWowPct).toBeCloseTo(33.333, 3);
    expect(analytics.grossYoyPct).toBe(-60);
    expect(analytics.rolling4GrossUsd).toBe(100);
    expect(analytics.rolling4Attendance).toBe(50);
    expect(analytics.grossPerShow).toBe(4);
    expect(analytics.attendancePerShow).toBe(2);
  });

  it("does not interpolate missing pandemic or ordinary weeks", () => {
    const analytics = buildBroadwayAnalytics([
      week("2026-07-12", 7, 10),
      week("2026-07-26", 9, 20),
      week("2026-08-02", 10, 30),
      week("2026-08-09", 11, 40),
    ])!;
    expect(analytics.rolling4GrossUsd).toBeNull();
    expect(analytics.chart.at(-1)?.rolling4GrossUsd).toBeNull();
  });

  it("uses equivalent elapsed calendar periods and leaves unavailable 2019 context null", () => {
    const analytics = buildBroadwayAnalytics([
      week("2025-01-05", 32, 10),
      week("2025-08-10", 11, 20),
      week("2026-01-04", 32, 20),
      week("2026-08-09", 11, 40),
    ])!;
    expect(analytics.ytdGrossUsd).toBe(60);
    expect(analytics.ytdGrossVsPreviousPct).toBe(100);
    expect(analytics.ytdGrossVs2019Pct).toBeNull();
  });
});
