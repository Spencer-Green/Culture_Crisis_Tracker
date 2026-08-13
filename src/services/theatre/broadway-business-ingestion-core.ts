import type { SourceDefinition } from "@/data-sources/catalog";
import type { BroadwayBusinessAdapter } from "@/data-sources/theatre/broadway-business-adapter";
import { fetchBroadwayBusinessDataset } from "@/data-sources/theatre/broadway-business-api";
import type { BroadwayMarketWeekRecord } from "@/data-sources/theatre/broadway-business-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export interface BroadwayBusinessIngestionStore {
  findSource(slug: string): Promise<{ id: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistWeeks(input: {
    sourceId: string;
    records: readonly BroadwayMarketWeekRecord[];
    retrievedAt: Date;
    sourceUrl: string;
    chartUrl: string;
  }): Promise<{ recordsCreated: number; recordsUpdated: number }>;
  completeRun(input: {
    runId: string;
    sourceId: string;
    completedAt: Date;
    recordsRead: number;
    recordsCreated: number;
    recordsUpdated: number;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  failRun(input: {
    runId: string;
    completedAt: Date;
    recordsRead: number;
    errorMessage: string;
  }): Promise<void>;
}

export type BroadwayBusinessIngestionResult = {
  runId: string;
  requestedSince: string;
  rowsRead: number;
  weeksSelected: number;
  created: number;
  updated: number;
  earliestWeek: string | null;
  latestWeek: string | null;
  latestGrossUsd: number | null;
  latestAttendance: number | null;
  requestCount: number;
  rateLimit: { limit: number | null; remaining: number | null };
  durationMs: number;
};

export async function runBroadwayBusinessIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: BroadwayBusinessAdapter;
  store: BroadwayBusinessIngestionStore;
  baseUrl: string | undefined;
  since: Date;
  now?: () => Date;
  fetchDataset?: typeof fetchBroadwayBusinessDataset;
}): Promise<BroadwayBusinessIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "broadway-business" is not present. Run the seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented")
    throw new IngestionPolicyError(
      'Source "broadway-business" is not implemented.',
    );
  if (!input.adapter.isConfigured() || !input.baseUrl)
    throw new IngestionPolicyError(
      'Source "broadway-business" is not configured.',
    );
  if (!source.enabled)
    throw new IngestionPolicyError('Source "broadway-business" is disabled.');

  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const requestedSince = input.since.toISOString().slice(0, 10);
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      requestedSince,
      accessClassification: "AUTHORIZED_STRUCTURED",
      status: "provisional-private-research",
    },
  });
  let recordsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const dataset = await (input.fetchDataset ?? fetchBroadwayBusinessDataset)(
      input.baseUrl,
    );
    recordsRead = dataset.records.length;
    const records = dataset.records.filter(
      (record) => record.weekEnding >= input.since,
    );
    const retrievedAt = now();
    const persisted = await input.store.persistWeeks({
      sourceId: source.id,
      records,
      retrievedAt,
      sourceUrl: dataset.safeSourceUrl,
      chartUrl: dataset.safeChartUrl,
    });
    const latest = records.at(-1) ?? null;
    const result: BroadwayBusinessIngestionResult = {
      runId,
      requestedSince,
      rowsRead: dataset.records.length,
      weeksSelected: records.length,
      created: persisted.recordsCreated,
      updated: persisted.recordsUpdated,
      earliestWeek: records[0]?.weekEnding.toISOString().slice(0, 10) ?? null,
      latestWeek: latest?.weekEnding.toISOString().slice(0, 10) ?? null,
      latestGrossUsd: latest?.grossUsd ?? null,
      latestAttendance: latest?.attendance ?? null,
      requestCount: dataset.requestCount,
      rateLimit: dataset.rateLimit,
      durationMs: retrievedAt.getTime() - startedAt.getTime(),
    };
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt: retrievedAt,
      recordsRead,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      metadata: {
        ...result,
        safeSourceUrl: dataset.safeSourceUrl,
        safeChartUrl: dataset.safeChartUrl,
        underlyingSource: "The Broadway League",
      },
    });
    return result;
  } catch (error) {
    const message = sanitiseIngestionError(error);
    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        recordsRead,
        errorMessage: message,
      });
    } catch {}
    throw new IngestionExecutionError(message);
  }
}
