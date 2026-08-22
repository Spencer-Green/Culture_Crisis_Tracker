import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  setMediaClassificationFeedback,
  type MediaClassificationCorrectionInput,
  type MediaClassificationFeedbackStore,
  type PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import type {
  MediaClassificationCorrections,
  MediaClassificationFeedbackReason,
  MediaClassificationFeedbackState,
} from "@/services/media/media-feedback-types";
import type {
  AiImpactType,
  MediaEventType,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";

function toPersistedFeedback(value: {
  mediaArticleId: string;
  reasons: string[];
  correctedSector: string | null;
  correctedEventType: string | null;
  correctedAiTag: string | null;
  correctedImportance: number | null;
  reviewedAt: Date;
}): PersistedMediaClassificationFeedback {
  return {
    ...value,
    reasons: value.reasons as MediaClassificationFeedbackReason[],
    correctedSector:
      value.correctedSector as MediaClassificationCorrections["correctedSector"],
    correctedEventType:
      value.correctedEventType as MediaClassificationCorrections["correctedEventType"],
    correctedAiTag:
      value.correctedAiTag as MediaClassificationCorrections["correctedAiTag"],
    correctedImportance:
      value.correctedImportance as MediaClassificationCorrections["correctedImportance"],
  };
}

export class PrismaMediaClassificationFeedbackStore implements MediaClassificationFeedbackStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findArticle(articleId: string) {
    const article = await this.prisma.mediaArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        classificationFeedback: {
          select: {
            mediaArticleId: true,
            reasons: true,
            correctedSector: true,
            correctedEventType: true,
            correctedAiTag: true,
            correctedImportance: true,
            reviewedAt: true,
          },
        },
      },
    });
    if (!article) return null;
    return {
      id: article.id,
      classificationFeedback: article.classificationFeedback
        ? toPersistedFeedback(article.classificationFeedback)
        : null,
    };
  }

  async upsertFeedback(input: {
    articleId: string;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    reviewedAt: Date;
  }) {
    const feedback = await this.prisma.mediaClassificationFeedback.upsert({
      where: { mediaArticleId: input.articleId },
      create: {
        mediaArticleId: input.articleId,
        reasons: input.reasons,
        ...input.corrections,
        reviewedAt: input.reviewedAt,
      },
      update: {
        reasons: input.reasons,
        ...input.corrections,
        reviewedAt: input.reviewedAt,
      },
      select: {
        mediaArticleId: true,
        reasons: true,
        correctedSector: true,
        correctedEventType: true,
        correctedAiTag: true,
        correctedImportance: true,
        reviewedAt: true,
      },
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
  reasons: readonly string[];
  corrections?: MediaClassificationCorrectionInput;
  reviewedAt?: Date;
}) {
  return setMediaClassificationFeedback(
    new PrismaMediaClassificationFeedbackStore(getPrisma()),
    {
      articleId: input.articleId,
      reasons: input.reasons,
      corrections: input.corrections,
      reviewedAt: input.reviewedAt ?? new Date(),
    },
  );
}

export type MediaClassificationFeedbackEvaluationRow = {
  articleId: string;
  machineClassification: {
    sector: MediaSectorSlug | null;
    eventType: MediaEventType | null;
    aiTag: AiImpactType | null;
    importance: number;
  };
  feedback: MediaClassificationFeedbackState;
};

export async function getMediaClassificationFeedbackEvaluationRows(): Promise<
  MediaClassificationFeedbackEvaluationRow[]
> {
  const rows = await getPrisma().mediaArticle.findMany({
    where: { classificationFeedback: { isNot: null } },
    orderBy: { classificationFeedback: { reviewedAt: "desc" } },
    select: {
      id: true,
      sectorSlug: true,
      eventType: true,
      aiImpactType: true,
      importance: true,
      classificationFeedback: {
        select: {
          reasons: true,
          correctedSector: true,
          correctedEventType: true,
          correctedAiTag: true,
          correctedImportance: true,
          reviewedAt: true,
        },
      },
    },
  });
  return rows.flatMap((row) => {
    if (!row.classificationFeedback) return [];
    const feedback = toPersistedFeedback({
      mediaArticleId: row.id,
      ...row.classificationFeedback,
    });
    return [
      {
        articleId: row.id,
        machineClassification: {
          sector: row.sectorSlug as MediaSectorSlug | null,
          eventType: row.eventType as MediaEventType | null,
          aiTag: row.aiImpactType as AiImpactType | null,
          importance: row.importance,
        },
        feedback: {
          reasons: feedback.reasons,
          correctedSector: feedback.correctedSector,
          correctedEventType: feedback.correctedEventType,
          correctedAiTag: feedback.correctedAiTag,
          correctedImportance: feedback.correctedImportance,
          reviewedAt: feedback.reviewedAt.toISOString(),
        },
      },
    ];
  });
}
