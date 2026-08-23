import {
  MEDIA_CORRECTABLE_AI_TAGS,
  MEDIA_CORRECTABLE_EVENT_TYPES,
  MEDIA_CORRECTABLE_IMPORTANCE_VALUES,
  MEDIA_CORRECTABLE_SECTORS,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  MEDIA_CLASSIFICATION_REVIEW_STATES,
  type MediaClassificationCorrections,
  type MediaClassificationEvaluationState,
  type MediaClassificationFeedbackReason,
  type MediaClassificationReviewState,
  type MediaMachineClassificationSnapshot,
  type PersistedMediaClassificationReviewState,
} from "@/services/media/media-feedback-types";

export type PersistedMediaClassificationFeedback =
  MediaClassificationCorrections & {
    mediaArticleId: string;
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
    reviewedAt: Date;
  };

export interface MediaClassificationFeedbackStore {
  findArticle(articleId: string): Promise<{
    id: string;
    machineClassification: MediaMachineClassificationSnapshot | null;
    classificationFeedback: PersistedMediaClassificationFeedback | null;
  } | null>;
  upsertFeedback(input: {
    articleId: string;
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
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

export type MediaClassificationCorrectionInput = {
  correctedSector?: unknown;
  correctedEventType?: unknown;
  correctedAiTag?: unknown;
  correctedImportance?: unknown;
};

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

const EMPTY_CORRECTIONS: MediaClassificationCorrections = {
  correctedSector: null,
  correctedEventType: null,
  correctedAiTag: null,
  correctedImportance: null,
};

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

export function machineClassificationsEqual(
  left: MediaMachineClassificationSnapshot | null,
  right: MediaMachineClassificationSnapshot | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.sector === right.sector &&
    left.eventType === right.eventType &&
    left.aiTag === right.aiTag &&
    left.importance === right.importance &&
    left.confidence === right.confidence
  );
}

export function mediaClassificationEvaluationState(
  current: MediaMachineClassificationSnapshot | null,
  feedback: PersistedMediaClassificationFeedback | null,
): MediaClassificationEvaluationState {
  if (!feedback) return "UNREVIEWED";
  if (feedback.reviewState === "WRONG_CLASSIFICATION") {
    return "WRONG_CLASSIFICATION";
  }
  return machineClassificationsEqual(
    current,
    feedback.approvedMachineClassification,
  )
    ? "CORRECT"
    : "REVIEW_OUTDATED";
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

function normaliseReviewState(
  value: string | undefined,
  reasons: readonly MediaClassificationFeedbackReason[],
): MediaClassificationReviewState {
  if (value === undefined) {
    return reasons.length > 0 ? "WRONG_CLASSIFICATION" : "UNREVIEWED";
  }
  if (
    !MEDIA_CLASSIFICATION_REVIEW_STATES.includes(
      value as MediaClassificationReviewState,
    )
  ) {
    throw new InvalidMediaClassificationFeedbackError();
  }
  return value as MediaClassificationReviewState;
}

function feedbackEqual(
  existing: PersistedMediaClassificationFeedback,
  input: {
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
  },
) {
  return (
    existing.reviewState === input.reviewState &&
    existing.reasons.length === input.reasons.length &&
    existing.reasons.every(
      (reason, index) => reason === input.reasons[index],
    ) &&
    correctionsEqual(existing, input.corrections) &&
    machineClassificationsEqual(
      existing.approvedMachineClassification,
      input.approvedMachineClassification,
    )
  );
}

export async function setMediaClassificationFeedback(
  store: MediaClassificationFeedbackStore,
  input: {
    articleId: string;
    reviewState?: string;
    reasons: readonly string[];
    corrections?: MediaClassificationCorrectionInput;
    reviewedAt: Date;
  },
): Promise<PersistedMediaClassificationFeedback | null> {
  const article = await store.findArticle(input.articleId);
  if (!article) throw new MediaArticleNotFoundError();

  const suppliedReasons = normaliseMediaClassificationFeedbackReasons(
    input.reasons,
  );
  const reviewState = normaliseReviewState(input.reviewState, suppliedReasons);
  const existing = article.classificationFeedback;
  if (reviewState === "UNREVIEWED") {
    if (existing) await store.deleteFeedback(input.articleId);
    return null;
  }

  if (reviewState === "CORRECT" && !article.machineClassification) {
    throw new InvalidMediaClassificationFeedbackError();
  }
  if (reviewState === "WRONG_CLASSIFICATION" && suppliedReasons.length === 0) {
    throw new InvalidMediaClassificationFeedbackError();
  }

  const reasons = reviewState === "CORRECT" ? [] : suppliedReasons;
  const corrections =
    reviewState === "CORRECT"
      ? EMPTY_CORRECTIONS
      : normaliseMediaClassificationCorrections(
          input.corrections ?? {},
          reasons,
        );
  const approvedMachineClassification =
    reviewState === "CORRECT" ? article.machineClassification : null;
  const next = {
    reviewState,
    reasons,
    corrections,
    approvedMachineClassification,
  };
  if (existing && feedbackEqual(existing, next)) return existing;

  return store.upsertFeedback({
    articleId: input.articleId,
    ...next,
    reviewedAt: input.reviewedAt,
  });
}
