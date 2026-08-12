import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  AbsDataSourceAdapter,
  buildAbsDataUrl,
  UnsupportedAbsMetricError,
} from "@/data-sources/macro/abs-adapter";

const csvFixture = readFileSync(
  new URL("./__fixtures__/hsi-m-recreation-change.csv", import.meta.url),
  "utf8",
);
const realCsvFixture = readFileSync(
  new URL("./__fixtures__/hsi-q-recreation-real.csv", import.meta.url),
  "utf8",
);

describe("ABS adapter", () => {
  it("requires a valid public base URL but no credential", () => {
    expect(
      new AbsDataSourceAdapter({
        getBaseUrl: () => "https://data.api.abs.gov.au/rest",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new AbsDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
      }).isConfigured(),
    ).toBe(false);
  });

  it("builds a narrow versioned SDMX URL with period filters", () => {
    expect(
      buildAbsDataUrl(
        "https://data.api.abs.gov.au/rest",
        "au-recreation-culture-spending-current-price-sa",
        "2026-01",
        "2026-03",
      ).toString(),
    ).toBe(
      "https://data.api.abs.gov.au/rest/data/ABS,HSI_M,1.6.0/7.50.CUR.20.AUS.M?startPeriod=2026-01&endPeriod=2026-03",
    );
  });

  it("returns only implemented metrics and parses fetched observations", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      return new Response(csvFixture, {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.sdmx.data+csv;version=2.0.0;labels=both",
        },
      });
    });
    const adapter = new AbsDataSourceAdapter({
      getBaseUrl: () => "https://data.api.abs.gov.au/rest",
      fetchImplementation,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    await expect(adapter.fetchAvailableMetrics()).resolves.toHaveLength(6);
    const observations = await adapter.fetchObservations({
      metricSlug: "au-recreation-culture-spending-mom-pct-sa",
      countryCode: "AU",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(observations).toHaveLength(2);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      "/8.50.CUR.20.AUS.M?startPeriod=2026-01&endPeriod=2026-04",
    );
  });

  it("selects the quarterly dataflow and period syntax for real metrics", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(realCsvFixture, {
          headers: { "content-type": "application/vnd.sdmx.data+csv" },
        }),
      ),
    );
    const adapter = new AbsDataSourceAdapter({
      getBaseUrl: () => "https://data.api.abs.gov.au/rest",
      fetchImplementation,
    });
    const observations = await adapter.fetchObservations({
      metricSlug: "au-recreation-culture-spending-real",
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(observations).toHaveLength(4);
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      "/data/ABS,HSI_Q,1.2.0/7.50.CVM.20.AUS.Q?startPeriod=2025-Q4&endPeriod=2026-Q2",
    );
  });

  it("reports successful small health checks without database writes", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      return new Response('{"data":{"dataflows":[]}}', {
        status: 200,
        headers: {
          "content-type": "application/vnd.sdmx.structure+json;version=1.0",
        },
      });
    });
    const adapter = new AbsDataSourceAdapter({
      getBaseUrl: () => "https://data.api.abs.gov.au/rest",
      fetchImplementation,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    await expect(adapter.healthCheck()).resolves.toMatchObject({
      status: "healthy",
      checkedAt: "2026-08-11T00:00:00.000Z",
    });
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      "/dataflow/ABS/HSI_M/1.6.0",
    );
  });

  it("rejects unsupported metrics explicitly", () => {
    expect(() =>
      buildAbsDataUrl(
        "https://data.api.abs.gov.au/rest",
        "unknown-metric",
        "2026-01",
        "2026-03",
      ),
    ).toThrow(UnsupportedAbsMetricError);
  });
});
