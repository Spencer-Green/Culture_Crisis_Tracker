import type { CountryCode, SectorSlug } from "@/lib/constants";

export const GDELT_EVENT_TYPES = [
  "VENUE_CLOSURE",
  "VENUE_AT_RISK",
  "FESTIVAL_CANCELLATION",
  "FESTIVAL_CLOSURE",
  "TOUR_CANCELLATION",
  "EVENT_CANCELLATION",
  "BANKRUPTCY_INSOLVENCY",
  "BUSINESS_CLOSURE",
  "STUDIO_CLOSURE",
  "PUBLISHER_CLOSURE",
  "LAYOFFS",
  "FUNDING_CUT",
  "ATTENDANCE_DECLINE",
  "TICKET_SALES_WEAKNESS",
  "REVENUE_DECLINE",
  "COST_PRESSURE",
  "CONSOLIDATION_ACQUISITION",
  "VENUE_OPENING",
  "FESTIVAL_LAUNCH",
  "BUSINESS_EXPANSION",
  "HIRING",
  "FUNDING_INCREASE",
  "INVESTMENT",
  "ATTENDANCE_RECORD",
  "REVENUE_GROWTH",
  "CAPACITY_EXPANSION",
] as const;

export type GdeltEventType = (typeof GDELT_EVENT_TYPES)[number];
export type GdeltPolarity = "negative" | "positive" | "neutral/ambiguous";
export type GdeltConfidenceLevel = "low" | "medium" | "high";
export type GdeltReviewState = "unreviewed" | "accepted" | "rejected";
export type GdeltSectorSlug = Extract<
  SectorSlug,
  "music" | "film" | "theatre" | "gaming" | "industry-events"
>;

export const GDELT_COUNTRY_SCOPE = ["AU", "US", "GB", "CA"] as const;
export type GdeltCountryCode = Extract<
  CountryCode,
  (typeof GDELT_COUNTRY_SCOPE)[number]
>;

export const GDELT_SOURCE_COUNTRY_FILTERS: Record<GdeltCountryCode, string> = {
  AU: "australia",
  US: "unitedstates",
  GB: "unitedkingdom",
  CA: "canada",
};

export const GDELT_REVIEW_STATES = [
  "unreviewed",
  "accepted",
  "rejected",
] as const satisfies readonly GdeltReviewState[];

export const GDELT_CONFIDENCE_SCORES: Record<GdeltConfidenceLevel, number> = {
  low: 0.35,
  medium: 0.65,
  high: 0.9,
};
