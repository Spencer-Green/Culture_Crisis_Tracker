import "server-only";

import { getPrisma } from "@/lib/prisma";
import type {
  MediaClassificationDimensionReviewStatus,
  MediaClassificationInputSnapshot,
  MediaClassificationPredictionSnapshot,
  MediaClassificationReviewAction,
} from "@/services/media/media-classification-review-ledger-core";
import type { MediaClassificationFeedbackReason } from "@/services/media/media-feedback-types";

export type MediaClassificationReviewLedgerEntry = {
  id: string;
  mediaArticleId: string;
  supersedesReviewEventId: string | null;
  isCurrent: boolean;
  action: MediaClassificationReviewAction;
  reasons: MediaClassificationFeedbackReason[];
  canonicalUrl: string;
  contentHash: string;
  storyFingerprint: string | null;
  publishedAt: string;
  inputSnapshot: MediaClassificationInputSnapshot;
  machinePrediction: MediaClassificationPredictionSnapshot;
  predictedAt: string;
  versions: {
    classifier: string;
    ruleset: string;
    taxonomy: string;
    signalDirection: string;
    inputSchema: string;
    reviewGuideline: string;
    codeRevision: string | null;
  };
  humanReview: {
    sector: {
      status: MediaClassificationDimensionReviewStatus;
      value: string | null;
    };
    eventType: {
      status: MediaClassificationDimensionReviewStatus;
      value: string | null;
    };
    signalDirection: {
      status: MediaClassificationDimensionReviewStatus;
      value: string | null;
    };
    importance: {
      status: MediaClassificationDimensionReviewStatus;
      value: number | null;
    };
    confidence: {
      status: MediaClassificationDimensionReviewStatus;
      value: string | null;
    };
    relevance: {
      status: MediaClassificationDimensionReviewStatus;
      value: boolean | null;
    };
    legacyAiImpact: {
      status: MediaClassificationDimensionReviewStatus;
      value: string | null;
    };
  };
  reviewedAt: string;
  createdAt: string;
};

export async function getMediaClassificationReviewEvents(
  input: {
    articleId?: string;
    currentOnly?: boolean;
    limit?: number;
  } = {},
): Promise<MediaClassificationReviewLedgerEntry[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const rows = await getPrisma().mediaClassificationReviewEvent.findMany({
    where: {
      ...(input.articleId ? { mediaArticleId: input.articleId } : {}),
      ...(input.currentOnly ? { supersededByReviewEvent: { is: null } } : {}),
    },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      supersededByReviewEvent: { select: { id: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    mediaArticleId: row.mediaArticleId,
    supersedesReviewEventId: row.supersedesReviewEventId,
    isCurrent: row.supersededByReviewEvent === null,
    action: row.action,
    reasons: row.reasons,
    canonicalUrl: row.canonicalUrl,
    contentHash: row.contentHash,
    storyFingerprint: row.storyFingerprint,
    publishedAt: row.publishedAt.toISOString(),
    inputSnapshot:
      row.inputSnapshot as unknown as MediaClassificationInputSnapshot,
    machinePrediction:
      row.machinePrediction as unknown as MediaClassificationPredictionSnapshot,
    predictedAt: row.predictedAt.toISOString(),
    versions: {
      classifier: row.classifierVersion,
      ruleset: row.rulesetVersion,
      taxonomy: row.taxonomyVersion,
      signalDirection: row.signalDirectionVersion,
      inputSchema: row.inputSchemaVersion,
      reviewGuideline: row.reviewGuidelineVersion,
      codeRevision: row.codeRevision,
    },
    humanReview: {
      sector: { status: row.sectorReviewStatus, value: row.humanSector },
      eventType: {
        status: row.eventTypeReviewStatus,
        value: row.humanEventType,
      },
      signalDirection: {
        status: row.signalDirectionReviewStatus,
        value: row.humanSignalDirection,
      },
      importance: {
        status: row.importanceReviewStatus,
        value: row.humanImportance,
      },
      confidence: {
        status: row.confidenceReviewStatus,
        value: row.humanConfidence,
      },
      relevance: {
        status: row.relevanceReviewStatus,
        value: row.humanRelevant,
      },
      legacyAiImpact: {
        status: row.legacyAiReviewStatus,
        value: row.humanLegacyAiImpactType,
      },
    },
    reviewedAt: row.reviewedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}
