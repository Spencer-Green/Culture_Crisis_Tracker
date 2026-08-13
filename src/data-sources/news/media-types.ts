import type { CountryCode, SectorSlug } from "@/lib/constants";

export const MEDIA_SOURCE_TYPES = ["THENEWSAPI", "RSS"] as const;
export type MediaSourceType = (typeof MEDIA_SOURCE_TYPES)[number];

export const MEDIA_EVENT_TYPES = [
  "CLOSURE",
  "AT_RISK",
  "BANKRUPTCY_INSOLVENCY",
  "LAYOFFS",
  "FUNDING_CUT",
  "CANCELLATION",
  "DEMAND_WEAKNESS",
  "REVENUE_DECLINE",
  "CONSOLIDATION_ACQUISITION",
  "OPENING",
  "INVESTMENT",
  "HIRING",
  "FUNDING_INCREASE",
  "ATTENDANCE_GROWTH",
  "REVENUE_GROWTH",
  "EXPANSION",
  "AI_ADOPTION",
  "AI_LABOR_DISPLACEMENT",
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_POLICY_REGULATION",
  "AI_CREATOR_TOOL",
  "AI_SYNTHETIC_CONTENT",
  "AI_UNION_DISPUTE",
] as const;

export type MediaEventType = (typeof MEDIA_EVENT_TYPES)[number];
export type MediaPolarity = "negative" | "positive" | "neutral/ambiguous";
export type MediaConfidence = "low" | "medium" | "high";
export type MediaReviewState = "unreviewed" | "accepted" | "rejected";
export type MediaSectorSlug = Extract<
  SectorSlug,
  "music" | "film" | "theatre" | "gaming" | "ai-policy" | "industry-events"
>;

export const AI_IMPACT_TYPES = [
  "CREATOR_POSITIVE",
  "CREATOR_NEGATIVE",
  "LABOR_DISPLACEMENT",
  "RIGHTS_LICENSING",
  "POLICY_REGULATION",
  "INDUSTRY_EFFICIENCY",
  "TOOL_ADOPTION",
  "AMBIGUOUS",
] as const;

export type AiImpactType = (typeof AI_IMPACT_TYPES)[number];

export type MediaSourceArticle = {
  sourceType: MediaSourceType;
  externalId: string | null;
  url: string;
  title: string;
  description: string | null;
  publisher: string;
  sourceDomain: string;
  publishedAt: Date;
  language: string | null;
  sourceCountry: string | null;
  queryFamily: string | null;
  feedSlug: string | null;
  sectorHint: MediaSectorSlug | null;
  sourceMetadata: Record<string, unknown>;
};

export type ClassifiedMediaArticle = MediaSourceArticle & {
  canonicalUrl: string;
  countryCode: CountryCode | null;
  sectorSlug: MediaSectorSlug;
  eventType: MediaEventType | null;
  polarity: MediaPolarity;
  confidence: MediaConfidence;
  importance: 1 | 2 | 3 | 4 | 5;
  aiImpactType: AiImpactType | null;
  reviewState: MediaReviewState;
  classificationRationale: string;
  storyFingerprint: string;
};
