import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
  MediaReviewState,
  MediaSectorSlug,
  MediaSourceType,
} from "@/data-sources/news/media-types";

export type MediaArticleView = {
  id: string;
  sourceType: MediaSourceType;
  canonicalUrl: string;
  title: string;
  description: string | null;
  publisher: string;
  sourceDomain: string;
  publishedAt: string;
  retrievedAt: string;
  countryCode: string | null;
  sectorSlug: MediaSectorSlug;
  eventType: MediaEventType | null;
  polarity: MediaPolarity;
  confidence: MediaConfidence;
  importance: number;
  aiImpactType: AiImpactType | null;
  reviewState: MediaReviewState;
  classificationRationale: string;
  possibleDuplicateStory: boolean;
  sourceMatches: string[];
};

export type MediaFilters = {
  hours: 24 | 72 | 168;
  sector?: MediaSectorSlug;
  aiOnly?: boolean;
  polarity?: MediaPolarity;
  eventType?: string;
  minimumImportance?: number;
  publisher?: string;
};

export function filterMediaArticles(
  articles: readonly MediaArticleView[],
  filters: MediaFilters,
  now: Date,
): MediaArticleView[] {
  const cutoff = now.getTime() - filters.hours * 60 * 60 * 1_000;
  const publisher = filters.publisher?.trim().toLowerCase();
  return articles
    .filter((article) => {
      const publishedAt = new Date(article.publishedAt).getTime();
      return (
        publishedAt >= cutoff &&
        (!filters.sector || article.sectorSlug === filters.sector) &&
        (!filters.aiOnly || article.aiImpactType !== null) &&
        (!filters.polarity || article.polarity === filters.polarity) &&
        (!filters.eventType || article.eventType === filters.eventType) &&
        (!filters.minimumImportance ||
          article.importance >= filters.minimumImportance) &&
        (!publisher || article.publisher.toLowerCase().includes(publisher))
      );
    })
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
}

export function buildMediaHighlights(articles: readonly MediaArticleView[]) {
  const ranked = (predicate: (article: MediaArticleView) => boolean) =>
    articles
      .filter(predicate)
      .slice()
      .sort(
        (left, right) =>
          right.importance - left.importance ||
          new Date(right.publishedAt).getTime() -
            new Date(left.publishedAt).getTime(),
      )
      .slice(0, 4);
  return {
    topDevelopments: ranked((article) => article.importance >= 4),
    aiAndCreativeWork: ranked((article) => article.aiImpactType !== null),
    industryHealth: ranked((article) => article.polarity === "negative"),
    positiveSignals: ranked((article) => article.polarity === "positive"),
  };
}

export function buildMediaCounts(articles: readonly MediaArticleView[]) {
  const countBy = (values: readonly (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const value of values)
      counts.set(
        value ?? "unclassified",
        (counts.get(value ?? "unclassified") ?? 0) + 1,
      );
    return Object.fromEntries(
      [...counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  };
  return {
    total: articles.length,
    bySector: countBy(articles.map((article) => article.sectorSlug)),
    byEventType: countBy(articles.map((article) => article.eventType)),
    byPolarity: countBy(articles.map((article) => article.polarity)),
    byImportance: countBy(
      articles.map((article) => String(article.importance)),
    ),
    aiRelated: articles.filter((article) => article.aiImpactType !== null)
      .length,
    aiImpactBreakdown: countBy(
      articles
        .map((article) => article.aiImpactType)
        .filter((value) => value !== null),
    ),
  };
}
