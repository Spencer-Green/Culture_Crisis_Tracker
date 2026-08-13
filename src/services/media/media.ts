import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  buildMediaCounts,
  buildMediaHighlights,
  filterMediaArticles,
  type MediaArticleView,
  type MediaFilters,
} from "@/services/media/media-service-core";
import type { MediaSectorSlug } from "@/data-sources/news/media-types";

const DATABASE_UNAVAILABLE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
]);

function isDatabaseUnavailable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export class MediaLoadError extends Error {
  constructor(cause: unknown) {
    super("Media intelligence could not be loaded.", { cause });
    this.name = "MediaLoadError";
  }
}

function toView(article: {
  id: string;
  sourceType: string;
  canonicalUrl: string;
  title: string;
  description: string | null;
  publisher: string;
  sourceDomain: string;
  publishedAt: Date;
  retrievedAt: Date;
  countryCode: string | null;
  sectorSlug: string | null;
  eventType: string | null;
  polarity: string;
  confidence: string;
  importance: number;
  aiImpactType: string | null;
  reviewState: string;
  classificationRationale: string;
  possibleDuplicateStory: boolean;
  sourceMatches: { sourceType: string }[];
}): MediaArticleView | null {
  if (
    !article.sectorSlug ||
    !["THENEWSAPI", "RSS"].includes(article.sourceType)
  )
    return null;
  return {
    ...article,
    sourceType: article.sourceType as MediaArticleView["sourceType"],
    sectorSlug: article.sectorSlug as MediaArticleView["sectorSlug"],
    eventType: article.eventType as MediaArticleView["eventType"],
    polarity: article.polarity as MediaArticleView["polarity"],
    confidence: article.confidence as MediaArticleView["confidence"],
    aiImpactType: article.aiImpactType as MediaArticleView["aiImpactType"],
    reviewState: article.reviewState as MediaArticleView["reviewState"],
    publishedAt: article.publishedAt.toISOString(),
    retrievedAt: article.retrievedAt.toISOString(),
    sourceMatches: [
      ...new Set(article.sourceMatches.map((match) => match.sourceType)),
    ],
  };
}

async function loadRecent(hours: number): Promise<MediaArticleView[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1_000);
  const rows = await getPrisma().mediaArticle.findMany({
    where: { publishedAt: { gte: cutoff } },
    orderBy: { publishedAt: "desc" },
    take: 500,
    select: {
      id: true,
      sourceType: true,
      canonicalUrl: true,
      title: true,
      description: true,
      publisher: true,
      sourceDomain: true,
      publishedAt: true,
      retrievedAt: true,
      countryCode: true,
      sectorSlug: true,
      eventType: true,
      polarity: true,
      confidence: true,
      importance: true,
      aiImpactType: true,
      reviewState: true,
      classificationRationale: true,
      possibleDuplicateStory: true,
      sourceMatches: { select: { sourceType: true } },
    },
  });
  return rows
    .map(toView)
    .filter((article): article is MediaArticleView => article !== null);
}

export async function getMediaPageData(filters: MediaFilters) {
  try {
    const now = new Date();
    const all = await loadRecent(168);
    const articles = filterMediaArticles(all, filters, now);
    return {
      databaseStatus: "available" as const,
      articles,
      highlights: buildMediaHighlights(articles),
      counts: buildMediaCounts(articles),
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        articles: [],
        highlights: buildMediaHighlights([]),
        counts: buildMediaCounts([]),
      };
    throw new MediaLoadError(error);
  }
}

export async function getRecentMediaDevelopments(
  sector: MediaSectorSlug,
  limit = 6,
): Promise<MediaArticleView[]> {
  const data = await getMediaPageData({ hours: 168, sector });
  return data.articles.slice(0, limit);
}

export const getMediaOverview = cache(async () => {
  const data = await getMediaPageData({ hours: 24 });
  return {
    databaseStatus: data.databaseStatus,
    total: data.counts.total,
    highImportance: data.articles.filter((article) => article.importance >= 4)
      .length,
    latestAi: data.highlights.aiAndCreativeWork[0] ?? null,
    latestIndustryHealth: data.highlights.industryHealth[0] ?? null,
    latestPositive: data.highlights.positiveSignals[0] ?? null,
  };
});
