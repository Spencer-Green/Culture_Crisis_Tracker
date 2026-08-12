import type { SourceDefinition } from "@/data-sources/catalog";
import type { GdeltArticle } from "@/data-sources/news/gdelt-api";
import type { GdeltDataSourceAdapter } from "@/data-sources/news/gdelt-adapter";
import {
  classifyGdeltArticle,
  type ClassifiedGdeltCandidate,
} from "@/data-sources/news/gdelt-classifier";
import { deduplicateGdeltArticles } from "@/data-sources/news/gdelt-dedup";
import {
  buildGdeltQuery,
  GDELT_QUERY_FAMILIES,
  getGdeltQueryFamily,
  type GdeltQueryFamily,
  type GdeltQueryFamilyId,
} from "@/data-sources/news/gdelt-queries";
import type { GdeltCountryCode } from "@/data-sources/news/gdelt-taxonomy";
import { HttpRequestError } from "@/lib/http";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export type GdeltIngestionSourceRecord = {
  id: string;
  slug: string;
  enabled: boolean;
};

export type PersistGdeltCandidatesResult = {
  recordsCreated: number;
  recordsUpdated: number;
};

export interface GdeltIngestionStore {
  findSource(slug: string): Promise<GdeltIngestionSourceRecord | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistCandidates(
    candidates: readonly ClassifiedGdeltCandidate[],
    retrievedAt: Date,
  ): Promise<PersistGdeltCandidatesResult>;
  completeRun(input: {
    runId: string;
    sourceId: string;
    completedAt: Date;
    articlesReturned: number;
    recordsCreated: number;
    recordsUpdated: number;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  failRun(input: {
    runId: string;
    completedAt: Date;
    errorMessage: string;
    articlesReturned: number;
  }): Promise<void>;
}

export type GdeltIngestionResult = {
  runId: string;
  days: number;
  startDate: string;
  endDate: string;
  queryFamilies: string[];
  articlesReturned: number;
  exactDuplicatesRemoved: number;
  overlappingCandidates: number;
  candidatesClassified: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  negative: number;
  positive: number;
  ambiguous: number;
  countryDistribution: Record<string, number>;
  sectorDistribution: Record<string, number>;
  eventTypeDistribution: Record<string, number>;
  recordsCreated: number;
  recordsUpdated: number;
  durationMs: number;
};

type RunGdeltIngestionInput = {
  sourceDefinition: SourceDefinition;
  adapter: GdeltDataSourceAdapter;
  store: GdeltIngestionStore;
  days: number;
  startDate: Date;
  endDate: Date;
  maxRecords: number;
  queryFamily?: GdeltQueryFamilyId;
  countryCode?: GdeltCountryCode;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  interRequestDelayMs?: number;
};

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
  );
}

function selectFamilies(id?: GdeltQueryFamilyId): GdeltQueryFamily[] {
  if (!id) return [...GDELT_QUERY_FAMILIES];
  const family = getGdeltQueryFamily(id);
  if (!family)
    throw new IngestionPolicyError(`Unknown GDELT query family "${id}".`);
  return [family];
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runGdeltIngestion(
  input: RunGdeltIngestionInput,
): Promise<GdeltIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source) {
    throw new IngestionPolicyError(
      'Source "gdelt" is not present in the database. Run the seed first.',
    );
  }
  if (input.sourceDefinition.implementationStatus !== "implemented") {
    throw new IngestionPolicyError('Source "gdelt" is not implemented.');
  }
  if (!input.adapter.isConfigured()) {
    throw new IngestionPolicyError('Source "gdelt" is not configured.');
  }
  if (!source.enabled) {
    throw new IngestionPolicyError('Source "gdelt" is disabled.');
  }

  const families = selectFamilies(input.queryFamily);
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      days: input.days,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      queryFamilies: families.map((family) => family.id),
      countryCode: input.countryCode ?? null,
      maxRecordsPerFamily: input.maxRecords,
      corpusType: "GDELT article candidates",
    },
  });
  let articlesReturned = 0;

  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const fetched: GdeltArticle[] = [];
    const sleep = input.sleep ?? defaultSleep;
    const delay = input.interRequestDelayMs ?? 5_500;
    for (const [index, family] of families.entries()) {
      const response = await input.adapter.fetchArticles({
        query: buildGdeltQuery(family, input.countryCode),
        queryFamily: family.id,
        startDate: input.startDate,
        endDate: input.endDate,
        maxRecords: input.maxRecords,
      });
      fetched.push(...response.articles);
      articlesReturned += response.articles.length;
      if (index < families.length - 1 && delay > 0) await sleep(delay);
    }
    const deduplicated = deduplicateGdeltArticles(fetched);
    const candidates = deduplicated.articles.map(classifyGdeltArticle);
    const retrievedAt = now();
    const persisted = await input.store.persistCandidates(
      candidates,
      retrievedAt,
    );
    const result = {
      runId,
      days: input.days,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      queryFamilies: families.map((family) => family.id),
      articlesReturned,
      exactDuplicatesRemoved: deduplicated.duplicateCount,
      overlappingCandidates: deduplicated.overlapCount,
      candidatesClassified: candidates.length,
      highConfidence: candidates.filter(
        (item) => item.confidenceLevel === "high",
      ).length,
      mediumConfidence: candidates.filter(
        (item) => item.confidenceLevel === "medium",
      ).length,
      lowConfidence: candidates.filter((item) => item.confidenceLevel === "low")
        .length,
      negative: candidates.filter((item) => item.polarity === "negative")
        .length,
      positive: candidates.filter((item) => item.polarity === "positive")
        .length,
      ambiguous: candidates.filter(
        (item) => item.polarity === "neutral/ambiguous",
      ).length,
      countryDistribution: countBy(
        candidates.map((item) => item.countryCode ?? "unknown"),
      ),
      sectorDistribution: countBy(candidates.map((item) => item.sectorSlug)),
      eventTypeDistribution: countBy(candidates.map((item) => item.eventType)),
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      durationMs: retrievedAt.getTime() - startedAt.getTime(),
    } satisfies GdeltIngestionResult;
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt: retrievedAt,
      articlesReturned,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      metadata: result,
    });
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof HttpRequestError
        ? sanitiseIngestionError(error)
        : error instanceof IngestionPolicyError ||
            error instanceof IngestionExecutionError
          ? error.message.slice(0, 500)
          : "GDELT ingestion failed while processing article candidates.";
    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        errorMessage,
        articlesReturned,
      });
    } catch {}
    throw new IngestionExecutionError(errorMessage);
  }
}
