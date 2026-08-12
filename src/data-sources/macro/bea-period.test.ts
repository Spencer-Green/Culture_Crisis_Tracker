import { describe, expect, it } from "vitest";

import {
  parseBeaApiMonth,
  validateBeaMonthRange,
} from "@/data-sources/macro/bea-period";

describe("BEA monthly periods", () => {
  it("normalises API periods to deterministic UTC month boundaries", () => {
    expect(parseBeaApiMonth("2024M02")).toEqual({
      periodStart: new Date("2024-02-01T00:00:00.000Z"),
      periodEnd: new Date("2024-02-29T23:59:59.999Z"),
      normalisedPeriod: "2024-02",
    });
  });

  it("rejects invalid and reversed month ranges", () => {
    expect(() => validateBeaMonthRange("2026-02", "2026-01")).toThrow(
      "must not precede",
    );
    expect(() => validateBeaMonthRange("2026-13", "2026-14")).toThrow(
      "expected YYYY-MM",
    );
  });
});
