import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EurostatResponseError,
  getJsonStatCell,
  parseJsonStatDataset,
} from "@/data-sources/macro/eurostat-jsonstat";
import { EUROSTAT_METRICS } from "@/data-sources/macro/eurostat-metrics";
import { parseEurostatObservations } from "@/data-sources/macro/eurostat-response";

const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/eurostat-nama-10-cp18.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

describe("Eurostat JSON-stat parsing", () => {
  it("parses sparse values, nulls, labels, and deterministic annual periods", () => {
    const observations = parseEurostatObservations(
      fixture,
      EUROSTAT_METRICS[0],
      "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_cp18?freq=A",
      new Date("2026-08-12T00:00:00.000Z"),
      "2019",
      "2021",
    );

    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      value: "7333194.4",
      periodStart: new Date("2019-01-01T00:00:00.000Z"),
      periodEnd: new Date("2019-12-31T23:59:59.999Z"),
      metadata: {
        datasetCode: "nama_10_cp18",
        frequencyLabel: "Annual",
        unitCode: "CP_MEUR",
        unitLabel: "Current prices, million euro",
        geographyCode: "EU27_2020",
        coicopCode: "TOTAL",
        classification: "COICOP 2018",
        observationStatus: "e",
      },
    });
    expect(observations[1].value).toBe("7692155.7");
  });

  it("uses declared dimension order rather than assuming time is last", () => {
    const reordered = structuredClone(fixture) as Record<string, unknown>;
    reordered.id = ["time", "geo", "coicop18", "unit", "freq"];
    reordered.size = [3, 1, 1, 1, 1];
    const dataset = parseJsonStatDataset(reordered);

    expect(
      getJsonStatCell(dataset, {
        time: "2021",
        geo: "EU27_2020",
        coicop18: "TOTAL",
        unit: "CP_MEUR",
        freq: "A",
      }),
    ).toEqual({ value: 7692155.7, status: "p" });
  });

  it("rejects absent coordinates and non-numeric values safely", () => {
    const dataset = parseJsonStatDataset(fixture);
    expect(() =>
      getJsonStatCell(dataset, {
        freq: "A",
        unit: "CP_MEUR",
        coicop18: "CP09",
        geo: "EU27_2020",
        time: "2019",
      }),
    ).toThrow(EurostatResponseError);

    const invalid = structuredClone(fixture) as Record<string, unknown>;
    invalid.value = { "0": "not-a-number" };
    expect(() => parseJsonStatDataset(invalid)).not.toThrow();
    expect(() =>
      getJsonStatCell(parseJsonStatDataset(invalid), {
        freq: "A",
        unit: "CP_MEUR",
        coicop18: "TOTAL",
        geo: "EU27_2020",
        time: "2019",
      }),
    ).toThrow("non-numeric");
  });
});
