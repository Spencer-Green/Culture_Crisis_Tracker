import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { GdeltDataSourceAdapter } from "@/data-sources/news/gdelt-adapter";
import type { ClassifiedGdeltCandidate } from "@/data-sources/news/gdelt-classifier";
import {
  runGdeltIngestion,
  type GdeltIngestionStore,
} from "@/services/industry-events/gdelt-ingestion-core";

class MemoryStore implements GdeltIngestionStore {
  enabled = true;
  candidates = new Set<string>();
  runs: Record<string, unknown>[] = [];

  async findSource() {
    return { id: "source-id", slug: "gdelt", enabled: this.enabled };
  }
  async createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }) {
    this.runs.push(input.metadata);
    return `run-${this.runs.length}`;
  }
  async markSourceAttempted() {}
  async persistCandidates(candidates: readonly ClassifiedGdeltCandidate[]) {
    const existing = candidates.filter((candidate) =>
      this.candidates.has(candidate.url),
    ).length;
    candidates.forEach((candidate) => this.candidates.add(candidate.url));
    return {
      recordsCreated: candidates.length - existing,
      recordsUpdated: existing,
    };
  }
  async completeRun(input: Parameters<GdeltIngestionStore["completeRun"]>[0]) {
    this.runs.push(input.metadata);
  }
  async failRun() {}
}

function adapter() {
  return new GdeltDataSourceAdapter({
    getBaseUrl: () => "https://api.gdeltproject.org",
    fetchImplementation: vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        const query = url.searchParams.get("query") ?? "";
        const title = query.includes("positive")
          ? "New Melbourne music venue opening this week"
          : "Melbourne music venue to close permanently after 30 years";
        return new Response(
          JSON.stringify({
            articles: [
              {
                url: "https://example.com/venue-story?utm_source=gdelt",
                title,
                seendate: "20260810T040000Z",
                domain: "example.com",
                language: "English",
                sourcecountry: "Australia",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
  });
}

describe("GDELT candidate ingestion", () => {
  it("deduplicates query overlap and remains idempotent on repeat", async () => {
    const store = new MemoryStore();
    const input = {
      sourceDefinition: getSourceDefinition("gdelt"),
      adapter: adapter(),
      store,
      days: 7,
      startDate: new Date("2026-08-05T00:00:00Z"),
      endDate: new Date("2026-08-12T00:00:00Z"),
      maxRecords: 5,
      interRequestDelayMs: 0,
      now: () => new Date("2026-08-12T00:00:01Z"),
    };
    const first = await runGdeltIngestion(input);
    const repeat = await runGdeltIngestion(input);

    expect(first.articlesReturned).toBe(7);
    expect(first.exactDuplicatesRemoved).toBe(6);
    expect(first.overlappingCandidates).toBe(1);
    expect(first.candidatesClassified).toBe(1);
    expect(first.recordsCreated).toBe(1);
    expect(repeat.recordsCreated).toBe(0);
    expect(repeat.recordsUpdated).toBe(1);
    expect(first.countryDistribution).toEqual({ AU: 1 });
  });

  it("enforces independent implementation, configuration, and enabled state", async () => {
    const store = new MemoryStore();
    store.enabled = false;
    await expect(
      runGdeltIngestion({
        sourceDefinition: getSourceDefinition("gdelt"),
        adapter: adapter(),
        store,
        days: 7,
        startDate: new Date("2026-08-05T00:00:00Z"),
        endDate: new Date("2026-08-12T00:00:00Z"),
        maxRecords: 5,
        interRequestDelayMs: 0,
      }),
    ).rejects.toThrow("disabled");
  });
});
