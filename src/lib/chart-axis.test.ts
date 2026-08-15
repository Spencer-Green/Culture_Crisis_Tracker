import { describe, expect, it } from "vitest";

import {
  calendarTicks,
  chartTimestamp,
  filterChartRange,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

describe("sector chart calendar axes", () => {
  it("uses monthly labels for one year and annual labels for five years", () => {
    const months = Array.from({ length: 60 }, (_, index) =>
      Date.UTC(2021 + Math.floor(index / 12), index % 12, 1),
    );
    expect(
      calendarTicks(months.slice(-12), { frequency: "monthly", range: "1Y" }),
    ).toHaveLength(12);
    expect(
      calendarTicks(months, { frequency: "monthly", range: "5Y" }).map(
        (value) => formatCalendarTick(value, "monthly", "5Y"),
      ),
    ).toEqual(["2021", "2022", "2023", "2024", "2025"]);
  });

  it("uses whole years for quarterly and annual observations", () => {
    const quarters = ["2019-Q1", "2019-Q4", "2020-Q2", "2021-Q3"].map((value) =>
      chartTimestamp(value, "quarterly"),
    );
    expect(
      calendarTicks(quarters, { frequency: "quarterly", range: "MAX" }),
    ).toHaveLength(3);
    expect(formatExactPeriod(quarters[1], "quarterly")).toBe("2019 Q4");
    expect(chartTimestamp(2024, "annual")).toBe(Date.UTC(2024, 0, 1));
  });

  it("shows annual weekly ticks for long ranges using real timestamps", () => {
    const timestamps = [
      "2019-06-30",
      "2020-08-23",
      "2021-10-17",
      "2022-01-02",
    ].map((value) => chartTimestamp(value, "weekly"));
    expect(
      calendarTicks(timestamps, { frequency: "weekly", range: "2019" }),
    ).toEqual(timestamps);
  });

  it("excludes future ticks and filters Since 2019 by calendar time", () => {
    const values = [
      Date.UTC(2018, 0, 1),
      Date.UTC(2019, 0, 1),
      Date.UTC(2027, 0, 1),
    ];
    expect(
      calendarTicks(values, {
        frequency: "annual",
        range: "MAX",
        now: new Date("2026-08-15T00:00:00Z"),
      }),
    ).toEqual(values.slice(0, 2));
    expect(filterChartRange(values, (value) => value, "2019")).toEqual(
      values.slice(1),
    );
  });
});
