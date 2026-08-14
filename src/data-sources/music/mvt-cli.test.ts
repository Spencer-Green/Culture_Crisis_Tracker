import { describe, expect, it } from "vitest";

import { parseMVTCli } from "@/data-sources/music/mvt-cli";

describe("MVT CLI", () => {
  it("supports all reports or one bounded year", () => {
    expect(parseMVTCli([])).toEqual({ year: undefined });
    expect(parseMVTCli(["--year=2025"])).toEqual({ year: 2025 });
  });

  it("rejects invalid years and unknown arguments", () => {
    expect(() => parseMVTCli(["--year=25"])).toThrow("four-digit");
    expect(() => parseMVTCli(["--year=2022"])).toThrow("2023-2025");
    expect(() => parseMVTCli(["--all"])).toThrow("Unknown argument");
  });
});
