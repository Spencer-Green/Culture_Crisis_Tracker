import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { mediaSourceMatchKey } from "@/data-sources/news/media-dedup";
import type { MediaIngestionStore } from "@/services/media/media-ingestion-core";

export class PrismaMediaIngestionStore implements MediaIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(
    input: Parameters<MediaIngestionStore["createRun"]>[0],
  ): Promise<string> {
    const run = await this.prisma.ingestionRun.create({
      data: {
        sourceId: input.sourceId,
        status: "running",
        startedAt: input.startedAt,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return run.id;
  }

  async markSourceAttempted(
    sourceId: string,
    attemptedAt: Date,
  ): Promise<void> {
    await this.prisma.dataSource.update({
      where: { id: sourceId },
      data: { lastAttemptedSyncAt: attemptedAt },
    });
  }

  async persistArticles(
    input: Parameters<MediaIngestionStore["persistArticles"]>[0],
  ) {
    const urls = input.bundles.map((bundle) => bundle.article.canonicalUrl);
    const existing = await this.prisma.mediaArticle.findMany({
      where: { canonicalUrl: { in: urls } },
      select: { id: true, canonicalUrl: true, sourceId: true },
    });
    const existingByUrl = new Map(
      existing.map((article) => [article.canonicalUrl, article]),
    );
    let crossSourceMatches = 0;
    for (const bundle of input.bundles) {
      const article = bundle.article;
      const current = existingByUrl.get(article.canonicalUrl);
      if (current && current.sourceId !== input.sourceId)
        crossSourceMatches += 1;
      const data = {
        title: article.title,
        description: article.description,
        publisher: article.publisher,
        sourceDomain: article.sourceDomain,
        publishedAt: article.publishedAt,
        retrievedAt: input.retrievedAt,
        language: article.language,
        countryCode: article.countryCode,
        sectorSlug: article.sectorSlug,
        eventType: article.eventType,
        polarity: article.polarity,
        confidence: article.confidence,
        importance: article.importance,
        aiImpactType: article.aiImpactType,
        reviewState: article.reviewState,
        classificationRationale: article.classificationRationale,
        storyFingerprint: article.storyFingerprint,
        lastSeenAt: input.retrievedAt,
        metadata: {
          ...article.sourceMetadata,
          articleBodyStored: false,
        } as Prisma.InputJsonValue,
      };
      const persistedArticle = await this.prisma.mediaArticle.upsert({
        where: { canonicalUrl: article.canonicalUrl },
        update: data,
        create: {
          ...data,
          sourceId: input.sourceId,
          sourceType: article.sourceType,
          externalId: article.externalId,
          canonicalUrl: article.canonicalUrl,
          firstSeenAt: input.retrievedAt,
        },
        select: { id: true },
      });
      for (const match of bundle.matches) {
        const matchKey = mediaSourceMatchKey({
          sourceSlug: input.sourceSlug,
          externalId: match.externalId,
          canonicalUrl: article.canonicalUrl,
          queryFamily: match.queryFamily,
          feedSlug: match.feedSlug,
        });
        await this.prisma.mediaArticleSourceMatch.upsert({
          where: { matchKey },
          create: {
            matchKey,
            mediaArticleId: persistedArticle.id,
            sourceId: input.sourceId,
            sourceType: match.sourceType,
            externalId: match.externalId,
            queryFamily: match.queryFamily,
            feedSlug: match.feedSlug,
            firstSeenAt: input.retrievedAt,
            lastSeenAt: input.retrievedAt,
            metadata: match.sourceMetadata as Prisma.InputJsonValue,
          },
          update: {
            lastSeenAt: input.retrievedAt,
            metadata: match.sourceMetadata as Prisma.InputJsonValue,
          },
        });
      }
    }
    const fingerprints = [
      ...new Set(
        input.bundles.map((bundle) => bundle.article.storyFingerprint),
      ),
    ];
    const duplicates = await this.prisma.mediaArticle.groupBy({
      by: ["storyFingerprint"],
      where: { storyFingerprint: { in: fingerprints } },
      _count: { _all: true },
      having: { storyFingerprint: { _count: { gt: 1 } } },
    });
    const duplicateFingerprints = duplicates
      .map((item) => item.storyFingerprint)
      .filter((value): value is string => value !== null);
    if (duplicateFingerprints.length > 0)
      await this.prisma.mediaArticle.updateMany({
        where: { storyFingerprint: { in: duplicateFingerprints } },
        data: { possibleDuplicateStory: true },
      });
    return {
      recordsCreated: input.bundles.length - existing.length,
      recordsUpdated: existing.length,
      crossSourceMatches,
    };
  }

  async completeRun(
    input: Parameters<MediaIngestionStore["completeRun"]>[0],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: input.runId },
        data: {
          status: "succeeded",
          completedAt: input.completedAt,
          recordsRead: input.recordsRead,
          recordsCreated: input.recordsCreated,
          recordsUpdated: input.recordsUpdated,
          errorMessage: null,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      }),
      this.prisma.dataSource.update({
        where: { id: input.sourceId },
        data: { lastSuccessfulSyncAt: input.completedAt },
      }),
    ]);
  }

  async failRun(
    input: Parameters<MediaIngestionStore["failRun"]>[0],
  ): Promise<void> {
    await this.prisma.ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.recordsRead,
        errorMessage: input.errorMessage,
      },
    });
  }
}
