import type { SourceDefinition } from "@/data-sources/catalog";
import { classifyMediaArticle } from "@/data-sources/news/media-classifier";
import {
  MEDIA_QUERY_FAMILIES,
  getMediaQueryFamily,
  type MediaQueryFamily,
} from "@/data-sources/news/media-queries";
import type {
  ClassifiedMediaArticle,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";
import type { TheNewsApiAdapter } from "@/data-sources/news/thenewsapi-adapter";
import { THENEWSAPI_MAX_REQUESTS_PER_RUN } from "@/data-sources/news/thenewsapi-api";
import { HttpRequestError } from "@/lib/http";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export type MediaArticleBundle = {
  article: ClassifiedMediaArticle;
  matches: ClassifiedMediaArticle[];
};

export type MediaIngestionSourceRecord = {
  id: string;
  slug: string;
  enabled: boolean;
};
export type PersistMediaResult = {
  recordsCreated: number;
  recordsUpdated: number;
  crossSourceMatches: number;
};

export interface MediaIngestionStore {
  findSource(slug: string): Promise<MediaIngestionSourceRecord | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistArticles(input: {
    sourceId: string;
    sourceSlug: string;
    bundles: readonly MediaArticleBundle[];
    retrievedAt: Date;
  }): Promise<PersistMediaResult>;
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

export class MediaRequestBudget {
  private used = 0;
  readonly maximum: number;

  constructor(maximum: number) {
    if (
      !Number.isInteger(maximum) ||
      maximum < 1 ||
      maximum > THENEWSAPI_MAX_REQUESTS_PER_RUN
    ) {
      throw new IngestionPolicyError(
        `TheNewsAPI max requests must be between 1 and ${THENEWSAPI_MAX_REQUESTS_PER_RUN}.`,
      );
    }
    this.maximum = maximum;
  }

  consume(): void {
    if (this.used >= this.maximum)
      throw new IngestionPolicyError("TheNewsAPI request budget is exhausted.");
    this.used += 1;
  }

  get requestsUsed(): number {
    return this.used;
  }
}

function rank(article: ClassifiedMediaArticle): number {
  const confidence =
    article.confidence === "high" ? 3 : article.confidence === "medium" ? 2 : 1;
  return article.importance * 10 + confidence;
}

export function bundleMediaArticles(input: readonly ClassifiedMediaArticle[]): {
  bundles: MediaArticleBundle[];
  duplicateCount: number;
} {
  const byUrl = new Map<string, MediaArticleBundle>();
  for (const article of input) {
    const current = byUrl.get(article.canonicalUrl);
    if (!current) {
      byUrl.set(article.canonicalUrl, { article, matches: [article] });
      continue;
    }
    current.matches.push(article);
    if (rank(article) > rank(current.article)) current.article = article;
  }
  const bundles = [...byUrl.values()].sort(
    (left, right) =>
      right.article.publishedAt.getTime() - left.article.publishedAt.getTime(),
  );
  return { bundles, duplicateCount: input.length - bundles.length };
}

function countBy(values: readonly (string | null)[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values)
    counts.set(
      value ?? "unclassified",
      (counts.get(value ?? "unclassified") ?? 0) + 1,
    );
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export type NewsApiIngestionResult = {
  runId: string;
  hours: number;
  requestsUsed: number;
  queryFamilies: string[];
  articlesReturned: number;
  canonicalDuplicates: number;
  created: number;
  updated: number;
  crossSourceMatches: number;
  sectorDistribution: Record<string, number>;
  eventTypeDistribution: Record<string, number>;
  polarityDistribution: Record<string, number>;
  aiImpactDistribution: Record<string, number>;
  importanceDistribution: Record<string, number>;
  publisherDistribution: Record<string, number>;
  durationMs: number;
};

export async function runNewsApiIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: TheNewsApiAdapter;
  store: MediaIngestionStore;
  hours: number;
  startDate: Date;
  endDate: Date;
  maxRequests: number;
  family?: string;
  sector?: MediaSectorSlug;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  interRequestDelayMs?: number;
}): Promise<NewsApiIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "thenewsapi" is not present. Run the seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "thenewsapi" is not implemented.');
  if (!input.adapter.isConfigured())
    throw new IngestionPolicyError('Source "thenewsapi" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "thenewsapi" is disabled.');
  let families: MediaQueryFamily[] = [...MEDIA_QUERY_FAMILIES];
  if (input.family) {
    const family = getMediaQueryFamily(input.family);
    if (!family)
      throw new IngestionPolicyError(
        `Unknown media query family "${input.family}".`,
      );
    families = [family];
  }
  if (input.sector)
    families = families.filter((family) => family.sector === input.sector);
  const budget = new MediaRequestBudget(input.maxRequests);
  families = families.slice(0, budget.maximum);
  if (families.length === 0)
    throw new IngestionPolicyError(
      "No media query families match the requested filters.",
    );
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      sourceType: "THENEWSAPI",
      hours: input.hours,
      maxRequests: input.maxRequests,
      queryFamilies: families.map((family) => family.id),
    },
  });
  let recordsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const raw = [];
    const sleep = input.sleep ?? defaultSleep;
    for (const [index, family] of families.entries()) {
      budget.consume();
      const response = await input.adapter.fetchArticles({
        family,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      raw.push(...response.articles);
      recordsRead += response.articles.length;
      if (index < families.length - 1 && (input.interRequestDelayMs ?? 350) > 0)
        await sleep(input.interRequestDelayMs ?? 350);
    }
    const classified = raw
      .map(classifyMediaArticle)
      .filter((article): article is ClassifiedMediaArticle => article !== null);
    const deduped = bundleMediaArticles(classified);
    const retrievedAt = now();
    const persisted = await input.store.persistArticles({
      sourceId: source.id,
      sourceSlug: source.slug,
      bundles: deduped.bundles,
      retrievedAt,
    });
    const articles = deduped.bundles.map((bundle) => bundle.article);
    const result: NewsApiIngestionResult = {
      runId,
      hours: input.hours,
      requestsUsed: budget.requestsUsed,
      queryFamilies: families.map((family) => family.id),
      articlesReturned: recordsRead,
      canonicalDuplicates: deduped.duplicateCount,
      created: persisted.recordsCreated,
      updated: persisted.recordsUpdated,
      crossSourceMatches: persisted.crossSourceMatches,
      sectorDistribution: countBy(
        articles.map((article) => article.sectorSlug),
      ),
      eventTypeDistribution: countBy(
        articles.map((article) => article.eventType),
      ),
      polarityDistribution: countBy(
        articles.map((article) => article.polarity),
      ),
      aiImpactDistribution: countBy(
        articles.map((article) => article.aiImpactType),
      ),
      importanceDistribution: countBy(
        articles.map((article) => String(article.importance)),
      ),
      publisherDistribution: countBy(
        articles.map((article) => article.publisher),
      ),
      durationMs: retrievedAt.getTime() - startedAt.getTime(),
    };
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt: retrievedAt,
      recordsRead,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      metadata: result,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof HttpRequestError
        ? sanitiseIngestionError(error)
        : error instanceof IngestionPolicyError
          ? error.message.slice(0, 500)
          : "TheNewsAPI ingestion failed while processing media articles.";
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
