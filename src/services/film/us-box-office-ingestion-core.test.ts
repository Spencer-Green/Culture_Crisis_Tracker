import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { getSourceDefinition } from "@/data-sources/catalog";
import { USBoxOfficeAdapter } from "@/data-sources/film/us-box-office-adapter";
import type { USBoxOfficeWeekendRecord } from "@/data-sources/film/us-box-office-types";
import {
  runUSBoxOfficeIngestion,
  type USBoxOfficeIngestionStore,
} from "@/services/film/us-box-office-ingestion-core";

const csv = readFileSync(
  new URL(
    "../../data-sources/film/__fixtures__/weekend_summary_2026.csv",
    import.meta.url,
  ),
  "utf8",
);

class MemoryStore implements USBoxOfficeIngestionStore {
  records = new Map<string, USBoxOfficeWeekendRecord>();
  runs = 0;
  findSource() {
    return Promise.resolve({ id: "source", enabled: true });
  }
  createRun() {
    this.runs += 1;
    return Promise.resolve(`run-${this.runs}`);
  }
  markSourceAttempted() {
    return Promise.resolve();
  }
  persistWeekends(
    input: Parameters<USBoxOfficeIngestionStore["persistWeekends"]>[0],
  ) {
    let created = 0;
    let updated = 0;
    for (const record of input.records) {
      const key = `${record.sourceYear}:${record.weekNumber}`;
      if (this.records.has(key)) updated += 1;
      else created += 1;
      this.records.set(key, record);
    }
    return Promise.resolve({
      recordsCreated: created,
      recordsUpdated: updated,
    });
  }
  completeRun() {
    return Promise.resolve();
  }
  failRun() {
    return Promise.resolve();
  }
}

describe("US box-office ingestion", () => {
  it("is idempotent and updates revised weekends", async () => {
    const store = new MemoryStore();
    const adapter = new USBoxOfficeAdapter(
      () => "https://www.kaggle.com/api/v1",
    );
    let currentCsv = csv;
    const execute = () =>
      runUSBoxOfficeIngestion({
        sourceDefinition: getSourceDefinition("us-box-office"),
        adapter,
        store,
        baseUrl: "https://www.kaggle.com/api/v1",
        startYear: 2026,
        now: () => new Date("2026-08-13T00:00:00Z"),
        download: async () => ({
          bytes: zipSync({ "weekend_summary_2026.csv": strToU8(currentCsv) }),
          safeRequestUrl:
            "https://www.kaggle.com/api/v1/datasets/download/jonbown/weekend-box-office-summaries",
          datasetUpdatedAt: new Date("2026-08-11T00:00:00Z"),
          latencyMs: 1,
        }),
      });
    const first = await execute();
    expect(first).toMatchObject({
      created: 4,
      updated: 0,
      canonicalWeekends: 4,
    });
    const repeat = await execute();
    expect(repeat).toMatchObject({ created: 0, updated: 4 });
    currentCsv = currentCsv.replace("$200,000,000", "$205,000,000");
    await execute();
    expect(store.records.get("2026:32")?.totalGrossUsd).toBe(205_000_000);
  });
});
