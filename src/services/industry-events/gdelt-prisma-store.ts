import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { articleIdentity } from "@/data-sources/news/gdelt-dedup";
import type { ClassifiedGdeltCandidate } from "@/data-sources/news/gdelt-classifier";
import type {
  GdeltIngestionStore,
  PersistGdeltCandidatesResult,
} from "@/services/industry-events/gdelt-ingestion-core";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function metadataRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PrismaGdeltIngestionStore implements GdeltIngestionStore {
  constructor(private readonly prisma: PrismaClient) {}

  findSource(slug: string) {
    return this.prisma.dataSource.findUnique({
      where: { slug },
      select: { id: true, slug: true, enabled: true },
    });
  }

  async createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string> {
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

  async persistCandidates(
    candidates: readonly ClassifiedGdeltCandidate[],
    retrievedAt: Date,
  ): Promise<PersistGdeltCandidatesResult> {
    const ids = candidates.map((candidate) => articleIdentity(candidate.url));
    const existing = await this.prisma.industryEvent.findMany({
      where: { id: { in: ids } },
      select: { id: true, metadata: true },
    });
    const existingById = new Map(existing.map((event) => [event.id, event]));

    await this.prisma.$transaction(
      candidates.map((candidate) => {
        const id = articleIdentity(candidate.url);
        const currentMetadata = metadataRecord(
          existingById.get(id)?.metadata ?? {},
        );
        const queryFamilies = [
          ...new Set([
            ...stringArray(currentMetadata.queryFamilies),
            ...candidate.queryFamilies,
          ]),
        ];
        const matchedEventTypes = [
          ...new Set([
            ...stringArray(currentMetadata.matchedEventTypes),
            ...candidate.matchedEventTypes,
          ]),
        ];
        const metadata = {
          provider: "GDELT",
          corpusType: "article-candidate",
          candidateStatus: "GDELT candidate",
          polarity: candidate.polarity,
          confidenceLevel: candidate.confidenceLevel,
          reviewState:
            typeof currentMetadata.reviewState === "string"
              ? currentMetadata.reviewState
              : "unreviewed",
          queryFamilies,
          matchedEventTypes,
          sourceCountry: candidate.sourceCountry,
          language: candidate.language,
          tone: candidate.tone,
          mobileUrl: candidate.mobileUrl,
          socialImage: candidate.socialImage,
          originalPublishedAt: candidate.publishedAt.toISOString(),
          canonicalUrl: candidate.url,
          classificationRationale: candidate.classificationRationale,
          retrievedAt: retrievedAt.toISOString(),
          articleBodyStored: false,
        };
        const data = {
          eventType: candidate.eventType,
          title: candidate.title,
          summary: candidate.classificationRationale,
          countryCode: candidate.countryCode,
          sectorSlug: candidate.sectorSlug,
          organisation: null,
          eventDate: candidate.publishedAt,
          sourceUrl: candidate.url,
          sourceName: candidate.domain,
          confidence: candidate.confidenceScore,
          metadata: metadata as Prisma.InputJsonValue,
        };
        return this.prisma.industryEvent.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        });
      }),
    );
    return {
      recordsCreated: candidates.length - existing.length,
      recordsUpdated: existing.length,
    };
  }

  async completeRun(
    input: Parameters<GdeltIngestionStore["completeRun"]>[0],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: input.runId },
        data: {
          status: "succeeded",
          completedAt: input.completedAt,
          recordsRead: input.articlesReturned,
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
    input: Parameters<GdeltIngestionStore["failRun"]>[0],
  ): Promise<void> {
    await this.prisma.ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.articlesReturned,
        errorMessage: input.errorMessage,
      },
    });
  }
}
