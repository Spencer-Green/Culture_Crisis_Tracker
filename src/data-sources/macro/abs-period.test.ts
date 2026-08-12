import { describe, expect, it } from "vitest";

import { parseAbsCliArguments } from "@/data-sources/macro/abs-cli";
import { parseAbsRealCliArguments } from "@/data-sources/macro/abs-real-cli";
import {
  getAbsQuarterBoundaries,
  getDefaultAbsPeriodRange,
  validateAbsPeriodRange,
  validateAbsQuarterRange,
} from "@/data-sources/macro/abs-period";

describe("ABS period validation", () => {
  it("accepts YYYY-MM ranges", () => {
    expect(validateAbsPeriodRange("2021-01", "2026-07")).toMatchObject({
      startPeriod: "2021-01",
      endPeriod: "2026-07",
      startDate: new Date("2021-01-01T00:00:00.000Z"),
      endDate: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it("rejects malformed and reversed periods", () => {
    expect(() => validateAbsPeriodRange("2026-1", "2026-07")).toThrow(
      "Expected YYYY-MM",
    );
    expect(() => validateAbsPeriodRange("2026-08", "2026-07")).toThrow(
      "must not precede",
    );
  });

  it("defaults to the previous twelve complete months", () => {
    expect(
      getDefaultAbsPeriodRange(new Date("2026-08-11T00:00:00.000Z")),
    ).toMatchObject({
      startPeriod: "2025-08",
      endPeriod: "2026-07",
    });
  });

  it("parses CLI periods and optional metric filters", () => {
    expect(
      parseAbsCliArguments(
        ["--start=2026-01", "--end=2026-03", "--metric=metric-a,metric-b"],
        new Date("2026-08-11T00:00:00.000Z"),
      ),
    ).toEqual({
      startPeriod: "2026-01",
      endPeriod: "2026-03",
      metricSlugs: ["metric-a", "metric-b"],
    });
    expect(() => parseAbsCliArguments(["--unknown=value"])).toThrow(
      "Unknown argument",
    );
  });

  it("normalises quarterly periods while preserving monthly validation", () => {
    expect(getAbsQuarterBoundaries("2026-Q2")).toEqual({
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-30T23:59:59.999Z"),
    });
    expect(validateAbsQuarterRange("2019-Q1", "2026-Q2")).toMatchObject({
      startDate: new Date("2019-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T23:59:59.999Z"),
    });
    expect(() => validateAbsQuarterRange("2026-Q5", "2026-Q2")).toThrow(
      "Expected YYYY-Qn",
    );
    expect(() => validateAbsQuarterRange("2026-Q3", "2026-Q2")).toThrow(
      "must not precede",
    );
    expect(() => validateAbsPeriodRange("2026-Q1", "2026-Q2")).toThrow(
      "Expected YYYY-MM",
    );
  });

  it("uses a dedicated quarterly real CLI without changing monthly syntax", () => {
    expect(
      parseAbsRealCliArguments(["--start=2025-Q4", "--end=2026-Q2"]),
    ).toEqual({
      startPeriod: "2025-Q4",
      endPeriod: "2026-Q2",
      metricSlugs: [
        "au-household-spending-total-real",
        "au-recreation-culture-spending-real",
      ],
    });
    expect(() =>
      parseAbsRealCliArguments([
        "--start=2025-Q4",
        "--end=2026-Q2",
        "--metric=au-household-spending-total-current-price-sa",
      ]),
    ).toThrow("quarterly real metrics");
  });
});
