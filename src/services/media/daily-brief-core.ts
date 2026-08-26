import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
  MediaSectorSlug,
} from "@/data-sources/news/media-types";
import { isInstitutionalRssSource } from "@/data-sources/news/rss-registry";
import {
  likelyDuplicateStory,
  normaliseHeadline,
} from "@/data-sources/news/media-dedup";
import {
  isAiCreativeWorkEligible,
  isAiIntelligenceEligible,
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

function sameStory(left: MediaArticleView, right: MediaArticleView): boolean {
  if (left.canonicalUrl === right.canonicalUrl) return true;
  if (
    left.storyFingerprint !== null &&
    left.storyFingerprint === right.storyFingerprint
  )
    return true;
  const leftLabels = getEffectiveMediaLabels(left);
  const rightLabels = getEffectiveMediaLabels(right);
  return (
    leftLabels.sector === rightLabels.sector &&
    leftLabels.eventType === rightLabels.eventType &&
    likelyDuplicateStory(
      { title: left.title, publishedAt: new Date(left.publishedAt) },
      { title: right.title, publishedAt: new Date(right.publishedAt) },
    )
  );
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
): MediaStoryCluster[] {
  const articles = input
    .filter(isCuratedPresentationEligible)
    .slice()
    .sort(
      (left, right) =>
        new Date(left.publishedAt).getTime() -
          new Date(right.publishedAt).getTime() ||
        left.id.localeCompare(right.id),
    );
  const groups: MediaArticleView[][] = [];
  for (const article of articles) {
    const group = groups.find((candidate) =>
      candidate.some((member) => sameStory(member, article)),
    );
    if (group) group.push(article);
    else groups.push([article]);
  }
  return groups.map(buildCluster).sort(rankClusters);
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
  return cluster.articles.some((article) =>
    isAiIntelligenceEligible({
      ...article,
      sectorSlug: cluster.sector ?? article.sectorSlug,
      eventType: cluster.eventType,
      aiImpactType: cluster.aiImpactType,
      importance: cluster.importance,
    }),
  );
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
