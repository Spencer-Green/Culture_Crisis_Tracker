import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { AbsDataSourceAdapter } from "@/data-sources/macro/abs-adapter";
import { runIngestion } from "@/services/ingestion/service-core";
import type { IngestionStore } from "@/services/ingestion/types";

const recreationFixture = readFileSync(
  new URL("./__fixtures__/hsi-q-recreation-real.csv", import.meta.url),
  "utf8",
);

class AbsFixtureStore implements IngestionStore {
  readonly persistedKeys = new Set<string>();
  async findSource() {
    return { id: "abs-id", slug: "abs", enabled: true };
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

describe("ABS quarterly real ingestion", () => {
  it("persists both official chain-volume metrics idempotently", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const total = String(input).includes("7.TOT.CVM");
      const body = total
        ? recreationFixture.replaceAll(
            "50: Recreation and culture",
            "TOT: Total",
          )
        : recreationFixture;
      return new Response(body, {
        headers: { "content-type": "application/vnd.sdmx.data+csv" },
      });
    });
    const adapter = new AbsDataSourceAdapter({
      getBaseUrl: () => "https://data.api.abs.gov.au/rest",
      fetchImplementation,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    const store = new AbsFixtureStore();
    const input = {
      sourceDefinition: getSourceDefinition("abs"),
      adapter,
      store,
      startDate: new Date("2025-10-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T23:59:59.999Z"),
      startPeriod: "2025-Q4",
      endPeriod: "2026-Q2",
      metricSlugs: [
        "au-household-spending-total-real",
        "au-recreation-culture-spending-real",
      ],
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
  });
});
