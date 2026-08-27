import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaSectorSlug,
  SignalDirection,
} from "@/data-sources/news/media-types";
import { assessAiIntelligence } from "@/data-sources/news/ai-intelligence";
import { deriveSignalDirection } from "@/data-sources/news/signal-direction";
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

function machineClassification(input: {
  title: string;
  description: string | null;
  sectorSlug: string | null;
  eventType: string | null;
  aiImpactType: string | null;
  importance: number;
  confidence: string;
}): MediaMachineClassificationSnapshot | null {
  if (!input.sectorSlug) return null;
  const aiAssessment = assessAiIntelligence({
    title: input.title,
    description: input.description,
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

export class PrismaMediaClassificationFeedbackStore implements MediaClassificationFeedbackStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findArticle(articleId: string) {
    const article = await this.prisma.mediaArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        description: true,
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
      title: true,
      description: true,
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
