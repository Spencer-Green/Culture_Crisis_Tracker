import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { FredDataSourceAdapter } from "@/data-sources/macro/fred-adapter";
import type { IngestionStore } from "@/services/ingestion/types";
import { runIngestion } from "@/services/ingestion/service-core";

const seriesFixtures = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/fred-series.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Record<string, unknown>>;

const observationRanges = {
  TOTALSL: ["1943-01-01", "2026-06-01"],
  REVOLSL: ["1968-01-01", "2026-06-01"],
  DRCCLACBS: ["1991-01-01", "2026-01-01"],
  CORCCACBS: ["1985-01-01", "2026-01-01"],
  CPIAUCSL: ["1947-01-01", "2026-06-01"],
  POPTHM: ["1959-01-01", "2026-06-01"],
  DSPI: ["1959-01-01", "2026-06-01"],
} as const;

class FredHistoryStore implements IngestionStore {
  readonly persistedKeys = new Set<string>();

  async findSource() {
    return { id: "fred-id", slug: "fred", enabled: true };
  }

  async createRun() {
    return crypto.randomUUID();
  }

  async markSourceAttempted() {}

  async persistMetricObservations(
    input: Parameters<IngestionStore["persistMetricObservations"]>[0],
  ) {
    let recordsCreated = 0;
    let recordsUpdated = 0;
    for (const observation of input.observations) {
      const key = `${input.metric.slug}:${observation.periodStart.toISOString()}:${observation.periodEnd.toISOString()}`;
      if (this.persistedKeys.has(key)) {
        recordsUpdated += 1;
      } else {
        this.persistedKeys.add(key);
        recordsCreated += 1;
      }
    }
    return { recordsCreated, recordsUpdated };
  }

  async completeRun() {}
  async failRun() {}
}

describe("FRED full-history ingestion", () => {
  it("ingests validated start/latest observations idempotently without live requests", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const seriesId = url.searchParams.get(
        "series_id",
      ) as keyof typeof observationRanges;
      if (url.pathname.endsWith("/series")) {
        return Response.json(seriesFixtures[seriesId]);
      }

      const [start, end] = observationRanges[seriesId];
      return Response.json({
        observations: [
          { date: start, value: "100" },
          { date: end, value: "125" },
        ],
      });
    });
    const adapter = new FredDataSourceAdapter({
      getBaseUrl: () => "https://api.stlouisfed.org/fred",
      getApiKey: () => "fixture-key",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const store = new FredHistoryStore();
    const input = {
      sourceDefinition: getSourceDefinition("fred"),
      adapter,
      store,
      startDate: new Date("1943-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-01T00:00:00.000Z"),
      startPeriod: "1943-01-01",
      endPeriod: "2026-06-01",
    } as const;

    const first = await runIngestion(input);
    const repeated = await runIngestion(input);

    expect(first).toMatchObject({
      recordsRead: 14,
      recordsCreated: 14,
      recordsUpdated: 0,
    });
    expect(repeated).toMatchObject({
      recordsRead: 14,
      recordsCreated: 0,
      recordsUpdated: 14,
    });
    expect(store.persistedKeys.size).toBe(14);
    expect(fetchImplementation).toHaveBeenCalledTimes(28);
  });
});
