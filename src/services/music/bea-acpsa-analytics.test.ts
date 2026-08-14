import { describe, expect, it } from "vitest";

import {
  buildBEAACPSAAnalytics,
  type BEAACPSAYearValue,
} from "@/services/music/bea-acpsa-analytics";

function year(overrides: Partial<BEAACPSAYearValue> = {}): BEAACPSAYearValue {
  return {
    year: 1998,
    categoryLabel: "Sound Recording",
    acpsaOutputUsd: 21_001_000_000,
    acpsaValueAddedUsd: 12_233_000_000,
    acpsaEmployment: 19_000,
    acpsaEmployeeCompensationUsd: 1_297_000_000,
    ...overrides,
  };
}

describe("BEA ACPSA Sound Recording analytics", () => {
  const records = [
    year(),
    year({
      year: 2019,
      acpsaOutputUsd: 21_818_000_000,
      acpsaValueAddedUsd: 13_310_000_000,
      acpsaEmployment: 21_000,
      acpsaEmployeeCompensationUsd: 2_337_000_000,
    }),
    year({
      year: 2022,
      acpsaOutputUsd: 29_402_000_000,
      acpsaValueAddedUsd: 20_491_000_000,
      acpsaEmployment: 22_000,
      acpsaEmployeeCompensationUsd: 3_326_000_000,
    }),
    year({
      year: 2023,
      acpsaOutputUsd: 30_564_000_000,
      acpsaValueAddedUsd: 21_133_000_000,
      acpsaEmployment: 19_000,
      acpsaEmployeeCompensationUsd: 3_119_000_000,
    }),
  ];

  it("calculates growth, shares, and per-worker values", () => {
    const result = buildBEAACPSAAnalytics(records)!;
    expect(result.latestGrowth.outputPct).toBeCloseTo(3.9521);
    expect(result.latestGrowth.employmentPct).toBeCloseTo(-13.6364);
    expect(result.valueAddedSharePct).toBeCloseTo(69.1434);
    expect(result.outputPerWorkerUsd).toBeCloseTo(1_608_631.58, 2);
    expect(result.valueAddedPerWorkerUsd).toBeCloseTo(1_112_263.16, 2);
  });

  it("builds 1998 and 2019 indexes without mutating input", () => {
    const original = records.map((record) => record.year);
    const result = buildBEAACPSAAnalytics([...records].reverse())!;
    expect(result.chart[0].outputIndex1998).toBe(100);
    expect(result.chart[0].employmentIndex1998).toBe(100);
    expect(
      result.chart.find((point) => point.year === 2019)?.outputIndex2019,
    ).toBe(100);
    expect(records.map((record) => record.year)).toEqual(original);
  });

  it("calculates long-run changes and CAGR", () => {
    const result = buildBEAACPSAAnalytics(records)!;
    expect(result.since1998?.outputChangePct).toBeCloseTo(45.536);
    expect(result.since1998?.employmentChangePct).toBe(0);
    expect(result.since2019?.outputChangePct).toBeCloseTo(40.0898);
    expect(result.since2019?.employmentChangePct).toBeCloseTo(-9.5238);
    expect(result.since1998?.outputCagrPct).toBeGreaterThan(1);
  });

  it("guards missing and zero worker denominators", () => {
    const result = buildBEAACPSAAnalytics([
      year({ acpsaEmployment: 0, acpsaValueAddedUsd: null }),
    ])!;
    expect(result.outputPerWorkerUsd).toBeNull();
    expect(result.valueAddedSharePct).toBeNull();
  });
});
