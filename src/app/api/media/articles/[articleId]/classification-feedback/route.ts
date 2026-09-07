import { NextResponse } from "next/server";
import { z } from "zod";

import {
  InvalidMediaClassificationFeedbackError,
  MediaArticleNotFoundError,
} from "@/services/media/media-feedback-core";
import { updateMediaClassificationFeedback } from "@/services/media/media-feedback";
import {
  MEDIA_CORRECTABLE_AI_TAGS,
  MEDIA_CORRECTABLE_EVENT_TYPES,
  MEDIA_CORRECTABLE_SIGNAL_DIRECTIONS,
  MEDIA_CORRECTABLE_SECTORS,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  MEDIA_CLASSIFICATION_REVIEW_STATES,
} from "@/services/media/media-feedback-types";

const feedbackRequestSchema = z
  .object({
    reviewState: z.enum(MEDIA_CLASSIFICATION_REVIEW_STATES).optional(),
    reasons: z
      .array(z.enum(MEDIA_CLASSIFICATION_FEEDBACK_REASONS))
      .max(MEDIA_CLASSIFICATION_FEEDBACK_REASONS.length),
    correctedSector: z.enum(MEDIA_CORRECTABLE_SECTORS).nullable().optional(),
    correctedEventType: z
      .enum(MEDIA_CORRECTABLE_EVENT_TYPES)
      .nullable()
      .optional(),
    correctedEventTypeToNull: z.boolean().optional(),
    correctedAiTag: z.enum(MEDIA_CORRECTABLE_AI_TAGS).nullable().optional(),
    correctedSignalDirection: z
      .enum(MEDIA_CORRECTABLE_SIGNAL_DIRECTIONS)
      .nullable()
      .optional(),
    correctedImportance: z.number().int().min(1).max(5).nullable().optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
) {
  const body = await request.json().catch(() => null);
  const parsed = feedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid classification feedback." },
      { status: 400 },
    );
  }

  const { articleId } = await context.params;
  try {
    const feedback = await updateMediaClassificationFeedback({
      articleId,
      reviewState: parsed.data.reviewState,
      reasons: parsed.data.reasons,
      corrections: {
        correctedSector: parsed.data.correctedSector,
        correctedEventType: parsed.data.correctedEventType,
        correctedEventTypeToNull: parsed.data.correctedEventTypeToNull,
        correctedAiTag: parsed.data.correctedAiTag,
        correctedSignalDirection: parsed.data.correctedSignalDirection,
        correctedImportance: parsed.data.correctedImportance,
      },
    });
    return NextResponse.json({
      data: feedback
        ? {
            articleId: feedback.mediaArticleId,
            reviewState: feedback.reviewState,
            reasons: feedback.reasons,
            correctedSector: feedback.correctedSector,
            correctedEventType: feedback.correctedEventType,
            correctedEventTypeToNull: feedback.correctedEventTypeToNull,
            correctedAiTag: feedback.correctedAiTag,
            correctedSignalDirection: feedback.correctedSignalDirection,
            correctedImportance: feedback.correctedImportance,
            approvedMachineClassification:
              feedback.approvedMachineClassification,
            evaluationState: feedback.reviewState,
            reviewedAt: feedback.reviewedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof MediaArticleNotFoundError) {
      return NextResponse.json(
        { error: "Media article not found." },
        { status: 404 },
      );
    }
    if (error instanceof InvalidMediaClassificationFeedbackError) {
      return NextResponse.json(
        { error: "Invalid classification feedback." },
        { status: 400 },
      );
    }
    throw error;
  }
}
