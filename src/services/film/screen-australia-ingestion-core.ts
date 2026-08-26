import type { SourceDefinition } from "@/data-sources/catalog";
import type { ScreenAustraliaAdapter } from "@/data-sources/film/screen-australia-adapter";
import { fetchScreenAustraliaWidget } from "@/data-sources/film/screen-australia-api";
import { parseScreenAustraliaWidgetHtml } from "@/data-sources/film/screen-australia-parser";
import {
  SCREEN_AUSTRALIA_WIDGET_URL,
  type ScreenAustraliaBoxOfficeRecord,
} from "@/data-sources/film/screen-australia-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export interface ScreenAustraliaIngestionStore {
  findSource(slug: string): Promise<{ id: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistObservations(input: {
    sourceId: string;
    records: readonly ScreenAustraliaBoxOfficeRecord[];
    retrievedAt: Date;
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

export type ScreenAustraliaIngestionResult = {
  runId: string;
  requestCount: 1;
  rowsRead: number;
  rowsSkipped: number;
  created: number;
  updated: number;
  reportDates: Record<string, string>;
  viewCounts: Record<string, number>;
  warnings: string[];
  durationMs: number;
};

type WidgetFetcher = typeof fetchScreenAustraliaWidget;

export async function runScreenAustraliaIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: ScreenAustraliaAdapter;
  store: ScreenAustraliaIngestionStore;
  baseUrl: string | undefined;
  now?: () => Date;
  fetcher?: WidgetFetcher;
}): Promise<ScreenAustraliaIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "screen-australia" is not present. Run the seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented")
    throw new IngestionPolicyError(
      'Source "screen-australia" is not implemented.',
    );
  if (!input.adapter.isConfigured() || !input.baseUrl)
    throw new IngestionPolicyError(
      'Source "screen-australia" is not configured.',
    );
  if (!source.enabled)
    throw new IngestionPolicyError('Source "screen-australia" is disabled.');

  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      sourceUrl: SCREEN_AUSTRALIA_WIDGET_URL,
      acquisition: "public-widget-html",
      access: "provisional-private-research",
      requestLimit: 1,
      historicalBackfill: false,
    },
  });
  let rowsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const response = await (input.fetcher ?? fetchScreenAustraliaWidget)(
      input.baseUrl,
    );
    const parsed = parseScreenAustraliaWidgetHtml(response.html);
    rowsRead = parsed.rowsRead;
    const retrievedAt = now();
    const persisted = await input.store.persistObservations({
      sourceId: source.id,
      records: parsed.records,
      retrievedAt,
    });
    const reportDates = Object.fromEntries(
      parsed.views.map((view) => [
        view.periodType,
        view.reportDate.toISOString().slice(0, 10),
      ]),
    );
    const viewCounts = Object.fromEntries(
      parsed.views.map((view) => [view.periodType, view.rowCount]),
    );
    const result: ScreenAustraliaIngestionResult = {
      runId,
      requestCount: response.requestCount,
      rowsRead,
      rowsSkipped: parsed.rowsSkipped,
      created: persisted.recordsCreated,
      updated: persisted.recordsUpdated,
      reportDates,
      viewCounts,
      warnings: parsed.warnings,
      durationMs: retrievedAt.getTime() - startedAt.getTime(),
    };
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt: retrievedAt,
      recordsRead: rowsRead,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      metadata: {
        ...result,
        sourceUrl: SCREEN_AUSTRALIA_WIDGET_URL,
        cacheControl: response.cacheControl,
        longitudinalStart: retrievedAt.toISOString(),
      },
    });
    return result;
  } catch (error) {
    const message = sanitiseIngestionError(error);
    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        recordsRead: rowsRead,
        errorMessage: message,
      });
    } catch {}
    throw new IngestionExecutionError(message);
  }
}
