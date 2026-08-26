import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";
import { culturalSectorEvidence } from "@/data-sources/news/media-evidence";
import { isInstitutionalRssSource } from "@/data-sources/news/rss-registry";
import {
  likelyDuplicateStory,
  normaliseHeadline,
} from "@/data-sources/news/media-dedup";
import {
  getAiIntelligenceAssessment,
  isAiCreativeWorkEligible,
  isAiIntelligenceEligibleWithAssessment,
  isCuratedPresentationEligible,
  type MediaArticleView,
} from "@/services/media/media-service-core";

const HOUR_MS = 60 * 60 * 1_000;

const CONFIDENCE_RANK: Record<MediaConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const MATERIAL_EVENTS = new Set<MediaEventType>([
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
  "AI_ADOPTION",
  "AI_LABOR_DISPLACEMENT",
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_POLICY_REGULATION",
  "AI_CREATOR_TOOL",
  "AI_SYNTHETIC_CONTENT",
  "AI_UNION_DISPUTE",
]);

const POSITIVE_EVENTS = new Set<MediaEventType>([
  "OPENING",
  "INVESTMENT",
  "HIRING",
  "FUNDING_INCREASE",
  "ATTENDANCE_GROWTH",
  "REVENUE_GROWTH",
  "EXPANSION",
]);

const SECTORS = ["music", "film", "theatre", "gaming"] as const;
export type BriefSector = (typeof SECTORS)[number];

export const FULL_BRIEF_SECTION_IDS = [
  "ai-intelligence",
  "music",
  "film",
  "gaming",
  "theatre",
] as const;

export type FullBriefSectionId = (typeof FULL_BRIEF_SECTION_IDS)[number];

export type FullBriefSections = Record<FullBriefSectionId, MediaStoryCluster[]>;

export type MediaStoryClusteringDiagnostics = {
  eligibleArticles: number;
  candidateGroups: number;
  pairComparisons: number;
  expiredGroupsSkipped: number;
};

export type MediaStorySource = {
  articleId: string;
  headline: string;
  publisher: string;
  url: string;
  publishedAt: string;
};

export type MediaStoryCluster = {
  clusterId: string;
  comparisonKey: string;
  representativeArticleId: string;
  articleIds: string[];
  sourceCount: number;
  publishers: string[];
  canonicalHeadline: string;
  snippet: string | null;
  earliestPublishedAt: string;
  latestPublishedAt: string;
  sector: MediaSectorSlug | null;
  eventType: MediaEventType | null;
  aiImpactType: AiImpactType | null;
  polarity: MediaPolarity;
  importance: number;
  machineImportance: number;
  confidence: MediaConfidence;
  humanReviewState: "unreviewed" | "reviewed" | "corrected" | "ambiguous";
  correctedSector: MediaSectorSlug | null;
  correctedEventType: MediaEventType | null;
  correctedAiTag: AiImpactType | null;
  correctedImportance: number | null;
  ambiguousHumanCorrections: boolean;
  whyItMatters: string;
  sources: MediaStorySource[];
  articles: MediaArticleView[];
};

export type DailyBriefDelta = {
  newStoryCount: number;
  newHighImportanceCount: number;
  currentQualifyingCount: number;
  previousQualifyingCount: number;
  sectorChanges: Record<BriefSector, number>;
  aiChange: number;
  positiveChange: number;
  bullets: string[];
};

export type DailyCultureBriefCore = {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  topLine: string[];
  topDevelopments: MediaStoryCluster[];
  aiAndCreativeWork: MediaStoryCluster[];
  sectors: Record<BriefSector, MediaStoryCluster[]>;
  fullPageSections: FullBriefSections;
  positiveSignals: MediaStoryCluster[];
  delta: DailyBriefDelta;
  diagnostics: {
    currentWindowArticles: number;
    rawEligibleArticles: number;
    storyClusters: number;
    duplicateArticlesCollapsed: number;
    notRelevantExclusions: number;
    humanCorrectedStoriesUsed: number;
    previousWindowArticles: number;
    previousStoryClusters: number;
  };
};

export type BriefMediaFreshness = {
  mediaLastRefresh: string | null;
  mediaFreshnessWarning: string | null;
};

export function deriveBriefMediaFreshness(input: {
  databaseAvailable: boolean;
  sources: readonly {
    sourceId: string;
    status: string;
    lastSuccessAt: string | null;
  }[];
}): BriefMediaFreshness {
  const mediaSources = input.sources.filter(
    (source) =>
      ["rss", "thenewsapi"].includes(source.sourceId) ||
      isInstitutionalRssSource(source.sourceId),
  );
  const mediaLastRefresh =
    mediaSources
      .map((source) => source.lastSuccessAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;
  const staleMediaSources = mediaSources
    .filter((source) =>
      ["STALE", "OVERDUE", "FAILED_RECENTLY", "BLOCKED"].includes(
        source.status,
      ),
    )
    .map((source) => source.sourceId);
  return {
    mediaLastRefresh,
    mediaFreshnessWarning: !input.databaseAvailable
      ? "Media refresh state is unavailable."
      : staleMediaSources.length > 0
        ? `Media freshness warning: ${staleMediaSources.join(" and ")} ${staleMediaSources.length === 1 ? "is" : "are"} not current.`
        : null,
  };
}

export type EffectiveMediaLabels = {
  sector: MediaSectorSlug;
  eventType: MediaEventType | null;
  aiImpactType: AiImpactType | null;
  importance: number;
  correctedSector: MediaSectorSlug | null;
  correctedEventType: MediaEventType | null;
  correctedAiTag: AiImpactType | null;
  correctedImportance: number | null;
  corrected: boolean;
};

export function getEffectiveMediaLabels(
  article: MediaArticleView,
): EffectiveMediaLabels {
  const feedback = article.classificationFeedback;
  const correctedSector = feedback?.reasons.includes("WRONG_SECTOR")
    ? feedback.correctedSector
    : null;
  const correctedEventType = feedback?.reasons.includes("WRONG_EVENT_TYPE")
    ? feedback.correctedEventType
    : null;
  const correctedAiTag = feedback?.reasons.includes("WRONG_AI_TAG")
    ? feedback.correctedAiTag
    : null;
  const correctedImportance = feedback?.reasons.includes("WRONG_IMPORTANCE")
    ? feedback.correctedImportance
    : null;
  return {
    sector: correctedSector ?? article.sectorSlug,
    eventType: correctedEventType ?? article.eventType,
    aiImpactType: correctedAiTag ?? article.aiImpactType,
    importance: correctedImportance ?? article.importance,
    correctedSector,
    correctedEventType,
    correctedAiTag,
    correctedImportance,
    corrected:
      correctedSector !== null ||
      correctedEventType !== null ||
      correctedAiTag !== null ||
      correctedImportance !== null,
  };
}

const STORY_EVENT_COMPATIBILITY_FAMILIES = [
  new Set<MediaEventType>([
    "AI_POLICY_REGULATION",
    "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
  ]),
] as const;

const LOW_SPECIFICITY_STORY_EVENTS = new Set<MediaEventType>(["AI_ADOPTION"]);

const STORY_RESTRICTION_TOKENS = new Set([
  "ban",
  "bans",
  "banned",
  "bar",
  "bars",
  "barred",
  "block",
  "blocks",
  "blocked",
  "exclude",
  "excludes",
  "excluded",
  "excluding",
  "prohibit",
  "prohibits",
  "prohibited",
]);

const STORY_MUSIC_WORK_TOKENS = new Set([
  "music",
  "recording",
  "recordings",
  "song",
  "songs",
  "track",
  "tracks",
]);

type StoryIdentitySimilarity = {
  titleMatch: boolean;
  contextualMatch: boolean;
};

type MediaStoryIdentity = {
  article: MediaArticleView;
  labels: EffectiveMediaLabels;
  publishedAtMs: number;
  normalisedTitle: string;
  headlineTokens: Set<string>;
  semanticTitleTokens: Set<string>;
  semanticContextTokens: Set<string>;
  sectors: Set<MediaSectorSlug>;
};

type MediaStoryIdentityGroup = {
  members: MediaStoryIdentity[];
  latestPublishedAtMs: number;
};

function canonicalStoryToken(token: string): string {
  if (STORY_RESTRICTION_TOKENS.has(token)) return "restrict";
  if (STORY_MUSIC_WORK_TOKENS.has(token)) return "music";
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function storyIdentityTokens(value: string): Set<string> {
  return new Set(
    normaliseHeadline(value)
      .split(" ")
      .filter(Boolean)
      .map(canonicalStoryToken),
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return {
    intersection,
    jaccard: union === 0 ? 0 : intersection / union,
    smallerCoverage:
      Math.min(left.size, right.size) === 0
        ? 0
        : intersection / Math.min(left.size, right.size),
  };
}

function storyIdentitySimilarity(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): StoryIdentitySimilarity {
  const title = tokenOverlap(
    left.semanticTitleTokens,
    right.semanticTitleTokens,
  );
  const context = tokenOverlap(
    left.semanticContextTokens,
    right.semanticContextTokens,
  );
  return {
    titleMatch:
      title.intersection >= 5 &&
      title.jaccard >= 0.45 &&
      title.smallerCoverage >= 0.7,
    contextualMatch:
      title.intersection >= 4 &&
      title.smallerCoverage >= 0.5 &&
      context.intersection >= 8 &&
      context.smallerCoverage >= 0.35,
  };
}

function buildStoryIdentity(article: MediaArticleView): MediaStoryIdentity {
  const labels = getEffectiveMediaLabels(article);
  const normalisedTitle = normaliseHeadline(article.title);
  return {
    article,
    labels,
    publishedAtMs: new Date(article.publishedAt).getTime(),
    normalisedTitle,
    headlineTokens: new Set(normalisedTitle.split(" ").filter(Boolean)),
    semanticTitleTokens: storyIdentityTokens(article.title),
    semanticContextTokens: storyIdentityTokens(
      `${article.title} ${article.description ?? ""}`,
    ),
    sectors: new Set([
      labels.sector,
      ...culturalSectorEvidence(
        `${article.title}. ${article.description ?? ""}`,
      ),
    ]),
  };
}

function storySectorsCompatible(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): boolean {
  return [...left.sectors].some((sector) => right.sectors.has(sector));
}

function eventTypesShareStoryFamily(
  left: MediaEventType,
  right: MediaEventType,
): boolean {
  return STORY_EVENT_COMPATIBILITY_FAMILIES.some(
    (family) => family.has(left) && family.has(right),
  );
}

function eventTypeHasStoryFamily(eventType: MediaEventType): boolean {
  return STORY_EVENT_COMPATIBILITY_FAMILIES.some((family) =>
    family.has(eventType),
  );
}

function storyEventCompatibility(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): "compatible" | "weak-fallback" | "incompatible" {
  const leftEvent = left.labels.eventType;
  const rightEvent = right.labels.eventType;
  if (leftEvent === rightEvent) return "compatible";
  if (
    leftEvent !== null &&
    rightEvent !== null &&
    eventTypesShareStoryFamily(leftEvent, rightEvent)
  )
    return "compatible";
  if (
    (leftEvent !== null &&
      LOW_SPECIFICITY_STORY_EVENTS.has(leftEvent) &&
      left.article.confidence === "low" &&
      rightEvent !== null &&
      eventTypeHasStoryFamily(rightEvent)) ||
    (rightEvent !== null &&
      LOW_SPECIFICITY_STORY_EVENTS.has(rightEvent) &&
      right.article.confidence === "low" &&
      leftEvent !== null &&
      eventTypeHasStoryFamily(leftEvent))
  )
    return "weak-fallback";
  return "incompatible";
}

function likelyDuplicateIdentity(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): boolean {
  if (Math.abs(left.publishedAtMs - right.publishedAtMs) > 48 * HOUR_MS)
    return false;
  if (left.headlineTokens.size < 4 || right.headlineTokens.size < 4)
    return false;
  if (left.normalisedTitle === right.normalisedTitle) return true;
  const overlap = tokenOverlap(left.headlineTokens, right.headlineTokens);
  return (
    overlap.intersection >= 6 &&
    (overlap.jaccard >= 0.82 || overlap.smallerCoverage >= 0.62)
  );
}

function distinctCorrections<T>(values: readonly (T | null)[]): {
  value: T | null;
  conflict: boolean;
} {
  const present = [
    ...new Set(values.filter((value): value is T => value !== null)),
  ];
  return {
    value: present.length === 1 ? present[0] : null,
    conflict: present.length > 1,
  };
}

function compatibleStoryIdentity(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): boolean {
  if (Math.abs(left.publishedAtMs - right.publishedAtMs) > 48 * HOUR_MS)
    return false;
  if (
    left.article.countryCode !== null &&
    right.article.countryCode !== null &&
    left.article.countryCode !== right.article.countryCode
  )
    return false;
  if (!storySectorsCompatible(left, right)) return false;
  const similarity = storyIdentitySimilarity(left, right);
  const semanticallyEquivalent =
    similarity.titleMatch || similarity.contextualMatch;
  const eventCompatibility = storyEventCompatibility(left, right);
  if (
    eventCompatibility === "compatible" &&
    left.labels.eventType === right.labels.eventType
  )
    return (
      semanticallyEquivalent &&
      ((left.labels.eventType !== null &&
        eventTypeHasStoryFamily(left.labels.eventType)) ||
        left.labels.correctedEventType !== null ||
        right.labels.correctedEventType !== null)
    );
  if (eventCompatibility === "compatible") return semanticallyEquivalent;
  if (eventCompatibility === "weak-fallback") return semanticallyEquivalent;
  return false;
}

function storyMatch(
  left: MediaStoryIdentity,
  right: MediaStoryIdentity,
): { matches: boolean; compatibleIdentity: boolean } {
  const directMatch =
    left.article.canonicalUrl === right.article.canonicalUrl ||
    (left.article.storyFingerprint !== null &&
      left.article.storyFingerprint === right.article.storyFingerprint);
  const legacyMatch =
    left.labels.sector === right.labels.sector &&
    left.labels.eventType === right.labels.eventType &&
    likelyDuplicateIdentity(left, right);
  const compatibleIdentity = compatibleStoryIdentity(left, right);
  return {
    matches: directMatch || legacyMatch || compatibleIdentity,
    compatibleIdentity,
  };
}

function rankArticles(left: MediaArticleView, right: MediaArticleView): number {
  const leftLabels = getEffectiveMediaLabels(left);
  const rightLabels = getEffectiveMediaLabels(right);
  return (
    rightLabels.importance - leftLabels.importance ||
    CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
    (right.description?.trim().length ?? 0) -
      (left.description?.trim().length ?? 0) ||
    new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime() ||
    left.id.localeCompare(right.id)
  );
}

function whyItMatters(eventType: MediaEventType | null): string {
  switch (eventType) {
    case "CLOSURE":
      return "A reported closure changes cultural capacity and warrants follow-up as its practical effects become clear.";
    case "AT_RISK":
      return "The reported risk is an early operating-pressure signal, not confirmation of closure.";
    case "BANKRUPTCY_INSOLVENCY":
      return "An insolvency event can affect workers, suppliers, audiences, and future cultural output.";
    case "LAYOFFS":
      return "Workforce reductions are a direct creative-employment and production-capacity development.";
    case "FUNDING_CUT":
      return "Reduced funding can constrain future programming, employment, or access.";
    case "CANCELLATION":
      return "A cancellation is a realized change to planned cultural activity, though its cause may remain unclear.";
    case "DEMAND_WEAKNESS":
    case "REVENUE_DECLINE":
      return "The reported demand or revenue change is a business-condition signal that needs period and market context.";
    case "CONSOLIDATION_ACQUISITION":
      return "Ownership consolidation may change control, employment, distribution, or creative bargaining power.";
    case "OPENING":
    case "EXPANSION":
      return "New or expanded cultural capacity is a positive counter-signal to contraction elsewhere.";
    case "INVESTMENT":
    case "FUNDING_INCREASE":
      return "New investment or funding may support future cultural production, access, or employment.";
    case "HIRING":
      return "Hiring is a direct positive workforce and operating-capacity signal.";
    case "ATTENDANCE_GROWTH":
    case "REVENUE_GROWTH":
      return "The reported increase is a positive demand or commercial signal, without establishing a broader trend alone.";
    case "EXECUTIVE_LEADERSHIP_CHANGE":
      return "A senior leadership change can alter strategy, execution capacity, or organizational continuity; the evidence does not by itself establish downstream effects.";
    case "MAJOR_PRODUCT_CAPABILITY_RELEASE":
      return "A material capability release can change adoption, competition, production workflows, or access to consequential AI systems.";
    case "COMPUTE_INFRASTRUCTURE_EXPANSION":
      return "Concrete compute or energy-capacity expansion can change the scale, cost, and geographic distribution of AI development and deployment.";
    case "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE":
      return "A rights, eligibility, accreditation, or disclosure-rule change can alter market access, creator treatment, or how AI outputs are identified.";
    case "AI_LABOR_DISPLACEMENT":
    case "AI_UNION_DISPUTE":
      return "This directly concerns how AI changes creative work, bargaining, or employment conditions.";
    case "AI_COPYRIGHT":
    case "AI_LICENSING":
      return "This may shape creator rights, compensation, or permission for AI training and outputs.";
    case "AI_POLICY_REGULATION":
      return "The policy development may alter rules governing creative AI, rights, or cultural production.";
    case "AI_ADOPTION":
    case "AI_CREATOR_TOOL":
    case "AI_SYNTHETIC_CONTENT":
      return "This is a concrete creative-work application of AI rather than a generic technology story.";
    default:
      return "This classified development is relevant to the cultural economy; the linked reporting provides the underlying detail.";
  }
}

function hasBriefEventEvidence(cluster: MediaStoryCluster): boolean {
  const text = cluster.canonicalHeadline;
  switch (cluster.eventType) {
    case "CLOSURE":
      return /\b(close[sd]?|closing|closure|shut(?:s|ting)? down)\b/i.test(
        text,
      );
    case "AT_RISK":
      return /\b(at risk|could close|may close|warns?[^.]{0,40}clos)/i.test(
        text,
      );
    case "BANKRUPTCY_INSOLVENCY":
      return /\b(bankrupt|bankruptcy|insolvent|insolvency|liquidation|receivership|administration)\b/i.test(
        text,
      );
    case "LAYOFFS": {
      const direct =
        /\b(layoffs?|lays? off|laid off|job cuts?|cuts? (?:jobs|roles|staff)|redundan(?:cy|cies|t))\b/i.test(
          text,
        );
      const backgroundOnly =
        /\b(?:after|following)\b[^.]{0,60}\b(?:layoffs?|job cuts?)\b/i.test(
          cluster.canonicalHeadline,
        ) &&
        !/\b(new|more|further|another|announc(?:es|ed)|plans?|begins?)\b[^.]{0,40}\b(?:layoffs?|job cuts?)\b/i.test(
          cluster.canonicalHeadline,
        );
      return direct && !backgroundOnly;
    }
    case "FUNDING_CUT":
      return /\b(funding|grant|subsidy|budget)[^.]{0,40}\b(cut|cuts|cutting|reduc(?:e|ed|tion)|withdrawn)\b/i.test(
        text,
      );
    case "CANCELLATION":
      return /\b(cancelled|canceled|cancellation|scrapped|called off)\b/i.test(
        text,
      );
    case "DEMAND_WEAKNESS":
      return /\b(demand|sales|attendance|box office|tickets?)[^.]{0,50}\b(weak|weaken|declin|down|drop|fall|fell|slump|miss|lowest)\w*\b|\b(weak|declin|drop|fall|slump)\w*[^.]{0,40}\b(demand|sales|attendance|box office|tickets?)\b/i.test(
        text,
      );
    case "REVENUE_DECLINE":
      return /\b(revenue|income|gross|earnings?)[^.]{0,50}\b(declin|down|drop|fall|fell|slump|loss)\w*\b/i.test(
        text,
      );
    case "CONSOLIDATION_ACQUISITION":
      return /\b(acqui(?:re|res|red|ring|sition)|merg(?:e|es|ed|er)|takeover|buys?|bought)\b/i.test(
        text,
      );
    case "OPENING":
      return /\b(opening|opens?|opened|launch(?:es|ed)?)\b/i.test(text);
    case "INVESTMENT":
      return /\b(invest(?:s|ed|ment|ing)|capital injection|funding round)\b/i.test(
        text,
      );
    case "HIRING":
      return /\b(hir(?:e|es|ed|ing)|recruit(?:s|ed|ing|ment)|adds? (?:jobs|roles|staff))\b/i.test(
        text,
      );
    case "FUNDING_INCREASE":
      return /\b(funding|grant|subsidy|budget)[^.]{0,50}\b(increase|boost|rise|rises|rose|grow|grew|additional|new)\w*\b/i.test(
        text,
      );
    case "ATTENDANCE_GROWTH":
      return /\b(attendance|admissions?|audience|visits?)[^.]{0,50}\b(grow|growth|rise|rises|rose|increase|record)\w*\b/i.test(
        text,
      );
    case "REVENUE_GROWTH":
      return /\b(revenue|income|gross|earnings?|sales)[^.]{0,50}\b(grow|growth|rise|rises|rose|increase|record)\w*\b/i.test(
        text,
      );
    case "EXPANSION":
      return /\b(expand|expands|expanded|expansion|go(?:es)? wide|went wide|new locations?)\b/i.test(
        text,
      );
    case "EXECUTIVE_LEADERSHIP_CHANGE":
      return /\b(ceo|chief|executive|president|founder|head of)\b[^.]{0,100}\b(leaves?|left|departure|departs?|resigns?|steps? down|ousted|appointed|joins?)\b|\b(leaves?|left|departure|departs?|resigns?|steps? down|ousted|appointed)\b[^.]{0,100}\b(ceo|chief|executive|president|founder|head of)\b/i.test(
        text,
      );
    case "MAJOR_PRODUCT_CAPABILITY_RELEASE":
      return /\b(launch(?:es|ed)?|release[sd]?|deploys?|deployed|made available)\b[^.]{0,100}\b(model|system|capability|accelerator|gpu|chip)\b|\b(model|system|capability|accelerator|gpu|chip)\b[^.]{0,100}\b(launch(?:es|ed)?|release[sd]?|deploys?|deployed|available)\b/i.test(
        text,
      );
    case "COMPUTE_INFRASTRUCTURE_EXPANSION":
      return /\b(invest(?:s|ed|ing)|builds?|built|opens?|opened|expands?|expanded|adds?)\b[^.]{0,100}\b(data cent(?:er|re)|compute|gpu|accelerator|capacity|power|energy)\b|\b(data cent(?:er|re)|compute|gpu|accelerator|capacity|power|energy)\b[^.]{0,100}\b(builds?|built|opens?|opened|expands?|expanded|adds?)\b/i.test(
        text,
      );
    case "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE":
      return /\b(eligibility|eligible|ineligible|accreditation|chart rules?|content labels?|ai labels?|disclosure labels?|made with ai|digital replica|likeness rights?)\b/i.test(
        text,
      );
    case "AI_ADOPTION":
    case "AI_LABOR_DISPLACEMENT":
    case "AI_COPYRIGHT":
    case "AI_LICENSING":
    case "AI_POLICY_REGULATION":
    case "AI_CREATOR_TOOL":
    case "AI_SYNTHETIC_CONTENT":
    case "AI_UNION_DISPUTE":
      return isAiIntelligenceStory(cluster);
    default:
      return false;
  }
}

function comparisonKey(
  article: MediaArticleView,
  eventType: MediaEventType | null,
) {
  const headline = normaliseHeadline(article.title)
    .split(" ")
    .slice(0, 14)
    .join("-");
  return `${eventType ?? "unclassified"}:${headline}`;
}

function buildCluster(group: MediaArticleView[]): MediaStoryCluster {
  const articles = group.slice().sort(rankArticles);
  const representative = articles[0];
  const labels = articles.map(getEffectiveMediaLabels);
  const sectorCorrection = distinctCorrections(
    labels.map((label) => label.correctedSector),
  );
  const eventCorrection = distinctCorrections(
    labels.map((label) => label.correctedEventType),
  );
  const aiCorrection = distinctCorrections(
    labels.map((label) => label.correctedAiTag),
  );
  const importanceCorrection = distinctCorrections(
    labels.map((label) => label.correctedImportance),
  );
  const ambiguousHumanCorrections =
    sectorCorrection.conflict ||
    eventCorrection.conflict ||
    aiCorrection.conflict ||
    importanceCorrection.conflict;
  const representativeLabels = getEffectiveMediaLabels(representative);
  const sector = sectorCorrection.conflict
    ? null
    : (sectorCorrection.value ?? representativeLabels.sector);
  const eventType = eventCorrection.conflict
    ? null
    : (eventCorrection.value ?? representativeLabels.eventType);
  const aiImpactType = aiCorrection.conflict
    ? null
    : (aiCorrection.value ?? representativeLabels.aiImpactType);
  const correctedImportanceValues = labels
    .map((label) => label.correctedImportance)
    .filter((value): value is number => value !== null);
  const importance = importanceCorrection.conflict
    ? Math.min(...correctedImportanceValues)
    : (importanceCorrection.value ?? representativeLabels.importance);
  const sources = articles
    .map((article) => ({
      articleId: article.id,
      headline: article.title,
      publisher: article.publisher,
      url: article.canonicalUrl,
      publishedAt: article.publishedAt,
    }))
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
  const publishers = [
    ...new Set(
      sources.map((source) => source.publisher.trim()).filter(Boolean),
    ),
  ];
  const correctionUsed = labels.some((label) => label.corrected);
  const reviewed = articles.some(
    (article) =>
      article.classificationFeedback !== null ||
      article.reviewState !== "unreviewed",
  );
  const articleIds = articles.map((article) => article.id).sort();
  const fingerprint = articles.find(
    (article) => article.storyFingerprint !== null,
  )?.storyFingerprint;
  return {
    clusterId: fingerprint
      ? `fingerprint:${fingerprint}`
      : `articles:${articleIds.join(":")}`,
    comparisonKey: comparisonKey(representative, eventType),
    representativeArticleId: representative.id,
    articleIds,
    sourceCount: new Set(
      articles.map(
        (article) => article.publisher.trim() || article.sourceDomain,
      ),
    ).size,
    publishers,
    canonicalHeadline: representative.title,
    snippet: representative.description,
    earliestPublishedAt: articles
      .map((article) => article.publishedAt)
      .sort()[0],
    latestPublishedAt: articles
      .map((article) => article.publishedAt)
      .sort()
      .at(-1)!,
    sector,
    eventType,
    aiImpactType,
    polarity: representative.polarity,
    importance,
    machineImportance: representative.importance,
    confidence: representative.confidence,
    humanReviewState: ambiguousHumanCorrections
      ? "ambiguous"
      : correctionUsed
        ? "corrected"
        : reviewed
          ? "reviewed"
          : "unreviewed",
    correctedSector: sectorCorrection.value,
    correctedEventType: eventCorrection.value,
    correctedAiTag: aiCorrection.value,
    correctedImportance: importanceCorrection.value,
    ambiguousHumanCorrections,
    whyItMatters: whyItMatters(eventType),
    sources,
    articles,
  };
}

export function buildMediaStoryClusters(
  input: readonly MediaArticleView[],
  diagnostics?: MediaStoryClusteringDiagnostics,
): MediaStoryCluster[] {
  const identities = input
    .filter(isCuratedPresentationEligible)
    .slice()
    .sort(
      (left, right) =>
        new Date(left.publishedAt).getTime() -
          new Date(right.publishedAt).getTime() ||
        left.id.localeCompare(right.id),
    )
    .map(buildStoryIdentity);
  if (diagnostics) {
    diagnostics.eligibleArticles = identities.length;
    diagnostics.candidateGroups = 0;
    diagnostics.pairComparisons = 0;
    diagnostics.expiredGroupsSkipped = 0;
  }
  const groups: MediaStoryIdentityGroup[] = [];
  const canonicalGroups = new Map<string, MediaStoryIdentityGroup>();
  const fingerprintGroups = new Map<string, MediaStoryIdentityGroup>();
  const registerIdentity = (
    identity: MediaStoryIdentity,
    group: MediaStoryIdentityGroup,
  ) => {
    canonicalGroups.set(identity.article.canonicalUrl, group);
    if (identity.article.storyFingerprint !== null)
      fingerprintGroups.set(identity.article.storyFingerprint, group);
  };
  for (const identity of identities) {
    const directGroups = new Set<MediaStoryIdentityGroup>();
    const canonicalGroup = canonicalGroups.get(identity.article.canonicalUrl);
    if (canonicalGroup) directGroups.add(canonicalGroup);
    if (identity.article.storyFingerprint !== null) {
      const fingerprintGroup = fingerprintGroups.get(
        identity.article.storyFingerprint,
      );
      if (fingerprintGroup) directGroups.add(fingerprintGroup);
    }
    const matchingGroups = groups
      .map((candidate, index) => {
        if (
          identity.publishedAtMs - candidate.latestPublishedAtMs >
            48 * HOUR_MS &&
          !directGroups.has(candidate)
        ) {
          if (diagnostics) diagnostics.expiredGroupsSkipped += 1;
          return { index, matches: false, compatibleIdentity: false };
        }
        if (diagnostics) diagnostics.candidateGroups += 1;
        let matches = false;
        let compatibleIdentity = false;
        for (const member of candidate.members) {
          if (diagnostics) diagnostics.pairComparisons += 1;
          const result = storyMatch(member, identity);
          matches ||= result.matches;
          compatibleIdentity ||= result.compatibleIdentity;
          if (matches && compatibleIdentity) break;
        }
        return { index, matches, compatibleIdentity };
      })
      .filter((candidate) => candidate.matches)
      .sort(
        (left, right) =>
          Number(right.compatibleIdentity) - Number(left.compatibleIdentity) ||
          left.index - right.index,
      );
    if (matchingGroups.length === 0) {
      const group = {
        members: [identity],
        latestPublishedAtMs: identity.publishedAtMs,
      };
      groups.push(group);
      registerIdentity(identity, group);
      continue;
    }
    const target = groups[matchingGroups[0].index];
    target.members.push(identity);
    target.latestPublishedAtMs = Math.max(
      target.latestPublishedAtMs,
      identity.publishedAtMs,
    );
    registerIdentity(identity, target);
    const compatibleGroupIndexes = matchingGroups
      .slice(1)
      .filter((candidate) => candidate.compatibleIdentity)
      .map((candidate) => candidate.index)
      .sort((left, right) => right - left);
    for (const index of compatibleGroupIndexes) {
      const source = groups[index];
      target.members.push(...source.members);
      target.latestPublishedAtMs = Math.max(
        target.latestPublishedAtMs,
        source.latestPublishedAtMs,
      );
      for (const member of source.members) registerIdentity(member, target);
      groups.splice(index, 1);
    }
  }
  return groups
    .map((group) =>
      buildCluster(group.members.map((identity) => identity.article)),
    )
    .sort(rankClusters);
}

export function rankClusters(
  left: MediaStoryCluster,
  right: MediaStoryCluster,
): number {
  return (
    right.importance - left.importance ||
    CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
    right.sourceCount - left.sourceCount ||
    new Date(right.latestPublishedAt).getTime() -
      new Date(left.latestPublishedAt).getTime() ||
    left.clusterId.localeCompare(right.clusterId)
  );
}

export function isMaterialStorySignal(cluster: MediaStoryCluster): boolean {
  if (isAiIntelligenceStory(cluster)) return cluster.importance >= 2;
  return (
    cluster.eventType !== null &&
    MATERIAL_EVENTS.has(cluster.eventType) &&
    hasBriefEventEvidence(cluster) &&
    cluster.confidence !== "low" &&
    cluster.importance >= 2
  );
}

export function isCreativeAiStory(cluster: MediaStoryCluster): boolean {
  if (
    cluster.aiImpactType === null ||
    cluster.eventType?.startsWith("AI_") !== true
  )
    return false;
  return cluster.articles.some((article) =>
    isAiCreativeWorkEligible({
      ...article,
      sectorSlug: cluster.sector ?? article.sectorSlug,
      eventType: cluster.eventType,
      aiImpactType: cluster.aiImpactType,
      importance: cluster.importance,
    }),
  );
}

export function isAiIntelligenceStory(cluster: MediaStoryCluster): boolean {
  if (cluster.ambiguousHumanCorrections) return false;
  return cluster.articles.some((article) => {
    const assessment = getAiIntelligenceAssessment(article);
    return isAiIntelligenceEligibleWithAssessment(
      {
        ...article,
        sectorSlug: cluster.sector ?? article.sectorSlug,
        eventType: cluster.eventType,
        aiImpactType: cluster.aiImpactType,
        importance: cluster.importance,
      },
      assessment,
    );
  });
}

export function isPositiveCounterSignal(cluster: MediaStoryCluster): boolean {
  return (
    cluster.eventType !== null &&
    POSITIVE_EVENTS.has(cluster.eventType) &&
    hasBriefEventEvidence(cluster) &&
    cluster.polarity === "positive" &&
    cluster.confidence !== "low"
  );
}

export function assignFullBriefSection(
  cluster: MediaStoryCluster,
): FullBriefSectionId | null {
  if (!cluster.articles.some(isCuratedPresentationEligible)) return null;
  if (!isMaterialStorySignal(cluster)) return null;
  if (isAiIntelligenceStory(cluster)) return "ai-intelligence";
  return SECTORS.includes(cluster.sector as BriefSector)
    ? (cluster.sector as BriefSector)
    : null;
}

export function buildFullBriefSections(
  clusters: readonly MediaStoryCluster[],
  limit = 4,
): FullBriefSections {
  const sections: FullBriefSections = {
    "ai-intelligence": [],
    music: [],
    film: [],
    gaming: [],
    theatre: [],
  };
  const assigned = new Set<string>();
  for (const cluster of clusters) {
    if (assigned.has(cluster.clusterId)) continue;
    const section = assignFullBriefSection(cluster);
    if (section === null) continue;
    sections[section].push(cluster);
    assigned.add(cluster.clusterId);
  }
  for (const section of FULL_BRIEF_SECTION_IDS) {
    sections[section] = sections[section].sort(rankClusters).slice(0, limit);
  }
  return sections;
}

function clustersMatch(
  current: MediaStoryCluster,
  previous: MediaStoryCluster,
): boolean {
  if (current.comparisonKey === previous.comparisonKey) return true;
  return (
    current.sector === previous.sector &&
    current.eventType === previous.eventType &&
    likelyDuplicateStory(
      {
        title: current.canonicalHeadline,
        publishedAt: new Date(current.earliestPublishedAt),
      },
      {
        title: previous.canonicalHeadline,
        publishedAt: new Date(previous.latestPublishedAt),
      },
    )
  );
}

function countSectors(clusters: readonly MediaStoryCluster[]) {
  return Object.fromEntries(
    SECTORS.map((sector) => [
      sector,
      clusters.filter((cluster) => cluster.sector === sector).length,
    ]),
  ) as Record<BriefSector, number>;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function buildDelta(
  current: readonly MediaStoryCluster[],
  previous: readonly MediaStoryCluster[],
): DailyBriefDelta {
  const currentSignals = current.filter(isMaterialStorySignal);
  const previousSignals = previous.filter(isMaterialStorySignal);
  const newStories = currentSignals.filter(
    (cluster) =>
      !previousSignals.some((candidate) => clustersMatch(cluster, candidate)),
  );
  const currentSectors = countSectors(currentSignals);
  const previousSectors = countSectors(previousSignals);
  const sectorChanges = Object.fromEntries(
    SECTORS.map((sector) => [
      sector,
      currentSectors[sector] - previousSectors[sector],
    ]),
  ) as Record<BriefSector, number>;
  const aiChange =
    current.filter(isAiIntelligenceStory).length -
    previous.filter(isAiIntelligenceStory).length;
  const positiveChange =
    current.filter(isPositiveCounterSignal).length -
    previous.filter(isPositiveCounterSignal).length;
  const bullets: string[] = [];
  const newHighImportanceCount = newStories.filter(
    (cluster) => cluster.importance >= 4,
  ).length;
  if (newHighImportanceCount > 0)
    bullets.push(
      `${newHighImportanceCount} new importance 4–5 ${newHighImportanceCount === 1 ? "story was" : "stories were"} observed.`,
    );
  for (const sector of SECTORS) {
    const change = sectorChanges[sector];
    if (change !== 0)
      bullets.push(
        `${sector[0].toUpperCase()}${sector.slice(1)} had ${Math.abs(change)} ${change > 0 ? "more" : "fewer"} qualifying ${Math.abs(change) === 1 ? "development" : "developments"} than the previous 24 hours.`,
      );
  }
  if (aiChange !== 0)
    bullets.push(
      `AI Intelligence changed by ${signed(aiChange)} qualifying ${Math.abs(aiChange) === 1 ? "development" : "developments"}.`,
    );
  if (positiveChange !== 0)
    bullets.push(
      `Positive counter-signals changed by ${signed(positiveChange)} compared with the previous window.`,
    );
  if (bullets.length === 0)
    bullets.push(
      "No material change in qualifying story counts was observed versus the previous 24 hours.",
    );
  return {
    newStoryCount: newStories.length,
    newHighImportanceCount,
    currentQualifyingCount: currentSignals.length,
    previousQualifyingCount: previousSignals.length,
    sectorChanges,
    aiChange,
    positiveChange,
    bullets: bullets.slice(0, 6),
  };
}

export function mediaArticlesInWindow(
  articles: readonly MediaArticleView[],
  start: Date,
  end: Date,
): MediaArticleView[] {
  return articles.filter((article) => {
    const publishedAt = new Date(article.publishedAt).getTime();
    return publishedAt >= start.getTime() && publishedAt < end.getTime();
  });
}

function buildTopLine(
  top: readonly MediaStoryCluster[],
  ai: readonly MediaStoryCluster[],
  sectors: Record<BriefSector, MediaStoryCluster[]>,
): string[] {
  const sectorWithStories = SECTORS.filter(
    (sector) => sectors[sector].length > 0,
  );
  if (top.length === 0) {
    const quiet =
      sectorWithStories.length === 0
        ? "No new high-confidence sector developments were identified."
        : `Lower-intensity developments were identified in ${sectorWithStories.join(", ")}.`;
    return [
      "Culture Intelligence was relatively quiet over the last 24 hours.",
      quiet,
    ];
  }
  return [
    `${top.length} top ${top.length === 1 ? "development" : "developments"} met the brief's materiality threshold in the last 24 hours.`,
    ai.length > 0
      ? `${ai.length} materially relevant AI ${ai.length === 1 ? "development was" : "developments were"} identified.`
      : "No qualifying material AI development was identified.",
  ];
}

export function buildDailyCultureBriefCore(input: {
  articles: readonly MediaArticleView[];
  now: Date;
}): DailyCultureBriefCore {
  const windowEnd = input.now;
  const windowStart = new Date(windowEnd.getTime() - 24 * HOUR_MS);
  const previousWindowStart = new Date(windowEnd.getTime() - 48 * HOUR_MS);
  const currentArticles = mediaArticlesInWindow(
    input.articles,
    windowStart,
    windowEnd,
  );
  const previousArticles = mediaArticlesInWindow(
    input.articles,
    previousWindowStart,
    windowStart,
  );
  const currentClusters = buildMediaStoryClusters(currentArticles);
  const previousClusters = buildMediaStoryClusters(previousArticles);
  const signalClusters = currentClusters
    .filter(isMaterialStorySignal)
    .sort(rankClusters);
  const topDevelopments = signalClusters
    .filter((cluster) => cluster.importance >= 3)
    .slice(0, 5);
  const aiAndCreativeWork = currentClusters
    .filter(isAiIntelligenceStory)
    .sort(rankClusters)
    .slice(0, 4);
  const topIds = new Set(topDevelopments.map((cluster) => cluster.clusterId));
  const sectors = Object.fromEntries(
    SECTORS.map((sector) => {
      const candidates = signalClusters.filter(
        (cluster) => cluster.sector === sector,
      );
      const secondary = candidates.filter(
        (cluster) => !topIds.has(cluster.clusterId),
      );
      return [
        sector,
        (secondary.length > 0 ? secondary : candidates).slice(0, 3),
      ];
    }),
  ) as Record<BriefSector, MediaStoryCluster[]>;
  const positiveSignals = currentClusters
    .filter(isPositiveCounterSignal)
    .sort(rankClusters)
    .slice(0, 4);
  const fullPageSections = buildFullBriefSections(currentClusters);
  return {
    generatedAt: input.now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    previousWindowStart: previousWindowStart.toISOString(),
    previousWindowEnd: windowStart.toISOString(),
    topLine: buildTopLine(topDevelopments, aiAndCreativeWork, sectors),
    topDevelopments,
    aiAndCreativeWork,
    sectors,
    fullPageSections,
    positiveSignals,
    delta: buildDelta(currentClusters, previousClusters),
    diagnostics: {
      currentWindowArticles: currentArticles.length,
      rawEligibleArticles: currentArticles.filter(isCuratedPresentationEligible)
        .length,
      storyClusters: currentClusters.length,
      duplicateArticlesCollapsed:
        currentArticles.filter(isCuratedPresentationEligible).length -
        currentClusters.length,
      notRelevantExclusions: currentArticles.filter(
        (article) => !isCuratedPresentationEligible(article),
      ).length,
      humanCorrectedStoriesUsed: currentClusters.filter(
        (cluster) => cluster.humanReviewState === "corrected",
      ).length,
      previousWindowArticles: previousArticles.length,
      previousStoryClusters: previousClusters.length,
    },
  };
}
