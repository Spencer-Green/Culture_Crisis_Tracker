import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { inspectBeaMetrics } from "@/data-sources/macro/bea-inspection";
import {
  BEA_MACRO_METRICS,
  BEA_MUSIC_METRICS,
} from "@/data-sources/macro/bea-metrics";

function fixtures(names: string[]) {
  return names.map((name) =>
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"),
  );
}

describe("BEA metadata inspection", () => {
  it("discovers validated tables, lines, frequencies, and availability", async () => {
    const responses = fixtures([
      "bea-years.json",
      "bea-t20805.json",
      "bea-t20806.json",
    ]);
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(responses.shift(), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const metrics = await inspectBeaMetrics(
      "https://apps.bea.gov/api/data",
      "test-key",
      { fetchImplementation, metrics: BEA_MACRO_METRICS },
    );
    expect(metrics).toHaveLength(4);
    expect(metrics).toContainEqual(
      expect.objectContaining({
        tableName: "T20805",
        lineNumber: "18",
        lineDescription: "Recreation services",
        seriesCode: "DRCARC",
        frequency: "monthly",
      }),
    );
  });

  it("discovers the exact detailed recorded-music lines and representative values", async () => {
    const responses = fixtures([
      "bea-underlying-years.json",
      "bea-u20405.json",
      "bea-u20406.json",
    ]);
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(responses.shift(), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const metrics = await inspectBeaMetrics(
      "https://apps.bea.gov/api/data",
      "test-key",
      { fetchImplementation, metrics: BEA_MUSIC_METRICS },
    );

    expect(metrics).toHaveLength(4);
    expect(metrics).toContainEqual(
      expect.objectContaining({
        dataset: "NIUnderlyingDetail",
        tableName: "U20405",
        lineNumber: "225",
        lineDescription:
          "Audio streaming and radio services (including satellite radio)",
        seriesCode: "LA000232",
        firstAvailablePeriod: "2007-01",
        latestAvailablePeriod: "2026-06",
        latestValue: "13,131",
      }),
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({
        tableName: "U20406",
        lineNumber: "45",
        seriesCode: "DRTDRX",
        unit: "chained 2017 USD millions SAAR",
      }),
    );
  });
});
