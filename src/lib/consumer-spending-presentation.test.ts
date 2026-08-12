import { describe, expect, it } from "vitest";

import { ABS_METRICS } from "@/data-sources/macro/abs-metrics";
import { BEA_METRICS } from "@/data-sources/macro/bea-metrics";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";
import { STATCAN_METRICS } from "@/data-sources/macro/statcan-metrics";
import {
  isCurrentSource,
  isStructuralBenchmarkSource,
} from "@/data-sources/source-role";

describe("consumer spending presentation semantics", () => {
  it("preserves the official ABS recreation monthly-change metric", () => {
    const metric = ABS_METRICS.find(
      (item) => item.slug === "au-recreation-culture-spending-mom-pct-sa",
    );
    expect(metric).toMatchObject({
      unit: "percent",
      frequency: "monthly",
      dimensions: {
        measure: {
          label: "Household spending - Percentage change from previous period",
        },
      },
    });
  });

  it("keeps exactly two official ABS quarterly chain-volume metrics", () => {
    const realMetrics = ABS_METRICS.filter(
      (metric) => metric.dataflow.id === "HSI_Q",
    );
    expect(realMetrics).toHaveLength(2);
    expect(realMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "au-household-spending-total-real",
          frequency: "quarterly",
          unit: "AUD millions, Chain Volume Measures",
        }),
        expect.objectContaining({
          slug: "au-recreation-culture-spending-real",
          frequency: "quarterly",
          unit: "AUD millions, Chain Volume Measures",
        }),
      ]),
    );
  });

  it("keeps ONS nominal and CVM measures distinct", () => {
    expect(ONS_METRICS.map((metric) => metric.priceBasis)).toEqual([
      "current-prices",
      "cvm",
      "current-prices",
      "cvm",
    ]);
  });

  it("preserves BEA SAAR semantics for all spending rows", () => {
    expect(
      BEA_METRICS.every(
        (metric) =>
          metric.adjustment === "Seasonally adjusted at annual rates (SAAR)" &&
          metric.unit.includes("SAAR"),
      ),
    ).toBe(true);
  });

  it("preserves Statistics Canada quarterly-rate semantics without SAAR", () => {
    expect(
      STATCAN_METRICS.every(
        (metric) =>
          metric.frequency === "quarterly" &&
          metric.seasonalAdjustment ===
            "Seasonally adjusted at quarterly rates" &&
          !metric.unit.includes("SAAR"),
      ),
    ).toBe(true);
  });

  it("keeps Eurostat structural and FRED current", () => {
    expect(isStructuralBenchmarkSource("eurostat")).toBe(true);
    expect(isCurrentSource("eurostat")).toBe(false);
    expect(isCurrentSource("fred")).toBe(true);
  });
});
