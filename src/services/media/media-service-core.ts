import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
  MediaReviewState,
  MediaSectorSlug,
  MediaSourceType,
  SignalDirection,
} from "@/data-sources/news/media-types";
import {
  assessAiIntelligence,
  isMaterialAiAssessment,
} from "@/data-sources/news/ai-intelligence";
import { likelyDuplicateStory } from "@/data-sources/news/media-dedup";
import {
  CULTURAL_MEDIA_SECTORS,
  hasCreativeAiConnection,
  hasCreativeIndustryEvidence,
  hasSectorEvidence,
} from "@/data-sources/news/media-evidence";
import type { MediaClassificationFeedbackState } from "@/services/media/media-feedback-types";
import type { MediaSourceEvidenceMetadata } from "@/data-sources/news/media-source-metadata";

export type MediaArticleView = {
  id: string;
  sourceType: MediaSourceType;
  canonicalUrl: string;
  title: string;
  description: string | null;
  publisher: string;
  sourceDomain: string;
  publishedAt: string;
  retrievedAt: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  countryCode: string | null;
  sectorSlug: MediaSectorSlug;
  eventType: MediaEventType | null;
  polarity: MediaPolarity;
  signalDirection: SignalDirection;
  confidence: MediaConfidence;
  importance: number;
  aiImpactType: AiImpactType | null;
  reviewState: MediaReviewState;
  classificationRationale: string;
  classificationFeedback: MediaClassificationFeedbackState | null;
  storyFingerprint: string | null;
  possibleDuplicateStory: boolean;
  sourceMatches: string[];
  sourceEvidence?: MediaSourceEvidenceMetadata | null;
};

export type MediaFilters = {
  hours: 24 | 72 | 168;
  sector?: MediaSectorSlug;
  aiOnly?: boolean;
  polarity?: MediaPolarity;
  eventType?: string;
  minimumImportance?: number;
  publisher?: string;
};

export function filterMediaArticles(
  articles: readonly MediaArticleView[],
  filters: MediaFilters,
  now: Date,
): MediaArticleView[] {
  const cutoff = now.getTime() - filters.hours * 60 * 60 * 1_000;
  const publisher = filters.publisher?.trim().toLowerCase();
  return articles
    .filter((article) => {
      const publishedAt = new Date(article.publishedAt).getTime();
      return (
        publishedAt >= cutoff &&
        (!filters.sector || article.sectorSlug === filters.sector) &&
        (!filters.aiOnly || article.aiImpactType !== null) &&
        (!filters.polarity || article.polarity === filters.polarity) &&
        (!filters.eventType ||
          getEffectiveEventType(article) === filters.eventType) &&
        (!filters.minimumImportance ||
          article.importance >= filters.minimumImportance) &&
        (!publisher || article.publisher.toLowerCase().includes(publisher))
      );
    })
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
}

const CONFIDENCE_RANK: Record<MediaConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const MATERIAL_EVENT_TYPES = new Set<MediaEventType>([
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
  "EXECUTIVE_LEADERSHIP_CHANGE",
  "MAJOR_PRODUCT_CAPABILITY_RELEASE",
  "COMPUTE_INFRASTRUCTURE_EXPANSION",
  "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
  "AI_LABOR_DISPLACEMENT",
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_POLICY_REGULATION",
  "AI_CREATOR_TOOL",
  "AI_SYNTHETIC_CONTENT",
  "AI_UNION_DISPUTE",
]);

function articleText(article: MediaArticleView): string {
  return `${article.title}. ${article.description ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
}

export function hasCredibleCulturalRelevance(
  article: MediaArticleView,
): boolean {
  const text = articleText(article);
  if (
    CULTURAL_MEDIA_SECTORS.includes(
      article.sectorSlug as (typeof CULTURAL_MEDIA_SECTORS)[number],
    )
  ) {
    return hasSectorEvidence(text, article.sectorSlug);
  }
  return hasCreativeIndustryEvidence(text);
}

export function isAiCreativeWorkEligible(article: MediaArticleView): boolean {
  const text = articleText(article);
  return (
    hasCreativeAiConnection(text) &&
    hasCredibleCulturalRelevance(article) &&
    article.aiImpactType !== null &&
    article.eventType?.startsWith("AI_") === true &&
    (article.confidence !== "low" || article.aiImpactType !== "AMBIGUOUS")
  );
}

function correctedClassificationValue<T>(
  article: MediaArticleView,
  reason:
    | "WRONG_EVENT_TYPE"
    | "WRONG_AI_TAG"
    | "WRONG_SIGNAL_DIRECTION"
    | "WRONG_IMPORTANCE",
  value: T | null | undefined,
): T | null {
  return article.classificationFeedback?.reasons.includes(reason) === true
    ? (value ?? null)
    : null;
}

export function getEffectiveSignalDirection(
  article: MediaArticleView,
): SignalDirection {
  return (
    correctedClassificationValue(
      article,
      "WRONG_SIGNAL_DIRECTION",
      article.classificationFeedback?.correctedSignalDirection,
    ) ?? article.signalDirection
  );
}

export function getEffectiveEventType(
  article: MediaArticleView,
): MediaEventType | null {
  const feedback = article.classificationFeedback;
  if (feedback?.reasons.includes("WRONG_EVENT_TYPE") !== true) {
    return article.eventType;
  }
  if (feedback.correctedEventTypeToNull === true) return null;
  return feedback.correctedEventType ?? article.eventType;
}

type AiIntelligenceAssessment = ReturnType<typeof assessAiIntelligence>;

const AI_INTELLIGENCE_ASSESSMENT_CACHE = new WeakMap<
  MediaArticleView,
  AiIntelligenceAssessment
>();

export function getAiIntelligenceAssessment(
  article: MediaArticleView,
): AiIntelligenceAssessment {
  if (AI_INTELLIGENCE_ASSESSMENT_CACHE.has(article))
    return AI_INTELLIGENCE_ASSESSMENT_CACHE.get(article) ?? null;
  const assessment = assessAiIntelligence({
    title: article.title,
    description: article.description,
    evidenceRole: article.sourceEvidence?.evidenceRole,
    sourcePerspective: article.sourceEvidence?.sourcePerspective,
  });
  AI_INTELLIGENCE_ASSESSMENT_CACHE.set(article, assessment);
  return assessment;
}

export function isAiIntelligenceEligibleWithAssessment(
  article: MediaArticleView,
  assessment: AiIntelligenceAssessment,
): boolean {
  if (!assessment) return false;

  const effectiveEventType = getEffectiveEventType(article);
  const correctedAiTag = correctedClassificationValue(
    article,
    "WRONG_AI_TAG",
    article.classificationFeedback?.correctedAiTag,
  );
  const correctedImportance = correctedClassificationValue(
    article,
    "WRONG_IMPORTANCE",
    article.classificationFeedback?.correctedImportance,
  );
  const humanMaterialCorrection =
    correctedImportance !== null &&
    correctedImportance >= 3 &&
    (effectiveEventType?.startsWith("AI_") === true ||
      (correctedAiTag ?? article.aiImpactType) !== null);

  return isMaterialAiAssessment(assessment) || humanMaterialCorrection;
}

export function isAiIntelligenceEligible(article: MediaArticleView): boolean {
  return isAiIntelligenceEligibleWithAssessment(
    article,
    getAiIntelligenceAssessment(article),
  );
}

function hasClassificationEventEvidence(article: MediaArticleView): boolean {
  const text = articleText(article);
  return (
    getEffectiveEventType(article) !== "BANKRUPTCY_INSOLVENCY" ||
    /\b(bankrupt|bankruptcy|insolvent|insolvency|liquidation|receivership)\b/i.test(
      text,
    ) ||
    /\b(?:enters?|entered|placed|goes?|went)\s+(?:into\s+)?administration\b|\bin administration\b/i.test(
      text,
    )
  );
}

export function isTopDevelopmentEligible(article: MediaArticleView): boolean {
  const correctedImportance = correctedClassificationValue(
    article,
    "WRONG_IMPORTANCE",
    article.classificationFeedback?.correctedImportance,
  );
  if (
    isAiIntelligenceEligible(article) &&
    (correctedImportance ?? article.importance) >= 3
  )
    return true;
  const effectiveEventType = getEffectiveEventType(article);
  return (
    hasCredibleCulturalRelevance(article) &&
    hasClassificationEventEvidence(article) &&
    effectiveEventType !== null &&
    MATERIAL_EVENT_TYPES.has(effectiveEventType) &&
    article.confidence !== "low" &&
    article.importance >= 3
  );
}

export function isCuratedPresentationEligible(
  article: MediaArticleView,
): boolean {
  return (
    article.classificationFeedback?.reasons.includes(
      "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
    ) !== true
  );
}

function preferCanonicalRepresentative(
  left: MediaArticleView,
  right: MediaArticleView,
): MediaArticleView {
  const leftDescription = left.description?.trim().length ?? 0;
  const rightDescription = right.description?.trim().length ?? 0;
  if (leftDescription !== rightDescription)
    return leftDescription > rightDescription ? left : right;
  if (CONFIDENCE_RANK[left.confidence] !== CONFIDENCE_RANK[right.confidence])
    return CONFIDENCE_RANK[left.confidence] > CONFIDENCE_RANK[right.confidence]
      ? left
      : right;
  if (left.sourceMatches.length !== right.sourceMatches.length)
    return left.sourceMatches.length > right.sourceMatches.length
      ? left
      : right;
  const leftPublished = new Date(left.publishedAt).getTime();
  const rightPublished = new Date(right.publishedAt).getTime();
  if (leftPublished !== rightPublished)
    return leftPublished < rightPublished ? left : right;
  return left.canonicalUrl.localeCompare(right.canonicalUrl) <= 0
    ? left
    : right;
}

export function collapseDuplicateStories(
  articles: readonly MediaArticleView[],
): {
  articles: MediaArticleView[];
  suppressedCount: number;
} {
  const groups: MediaArticleView[][] = [];
  for (const article of articles) {
    const group = groups.find((candidateGroup) => {
      const representative = candidateGroup[0];
      return (
        (representative.storyFingerprint !== null &&
          representative.storyFingerprint === article.storyFingerprint) ||
        (representative.sectorSlug === article.sectorSlug &&
          representative.eventType === article.eventType &&
          likelyDuplicateStory(
            {
              title: representative.title,
              publishedAt: new Date(representative.publishedAt),
            },
            {
              title: article.title,
              publishedAt: new Date(article.publishedAt),
            },
          ))
      );
    });
    if (group) group.push(article);
    else groups.push([article]);
  }

  return {
    articles: groups.map((group) => {
      const representative = group.reduce(preferCanonicalRepresentative);
      return {
        ...representative,
        possibleDuplicateStory:
          representative.possibleDuplicateStory || group.length > 1,
        sourceMatches: [
          ...new Set(group.flatMap((article) => article.sourceMatches)),
        ],
      };
    }),
    suppressedCount: articles.length - groups.length,
  };
}

function rankArticles(articles: readonly MediaArticleView[]) {
  return articles
    .slice()
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
        new Date(right.publishedAt).getTime() -
          new Date(left.publishedAt).getTime() ||
        left.id.localeCompare(right.id),
    );
}

export function buildMediaHighlights(articles: readonly MediaArticleView[]) {
  const curatedArticles = articles.filter(isCuratedPresentationEligible);
  const aiCandidates = curatedArticles.filter(isAiIntelligenceEligible);
  const topCandidates = curatedArticles.filter(
    (article) =>
      isTopDevelopmentEligible(article) && !isAiIntelligenceEligible(article),
  );
  const healthCandidates = curatedArticles.filter(
    (article) =>
      getEffectiveSignalDirection(article) === "NEGATIVE" &&
      getEffectiveEventType(article) !== null &&
      article.confidence !== "low" &&
      hasCredibleCulturalRelevance(article),
  );
  const positiveCandidates = curatedArticles.filter(
    (article) =>
      getEffectiveSignalDirection(article) === "POSITIVE" &&
      getEffectiveEventType(article) !== null &&
      article.confidence !== "low" &&
      hasCredibleCulturalRelevance(article),
  );
  const top = collapseDuplicateStories(topCandidates);
  const ai = collapseDuplicateStories(aiCandidates);
  const health = collapseDuplicateStories(healthCandidates);
  const positive = collapseDuplicateStories(positiveCandidates);

  return {
    topDevelopments: rankArticles(top.articles).slice(0, 4),
    aiAndCreativeWork: rankArticles(ai.articles).slice(0, 4),
    industryHealth: rankArticles(health.articles).slice(0, 4),
    positiveSignals: rankArticles(positive.articles).slice(0, 4),
    diagnostics: {
      topCandidatesBeforeDeduplication: topCandidates.length,
      topCandidatesAfterDeduplication: top.articles.length,
      aiCandidatesBeforeDeduplication: aiCandidates.length,
      aiCandidatesAfterDeduplication: ai.articles.length,
      duplicateEventCardsSuppressed:
        top.suppressedCount +
        ai.suppressedCount +
        health.suppressedCount +
        positive.suppressedCount,
      retainedOutsideTopAndAi: articles.filter(
        (article) =>
          !isCuratedPresentationEligible(article) ||
          (!isTopDevelopmentEligible(article) &&
            !isAiIntelligenceEligible(article)),
      ).length,
    },
  };
}

export function buildSectorMediaTiers(articles: readonly MediaArticleView[]) {
  const isSignal = (article: MediaArticleView) =>
    isCuratedPresentationEligible(article) &&
    (article.reviewState === "accepted" ||
      isAiIntelligenceEligible(article) ||
      (hasCredibleCulturalRelevance(article) &&
        hasClassificationEventEvidence(article) &&
        article.importance >= 2 &&
        CONFIDENCE_RANK[article.confidence] >= CONFIDENCE_RANK.medium &&
        article.eventType !== null));
  const industrySignals = articles
    .filter(isSignal)
    .slice()
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
        new Date(right.publishedAt).getTime() -
          new Date(left.publishedAt).getTime(),
    );
  const signalIds = new Set(industrySignals.map((article) => article.id));
  const sectorFeed = articles
    .filter((article) => !signalIds.has(article.id))
    .slice()
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
  return { industrySignals, sectorFeed };
}

export function buildMediaCounts(articles: readonly MediaArticleView[]) {
  const countBy = (values: readonly (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const value of values)
      counts.set(
        value ?? "unclassified",
        (counts.get(value ?? "unclassified") ?? 0) + 1,
      );
    return Object.fromEntries(
      [...counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  };
  return {
    total: articles.length,
    bySector: countBy(articles.map((article) => article.sectorSlug)),
    byEventType: countBy(articles.map((article) => article.eventType)),
    byPolarity: countBy(articles.map((article) => article.polarity)),
    bySignalDirection: countBy(
      articles.map((article) => getEffectiveSignalDirection(article)),
    ),
    byImportance: countBy(
      articles.map((article) => String(article.importance)),
    ),
    aiRelated: articles.filter((article) => article.aiImpactType !== null)
      .length,
    aiImpactBreakdown: countBy(
      articles
        .map((article) => article.aiImpactType)
        .filter((value) => value !== null),
    ),
  };
}
