import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
} from "@/data-sources/types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  runIngestion,
} from "@/services/ingestion/service-core";
import type { IngestionStore } from "@/services/ingestion/types";

const metric: AvailableMetric = {
  slug: "test-metric",
  name: "Test metric",
  description: "Fixture metric",
  unit: "percent",
  frequency: "monthly",
};

const observation: NormalisedObservation = {
  metricSlug: metric.slug,
  countryCode: "AU",
  sectorSlug: "consumer-spending",
  periodStart: new Date("2026-01-01T00:00:00.000Z"),
  periodEnd: new Date("2026-01-31T23:59:59.999Z"),
  value: "1.2",
  sourceUrl: "https://data.api.abs.gov.au/rest/data/example",
  retrievedAt: new Date("2026-08-11T00:00:00.000Z"),
  metadata: {},
};

class FakeAdapter implements DataSourceAdapter {
  readonly slug = "abs";
  readonly name = "ABS";
  readonly countries = ["AU"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(
    private readonly configured = true,
    private readonly fetchError?: Error,
  ) {}

  isConfigured() {
    return this.configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    return { status: "not-checked", checkedAt: null };
  }

  async fetchAvailableMetrics() {
    return [metric];
  }

  async fetchObservations(): Promise<NormalisedObservation[]> {
    if (this.fetchError) {
      throw this.fetchError;
    }
    return [observation];
  }
}

class FakeStore implements IngestionStore {
  enabled = true;
  readonly persistedKeys = new Set<string>();
  readonly failedMessages: string[] = [];
  runNumber = 0;
  persistedContext: { countryCode: string; sectorSlug: string } | null = null;

  async findSource() {
    return { id: "source-id", slug: "abs", enabled: this.enabled };
  }

  async createRun() {
    this.runNumber += 1;
    return `run-${this.runNumber}`;
  }

  async markSourceAttempted() {}

  async persistMetricObservations(
    input: Parameters<IngestionStore["persistMetricObservations"]>[0],
  ) {
    this.persistedContext = {
      countryCode: input.countryCode,
      sectorSlug: input.sectorSlug,
    };
    let recordsCreated = 0;
    let recordsUpdated = 0;

    for (const item of input.observations) {
      const key = `${input.metric.slug}:${item.periodStart.toISOString()}:${item.periodEnd.toISOString()}`;
      if (this.persistedKeys.has(key)) {
        recordsUpdated += 1;
      } else {
        recordsCreated += 1;
        this.persistedKeys.add(key);
      }
    }

    return { recordsCreated, recordsUpdated };
  }

  async completeRun() {}

  async failRun(input: Parameters<IngestionStore["failRun"]>[0]) {
    this.failedMessages.push(input.errorMessage);
  }
}

const baseInput = {
  sourceDefinition: getSourceDefinition("abs"),
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-01-01T00:00:00.000Z"),
  startPeriod: "2026-01",
  endPeriod: "2026-01",
} as const;

describe("ingestion service", () => {
  it("is idempotent across repeated observation upserts", async () => {
    const store = new FakeStore();
    const adapter = new FakeAdapter();

    const first = await runIngestion({ ...baseInput, store, adapter });
    const second = await runIngestion({ ...baseInput, store, adapter });

    expect(first).toMatchObject({
      recordsRead: 1,
      recordsCreated: 1,
      recordsUpdated: 0,
    });
    expect(second).toMatchObject({
      recordsRead: 1,
      recordsCreated: 0,
      recordsUpdated: 1,
    });
    expect(store.persistedKeys.size).toBe(1);
  });

  it("uses metric-specific country and sector provenance when provided", async () => {
    const store = new FakeStore();
    const musicMetric = {
      ...metric,
      countryCode: "US" as const,
      sectorSlug: "music" as const,
    };
    class MusicAdapter extends FakeAdapter {
      override async fetchAvailableMetrics() {
        return [musicMetric];
      }
    }

    await runIngestion({
      ...baseInput,
      sourceDefinition: getSourceDefinition("bea"),
      store,
      adapter: new MusicAdapter(),
    });

    expect(store.persistedContext).toEqual({
      countryCode: "US",
      sectorSlug: "music",
    });
  });

  it("keeps implementation, configuration, and enablement independent", async () => {
    const disabledStore = new FakeStore();
    disabledStore.enabled = false;

    await expect(
      runIngestion({
        ...baseInput,
        store: disabledStore,
        adapter: new FakeAdapter(),
      }),
    ).rejects.toThrow(IngestionPolicyError);

    await expect(
      runIngestion({
        ...baseInput,
        store: new FakeStore(),
        adapter: new FakeAdapter(false),
      }),
    ).rejects.toThrow("not configured");
  });

  it("stores and returns sanitised failures", async () => {
    const store = new FakeStore();

    await expect(
      runIngestion({
        ...baseInput,
        store,
        adapter: new FakeAdapter(
          true,
          new Error("DATABASE_URL=postgresql://secret"),
        ),
      }),
    ).rejects.toThrow(IngestionExecutionError);

    expect(store.failedMessages).toEqual([
      "Ingestion failed while processing source data.",
    ]);
    expect(JSON.stringify(store.failedMessages)).not.toContain("secret");
  });
});
