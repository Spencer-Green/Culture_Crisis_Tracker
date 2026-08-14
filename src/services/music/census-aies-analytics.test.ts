import { describe, expect, it } from "vitest";

import {
  buildCensusRecordIndustryAnalytics,
  type CensusRecordIndustryYearValue,
} from "@/services/music/census-aies-analytics";

function year(
  value: Partial<CensusRecordIndustryYearValue> = {},
): CensusRecordIndustryYearValue {
  return {
    year: 2023,
    naicsCode: "512250",
    industryLabel: "Record production and distribution",
    revenueUsd: 13_698_582_000,
    payrollUsd: 2_202_030_000,
    employment: 13_163,
    operatingExpensesUsd: 12_151_050_000,
    sourceVintage: "2023",
    ...value,
  };
}

describe("Census record-industry analytics", () => {
  it("calculates valid per-employee ratios without inventing change", () => {
    const result = buildCensusRecordIndustryAnalytics([year()])!;
    expect(result.revenuePerEmployeeUsd).toBeCloseTo(1_040_688.44, 2);
    expect(result.payrollPerEmployeeUsd).toBeCloseTo(167_289.37, 2);
    expect(result.revenueChangePct).toBeNull();
    expect(result.changeLabel).toBe("Insufficient comparable AIES history");
  });

  it("labels adjacent observations YoY and gaps as prior-observation changes", () => {
    const adjacent = buildCensusRecordIndustryAnalytics([
      year({ year: 2023, revenueUsd: 100 }),
      year({ year: 2024, revenueUsd: 110, sourceVintage: "2024" }),
    ])!;
    expect(adjacent.isYearOverYear).toBe(true);
    expect(adjacent.revenueChangePct).toBeCloseTo(10);
    const gap = buildCensusRecordIndustryAnalytics([
      year({ year: 2023, revenueUsd: 100 }),
      year({ year: 2025, revenueUsd: 120, sourceVintage: "2025" }),
    ])!;
    expect(gap.isYearOverYear).toBe(false);
    expect(gap.changeLabel).toBe("Change since 2023");
    expect(gap.revenueChangePct).toBeCloseTo(20);
  });

  it("guards zero and suppressed denominators", () => {
    expect(
      buildCensusRecordIndustryAnalytics([
        year({ employment: 0, revenueUsd: null }),
      ])!.revenuePerEmployeeUsd,
    ).toBeNull();
  });
});
