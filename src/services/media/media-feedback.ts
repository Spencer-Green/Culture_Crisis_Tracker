import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";
import { getPrisma } from "@/lib/prisma";
import {
  mediaClassificationEvaluationState,
  setMediaClassificationFeedback,
  type MediaClassificationCorrectionInput,
  type MediaClassificationFeedbackStore,
  type PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
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
  correctedAiTag: string | null;
  correctedImportance: number | null;
  approvedSector: string | null;
  approvedEventType: string | null;
  approvedAiTag: string | null;
  approvedImportance: number | null;
  approvedConfidence: string | null;
  reviewedAt: Date;
};

function machineClassification(input: {
  sectorSlug: string | null;
  eventType: string | null;
  aiImpactType: string | null;
  importance: number;
  confidence: string;
}): MediaMachineClassificationSnapshot | null {
  if (!input.sectorSlug) return null;
  return {
    sector: input.sectorSlug as MediaSectorSlug,
    eventType: input.eventType as MediaEventType | null,
    aiTag: input.aiImpactType as AiImpactType | null,
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
    correctedAiTag:
      value.correctedAiTag as MediaClassificationCorrections["correctedAiTag"],
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
    correctedAiTag: feedback.correctedAiTag,
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
  correctedAiTag: true,
  correctedImportance: true,
  approvedSector: true,
  approvedEventType: true,
  approvedAiTag: true,
  approvedImportance: true,
  approvedConfidence: true,
  reviewedAt: true,
} as const;

export class PrismaMediaClassificationFeedbackStore implements MediaClassificationFeedbackStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findArticle(articleId: string) {
    const article = await this.prisma.mediaArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
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
}

export async function updateMediaClassificationFeedback(input: {
  articleId: string;
  reviewState?: string;
  reasons: readonly string[];
  corrections?: MediaClassificationCorrectionInput;
  reviewedAt?: Date;
}) {
  return setMediaClassificationFeedback(
    new PrismaMediaClassificationFeedbackStore(getPrisma()),
    {
      articleId: input.articleId,
      reviewState: input.reviewState,
      reasons: input.reasons,
      corrections: input.corrections,
      reviewedAt: input.reviewedAt ?? new Date(),
    },
  );
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
