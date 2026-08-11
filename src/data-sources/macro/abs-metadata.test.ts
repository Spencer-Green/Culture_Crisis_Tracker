import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseAbsStructureMetadata,
  validateAbsMetricMappings,
} from "@/data-sources/macro/abs-metadata";
import {
  ABS_DATAFLOW,
  ABS_METRICS,
  getAbsDataKey,
} from "@/data-sources/macro/abs-metrics";

const fixture = readFileSync(
  new URL("./__fixtures__/hsi-m-structure.json", import.meta.url),
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
    expect(ABS_METRICS).toHaveLength(4);
    expect(
      ABS_METRICS.map((metric) => [metric.slug, getAbsDataKey(metric)]),
    ).toEqual([
      ["au-household-spending-total-current-price-sa", "7.TOT.CUR.20.AUS.M"],
      ["au-recreation-culture-spending-current-price-sa", "7.50.CUR.20.AUS.M"],
      ["au-recreation-culture-spending-mom-pct-sa", "8.50.CUR.20.AUS.M"],
      ["au-discretionary-spending-mom-pct-sa", "8.3.CUR.20.AUS.M"],
    ]);
  });
});
