import {
  AI_IMPACT_TYPES,
  MEDIA_EVENT_TYPES,
  type AiImpactType,
  type ClassifiedMediaArticle,
  type MediaConfidence,
  type MediaEventType,
  type MediaSectorSlug,
  SIGNAL_DIRECTIONS,
  type SignalDirection,
} from "@/data-sources/news/media-types";

export const MEDIA_CLASSIFICATION_FEEDBACK_REASONS = [
  "WRONG_SECTOR",
  "WRONG_EVENT_TYPE",
  "WRONG_AI_TAG",
  "WRONG_SIGNAL_DIRECTION",
  "WRONG_IMPORTANCE",
  "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
] as const;

export type MediaClassificationFeedbackReason =
  (typeof MEDIA_CLASSIFICATION_FEEDBACK_REASONS)[number];

export const MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS = [
  "WRONG_SECTOR",
  "WRONG_EVENT_TYPE",
  "WRONG_SIGNAL_DIRECTION",
  "WRONG_IMPORTANCE",
  "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
] as const satisfies readonly MediaClassificationFeedbackReason[];

export const MEDIA_CLASSIFICATION_REVIEW_STATES = [
  "UNREVIEWED",
  "CORRECT",
  "WRONG_CLASSIFICATION",
] as const;

export type MediaClassificationReviewState =
  (typeof MEDIA_CLASSIFICATION_REVIEW_STATES)[number];

export type PersistedMediaClassificationReviewState = Exclude<
  MediaClassificationReviewState,
  "UNREVIEWED"
>;

export type MediaClassificationEvaluationState =
  MediaClassificationReviewState | "REVIEW_OUTDATED";

export const MEDIA_CORRECTABLE_SECTORS = [
  "music",
  "film",
  "theatre",
  "gaming",
  "industry-events",
  "ai-policy",
] as const satisfies readonly MediaSectorSlug[];

export const MEDIA_CORRECTABLE_EVENT_TYPES = MEDIA_EVENT_TYPES;
export const MEDIA_CORRECTABLE_AI_TAGS = AI_IMPACT_TYPES;
export const MEDIA_CORRECTABLE_SIGNAL_DIRECTIONS = SIGNAL_DIRECTIONS;
export const MEDIA_CORRECTABLE_IMPORTANCE_VALUES = [1, 2, 3, 4, 5] as const;

export type MediaImportance = ClassifiedMediaArticle["importance"];

export type MediaMachineClassificationSnapshot = {
  sector: MediaSectorSlug;
  eventType: MediaEventType | null;
  aiTag: AiImpactType | null;
  signalDirection: SignalDirection | null;
  importance: MediaImportance;
  confidence: MediaConfidence;
};

export type MediaClassificationCorrections = {
  correctedSector: MediaSectorSlug | null;
  correctedEventType: MediaEventType | null;
  correctedEventTypeToNull?: boolean;
  correctedAiTag: AiImpactType | null;
  correctedSignalDirection: SignalDirection | null;
  correctedImportance: MediaImportance | null;
};

export type MediaClassificationFeedbackState =
  MediaClassificationCorrections & {
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
    evaluationState: Exclude<MediaClassificationEvaluationState, "UNREVIEWED">;
    reviewedAt: string;
  };

export const MEDIA_CORRECTABLE_SECTOR_LABELS: Record<MediaSectorSlug, string> =
  {
    music: "Music",
    film: "Film",
    theatre: "Theatre",
    gaming: "Gaming",
    "industry-events": "Cross-sector / cultural economy",
    "ai-policy": "AI & policy",
  };

export const MEDIA_CLASSIFICATION_FEEDBACK_LABELS: Record<
  MediaClassificationFeedbackReason,
  string
> = {
  WRONG_SECTOR: "Wrong sector",
  WRONG_EVENT_TYPE: "Wrong event type",
  WRONG_AI_TAG: "Wrong legacy AI tag",
  WRONG_SIGNAL_DIRECTION: "Wrong signal direction",
  WRONG_IMPORTANCE: "Wrong importance",
  NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE:
    "Not relevant to cultural intelligence",
};
