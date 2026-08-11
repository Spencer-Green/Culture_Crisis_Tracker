import { describe, expect, it } from "vitest";

import { normalisedObservationSchema } from "@/data-sources/types";

const observation = {
  metricSlug: "recreation-spending",
  countryCode: "AU",
  sectorSlug: "consumer-spending",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-31T23:59:59.000Z",
  value: "1234.560000",
  retrievedAt: "2026-02-10T00:00:00.000Z",
  sourceUrl: "https://example.gov/source",
  metadata: { series: "example" },
};

describe("normalised observation validation", () => {
  it("accepts decimal-safe values and coerces ISO timestamps", () => {
    const result = normalisedObservationSchema.parse(observation);

    expect(result.value).toBe("1234.560000");
    expect(result.periodStart).toBeInstanceOf(Date);
  });

  it("rejects JavaScript numbers to avoid precision loss", () => {
    const result = normalisedObservationSchema.safeParse({
      ...observation,
      value: 1234.56,
    });

    expect(result.success).toBe(false);
  });

  it("rejects periods whose end precedes their start", () => {
    const result = normalisedObservationSchema.safeParse({
      ...observation,
      periodEnd: "2025-12-31T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});
