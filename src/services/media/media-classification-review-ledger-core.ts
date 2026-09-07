import { createHash } from "node:crypto";

import type {
  MediaClassificationCorrectionInput,
  MediaClassificationFeedbackStore,
  PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import {
  MediaArticleNotFoundError,
  setMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import type {
  MediaClassificationFeedbackReason,
  MediaMachineClassificationSnapshot,
} from "@/services/media/media-feedback-types";
import {
  MEDIA_CLASSIFICATION_INPUT_SCHEMA_VERSION,
  MEDIA_CLASSIFICATION_REVIEW_GUIDELINE_VERSION,
  MEDIA_CLASSIFICATION_RULESET_VERSION,
  MEDIA_CLASSIFICATION_TAXONOMY_VERSION,
  MEDIA_CLASSIFIER_VERSION,
  MEDIA_SIGNAL_DIRECTION_VERSION,
} from "@/services/media/media-classification-contract-versions";

export const MEDIA_CLASSIFICATION_DIMENSION_REVIEW_STATUSES = [
  "UNREVIEWED",
  "APPROVED",
  "CORRECTED",
  "REJECTED",
] as const;

export type MediaClassificationDimensionReviewStatus =
  (typeof MEDIA_CLASSIFICATION_DIMENSION_REVIEW_STATUSES)[number];

export type MediaClassificationReviewAction =
  "CORRECT" | "WRONG_CLASSIFICATION" | "CLEAR";

export type MediaClassificationInputSnapshot = {
  schemaVersion: string;
  title: string;
  description: string | null;
  publisher: string;
  sourceDomain: string;
  sourceType: string;
  sourceId: string;
  sourceSlug: string;
  externalId: string | null;
  canonicalUrl: string;
  publishedAt: string;
  language: string | null;
  sourceMetadata: unknown;
  sourceMatches: Array<{
    sourceType: string;
    sourceSlug: string;
    externalId: string | null;
    queryFamily: string | null;
    queryDefinition: unknown;
    feedSlug: string | null;
    feedDefinition: unknown;
    metadata: unknown;
  }>;
};

export type MediaClassificationPredictionSnapshot = {
  sector: string | null;
  eventType: string | null;
  signalDirection: string | null;
  importance: number;
  confidence: string;
  legacyAiImpactType: string | null;
  polarity: string;
  countryCode: string | null;
  reviewState: string;
  classificationRationale: string;
  aiCategory: string | null;
  claimKind: string | null;
};

export type MediaClassificationReviewSnapshot = {
  mediaArticleId: string;
  canonicalUrl: string;
  storyFingerprint: string | null;
  publishedAt: Date;
  predictedAt: Date;
  inputSnapshot: MediaClassificationInputSnapshot;
  machinePrediction: MediaClassificationPredictionSnapshot;
  machineClassification: MediaMachineClassificationSnapshot | null;
};

export type MediaClassificationReviewEventDraft = {
  mediaArticleId: string;
  supersedesReviewEventId: string | null;
  action: MediaClassificationReviewAction;
  reasons: MediaClassificationFeedbackReason[];
  canonicalUrl: string;
  contentHash: string;
  storyFingerprint: string | null;
  publishedAt: Date;
  inputSnapshot: MediaClassificationInputSnapshot;
  machinePrediction: MediaClassificationPredictionSnapshot;
  predictedAt: Date;
  classifierVersion: string;
  rulesetVersion: string;
  taxonomyVersion: string;
  signalDirectionVersion: string;
  inputSchemaVersion: string;
  reviewGuidelineVersion: string;
  codeRevision: string | null;
  sectorReviewStatus: MediaClassificationDimensionReviewStatus;
  humanSector: string | null;
  eventTypeReviewStatus: MediaClassificationDimensionReviewStatus;
  humanEventType: string | null;
  signalDirectionReviewStatus: MediaClassificationDimensionReviewStatus;
  humanSignalDirection: string | null;
  importanceReviewStatus: MediaClassificationDimensionReviewStatus;
  humanImportance: number | null;
  confidenceReviewStatus: MediaClassificationDimensionReviewStatus;
  humanConfidence: string | null;
  relevanceReviewStatus: MediaClassificationDimensionReviewStatus;
  humanRelevant: boolean | null;
  legacyAiReviewStatus: MediaClassificationDimensionReviewStatus;
  humanLegacyAiImpactType: string | null;
  reviewedAt: Date;
};

export interface MediaClassificationReviewLedgerStore extends MediaClassificationFeedbackStore {
  findReviewSnapshot(
    articleId: string,
  ): Promise<MediaClassificationReviewSnapshot | null>;
  findLatestReviewEventId(articleId: string): Promise<string | null>;
  appendReviewEvent(
    event: MediaClassificationReviewEventDraft,
  ): Promise<{ id: string }>;
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }
  return value;
}

export function mediaClassificationInputHash(
  input: MediaClassificationInputSnapshot,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalise(input)))
    .digest("hex");
}

function statusForCorrection(input: {
  selected: boolean;
  hasTarget: boolean;
}): MediaClassificationDimensionReviewStatus {
  if (!input.selected) return "UNREVIEWED";
  return input.hasTarget ? "CORRECTED" : "REJECTED";
}

export function buildMediaClassificationReviewEvent(input: {
  snapshot: MediaClassificationReviewSnapshot;
  feedback: PersistedMediaClassificationFeedback | null;
  supersedesReviewEventId: string | null;
  reviewedAt: Date;
  codeRevision?: string | null;
}): MediaClassificationReviewEventDraft {
  const { snapshot, feedback } = input;
  const machine = snapshot.machineClassification;
  const action: MediaClassificationReviewAction = feedback
    ? feedback.reviewState
    : "CLEAR";
  const approved = action === "CORRECT";
  const reasons = feedback?.reasons ?? [];
  const hasReason = (reason: MediaClassificationFeedbackReason) =>
    reasons.includes(reason);

  const sectorSelected = hasReason("WRONG_SECTOR");
  const eventSelected = hasReason("WRONG_EVENT_TYPE");
  const signalSelected = hasReason("WRONG_SIGNAL_DIRECTION");
  const importanceSelected = hasReason("WRONG_IMPORTANCE");
  const legacyAiSelected = hasReason("WRONG_AI_TAG");
  const notRelevant = hasReason("NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE");

  return {
    mediaArticleId: snapshot.mediaArticleId,
    supersedesReviewEventId: input.supersedesReviewEventId,
    action,
    reasons,
    canonicalUrl: snapshot.canonicalUrl,
    contentHash: mediaClassificationInputHash(snapshot.inputSnapshot),
    storyFingerprint: snapshot.storyFingerprint,
    publishedAt: snapshot.publishedAt,
    inputSnapshot: snapshot.inputSnapshot,
    machinePrediction: snapshot.machinePrediction,
    predictedAt: snapshot.predictedAt,
    classifierVersion: MEDIA_CLASSIFIER_VERSION,
    rulesetVersion: MEDIA_CLASSIFICATION_RULESET_VERSION,
    taxonomyVersion: MEDIA_CLASSIFICATION_TAXONOMY_VERSION,
    signalDirectionVersion: MEDIA_SIGNAL_DIRECTION_VERSION,
    inputSchemaVersion: MEDIA_CLASSIFICATION_INPUT_SCHEMA_VERSION,
    reviewGuidelineVersion: MEDIA_CLASSIFICATION_REVIEW_GUIDELINE_VERSION,
    codeRevision: input.codeRevision ?? null,
    sectorReviewStatus: approved
      ? "APPROVED"
      : statusForCorrection({
          selected: sectorSelected,
          hasTarget: feedback?.correctedSector !== null,
        }),
    humanSector: approved
      ? (machine?.sector ?? null)
      : (feedback?.correctedSector ?? null),
    eventTypeReviewStatus: approved
      ? "APPROVED"
      : statusForCorrection({
          selected: eventSelected,
          hasTarget:
            feedback?.correctedEventType !== null ||
            feedback?.correctedEventTypeToNull === true,
        }),
    humanEventType: approved
      ? (machine?.eventType ?? null)
      : (feedback?.correctedEventType ?? null),
    signalDirectionReviewStatus: approved
      ? "APPROVED"
      : statusForCorrection({
          selected: signalSelected,
          hasTarget: feedback?.correctedSignalDirection !== null,
        }),
    humanSignalDirection: approved
      ? (machine?.signalDirection ?? null)
      : (feedback?.correctedSignalDirection ?? null),
    importanceReviewStatus: approved
      ? "APPROVED"
      : statusForCorrection({
          selected: importanceSelected,
          hasTarget: feedback?.correctedImportance !== null,
        }),
    humanImportance: approved
      ? (machine?.importance ?? null)
      : (feedback?.correctedImportance ?? null),
    confidenceReviewStatus: approved ? "APPROVED" : "UNREVIEWED",
    humanConfidence: approved ? (machine?.confidence ?? null) : null,
    relevanceReviewStatus: approved
      ? "APPROVED"
      : notRelevant
        ? "REJECTED"
        : "UNREVIEWED",
    humanRelevant: approved ? true : notRelevant ? false : null,
    legacyAiReviewStatus: approved
      ? "APPROVED"
      : statusForCorrection({
          selected: legacyAiSelected,
          hasTarget: feedback?.correctedAiTag !== null,
        }),
    humanLegacyAiImpactType: approved
      ? (machine?.aiTag ?? null)
      : (feedback?.correctedAiTag ?? null),
    reviewedAt: input.reviewedAt,
  };
}

export async function setMediaClassificationFeedbackWithLedger(
  store: MediaClassificationReviewLedgerStore,
  input: {
    articleId: string;
    reviewState?: string;
    reasons: readonly string[];
    corrections?: MediaClassificationCorrectionInput;
    reviewedAt: Date;
    codeRevision?: string | null;
  },
): Promise<{
  feedback: PersistedMediaClassificationFeedback | null;
  reviewEventId: string;
}> {
  const snapshot = await store.findReviewSnapshot(input.articleId);
  if (!snapshot) throw new MediaArticleNotFoundError();
  const supersedesReviewEventId = await store.findLatestReviewEventId(
    input.articleId,
  );
  const feedback = await setMediaClassificationFeedback(store, input);
  const event = buildMediaClassificationReviewEvent({
    snapshot,
    feedback,
    supersedesReviewEventId,
    reviewedAt: input.reviewedAt,
    codeRevision: input.codeRevision,
  });
  const persistedEvent = await store.appendReviewEvent(event);
  return { feedback, reviewEventId: persistedEvent.id };
}
