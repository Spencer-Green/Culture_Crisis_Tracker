import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { StatCanDataSourceAdapter } from "@/data-sources/macro/statcan-adapter";
import { STATCAN_METRICS } from "@/data-sources/macro/statcan-metrics";
import { runIngestion } from "@/services/ingestion/service-core";
import type { IngestionStore } from "@/services/ingestion/types";

const baseSeries = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/statcan-series-info.json", import.meta.url),
    "utf8",
  ),
);
const baseData = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/statcan-vector-data.json", import.meta.url),
    "utf8",
  ),
);

function metricForRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body) {
    const [{ coordinate }] = JSON.parse(String(init.body));
    return STATCAN_METRICS.find((metric) => metric.coordinate === coordinate)!;
  }
  const vectorId = Number(
    new URL(String(input)).searchParams.get("vectorIds")?.replaceAll('"', ""),
  );
  return STATCAN_METRICS.find((metric) => metric.vectorId === vectorId)!;
}

function responseFor(metric: (typeof STATCAN_METRICS)[number], data: boolean) {
  const payload = structuredClone(data ? baseData : baseSeries);
  payload[0].object.coordinate = metric.coordinate;
  payload[0].object.vectorId = metric.vectorId;
  if (!data) {
    payload[0].object.SeriesTitleEn = [
      "Canada",
      metric.priceLabel,
      metric.seasonalAdjustment,
      metric.categoryLabel,
    ].join(";");
  }
  return payload;
}

class StatCanFixtureStore implements IngestionStore {
  readonly persistedKeys = new Set<string>();
  async findSource() {
    return { id: "statcan-id", slug: "statcan", enabled: true };
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
      if (this.persistedKeys.has(key)) recordsUpdated += 1;
      else {
        this.persistedKeys.add(key);
        recordsCreated += 1;
      }
    }
    return { recordsCreated, recordsUpdated };
  }
  async completeRun() {}
  async failRun() {}
}

describe("Statistics Canada ingestion", () => {
  it("ingests the recent four-series range idempotently without live requests", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const metric = metricForRequest(input, init);
      const isData = !init?.body;
      return Response.json(responseFor(metric, isData));
    });
    const adapter = new StatCanDataSourceAdapter({
      getBaseUrl: () => "https://www150.statcan.gc.ca/t1/wds",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const store = new StatCanFixtureStore();
    const input = {
      sourceDefinition: getSourceDefinition("statcan"),
      adapter,
      store,
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.999Z"),
      startPeriod: "2025-Q4",
      endPeriod: "2026-Q1",
    } as const;

    const first = await runIngestion(input);
    const repeated = await runIngestion(input);
    expect(first).toMatchObject({
      recordsRead: 8,
      recordsCreated: 8,
      recordsUpdated: 0,
    });
    expect(repeated).toMatchObject({
      recordsRead: 8,
      recordsCreated: 0,
      recordsUpdated: 8,
    });
    expect(store.persistedKeys.size).toBe(8);
    expect(fetchImplementation).toHaveBeenCalledTimes(16);
  });
});
