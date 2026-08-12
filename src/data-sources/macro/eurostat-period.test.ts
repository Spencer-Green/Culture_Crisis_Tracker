import { describe, expect, it } from "vitest";

import { parseEurostatCliArguments } from "@/data-sources/macro/eurostat-cli";
import { EUROSTAT_METRICS } from "@/data-sources/macro/eurostat-metrics";
import {
  getEurostatYearBoundaries,
  validateEurostatYearRange,
} from "@/data-sources/macro/eurostat-period";

describe("Eurostat annual period handling", () => {
  it("normalises years to deterministic UTC boundaries", () => {
    expect(getEurostatYearBoundaries("2024")).toEqual({
      periodStart: new Date("2024-01-01T00:00:00.000Z"),
      periodEnd: new Date("2024-12-31T23:59:59.999Z"),
    });
  });

  it("accepts strict four-digit years and rejects reversed ranges", () => {
    expect(validateEurostatYearRange("2019", "2024")).toMatchObject({
      startYear: "2019",
      endYear: "2024",
    });
    expect(() => validateEurostatYearRange("19", "2024")).toThrow("YYYY");
    expect(() => validateEurostatYearRange("2025", "2024")).toThrow(
      "must not precede",
    );
  });

  it("parses CLI years and metric filters", () => {
    expect(
      parseEurostatCliArguments([
        "--start=2019",
        "--end=2024",
        `--metric=${EUROSTAT_METRICS[0].slug}`,
      ]),
    ).toMatchObject({ startYear: "2019", endYear: "2024" });
  });
});
