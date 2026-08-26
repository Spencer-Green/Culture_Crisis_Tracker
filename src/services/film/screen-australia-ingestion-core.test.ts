import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { ScreenAustraliaAdapter } from "@/data-sources/film/screen-australia-adapter";
import { SCREEN_AUSTRALIA_WIDGET_URL } from "@/data-sources/film/screen-australia-types";
import {
  runScreenAustraliaIngestion,
  type ScreenAustraliaIngestionStore,
} from "@/services/film/screen-australia-ingestion-core";

const fixture = readFileSync(
  fileURLToPath(
    new URL(
      "../../data-sources/film/__fixtures__/screen-australia-widget.html",
      import.meta.url,
    ),
  ),
  "utf8",
);

function memoryStore() {
  const observations = new Map<string, { gross: number | null }>();
  let runs = 0;
  const store: ScreenAustraliaIngestionStore = {
    findSource: async () => ({ id: "source-id", enabled: true }),
    createRun: async () => `run-${++runs}`,
    markSourceAttempted: async () => undefined,
    persistObservations: async ({ records }) => {
      let recordsCreated = 0;
      let recordsUpdated = 0;
      for (const record of records) {
        const key = `${record.reportDate.toISOString()}:${record.periodType}:${record.rank}:${record.normalizedTitle}`;
        if (observations.has(key)) recordsUpdated += 1;
        else recordsCreated += 1;
        observations.set(key, { gross: record.periodGrossAud });
      }
      return { recordsCreated, recordsUpdated };
    },
    completeRun: async () => undefined,
    failRun: async () => undefined,
  };
  return { store, observations };
}

describe("Screen Australia ingestion", () => {
  it("is idempotent and updates revised source rows", async () => {
    const memory = memoryStore();
    const adapter = new ScreenAustraliaAdapter(
      () => SCREEN_AUSTRALIA_WIDGET_URL,
    );
    const times = [
      new Date("2026-08-24T00:00:00Z"),
      new Date("2026-08-24T00:00:01Z"),
      new Date("2026-08-31T00:00:00Z"),
      new Date("2026-08-31T00:00:01Z"),
      new Date("2026-09-07T00:00:00Z"),
      new Date("2026-09-07T00:00:01Z"),
    ];
    const run = (html: string) =>
      runScreenAustraliaIngestion({
        sourceDefinition: getSourceDefinition("screen-australia"),
        adapter,
        store: memory.store,
        baseUrl: SCREEN_AUSTRALIA_WIDGET_URL,
        now: () => times.shift()!,
        fetcher: async () => ({
          html,
          latencyMs: 1,
          cacheControl: "max-age=3600",
          retrievedUrl: SCREEN_AUSTRALIA_WIDGET_URL,
          requestCount: 1,
        }),
      });

    const first = await run(fixture);
    const repeat = await run(fixture);
    const revised = await run(fixture.replace("8261513", "9000000"));

    expect(first).toMatchObject({ created: 8, updated: 0, requestCount: 1 });
    expect(repeat).toMatchObject({ created: 0, updated: 8, requestCount: 1 });
    expect(revised).toMatchObject({ created: 0, updated: 8, requestCount: 1 });
    expect(
      [...memory.observations.values()].some(
        (value) => value.gross === 9_000_000,
      ),
    ).toBe(true);
  });
});
