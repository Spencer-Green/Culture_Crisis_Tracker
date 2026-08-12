import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { inspectBeaMetrics } from "@/data-sources/macro/bea-inspection";

const fixtures = ["bea-years.json", "bea-t20805.json", "bea-t20806.json"].map(
  (name) =>
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"),
);

describe("BEA metadata inspection", () => {
  it("discovers validated tables, lines, frequencies, and availability", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(fixtures.shift(), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const metrics = await inspectBeaMetrics(
      "https://apps.bea.gov/api/data",
      "test-key",
      { fetchImplementation },
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
});
