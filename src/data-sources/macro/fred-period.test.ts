import { describe, expect, it } from "vitest";

import {
  normaliseFredPeriod,
  validateFredDateRange,
} from "@/data-sources/macro/fred-period";

describe("FRED periods", () => {
  it("normalises monthly source dates to UTC month boundaries", () => {
    expect(normaliseFredPeriod("2024-02-01", "monthly")).toEqual({
      periodStart: new Date("2024-02-01T00:00:00.000Z"),
      periodEnd: new Date("2024-02-29T23:59:59.999Z"),
    });
  });

  it("normalises quarter-start dates to UTC quarter boundaries", () => {
    expect(normaliseFredPeriod("2026-01-01", "quarterly")).toEqual({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
    });
  });

  it("rejects invalid and reversed date ranges", () => {
    expect(() => validateFredDateRange("2026-04-01", "2026-01-01")).toThrow(
      "must not precede",
    );
    expect(() => validateFredDateRange("2026-02-30", "2026-03-01")).toThrow(
      "expected YYYY-MM-DD",
    );
  });
});
