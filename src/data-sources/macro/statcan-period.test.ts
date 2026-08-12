import { describe, expect, it } from "vitest";

import { parseStatCanCliArguments } from "@/data-sources/macro/statcan-cli";
import {
  getStatCanQuarterBoundaries,
  validateStatCanQuarterRange,
} from "@/data-sources/macro/statcan-period";

describe("Statistics Canada quarter handling", () => {
  it("normalises real calendar quarters to UTC boundaries", () => {
    expect(getStatCanQuarterBoundaries("2026-Q1")).toEqual({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
    });
  });

  it("rejects invalid and reversed quarter ranges", () => {
    expect(validateStatCanQuarterRange("2019-Q1", "2026-Q1")).toMatchObject({
      startQuarter: "2019-Q1",
      endQuarter: "2026-Q1",
    });
    expect(() => validateStatCanQuarterRange("2026-Q5", "2026-Q1")).toThrow(
      "YYYY-Q1",
    );
    expect(() => validateStatCanQuarterRange("2026-Q2", "2026-Q1")).toThrow(
      "must not precede",
    );
  });

  it("validates CLI arguments", () => {
    expect(
      parseStatCanCliArguments(["--start=2025-Q4", "--end=2026-Q1"]),
    ).toMatchObject({ startQuarter: "2025-Q4", endQuarter: "2026-Q1" });
    expect(() => parseStatCanCliArguments(["--start=2025-Q4"])).toThrow(
      "requires both",
    );
  });
});
