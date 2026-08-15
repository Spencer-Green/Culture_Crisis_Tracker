import { describe, expect, it } from "vitest";

import {
  buildLPAPerformanceAnalytics,
  type LPAPerformanceValue,
} from "@/services/theatre/lpa-analytics";

function value(
  year: number,
  category: LPAPerformanceValue["category"],
  revenueAud: number | null,
  attendance: number | null,
  averageTicketPriceAud: number | null = null,
): LPAPerformanceValue {
  return {
    year,
    category,
    categoryLabel: category === "THEATRE" ? "Theatre" : "Musical Theatre",
    revenueAud,
    attendance,
    averageTicketPriceAud,
  };
}

describe("LPA annual analytics", () => {
  it("calculates prior-observation and 2019 comparisons by category", () => {
    const analytics = buildLPAPerformanceAnalytics([
      value(2019, "THEATRE", 100, 200),
      value(2023, "THEATRE", 120, 240, 50),
      value(2024, "THEATRE", 90, 180, 45),
    ]).theatre!;
    expect(analytics.revenueChangePct).toBe(-25);
    expect(analytics.attendanceChangePct).toBe(-25);
    expect(analytics.averageTicketPriceChangePct).toBe(-10);
    expect(analytics.revenueVs2019Pct).toBe(-10);
    expect(analytics.attendanceVs2019Pct).toBe(-10);
  });

  it("derives combined revenue and attendance only for valid common observations", () => {
    const analytics = buildLPAPerformanceAnalytics([
      value(2019, "THEATRE", 100, 200),
      value(2024, "THEATRE", 150, 250),
      value(2019, "MUSICAL_THEATRE", 300, 400),
      value(2024, "MUSICAL_THEATRE", 350, 450),
    ]).combined!;
    expect(analytics.latest).toMatchObject({
      year: 2024,
      revenueAud: 500,
      attendance: 700,
      averageTicketPriceAud: null,
    });
    expect(analytics.revenueVs2019Pct).toBe(25);
  });

  it("does not manufacture combined records or changes from missing values", () => {
    const result = buildLPAPerformanceAnalytics([
      value(2023, "THEATRE", 100, 200),
      value(2024, "THEATRE", 120, 220),
      value(2024, "MUSICAL_THEATRE", null, 400),
    ]);
    expect(result.combined).toBeNull();
    expect(result.theatre?.revenueVs2019Pct).toBeNull();
  });
});
