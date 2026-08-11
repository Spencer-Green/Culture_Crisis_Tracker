import { describe, expect, it } from "vitest";

import { parseAbsCliArguments } from "@/data-sources/macro/abs-cli";
import {
  getDefaultAbsPeriodRange,
  validateAbsPeriodRange,
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
});
