import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseAbsObservationCsv } from "@/data-sources/macro/abs-csv";
import { getAbsMetric } from "@/data-sources/macro/abs-metrics";

const fixture = readFileSync(
  new URL("./__fixtures__/hsi-m-recreation-change.csv", import.meta.url),
  "utf8",
);
const metric = getAbsMetric("au-recreation-culture-spending-mom-pct-sa");
const realFixture = readFileSync(
  new URL("./__fixtures__/hsi-q-recreation-real.csv", import.meta.url),
  "utf8",
);
const realMetric = getAbsMetric("au-recreation-culture-spending-real");

if (!metric || !realMetric) {
  throw new Error("ABS fixture metric is missing.");
}

describe("ABS SDMX CSV parsing", () => {
  it("parses numeric observations, labels, units, and quoted values", () => {
    const retrievedAt = new Date("2026-08-11T00:00:00.000Z");
    const result = parseAbsObservationCsv(
      fixture,
      metric,
      "https://data.api.abs.gov.au/rest/data/example",
      retrievedAt,
    );

    expect(result.rowsRead).toBe(5);
    expect(result.rowsSkipped).toBe(2);
    expect(result.observations).toHaveLength(2);
    expect(result.observations.map((item) => item.value)).toEqual(["0", "1.3"]);
    expect(result.observations[1]?.metadata).toMatchObject({
      dimensions: {
        category: {
          code: "50",
          label: "Recreation and culture",
        },
      },
      unit: { code: "PCT", label: "Percent" },
      multiplier: { code: "0", label: "Units" },
      originalObservationValue: "1.3",
      observationComment: "Duplicate period, latest row retained",
    });
  });

  it("normalises monthly periods to deterministic UTC boundaries", () => {
    const result = parseAbsObservationCsv(
      fixture,
      metric,
      "https://data.api.abs.gov.au/rest/data/example",
      new Date("2026-08-11T00:00:00.000Z"),
    );
    const february = result.observations[1];

    expect(february?.periodStart.toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(february?.periodEnd.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(february?.retrievedAt.toISOString()).toBe(
      "2026-08-11T00:00:00.000Z",
    );
  });

  it("rejects a response containing a different series", () => {
    const wrongSeries = fixture.replace(
      "50: Recreation and culture",
      "3: Discretionary",
    );

    expect(() =>
      parseAbsObservationCsv(
        wrongSeries,
        metric,
        "https://data.api.abs.gov.au/rest/data/example",
        new Date(),
      ),
    ).toThrow("unexpected CATEGORY code");
  });

  it("parses official quarterly chain-volume observations without interpolation", () => {
    const result = parseAbsObservationCsv(
      realFixture,
      realMetric,
      "https://data.api.abs.gov.au/rest/data/ABS,HSI_Q,1.2.0/7.50.CVM.20.AUS.Q",
      new Date("2026-08-12T00:00:00.000Z"),
    );

    expect(result.rowsRead).toBe(5);
    expect(result.rowsSkipped).toBe(1);
    expect(result.observations.map((item) => item.value)).toEqual([
      "37131.9",
      "37988.7",
      "38001.1",
      "38445.2",
    ]);
    expect(result.observations[0]).toMatchObject({
      periodStart: new Date("2025-04-01T00:00:00.000Z"),
      periodEnd: new Date("2025-06-30T23:59:59.999Z"),
      metadata: {
        dataflow: { agency: "ABS", id: "HSI_Q", version: "1.2.0" },
        priceBasis: "Chain Volume Measures",
        chainVolumeMeasure: true,
        seriesKey: "ABS/HSI_Q/1.2.0/7.50.CVM.20.AUS.Q",
      },
    });
    expect(
      result.observations.some((item) => item.periodStart.getUTCMonth() === 6),
    ).toBe(false);
  });
});
