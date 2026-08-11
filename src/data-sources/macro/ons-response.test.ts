import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { OnsResolvedSeries } from "@/data-sources/macro/ons-api";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";
import {
  parseOnsObservations,
  parseOnsSeriesSummary,
} from "@/data-sources/macro/ons-response";

const dataFixture = readFileSync(
  fileURLToPath(new URL("./__fixtures__/ons-data-zakv.json", import.meta.url)),
  "utf8",
);
const nominalMetric = ONS_METRICS[0];
const nominalSeries: OnsResolvedSeries = {
  cdid: "ZAKV",
  title: nominalMetric.expectedTitle,
  datasetId: "CT",
  edition: null,
  uri: "/economy/nationalaccounts/satelliteaccounts/timeseries/zakv/ct",
  releaseDate: "2026-06-29T23:00:00.000Z",
};

describe("ONS time-series responses", () => {
  it("summarises genuine quarterly availability separately from annual rows", () => {
    expect(
      parseOnsSeriesSummary(dataFixture, nominalSeries, nominalMetric),
    ).toEqual({
      cdid: "ZAKV",
      title: nominalMetric.expectedTitle,
      datasetId: "CT",
      uri: nominalSeries.uri,
      unit: "£m",
      releaseDate: "2026-06-29T23:00:00.000Z",
      nextRelease: "30 September 2026",
      earliestQuarter: "2025-Q3",
      latestQuarter: "2026-Q1",
      quarterlyObservationCount: 3,
      annualObservationCount: 1,
      monthlyObservationCount: 0,
    });
  });

  it("filters missing values, deduplicates quarters, and preserves provenance", () => {
    const requestUrl =
      "https://api.beta.ons.gov.uk/v1/data?uri=%2Feconomy%2Fnationalaccounts%2Fsatelliteaccounts%2Ftimeseries%2Fzakv%2Fct";
    const observations = parseOnsObservations(
      dataFixture,
      nominalSeries,
      nominalMetric,
      requestUrl,
      new Date("2026-08-11T00:00:00.000Z"),
      new Date("2025-07-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(observations).toHaveLength(2);
    expect(observations.map((observation) => observation.value)).toEqual([
      "443621",
      "451764",
    ]);
    expect(observations[1]).toMatchObject({
      metricSlug: nominalMetric.slug,
      countryCode: "GB",
      sectorSlug: "consumer-spending",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-31T23:59:59.999Z"),
      sourceUrl: requestUrl,
      metadata: {
        cdid: "ZAKV",
        datasetId: "CT",
        title: nominalMetric.expectedTitle,
        onsUri: nominalSeries.uri,
        originalPeriodLabel: "2026 Q1",
        rawUnit: "m",
        rawPreUnit: "£",
        metricUnit: "GBP millions current prices",
        priceBasis: "current-prices",
        requestUrl,
      },
    });
  });

  it("keeps CVM observations distinct from nominal expenditure", () => {
    const cvmMetric = ONS_METRICS[1];
    const payload = JSON.parse(dataFixture) as {
      uri: string;
      description: { cdid: string; title: string };
    };
    payload.uri =
      "/economy/nationalaccounts/satelliteaccounts/timeseries/zakw/ct";
    payload.description.cdid = "ZAKW";
    payload.description.title = cvmMetric.expectedTitle;
    const series: OnsResolvedSeries = {
      ...nominalSeries,
      cdid: "ZAKW",
      title: cvmMetric.expectedTitle,
      uri: payload.uri,
    };
    const observations = parseOnsObservations(
      JSON.stringify(payload),
      series,
      cvmMetric,
      "https://api.beta.ons.gov.uk/v1/data?uri=zakw",
      new Date("2026-08-11T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(observations[0]).toMatchObject({
      metricSlug: "uk-household-spending-total-cvm-sa",
      metadata: {
        priceBasis: "cvm",
        metricUnit: "GBP millions CVM",
        referenceYear: null,
      },
    });
  });

  it("rejects non-numeric quarter values", () => {
    expect(() =>
      parseOnsObservations(
        dataFixture.replace('"443621"', '"not-a-number"'),
        nominalSeries,
        nominalMetric,
        "https://api.beta.ons.gov.uk/v1/data?uri=zakv",
        new Date("2026-08-11T00:00:00.000Z"),
        new Date("2025-07-01T00:00:00.000Z"),
        new Date("2025-07-01T00:00:00.000Z"),
      ),
    ).toThrow("non-numeric");
  });
});
