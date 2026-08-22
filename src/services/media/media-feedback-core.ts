import {
  MEDIA_CORRECTABLE_AI_TAGS,
  MEDIA_CORRECTABLE_EVENT_TYPES,
  MEDIA_CORRECTABLE_IMPORTANCE_VALUES,
  MEDIA_CORRECTABLE_SECTORS,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  type MediaClassificationCorrections,
  type MediaClassificationFeedbackReason,
} from "@/services/media/media-feedback-types";

export type PersistedMediaClassificationFeedback =
  MediaClassificationCorrections & {
    mediaArticleId: string;
    reasons: MediaClassificationFeedbackReason[];
    reviewedAt: Date;
  };

export type MediaClassificationCorrectionInput = {
  correctedSector?: unknown;
  correctedEventType?: unknown;
  correctedAiTag?: unknown;
  correctedImportance?: unknown;
};

export interface MediaClassificationFeedbackStore {
  findArticle(articleId: string): Promise<{
    id: string;
    classificationFeedback: PersistedMediaClassificationFeedback | null;
  } | null>;
  upsertFeedback(input: {
    articleId: string;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    reviewedAt: Date;
  }): Promise<PersistedMediaClassificationFeedback>;
  deleteFeedback(articleId: string): Promise<void>;
}

export class MediaArticleNotFoundError extends Error {
  constructor() {
    super("Media article not found.");
    this.name = "MediaArticleNotFoundError";
  }
}

export class InvalidMediaClassificationFeedbackError extends Error {
  constructor() {
    super("Invalid media classification feedback.");
    this.name = "InvalidMediaClassificationFeedbackError";
  }
}

function optionalTaxonomyValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InvalidMediaClassificationFeedbackError();
  }
  return value as T;
}

export function normaliseMediaClassificationCorrections(
  input: MediaClassificationCorrectionInput,
  reasons: readonly MediaClassificationFeedbackReason[],
): MediaClassificationCorrections {
  const correctedSector = optionalTaxonomyValue(
    input.correctedSector,
    MEDIA_CORRECTABLE_SECTORS,
  );
  const correctedEventType = optionalTaxonomyValue(
    input.correctedEventType,
    MEDIA_CORRECTABLE_EVENT_TYPES,
  );
  const correctedAiTag = optionalTaxonomyValue(
    input.correctedAiTag,
    MEDIA_CORRECTABLE_AI_TAGS,
  );
  const importance = input.correctedImportance;
  if (
    importance !== undefined &&
    importance !== null &&
    !MEDIA_CORRECTABLE_IMPORTANCE_VALUES.includes(
      importance as (typeof MEDIA_CORRECTABLE_IMPORTANCE_VALUES)[number],
    )
  ) {
    throw new InvalidMediaClassificationFeedbackError();
  }
  const correctedImportance =
    importance === undefined || importance === null
      ? null
      : (importance as MediaClassificationCorrections["correctedImportance"]);

  return {
    correctedSector: reasons.includes("WRONG_SECTOR") ? correctedSector : null,
    correctedEventType: reasons.includes("WRONG_EVENT_TYPE")
      ? correctedEventType
      : null,
    correctedAiTag: reasons.includes("WRONG_AI_TAG") ? correctedAiTag : null,
    correctedImportance: reasons.includes("WRONG_IMPORTANCE")
      ? correctedImportance
      : null,
  };
}

function correctionsEqual(
  left: MediaClassificationCorrections,
  right: MediaClassificationCorrections,
) {
  return (
    left.correctedSector === right.correctedSector &&
    left.correctedEventType === right.correctedEventType &&
    left.correctedAiTag === right.correctedAiTag &&
    left.correctedImportance === right.correctedImportance
  );
}

export function normaliseMediaClassificationFeedbackReasons(
  values: readonly string[],
): MediaClassificationFeedbackReason[] {
  const supplied = new Set(values);
  if (
    [...supplied].some(
      (value) =>
        !MEDIA_CLASSIFICATION_FEEDBACK_REASONS.includes(
          value as MediaClassificationFeedbackReason,
        ),
    )
  ) {
    throw new InvalidMediaClassificationFeedbackError();
  }
  return MEDIA_CLASSIFICATION_FEEDBACK_REASONS.filter((reason) =>
    supplied.has(reason),
  );
}

export async function setMediaClassificationFeedback(
  store: MediaClassificationFeedbackStore,
  input: {
    articleId: string;
    reasons: readonly string[];
    corrections?: MediaClassificationCorrectionInput;
    reviewedAt: Date;
  },
): Promise<PersistedMediaClassificationFeedback | null> {
  const article = await store.findArticle(input.articleId);
  if (!article) throw new MediaArticleNotFoundError();

  const reasons = normaliseMediaClassificationFeedbackReasons(input.reasons);
  const corrections = normaliseMediaClassificationCorrections(
    input.corrections ?? {},
    reasons,
  );
  const existing = article.classificationFeedback;
  if (reasons.length === 0) {
    if (existing) await store.deleteFeedback(input.articleId);
    return null;
  }

  if (
    existing &&
    existing.reasons.length === reasons.length &&
    existing.reasons.every((reason, index) => reason === reasons[index]) &&
    correctionsEqual(existing, corrections)
  ) {
    return existing;
  }

  return store.upsertFeedback({
    articleId: input.articleId,
    reasons,
    corrections,
    reviewedAt: input.reviewedAt,
  });
}
