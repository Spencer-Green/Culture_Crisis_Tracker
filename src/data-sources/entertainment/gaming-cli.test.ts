import { describe, expect, it } from "vitest";

import {
  GamingCliError,
  parseIgdbCliArguments,
  parseSteamCliArguments,
} from "@/data-sources/entertainment/gaming-cli";

describe("gaming CLIs", () => {
  it("parses bounded IGDB dates and inclusive end days", () => {
    expect(
      parseIgdbCliArguments(["--start=2019-01-01", "--end=2026-08-13"]),
    ).toMatchObject({
      startPeriod: "2019-01-01",
      endPeriod: "2026-08-13",
      endDateExclusive: new Date("2026-08-14T00:00:00Z"),
    });
    expect(() => parseIgdbCliArguments(["--start=2026-02-30"])).toThrow(
      GamingCliError,
    );
    expect(() =>
      parseIgdbCliArguments(["--start=2026-08-13", "--end=2026-08-12"]),
    ).toThrow("must not precede");
  });

  it("bounds Steam batches and uses deterministic hourly capture buckets", () => {
    expect(
      parseSteamCliArguments(
        ["--limit=100", "--offset=20"],
        new Date("2026-08-13T12:37:45Z"),
      ),
    ).toEqual({
      limit: 100,
      offset: 20,
      capturedAt: new Date("2026-08-13T12:00:00Z"),
    });
    expect(() => parseSteamCliArguments(["--limit=1001"])).toThrow(
      GamingCliError,
    );
  });
});
