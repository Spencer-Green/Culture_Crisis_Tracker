import {
  GDELT_CONFIDENCE_SCORES,
  type GdeltConfidenceLevel,
  type GdeltPolarity,
  type GdeltReviewState,
} from "@/data-sources/news/gdelt-taxonomy";

export type IndustryEventRecord = {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  countryCode: string | null;
  sectorSlug: string;
  eventDate: Date;
  sourceUrl: string;
  sourceName: string;
  confidence: { toString(): string } | number;
  metadata: unknown;
};

export type IndustryEventCandidate = {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  countryCode: string | null;
  sectorSlug: string;
  publishedAt: string;
  sourceUrl: string;
  domain: string;
  confidenceLevel: GdeltConfidenceLevel;
  confidenceScore: number;
  polarity: GdeltPolarity;
  reviewState: GdeltReviewState;
  queryFamilies: string[];
  sourceCountry: string | null;
  language: string | null;
  classificationRationale: string;
};

export type IndustryEventFilters = {
  days?: 7 | 30 | null;
  countryCode?: string;
  sectorSlug?: string;
  eventType?: string;
  polarity?: GdeltPolarity;
  confidenceLevel?: GdeltConfidenceLevel;
  reviewState?: GdeltReviewState;
  domain?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeArticleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function toIndustryEventCandidate(
  event: IndustryEventRecord,
): IndustryEventCandidate | null {
  const metadata = record(event.metadata);
  if (metadata.provider !== "GDELT") return null;
  const sourceUrl = safeArticleUrl(event.sourceUrl);
  if (!sourceUrl) return null;
  const confidenceLevel = optionalString(metadata.confidenceLevel);
  const polarity = optionalString(metadata.polarity);
  const reviewState = optionalString(metadata.reviewState);
  if (
    !confidenceLevel ||
    !(confidenceLevel in GDELT_CONFIDENCE_SCORES) ||
    !["negative", "positive", "neutral/ambiguous"].includes(polarity ?? "") ||
    !["unreviewed", "accepted", "rejected"].includes(reviewState ?? "")
  ) {
    return null;
  }
  return {
    id: event.id,
    eventType: event.eventType,
    title: event.title,
    summary: event.summary,
    countryCode: event.countryCode,
    sectorSlug: event.sectorSlug,
    publishedAt: event.eventDate.toISOString(),
    sourceUrl,
    domain: event.sourceName,
    confidenceLevel: confidenceLevel as GdeltConfidenceLevel,
    confidenceScore: Number(event.confidence.toString()),
    polarity: polarity as GdeltPolarity,
    reviewState: reviewState as GdeltReviewState,
    queryFamilies: strings(metadata.queryFamilies),
    sourceCountry: optionalString(metadata.sourceCountry),
    language: optionalString(metadata.language),
    classificationRationale:
      optionalString(metadata.classificationRationale) ?? event.summary,
  };
}

export function filterIndustryEventCandidates(
  candidates: readonly IndustryEventCandidate[],
  filters: IndustryEventFilters,
): IndustryEventCandidate[] {
  const domain = filters.domain?.trim().toLowerCase();
  return candidates.filter(
    (candidate) =>
      (!filters.countryCode || candidate.countryCode === filters.countryCode) &&
      (!filters.sectorSlug || candidate.sectorSlug === filters.sectorSlug) &&
      (!filters.eventType || candidate.eventType === filters.eventType) &&
      (!filters.polarity || candidate.polarity === filters.polarity) &&
      (!filters.confidenceLevel ||
        candidate.confidenceLevel === filters.confidenceLevel) &&
      (!filters.reviewState || candidate.reviewState === filters.reviewState) &&
      (!domain || candidate.domain.toLowerCase().includes(domain)),
  );
}

export function buildGdeltCorpusStats(
  candidates: readonly IndustryEventCandidate[],
) {
  return {
    total: candidates.length,
    negative: candidates.filter((item) => item.polarity === "negative").length,
    positive: candidates.filter((item) => item.polarity === "positive").length,
    ambiguous: candidates.filter(
      (item) => item.polarity === "neutral/ambiguous",
    ).length,
    highConfidence: candidates.filter((item) => item.confidenceLevel === "high")
      .length,
    countriesCovered: new Set(
      candidates.map((item) => item.countryCode).filter(Boolean),
    ).size,
  };
}
