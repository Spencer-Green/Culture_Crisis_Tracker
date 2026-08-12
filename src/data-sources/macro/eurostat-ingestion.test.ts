import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { EurostatDataSourceAdapter } from "@/data-sources/macro/eurostat-adapter";
import { EUROSTAT_METRICS } from "@/data-sources/macro/eurostat-metrics";
import { runIngestion } from "@/services/ingestion/service-core";
import type { IngestionStore } from "@/services/ingestion/types";

const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/eurostat-nama-10-cp18.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

function payloadForUrl(url: URL): Record<string, unknown> {
  const unitCode = url.searchParams.get("unit")!;
  const purposeCode = url.searchParams.get("coicop18")!;
  const metric = EUROSTAT_METRICS.find(
    (candidate) =>
      candidate.unitCode === unitCode && candidate.coicopCode === purposeCode,
  )!;
  const payload = structuredClone(fixture) as Record<string, unknown>;
  const dimensions = payload.dimension as Record<
    string,
    Record<string, unknown>
  >;
  const unit = dimensions.unit.category as Record<string, unknown>;
  unit.index = { [metric.unitCode]: 0 };
  unit.label = { [metric.unitCode]: metric.unitLabel };
  const purpose = dimensions.coicop18.category as Record<string, unknown>;
  purpose.index = { [metric.coicopCode]: 0 };
  purpose.label = { [metric.coicopCode]: metric.coicopLabel };
  return payload;
}

class EurostatFixtureStore implements IngestionStore {
  readonly persistedKeys = new Set<string>();

  async findSource() {
    return { id: "eurostat-id", slug: "eurostat", enabled: true };
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

describe("Eurostat ingestion", () => {
  it("persists the four annual metrics idempotently without live requests", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) =>
      Response.json(payloadForUrl(new URL(String(input)))),
    );
    const adapter = new EurostatDataSourceAdapter({
      getBaseUrl: () =>
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const store = new EurostatFixtureStore();
    const input = {
      sourceDefinition: getSourceDefinition("eurostat"),
      adapter,
      store,
      startDate: new Date("2019-01-01T00:00:00.000Z"),
      endDate: new Date("2021-12-31T23:59:59.999Z"),
      startPeriod: "2019",
      endPeriod: "2021",
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
    expect(fetchImplementation).toHaveBeenCalledTimes(8);
  });
});
