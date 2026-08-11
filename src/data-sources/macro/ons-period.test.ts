import { describe, expect, it } from "vitest";

import {
  parseOnsCliArguments,
  resolveOnsCliRange,
} from "@/data-sources/macro/ons-cli";
import {
  formatOnsQuarter,
  getOnsQuarterBoundaries,
  validateOnsQuarterRange,
} from "@/data-sources/macro/ons-period";

describe("ONS quarter handling", () => {
  it("parses and formats strict quarter labels", () => {
    expect(parseOnsCliArguments(["--start=2019-Q1", "--end=2026-Q1"])).toEqual({
      startQuarter: "2019-Q1",
      endQuarter: "2026-Q1",
      metricSlugs: undefined,
    });
    expect(formatOnsQuarter(new Date("2026-05-15T00:00:00.000Z"))).toBe(
      "2026-Q2",
    );
  });

  it("normalises UTC quarter boundaries", () => {
    expect(getOnsQuarterBoundaries("2026-Q1")).toEqual({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(getOnsQuarterBoundaries("2026-Q4")).toEqual({
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T23:59:59.999Z"),
    });
  });

  it.each(["2026-Q5", "Q1-2026", "2026-01"])(
    "rejects invalid quarter label %s",
    (quarter) => {
      expect(() => parseOnsCliArguments([`--start=${quarter}`])).toThrow(
        "Expected YYYY-Q1 to YYYY-Q4",
      );
    },
  );

  it("rejects reversed ranges", () => {
    expect(() => validateOnsQuarterRange("2026-Q2", "2026-Q1")).toThrow(
      "must not precede",
    );
  });

  it("resolves omitted bounds against live availability", () => {
    expect(
      resolveOnsCliRange(
        { startQuarter: "2019-Q1" },
        { earliestQuarter: "1985-Q1", latestQuarter: "2026-Q1" },
      ),
    ).toMatchObject({
      startQuarter: "2019-Q1",
      endQuarter: "2026-Q1",
    });
    expect(
      resolveOnsCliRange(
        {},
        { earliestQuarter: "1985-Q1", latestQuarter: "2026-Q1" },
      ),
    ).toMatchObject({
      startQuarter: "2024-Q2",
      endQuarter: "2026-Q1",
    });
  });
});
