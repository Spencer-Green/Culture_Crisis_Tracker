import type { SourceDefinition } from "@/data-sources/catalog";
import { classifyMediaArticle } from "@/data-sources/news/media-classifier";
import { fetchRssFeed } from "@/data-sources/news/rss-api";
import type { RssFeedDefinition } from "@/data-sources/news/rss-registry";
import type {
  ClassifiedMediaArticle,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";
import { isSpecialistIntelligenceRelevant } from "@/data-sources/news/specialist-intelligence";
import {
  bundleMediaArticles,
  type MediaIngestionStore,
} from "@/services/media/media-ingestion-core";
import {
  IngestionExecutionError,
  IngestionPolicyError,
} from "@/services/ingestion/service-core";

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

export type RssIngestionResult = {
  runId: string;
  hours: number;
  feedsAttempted: number;
  feedsSucceeded: number;
  feedFailures: { slug: string; error: string }[];
  entriesRead: number;
  entriesInsideWindow: number;
  entriesBoundedOut: number;
  entriesAccepted: number;
  entriesSkipped: number;
  canonicalDuplicates: number;
  created: number;
  updated: number;
  crossSourceMatches: number;
  sectorDistribution: Record<string, number>;
  eventTypeDistribution: Record<string, number>;
  aiImpactDistribution: Record<string, number>;
  publisherDistribution: Record<string, number>;
  latestPublicationDate: string | null;
  durationMs: number;
};

export async function runRssIngestion(input: {
  sourceDefinition: SourceDefinition;
  store: MediaIngestionStore;
  feeds: readonly RssFeedDefinition[];
  hours: number;
  startDate: Date;
  sourceSlug?: string;
  sector?: MediaSectorSlug;
  fetchFeed?: typeof fetchRssFeed;
  now?: () => Date;
}): Promise<RssIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      `Source "${input.sourceDefinition.slug}" is not present. Run the seed first.`,
    );
  if (input.sourceDefinition.implementationStatus !== "implemented")
    throw new IngestionPolicyError(
      `Source "${input.sourceDefinition.slug}" is not implemented.`,
    );
  if (!source.enabled)
    throw new IngestionPolicyError(
      `Source "${input.sourceDefinition.slug}" is disabled.`,
    );
  let feeds = input.feeds.filter((feed) => feed.enabled);
  if (input.sourceSlug)
    feeds = feeds.filter((feed) => feed.slug === input.sourceSlug);
  if (input.sector)
    feeds = feeds.filter((feed) => feed.sector === input.sector);
  if (feeds.length === 0)
    throw new IngestionPolicyError(
      "No enabled RSS feeds match the requested filters.",
    );
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      sourceType: "RSS",
      hours: input.hours,
      feeds: feeds.map((feed) => feed.slug),
    },
  });
  let entriesRead = 0;
  let entriesInsideWindow = 0;
  let entriesBoundedOut = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const raw = [];
    const failures: { slug: string; error: string }[] = [];
    const fetcher = input.fetchFeed ?? fetchRssFeed;
    let succeeded = 0;
    for (const feed of feeds) {
      try {
        const response = await fetcher(feed);
        succeeded += 1;
        entriesRead += response.articles.length;
        const feedStartDate = new Date(
          Math.max(
            input.startDate.getTime(),
            feed.maximumAgeHours
              ? startedAt.getTime() - feed.maximumAgeHours * 60 * 60 * 1_000
              : Number.NEGATIVE_INFINITY,
          ),
        );
        const insideWindow = response.articles.filter(
          (article) =>
            article.publishedAt >= feedStartDate &&
            article.publishedAt <= startedAt,
        );
        const maximumItems =
          feed.maxItemsPerRun ??
          (feed.schedulingGroup === "INSTITUTIONAL"
            ? 50
            : feed.schedulingGroup === "SPECIALIST"
              ? 30
              : 100);
        entriesInsideWindow += insideWindow.length;
        entriesBoundedOut += Math.max(0, insideWindow.length - maximumItems);
        raw.push(
          ...insideWindow
            .slice(0, maximumItems)
            .filter(
              (article) =>
                feed.schedulingGroup !== "SPECIALIST" ||
                isSpecialistIntelligenceRelevant(article),
            ),
        );
      } catch {
        failures.push({
          slug: feed.slug,
          error: "Feed unavailable or invalid.",
        });
      }
    }
    if (succeeded === 0)
      throw new IngestionExecutionError("All curated RSS feeds failed.");
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
    const result: RssIngestionResult = {
      runId,
      hours: input.hours,
      feedsAttempted: feeds.length,
      feedsSucceeded: succeeded,
      feedFailures: failures,
      entriesRead,
      entriesInsideWindow,
      entriesBoundedOut,
      entriesAccepted: classified.length,
      entriesSkipped: Math.max(0, entriesRead - classified.length),
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
      aiImpactDistribution: countBy(
        articles.map((article) => article.aiImpactType),
      ),
      publisherDistribution: countBy(
        articles.map((article) => article.publisher),
      ),
      latestPublicationDate: articles[0]?.publishedAt.toISOString() ?? null,
      durationMs: retrievedAt.getTime() - startedAt.getTime(),
    };
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt: retrievedAt,
      recordsRead: entriesRead,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      metadata: result,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof IngestionPolicyError ||
      error instanceof IngestionExecutionError
        ? error.message.slice(0, 500)
        : "RSS ingestion failed while processing media articles.";
    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        recordsRead: entriesRead,
        errorMessage: message,
      });
    } catch {}
    throw new IngestionExecutionError(message);
  }
}
