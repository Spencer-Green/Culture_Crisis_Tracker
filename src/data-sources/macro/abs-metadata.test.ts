import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseAbsStructureMetadata,
  validateAbsMetricMappings,
} from "@/data-sources/macro/abs-metadata";
import {
  ABS_DATAFLOW,
  ABS_QUARTERLY_DATAFLOW,
  ABS_REAL_METRICS,
  ABS_METRICS,
  getAbsDataKey,
} from "@/data-sources/macro/abs-metrics";

const fixture = readFileSync(
  new URL("./__fixtures__/hsi-m-structure.json", import.meta.url),
  "utf8",
);
const quarterlyFixture = readFileSync(
  new URL("./__fixtures__/hsi-q-structure.json", import.meta.url),
  "utf8",
);

describe("ABS HSI_M metadata", () => {
  it("discovers the expected dataflow and dimension order", () => {
    const metadata = parseAbsStructureMetadata(fixture);

    expect(metadata.dataflow).toEqual({
      id: "HSI_M",
      version: "1.6.0",
      agency: "ABS",
      label: "Monthly Household Spending Indicator",
      description:
        "Experimental indicator of household spending using bank transactions data.",
      annotations: [
        {
          type: "NonProductionDataflow",
          title: null,
          text: "true",
        },
      ],
    });
    expect(metadata.dimensions.map((dimension) => dimension.id)).toEqual([
      ...ABS_DATAFLOW.dimensionOrder,
      "TIME_PERIOD",
    ]);
    expect(metadata.availability).toEqual({
      startPeriod: "2012-07",
      endPeriod: "2026-06",
    });
  });

  it("validates every hard-coded code and human-readable label", () => {
    const metadata = parseAbsStructureMetadata(fixture);

    expect(validateAbsMetricMappings(metadata)).toEqual([]);
    expect(ABS_METRICS).toHaveLength(6);
    expect(
      ABS_METRICS.map((metric) => [metric.slug, getAbsDataKey(metric)]),
    ).toEqual([
      ["au-household-spending-total-current-price-sa", "7.TOT.CUR.20.AUS.M"],
      ["au-recreation-culture-spending-current-price-sa", "7.50.CUR.20.AUS.M"],
      ["au-recreation-culture-spending-mom-pct-sa", "8.50.CUR.20.AUS.M"],
      ["au-discretionary-spending-mom-pct-sa", "8.3.CUR.20.AUS.M"],
      ["au-household-spending-total-real", "7.TOT.CVM.20.AUS.Q"],
      ["au-recreation-culture-spending-real", "7.50.CVM.20.AUS.Q"],
    ]);
  });

  it("validates the official quarterly chain-volume mappings", () => {
    const metadata = parseAbsStructureMetadata(quarterlyFixture);
    expect(metadata.dataflow).toMatchObject({
      agency: "ABS",
      id: "HSI_Q",
      version: "1.2.0",
      label: "Quarterly Household Spending Indicator",
    });
    expect(metadata.dimensions.map((dimension) => dimension.id)).toEqual([
      ...ABS_QUARTERLY_DATAFLOW.dimensionOrder,
      "TIME_PERIOD",
    ]);
    expect(
      validateAbsMetricMappings(
        metadata,
        ABS_QUARTERLY_DATAFLOW,
        ABS_REAL_METRICS,
      ),
    ).toEqual([]);
  });
});
