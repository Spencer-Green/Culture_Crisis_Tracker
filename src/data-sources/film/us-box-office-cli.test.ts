import { describe, expect, it } from "vitest";

import { parseUSBoxOfficeCli } from "@/data-sources/film/us-box-office-cli";

describe("US box-office CLI", () => {
  it("defaults to 2015 and accepts a bounded start year", () => {
    expect(parseUSBoxOfficeCli([])).toEqual({ startYear: 2015 });
    expect(parseUSBoxOfficeCli(["--start=1977"])).toEqual({ startYear: 1977 });
  });

  it("rejects malformed and future years", () => {
    expect(() => parseUSBoxOfficeCli(["--start=20x5"])).toThrow(
      "Use --start=YYYY",
    );
    expect(() => parseUSBoxOfficeCli(["--start=2099"])).toThrow("current year");
  });
});
