export const MEDIA_CLASSIFICATION_FEEDBACK_REASONS = [
  "WRONG_SECTOR",
  "WRONG_EVENT_TYPE",
  "WRONG_AI_TAG",
  "WRONG_IMPORTANCE",
  "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
] as const;

export type MediaClassificationFeedbackReason =
  (typeof MEDIA_CLASSIFICATION_FEEDBACK_REASONS)[number];

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
export const MEDIA_CORRECTABLE_IMPORTANCE_VALUES = [1, 2, 3, 4, 5] as const;

export type MediaImportance = ClassifiedMediaArticle["importance"];

export type MediaClassificationCorrections = {
  correctedSector: MediaSectorSlug | null;
  correctedEventType: MediaEventType | null;
  correctedAiTag: AiImpactType | null;
  correctedImportance: MediaImportance | null;
};

export type MediaClassificationFeedbackState =
  MediaClassificationCorrections & {
    reasons: MediaClassificationFeedbackReason[];
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
  WRONG_AI_TAG: "Wrong AI tag",
  WRONG_IMPORTANCE: "Wrong importance",
  NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE:
    "Not relevant to cultural intelligence",
};
import {
  AI_IMPACT_TYPES,
  MEDIA_EVENT_TYPES,
  type AiImpactType,
  type ClassifiedMediaArticle,
  type MediaEventType,
  type MediaSectorSlug,
} from "@/data-sources/news/media-types";
