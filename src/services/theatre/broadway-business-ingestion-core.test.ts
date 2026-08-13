import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { BroadwayBusinessAdapter } from "@/data-sources/theatre/broadway-business-adapter";
import type { BroadwayMarketWeekRecord } from "@/data-sources/theatre/broadway-business-types";
import {
  runBroadwayBusinessIngestion,
  type BroadwayBusinessIngestionStore,
} from "@/services/theatre/broadway-business-ingestion-core";

class MemoryStore implements BroadwayBusinessIngestionStore {
  records = new Map<string, BroadwayMarketWeekRecord>();
  findSource() {
    return Promise.resolve({ id: "source", enabled: true });
  }
  createRun() {
    return Promise.resolve("run");
  }
  markSourceAttempted() {
    return Promise.resolve();
  }
  persistWeeks(
    input: Parameters<BroadwayBusinessIngestionStore["persistWeeks"]>[0],
  ) {
    let recordsCreated = 0;
    let recordsUpdated = 0;
    for (const record of input.records) {
      const key = record.weekEnding.toISOString();
      if (this.records.has(key)) recordsUpdated += 1;
      else recordsCreated += 1;
      this.records.set(key, record);
    }
    return Promise.resolve({ recordsCreated, recordsUpdated });
  }
  completeRun() {
    return Promise.resolve();
  }
  failRun() {
    return Promise.resolve();
  }
}

const records: BroadwayMarketWeekRecord[] = [
  {
    sourceWeekId: 1,
    seasonWeekNumber: 10,
    weekStart: new Date("2026-07-27T00:00:00Z"),
    weekEnding: new Date("2026-08-02T00:00:00Z"),
    grossUsd: 30,
    attendance: 15,
    showCount: null,
    capacityPct: 80,
    averageTicketPriceUsd: null,
    performanceCount: null,
    previewCount: null,
    metadata: {},
  },
  {
    sourceWeekId: 2,
    seasonWeekNumber: 11,
    weekStart: new Date("2026-08-03T00:00:00Z"),
    weekEnding: new Date("2026-08-09T00:00:00Z"),
    grossUsd: 40,
    attendance: 20,
    showCount: 10,
    capacityPct: 82,
    averageTicketPriceUsd: 2,
    performanceCount: 80,
    previewCount: 0,
    metadata: {},
  },
];

describe("Broadway Business ingestion", () => {
  it("upserts weekly identity and applies the requested bound", async () => {
    const store = new MemoryStore();
    const execute = () =>
      runBroadwayBusinessIngestion({
        sourceDefinition: getSourceDefinition("broadway-business"),
        adapter: new BroadwayBusinessAdapter(
          () => "https://broadwaybusiness.com/grosses",
        ),
        store,
        baseUrl: "https://broadwaybusiness.com/grosses",
        since: new Date("2026-08-01T00:00:00Z"),
        now: () => new Date("2026-08-14T00:00:00Z"),
        fetchDataset: async () => ({
          records,
          requestCount: 2,
          latestPageWeek: records[1],
          safeSourceUrl: "https://broadwaybusiness.com/grosses/",
          safeChartUrl:
            "https://broadwaybusiness.com/grosses/api/week/stats/chart?uptodate=1",
          rateLimit: { limit: 60, remaining: 59 },
        }),
      });
    expect(await execute()).toMatchObject({
      created: 2,
      updated: 0,
      weeksSelected: 2,
    });
    expect(await execute()).toMatchObject({ created: 0, updated: 2 });
    expect(store.records).toHaveLength(2);
  });
});
