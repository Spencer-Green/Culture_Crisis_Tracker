import { getMediaQueryFamily } from "@/data-sources/news/media-queries";
import {
  assessAiIntelligence,
  type AiIntelligenceAssessment,
} from "@/data-sources/news/ai-intelligence";
import {
  canonicaliseMediaUrl,
  storyFingerprint,
} from "@/data-sources/news/media-dedup";
import {
  CULTURAL_MEDIA_SECTORS,
  culturalSectorEvidence,
  hasAiRelevance,
  hasCreativeIndustryEvidence,
} from "@/data-sources/news/media-evidence";
import type {
  AiImpactType,
  ClassifiedMediaArticle,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
  MediaSectorSlug,
  MediaSourceArticle,
} from "@/data-sources/news/media-types";
import type { CountryCode } from "@/lib/constants";

type RuleMatch = {
  eventType: MediaEventType;
  polarity: MediaPolarity;
  confidence: MediaConfidence;
  aiImpactType: AiImpactType | null;
  rationale: string;
};

const COUNTRY_PATTERNS: readonly [CountryCode, RegExp][] = [
  [
    "AU",
    /\b(australia|australian|sydney|melbourne|brisbane|perth|adelaide)\b/i,
  ],
  ["US", /\b(united states|u\.s\.|american|hollywood|new york|los angeles)\b/i],
  ["GB", /\b(united kingdom|britain|british|england|scotland|wales|london)\b/i],
  ["CA", /\b(canada|canadian|toronto|vancouver|montreal|ottawa)\b/i],
  ["NZ", /\b(new zealand|aotearoa|auckland|wellington)\b/i],
  [
    "EU",
    /\b(european union|e\.u\.|european commission|european parliament)\b/i,
  ],
];

export function inferMediaCountry(text: string): CountryCode | null {
  const matches = COUNTRY_PATTERNS.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : null;
}

export function classifyMediaSector(
  text: string,
  hint: MediaSectorSlug | null,
  trustedSourceHint = false,
): MediaSectorSlug {
  const evidence = culturalSectorEvidence(text);
  if (evidence.length === 1) return evidence[0];
  if (
    evidence.length > 1 &&
    hint &&
    CULTURAL_MEDIA_SECTORS.includes(
      hint as (typeof CULTURAL_MEDIA_SECTORS)[number],
    ) &&
    evidence.includes(hint as (typeof CULTURAL_MEDIA_SECTORS)[number])
  )
    return hint;
  if (evidence.length > 1) return "industry-events";
  if (hasAiRelevance(text)) return "ai-policy";
  if (
    trustedSourceHint &&
    hint &&
    CULTURAL_MEDIA_SECTORS.includes(
      hint as (typeof CULTURAL_MEDIA_SECTORS)[number],
    )
  )
    return hint;
  if (hint === "ai-policy") return hint;
  return "industry-events";
}

function matchEvent(
  text: string,
  aiAssessment: AiIntelligenceAssessment | null,
): RuleMatch | null {
  if (aiAssessment)
    return aiAssessment.eventType
      ? {
          eventType: aiAssessment.eventType,
          polarity: aiAssessment.polarity,
          confidence: aiAssessment.confidence,
          aiImpactType: aiAssessment.aiImpactType,
          rationale: aiAssessment.rationale,
        }
      : null;
  if (
    /\b(could close|may close|might close|at risk|under threat|facing closure)\b/i.test(
      text,
    )
  )
    return {
      eventType: "AT_RISK",
      polarity: "negative",
      confidence: "high",
      aiImpactType: null,
      rationale:
        "The article describes a cultural organisation as threatened rather than confirmed closed.",
    };
  if (
    /\b(to close|closing permanently|closed permanently|shut(?:ting)? down|cease trading|studio closure|venue closure)\b/i.test(
      text,
    )
  )
    return {
      eventType: "CLOSURE",
      polarity: "negative",
      confidence: "high",
      aiImpactType: null,
      rationale: "The article explicitly reports a closure.",
    };
  if (
    /\b(bankrupt|bankruptcy|insolvent|insolvency|liquidation|receivership)\b/i.test(
      text,
    ) ||
    /\b(?:enters?|entered|placed|goes?|went)\s+(?:into\s+)?administration\b|\bin administration\b/i.test(
      text,
    )
  )
    return {
      eventType: "BANKRUPTCY_INSOLVENCY",
      polarity: "negative",
      confidence: "high",
      aiImpactType: null,
      rationale: "The article uses explicit insolvency terminology.",
    };
  if (
    /\b(layoffs?|job cuts?|redundancies|staff cuts?|workforce reduction)\b/i.test(
      text,
    )
  )
    return {
      eventType: "LAYOFFS",
      polarity: "negative",
      confidence: "high",
      aiImpactType: null,
      rationale: "The article explicitly reports workforce reductions.",
    };
  if (
    /\b(funding cut|budget cut|grant cut|subsidy cut|funding withdrawn)\b/i.test(
      text,
    )
  )
    return {
      eventType: "FUNDING_CUT",
      polarity: "negative",
      confidence: "high",
      aiImpactType: null,
      rationale: "The article explicitly reports a funding reduction.",
    };
  if (/\b(cancelled|canceled|cancellation|called off)\b/i.test(text))
    return {
      eventType: "CANCELLATION",
      polarity: "negative",
      confidence: "medium",
      aiImpactType: null,
      rationale:
        "The article reports a cancellation; supplied metadata does not establish broader impact.",
    };
  if (
    /\b(ticket sales|attendance|box office|bookings|sales)\b/i.test(text) &&
    /\b(decline|fall|slump|weak|down|poor)\b/i.test(text)
  )
    return {
      eventType: "DEMAND_WEAKNESS",
      polarity: "negative",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports weaker demand or sales.",
    };
  if (/\b(acquisition|acquires|merger|consolidation|takeover)\b/i.test(text))
    return {
      eventType: "CONSOLIDATION_ACQUISITION",
      polarity: "neutral/ambiguous",
      confidence: "high",
      aiImpactType: null,
      rationale:
        "The article reports an acquisition or consolidation without treating it as inherently negative.",
    };
  if (
    /\b(opens?|opening|reopens?|launches?)\b/i.test(text) &&
    /\b(venue|cinema|theatre|theater|festival|studio)\b/i.test(text)
  )
    return {
      eventType: "OPENING",
      polarity: "positive",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports an opening or launch.",
    };
  if (/\b(investment|invests?|funding round|new funding)\b/i.test(text))
    return {
      eventType: "INVESTMENT",
      polarity: "positive",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports investment or new funding.",
    };
  if (/\b(hiring|hires|new jobs|adds jobs)\b/i.test(text))
    return {
      eventType: "HIRING",
      polarity: "positive",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports hiring or job creation.",
    };
  if (
    /\b(record attendance|attendance record|record box office|record revenue|revenue growth)\b/i.test(
      text,
    )
  )
    return {
      eventType: "REVENUE_GROWTH",
      polarity: "positive",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports record demand or revenue growth.",
    };
  if (/\b(expands?|expansion|new location|capacity expansion)\b/i.test(text))
    return {
      eventType: "EXPANSION",
      polarity: "positive",
      confidence: "medium",
      aiImpactType: null,
      rationale: "The article reports expansion.",
    };
  return null;
}

function isPrimaryDocument(article: MediaSourceArticle): boolean {
  return article.sourceMetadata.evidenceRole === "PRIMARY_DOCUMENT";
}

const PRIMARY_DOCUMENT_ANALYSIS_PATTERN =
  /\b(analysis|blog|consultation|discussion paper|guidance|hearing testimony|policy paper|proposal|proposed rule|report|research|remarks|request for comments|speech|study|white paper)\b/i;

const PRIMARY_DOCUMENT_ACTION_PATTERN =
  /\b(adopts?|announces?|approves?|bans?|blocks?|challenges?|charges?|enacts?|files?|finali[sz]es?|issues?|launches?|opens? (?:an? )?(?:case|enforcement action|investigation)|orders?|prohibits?|publishes?|releases?|requires?|settles?|sues?)\b/i;

function guardPrimaryDocumentEvent(
  article: MediaSourceArticle,
  match: RuleMatch | null,
): RuleMatch | null {
  if (!match || !isPrimaryDocument(article)) return match;
  const title = article.title.replace(/\s+/g, " ").trim();
  if (PRIMARY_DOCUMENT_ANALYSIS_PATTERN.test(title)) return null;
  if (!PRIMARY_DOCUMENT_ACTION_PATTERN.test(title)) return null;
  if (
    match.eventType === "CONSOLIDATION_ACQUISITION" &&
    !/\b(approves?|blocks?|challenges?|files?|orders?|requires?|settles?|sues?)\b/i.test(
      title,
    )
  )
    return null;
  return match;
}

function importanceFor(
  match: RuleMatch | null,
  text: string,
  culturalEconomyRelevant: boolean,
  aiAssessment: AiIntelligenceAssessment | null,
  primaryDocument = false,
): 1 | 2 | 3 | 4 | 5 {
  if (aiAssessment) return aiAssessment.importance;
  let value = 1;
  if (match) value += 1;
  if (!culturalEconomyRelevant) return Math.min(2, value) as 1 | 2;
  if (match?.confidence === "high") value += 1;
  if (
    match?.eventType === "CLOSURE" ||
    match?.eventType === "BANKRUPTCY_INSOLVENCY" ||
    match?.eventType === "LAYOFFS" ||
    match?.eventType === "FUNDING_CUT" ||
    match?.eventType === "CONSOLIDATION_ACQUISITION" ||
    match?.eventType === "INVESTMENT" ||
    match?.aiImpactType === "LABOR_DISPLACEMENT" ||
    match?.aiImpactType === "RIGHTS_LICENSING" ||
    match?.aiImpactType === "POLICY_REGULATION"
  )
    value += 1;
  if (
    !primaryDocument &&
    /\b(court|supreme court|regulator|union|guild|dga|iatse|sag-aftra|major|thousands?|record)\b/i.test(
      text,
    )
  )
    value += 1;
  return Math.min(5, value) as 1 | 2 | 3 | 4 | 5;
}

export function classifyMediaArticle(
  article: MediaSourceArticle,
): ClassifiedMediaArticle | null {
  const canonicalUrl = canonicaliseMediaUrl(article.url);
  if (!canonicalUrl) return null;
  const text = `${article.title}. ${article.description ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const family = article.queryFamily
    ? getMediaQueryFamily(article.queryFamily)
    : undefined;
  const suppliedSectorHint = article.sectorHint ?? family?.sector ?? null;
  const sectorHint =
    isPrimaryDocument(article) &&
    suppliedSectorHint === "ai-policy" &&
    !hasAiRelevance(text)
      ? null
      : suppliedSectorHint;
  const sectorSlug = classifyMediaSector(
    text,
    sectorHint,
    article.sourceType === "RSS",
  );
  const culturalEconomyRelevant =
    hasCreativeIndustryEvidence(text) ||
    (article.sourceType === "RSS" &&
      CULTURAL_MEDIA_SECTORS.includes(
        sectorSlug as (typeof CULTURAL_MEDIA_SECTORS)[number],
      ));
  const aiAssessment = assessAiIntelligence({
    title: article.title,
    description: article.description,
    evidenceRole:
      typeof article.sourceMetadata.evidenceRole === "string"
        ? article.sourceMetadata.evidenceRole
        : null,
    sourcePerspective:
      typeof article.sourceMetadata.sourcePerspective === "string"
        ? article.sourceMetadata.sourcePerspective
        : null,
  });
  const direct = guardPrimaryDocumentEvent(
    article,
    matchEvent(text, aiAssessment),
  );
  const fallback: RuleMatch | null = family?.fallbackEventType
    ? {
        eventType: family.fallbackEventType,
        polarity: family.fallbackPolarity,
        confidence: "low",
        aiImpactType: family.aiRelated ? "AMBIGUOUS" : null,
        rationale: `The article matched the ${family.name.toLowerCase()} query, but its supplied title and snippet do not confirm the event.`,
      }
    : null;
  const match = direct ?? (aiAssessment ? null : fallback);
  return {
    ...article,
    canonicalUrl,
    countryCode: inferMediaCountry(`${text} ${article.sourceCountry ?? ""}`),
    sectorSlug,
    eventType: match?.eventType ?? null,
    polarity: match?.polarity ?? "neutral/ambiguous",
    confidence: match?.confidence ?? aiAssessment?.confidence ?? "low",
    importance: importanceFor(
      match,
      text,
      culturalEconomyRelevant,
      aiAssessment,
      isPrimaryDocument(article),
    ),
    aiImpactType: match?.aiImpactType ?? aiAssessment?.aiImpactType ?? null,
    reviewState: "unreviewed",
    classificationRationale:
      match?.rationale ??
      aiAssessment?.rationale ??
      "No high-confidence event classification was supported by the supplied title and snippet.",
    storyFingerprint: storyFingerprint(article.title, article.publishedAt),
  };
}
