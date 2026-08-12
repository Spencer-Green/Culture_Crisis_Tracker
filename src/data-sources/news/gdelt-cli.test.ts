import { describe, expect, it } from "vitest";

import {
  gdeltMaxRecordsForDays,
  parseGdeltCliArguments,
  resolveGdeltWindow,
} from "@/data-sources/news/gdelt-cli";

describe("GDELT CLI", () => {
  it("accepts bounded windows and optional filters", () => {
    expect(
      parseGdeltCliArguments([
        "--days=30",
        "--query-family=layoffs",
        "--country=au",
      ]),
    ).toEqual({
      days: 30,
      queryFamily: "layoffs",
      countryCode: "AU",
    });
    expect(gdeltMaxRecordsForDays(7)).toBe(50);
    expect(gdeltMaxRecordsForDays(30)).toBe(100);
  });

  it("rejects archive-scale or invalid requests", () => {
    expect(() => parseGdeltCliArguments(["--days=31"])).toThrow(
      "between 1 and 30",
    );
    expect(() => parseGdeltCliArguments(["--country=EU"])).toThrow(
      "AU, US, GB, CA",
    );
    expect(() => parseGdeltCliArguments(["--query-family=everything"])).toThrow(
      "Unsupported",
    );
  });

  it("creates a deterministic recent window", () => {
    expect(resolveGdeltWindow(7, new Date("2026-08-12T00:00:00Z"))).toEqual({
      startDate: new Date("2026-08-05T00:00:00Z"),
      endDate: new Date("2026-08-12T00:00:00Z"),
    });
  });
});
