import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaSectorSlug,
  SignalDirection,
} from "@/data-sources/news/media-types";
import { assessAiIntelligence } from "@/data-sources/news/ai-intelligence";
import { getMediaQueryFamily } from "@/data-sources/news/media-queries";
import { readMediaSourceEvidenceMetadata } from "@/data-sources/news/media-source-metadata";
import { getRssFeed } from "@/data-sources/news/rss-registry";
import { deriveSignalDirection } from "@/data-sources/news/signal-direction";
import { getPrisma } from "@/lib/prisma";
import {
  mediaClassificationEvaluationState,
  type MediaClassificationCorrectionInput,
  type MediaClassificationFeedbackStore,
  type PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import {
  MEDIA_CLASSIFICATION_INPUT_SCHEMA_VERSION,
  mediaClassificationCodeRevision,
} from "@/services/media/media-classification-contract-versions";
import {
  setMediaClassificationFeedbackWithLedger,
  type MediaClassificationReviewEventDraft,
  type MediaClassificationReviewLedgerStore,
} from "@/services/media/media-classification-review-ledger-core";
import type {
  MediaClassificationCorrections,
  MediaClassificationEvaluationState,
  MediaClassificationFeedbackReason,
  MediaClassificationFeedbackState,
  MediaImportance,
  MediaMachineClassificationSnapshot,
  PersistedMediaClassificationReviewState,
} from "@/services/media/media-feedback-types";

type FlatPersistedFeedback = {
  mediaArticleId: string;
  reviewState: string;
  reasons: string[];
  correctedSector: string | null;
  correctedEventType: string | null;
  correctedEventTypeToNull: boolean;
  correctedAiTag: string | null;
  correctedSignalDirection: string | null;
  correctedImportance: number | null;
  approvedSector: string | null;
  approvedEventType: string | null;
  approvedAiTag: string | null;
  approvedSignalDirection: string | null;
  approvedImportance: number | null;
  approvedConfidence: string | null;
  reviewedAt: Date;
};

type MediaFeedbackPrismaClient = Pick<
  PrismaClient,
  | "mediaArticle"
  | "mediaClassificationFeedback"
  | "mediaClassificationReviewEvent"
>;

function machineClassification(input: {
  title: string;
  description: string | null;
  metadata?: unknown;
  sectorSlug: string | null;
  eventType: string | null;
  aiImpactType: string | null;
  importance: number;
  confidence: string;
}): MediaMachineClassificationSnapshot | null {
  if (!input.sectorSlug) return null;
  const sourceEvidence = readMediaSourceEvidenceMetadata(input.metadata);
  const aiAssessment = assessAiIntelligence({
    title: input.title,
    description: input.description,
    evidenceRole: sourceEvidence?.evidenceRole,
    sourcePerspective: sourceEvidence?.sourcePerspective,
  });
  return {
    sector: input.sectorSlug as MediaSectorSlug,
    eventType: input.eventType as MediaEventType | null,
    aiTag: input.aiImpactType as AiImpactType | null,
    signalDirection: deriveSignalDirection({
      title: input.title,
      description: input.description,
      eventType: input.eventType as MediaEventType | null,
      claimKind: aiAssessment?.claimKind ?? null,
      aiCategory: aiAssessment?.category ?? null,
    }),
    importance: input.importance as MediaImportance,
    confidence: input.confidence as MediaConfidence,
  };
}

function approvedMachineClassification(
  value: FlatPersistedFeedback,
): MediaMachineClassificationSnapshot | null {
  if (
    value.approvedSector === null ||
    value.approvedImportance === null ||
    value.approvedConfidence === null
  ) {
    return null;
  }
  return {
    sector: value.approvedSector as MediaSectorSlug,
    eventType: value.approvedEventType as MediaEventType | null,
    aiTag: value.approvedAiTag as AiImpactType | null,
    signalDirection: value.approvedSignalDirection as SignalDirection | null,
    importance: value.approvedImportance as MediaImportance,
    confidence: value.approvedConfidence as MediaConfidence,
  };
}

function toPersistedFeedback(
  value: FlatPersistedFeedback,
): PersistedMediaClassificationFeedback {
  return {
    mediaArticleId: value.mediaArticleId,
    reviewState: value.reviewState as PersistedMediaClassificationReviewState,
    reasons: value.reasons as MediaClassificationFeedbackReason[],
    correctedSector:
      value.correctedSector as MediaClassificationCorrections["correctedSector"],
    correctedEventType:
      value.correctedEventType as MediaClassificationCorrections["correctedEventType"],
    correctedEventTypeToNull: value.correctedEventTypeToNull,
    correctedAiTag:
      value.correctedAiTag as MediaClassificationCorrections["correctedAiTag"],
    correctedSignalDirection:
      value.correctedSignalDirection as MediaClassificationCorrections["correctedSignalDirection"],
    correctedImportance:
      value.correctedImportance as MediaClassificationCorrections["correctedImportance"],
    approvedMachineClassification: approvedMachineClassification(value),
    reviewedAt: value.reviewedAt,
  };
}

export function toMediaClassificationFeedbackState(
  current: MediaMachineClassificationSnapshot | null,
  feedback: PersistedMediaClassificationFeedback,
): MediaClassificationFeedbackState {
  return {
    reviewState: feedback.reviewState,
    reasons: feedback.reasons,
    correctedSector: feedback.correctedSector,
    correctedEventType: feedback.correctedEventType,
    correctedEventTypeToNull: feedback.correctedEventTypeToNull,
    correctedAiTag: feedback.correctedAiTag,
    correctedSignalDirection: feedback.correctedSignalDirection,
    correctedImportance: feedback.correctedImportance,
    approvedMachineClassification: feedback.approvedMachineClassification,
    evaluationState: mediaClassificationEvaluationState(
      current,
      feedback,
    ) as Exclude<MediaClassificationEvaluationState, "UNREVIEWED">,
    reviewedAt: feedback.reviewedAt.toISOString(),
  };
}

const feedbackSelect = {
  mediaArticleId: true,
  reviewState: true,
  reasons: true,
  correctedSector: true,
  correctedEventType: true,
  correctedEventTypeToNull: true,
  correctedAiTag: true,
  correctedSignalDirection: true,
  correctedImportance: true,
  approvedSector: true,
  approvedEventType: true,
  approvedAiTag: true,
  approvedSignalDirection: true,
  approvedImportance: true,
  approvedConfidence: true,
  reviewedAt: true,
} as const;

export class PrismaMediaClassificationFeedbackStore
  implements
    MediaClassificationFeedbackStore,
    MediaClassificationReviewLedgerStore
{
  constructor(private readonly prisma: MediaFeedbackPrismaClient) {}

  async findArticle(articleId: string) {
    const article = await this.prisma.mediaArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        description: true,
        metadata: true,
        sectorSlug: true,
        eventType: true,
        aiImpactType: true,
        importance: true,
        confidence: true,
        classificationFeedback: { select: feedbackSelect },
      },
    });
    if (!article) return null;
    return {
      id: article.id,
      machineClassification: machineClassification(article),
      classificationFeedback: article.classificationFeedback
        ? toPersistedFeedback(article.classificationFeedback)
        : null,
    };
  }

  async upsertFeedback(input: {
    articleId: string;
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
    reviewedAt: Date;
  }) {
    const approved = input.approvedMachineClassification;
    const data = {
      reviewState: input.reviewState,
      reasons: input.reasons,
      ...input.corrections,
      approvedSector: approved?.sector ?? null,
      approvedEventType: approved?.eventType ?? null,
      approvedAiTag: approved?.aiTag ?? null,
      approvedSignalDirection: approved?.signalDirection ?? null,
      approvedImportance: approved?.importance ?? null,
      approvedConfidence: approved?.confidence ?? null,
      reviewedAt: input.reviewedAt,
    };
    const feedback = await this.prisma.mediaClassificationFeedback.upsert({
      where: { mediaArticleId: input.articleId },
      create: { mediaArticleId: input.articleId, ...data },
      update: data,
      select: feedbackSelect,
    });
    return toPersistedFeedback(feedback);
  }

  async deleteFeedback(articleId: string): Promise<void> {
    await this.prisma.mediaClassificationFeedback.deleteMany({
      where: { mediaArticleId: articleId },
    });
  }

  async findReviewSnapshot(articleId: string) {
    const article = await this.prisma.mediaArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        sourceId: true,
        source: { select: { slug: true } },
        sourceType: true,
        externalId: true,
        canonicalUrl: true,
        title: true,
        description: true,
        publisher: true,
        sourceDomain: true,
        publishedAt: true,
        retrievedAt: true,
        language: true,
        countryCode: true,
        sectorSlug: true,
        eventType: true,
        polarity: true,
        confidence: true,
        importance: true,
        aiImpactType: true,
        reviewState: true,
        classificationRationale: true,
        storyFingerprint: true,
        metadata: true,
        sourceMatches: {
          orderBy: { matchKey: "asc" },
          select: {
            sourceType: true,
            externalId: true,
            queryFamily: true,
            feedSlug: true,
            metadata: true,
            source: { select: { slug: true } },
          },
        },
      },
    });
    if (!article) return null;

    const machine = machineClassification(article);
    const sourceEvidence = readMediaSourceEvidenceMetadata(article.metadata);
    const aiAssessment = assessAiIntelligence({
      title: article.title,
      description: article.description,
      evidenceRole: sourceEvidence?.evidenceRole,
      sourcePerspective: sourceEvidence?.sourcePerspective,
    });
    const sourceMatches = article.sourceMatches.map((match) => {
      const query = match.queryFamily
        ? getMediaQueryFamily(match.queryFamily)
        : undefined;
      const feed = match.feedSlug ? getRssFeed(match.feedSlug) : undefined;
      return {
        sourceType: match.sourceType,
        sourceSlug: match.source.slug,
        externalId: match.externalId,
        queryFamily: match.queryFamily,
        queryDefinition: query
          ? {
              id: query.id,
              name: query.name,
              search: query.search,
              sort: query.sort ?? null,
              sector: query.sector,
              fallbackEventType: query.fallbackEventType,
              fallbackPolarity: query.fallbackPolarity,
              aiRelated: query.aiRelated,
            }
          : null,
        feedSlug: match.feedSlug,
        feedDefinition: feed
          ? {
              slug: feed.slug,
              name: feed.name,
              sector: feed.sector,
              tier: feed.tier,
              geography: feed.geography,
              evidenceRole: feed.evidenceRole,
              sourcePerspective: feed.sourcePerspective,
              sourcePerspectives: feed.sourcePerspectives ?? [
                feed.sourcePerspective,
              ],
              jurisdiction: feed.jurisdiction,
              sourceSpecialisms: [...feed.sourceSpecialisms],
              translationStatus: feed.translationStatus ?? null,
            }
          : null,
        metadata: match.metadata,
      };
    });
    const inputSnapshot = {
      schemaVersion: MEDIA_CLASSIFICATION_INPUT_SCHEMA_VERSION,
      title: article.title,
      description: article.description,
      publisher: article.publisher,
      sourceDomain: article.sourceDomain,
      sourceType: article.sourceType,
      sourceId: article.sourceId,
      sourceSlug: article.source.slug,
      externalId: article.externalId,
      canonicalUrl: article.canonicalUrl,
      publishedAt: article.publishedAt.toISOString(),
      language: article.language,
      sourceMetadata: article.metadata,
      sourceMatches,
    };
    return {
      mediaArticleId: article.id,
      canonicalUrl: article.canonicalUrl,
      storyFingerprint: article.storyFingerprint,
      publishedAt: article.publishedAt,
      predictedAt: article.retrievedAt,
      inputSnapshot,
      machineClassification: machine,
      machinePrediction: {
        sector: article.sectorSlug,
        eventType: article.eventType,
        signalDirection: machine?.signalDirection ?? null,
        importance: article.importance,
        confidence: article.confidence,
        legacyAiImpactType: article.aiImpactType,
        polarity: article.polarity,
        countryCode: article.countryCode,
        reviewState: article.reviewState,
        classificationRationale: article.classificationRationale,
        aiCategory: aiAssessment?.category ?? null,
        claimKind: aiAssessment?.claimKind ?? null,
      },
    };
  }

  async findLatestReviewEventId(articleId: string): Promise<string | null> {
    const event = await this.prisma.mediaClassificationReviewEvent.findFirst({
      where: { mediaArticleId: articleId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return event?.id ?? null;
  }

  async appendReviewEvent(
    event: MediaClassificationReviewEventDraft,
  ): Promise<{ id: string }> {
    return this.prisma.mediaClassificationReviewEvent.create({
      data: {
        ...event,
        inputSnapshot: event.inputSnapshot as Prisma.InputJsonValue,
        machinePrediction: event.machinePrediction as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  }
}

export async function updateMediaClassificationFeedback(input: {
  articleId: string;
  reviewState?: string;
  reasons: readonly string[];
  corrections?: MediaClassificationCorrectionInput;
  reviewedAt?: Date;
}) {
  const reviewedAt = input.reviewedAt ?? new Date();
  const result = await getPrisma().$transaction(async (transaction) =>
    setMediaClassificationFeedbackWithLedger(
      new PrismaMediaClassificationFeedbackStore(transaction),
      {
        articleId: input.articleId,
        reviewState: input.reviewState,
        reasons: input.reasons,
        corrections: input.corrections,
        reviewedAt,
        codeRevision: mediaClassificationCodeRevision(),
      },
    ),
  );
  return result.feedback;
}

export type MediaClassificationFeedbackEvaluationRow = {
  articleId: string;
  evaluationState: MediaClassificationEvaluationState;
  reviewedAt: string | null;
  machineClassification: MediaMachineClassificationSnapshot | null;
  approvedMachineClassification: MediaMachineClassificationSnapshot | null;
  feedback: MediaClassificationFeedbackState | null;
};

export async function getMediaClassificationFeedbackEvaluationRows(): Promise<
  MediaClassificationFeedbackEvaluationRow[]
> {
  const rows = await getPrisma().mediaArticle.findMany({
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      metadata: true,
      sectorSlug: true,
      eventType: true,
      aiImpactType: true,
      importance: true,
      confidence: true,
      classificationFeedback: { select: feedbackSelect },
    },
  });
  return rows.map((row) => {
    const current = machineClassification(row);
    const persisted = row.classificationFeedback
      ? toPersistedFeedback(row.classificationFeedback)
      : null;
    const feedback = persisted
      ? toMediaClassificationFeedbackState(current, persisted)
      : null;
    return {
      articleId: row.id,
      evaluationState: mediaClassificationEvaluationState(current, persisted),
      reviewedAt: persisted?.reviewedAt.toISOString() ?? null,
      machineClassification: current,
      approvedMachineClassification:
        persisted?.approvedMachineClassification ?? null,
      feedback,
    };
  });
}
