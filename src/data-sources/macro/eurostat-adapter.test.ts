import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  EurostatDataSourceAdapter,
  UnsupportedEurostatMetricError,
} from "@/data-sources/macro/eurostat-adapter";
import { buildEurostatDataUrl } from "@/data-sources/macro/eurostat-api";
import { EUROSTAT_METRICS } from "@/data-sources/macro/eurostat-metrics";

const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/eurostat-nama-10-cp18.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

function responseFixture(metric: (typeof EUROSTAT_METRICS)[number]) {
  const payload = structuredClone(fixture) as Record<string, unknown>;
  const dimensions = payload.dimension as Record<
    string,
    Record<string, unknown>
  >;
  const unitCategory = dimensions.unit.category as Record<string, unknown>;
  const purposeCategory = dimensions.coicop18.category as Record<
    string,
    unknown
  >;
  unitCategory.index = { [metric.unitCode]: 0 };
  unitCategory.label = {
    [metric.unitCode]: metric.unitLabel,
  };
  purposeCategory.index = { [metric.coicopCode]: 0 };
  purposeCategory.label = {
    [metric.coicopCode]: metric.coicopLabel,
  };
  return payload;
}

describe("Eurostat adapter", () => {
  it("is configured with a valid public URL and no credential", () => {
    expect(
      new EurostatDataSourceAdapter({
        getBaseUrl: () =>
          "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
      }).isConfigured(),
    ).toBe(true);
    expect(
      new EurostatDataSourceAdapter({
        getBaseUrl: () => "not-a-url",
      }).isConfigured(),
    ).toBe(false);
  });

  it("exposes exactly the four validated annual metrics", async () => {
    const adapter = new EurostatDataSourceAdapter({
      getBaseUrl: () =>
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
    });
    await expect(adapter.fetchAvailableMetrics()).resolves.toEqual(
      EUROSTAT_METRICS.map(({ slug, name, description, unit, frequency }) => ({
        slug,
        name,
        description,
        unit,
        frequency,
      })),
    );
  });

  it.each(EUROSTAT_METRICS)(
    "maps $slug with exact unit and COICOP semantics",
    async (metric) => {
      const fetchImplementation = vi.fn<typeof fetch>(async () =>
        Response.json(responseFixture(metric)),
      );
      const adapter = new EurostatDataSourceAdapter({
        getBaseUrl: () => "https://ec.europa.eu/eurostat/api/dissemination",
        fetchImplementation,
        now: () => new Date("2026-08-12T00:00:00.000Z"),
      });
      const observations = await adapter.fetchObservations({
        metricSlug: metric.slug,
        countryCode: "EU",
        startDate: new Date("2019-01-01T00:00:00.000Z"),
        endDate: new Date("2021-12-31T23:59:59.999Z"),
      });

      expect(observations).toHaveLength(2);
      expect(observations[0].metadata).toMatchObject({
        unitCode: metric.unitCode,
        unitLabel: metric.unitLabel,
        coicopCode: metric.coicopCode,
        coicopLabel: metric.coicopLabel,
        priceBasis: metric.priceBasis,
      });
      const requestedUrl = new URL(
        String(fetchImplementation.mock.calls[0][0]),
      );
      expect(requestedUrl.pathname).toContain(
        "/dissemination/statistics/1.0/data/nama_10_cp18",
      );
      expect(requestedUrl.searchParams.get("sinceTimePeriod")).toBe("2019");
      expect(requestedUrl.searchParams.get("untilTimePeriod")).toBe("2021");
      expect(requestedUrl.searchParams.get("geo")).toBe("EU27_2020");
    },
  );

  it("constructs narrow URLs and rejects reversed or unsupported requests", async () => {
    const url = buildEurostatDataUrl(
      "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
      EUROSTAT_METRICS[2],
      { startYear: "2019", endYear: "2024" },
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      freq: "A",
      unit: "CP_MEUR",
      coicop18: "CP09",
      geo: "EU27_2020",
      sinceTimePeriod: "2019",
      untilTimePeriod: "2024",
    });

    const adapter = new EurostatDataSourceAdapter({
      getBaseUrl: () =>
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
    });
    await expect(
      adapter.fetchObservations({
        metricSlug: EUROSTAT_METRICS[0].slug,
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        endDate: new Date("2023-12-31T23:59:59.999Z"),
      }),
    ).rejects.toThrow("must not precede");
    await expect(
      adapter.fetchObservations({
        metricSlug: "unknown",
        startDate: new Date("2019-01-01T00:00:00.000Z"),
        endDate: new Date("2024-12-31T23:59:59.999Z"),
      }),
    ).rejects.toThrow(UnsupportedEurostatMetricError);
  });
});
