import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import {
  parsePercent,
  parseUSBoxOfficeArchive,
  parseUsd,
  parseWeekendLabel,
} from "@/data-sources/film/us-box-office-parser";

const fixture = (year: number) =>
  readFileSync(
    new URL(`./__fixtures__/weekend_summary_${year}.csv`, import.meta.url),
    "utf8",
  );

const archive = () =>
  zipSync({
    "weekend_summary_2025.csv": strToU8(fixture(2025)),
    "weekend_summary_2026.csv": strToU8(fixture(2026)),
  });

describe("US box-office dataset parser", () => {
  it("parses USD, percentages, and missing source fields", () => {
    expect(parseUsd('"$1,234"'.replaceAll('"', ""))).toBe(1234);
    expect(parseUsd("-")).toBeNull();
    expect(parsePercent("+11.1%")).toBe(11.1);
    expect(parsePercent("+1,011.6%")).toBe(1011.6);
    expect(parsePercent("<0.1%")).toBeNull();
    expect(parsePercent("-")).toBeNull();
  });

  it("parses cross-month and cross-year weekend labels in UTC", () => {
    expect(
      parseWeekendLabel("Jul 31-Aug 2", 2026).weekendEnd.toISOString(),
    ).toBe("2026-08-02T00:00:00.000Z");
    expect(
      parseWeekendLabel("Dec 30-Jan 1, 2027", 2026).weekendStart.toISOString(),
    ).toBe("2026-12-30T00:00:00.000Z");
  });

  it("selects one standard weekend, skips null/future rows, and sorts chronologically", () => {
    const parsed = parseUSBoxOfficeArchive(archive(), {
      startYear: 2026,
      throughDate: new Date("2026-08-13T00:00:00Z"),
    });
    expect(parsed.columns).toContain("overall_gross");
    expect(parsed.records).toHaveLength(4);
    expect(parsed.duplicateVariantsRemoved).toBe(1);
    expect(parsed.nullGrossRowsSkipped).toBe(1);
    expect(parsed.records[2]).toMatchObject({
      weekNumber: 31,
      totalGrossUsd: 180_000_000,
      occasion: null,
    });
    expect(parsed.records.at(-1)?.topFilm).toBe("Current Film");
  });
});
