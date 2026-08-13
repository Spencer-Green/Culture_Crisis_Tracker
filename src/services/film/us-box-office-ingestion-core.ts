import type { SourceDefinition } from "@/data-sources/catalog";
import type { USBoxOfficeAdapter } from "@/data-sources/film/us-box-office-adapter";
import { downloadUSBoxOfficeArchive } from "@/data-sources/film/us-box-office-api";
import { parseUSBoxOfficeArchive } from "@/data-sources/film/us-box-office-parser";
import {
  US_BOX_OFFICE_DATASET_PAGE,
  US_BOX_OFFICE_DATASET_SLUG,
  US_BOX_OFFICE_PROVENANCE,
  type USBoxOfficeWeekendRecord,
} from "@/data-sources/film/us-box-office-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export interface USBoxOfficeIngestionStore {
  findSource(slug: string): Promise<{ id: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistWeekends(input: {
    sourceId: string;
    records: readonly USBoxOfficeWeekendRecord[];
    retrievedAt: Date;
    datasetUpdatedAt: Date | null;
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

export type USBoxOfficeIngestionResult = {
  runId: string;
  startYear: number;
  rowsRead: number;
  canonicalWeekends: number;
  created: number;
  updated: number;
  duplicateVariantsRemoved: number;
  nullGrossRowsSkipped: number;
  futureRowsSkipped: number;
  earliestWeekend: string | null;
  latestWeekend: string | null;
  datasetUpdatedAt: string | null;
  durationMs: number;
};

export async function runUSBoxOfficeIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: USBoxOfficeAdapter;
  store: USBoxOfficeIngestionStore;
  baseUrl: string | undefined;
  startYear: number;
  now?: () => Date;
  download?: typeof downloadUSBoxOfficeArchive;
}): Promise<USBoxOfficeIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "us-box-office" is not present. Run the seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented")
    throw new IngestionPolicyError(
      'Source "us-box-office" is not implemented.',
    );
  if (!input.adapter.isConfigured() || !input.baseUrl)
    throw new IngestionPolicyError('Source "us-box-office" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "us-box-office" is disabled.');

  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      startYear: input.startYear,
      datasetSlug: US_BOX_OFFICE_DATASET_SLUG,
      status: "provisional-research",
    },
  });
  let recordsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const archive = await (input.download ?? downloadUSBoxOfficeArchive)(
      input.baseUrl,
    );
    const parsed = parseUSBoxOfficeArchive(archive.bytes, {
      startYear: input.startYear,
      throughDate: startedAt,
    });
    recordsRead = parsed.rawRows;
    const retrievedAt = now();
    const persisted = await input.store.persistWeekends({
      sourceId: source.id,
      records: parsed.records,
      retrievedAt,
      datasetUpdatedAt: archive.datasetUpdatedAt,
    });
    const result: USBoxOfficeIngestionResult = {
      runId,
      startYear: input.startYear,
      rowsRead: parsed.rawRows,
      canonicalWeekends: parsed.records.length,
      created: persisted.recordsCreated,
      updated: persisted.recordsUpdated,
      duplicateVariantsRemoved: parsed.duplicateVariantsRemoved,
      nullGrossRowsSkipped: parsed.nullGrossRowsSkipped,
      futureRowsSkipped: parsed.futureRowsSkipped,
      earliestWeekend:
        parsed.records[0]?.weekendEnd.toISOString().slice(0, 10) ?? null,
      latestWeekend:
        parsed.records.at(-1)?.weekendEnd.toISOString().slice(0, 10) ?? null,
      datasetUpdatedAt: archive.datasetUpdatedAt?.toISOString() ?? null,
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
        safeRequestUrl: archive.safeRequestUrl,
        datasetPage: US_BOX_OFFICE_DATASET_PAGE,
        underlyingProvenance: US_BOX_OFFICE_PROVENANCE,
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
