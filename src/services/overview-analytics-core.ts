import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  buildMediaStoryClusters,
  isAiIntelligenceStory,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type AnalyticalDirection =
  "improving" | "stable" | "pressured" | "mixed" | "insufficient";

export type AnalyticalFreshness =
  "current" | "degraded" | "structural" | "unavailable";

export type DirectionalMeasure = {
  label: string;
  valuePct: number | null;
  neutralBandPct: number;
  positiveWhenUp?: boolean;
};

export type ViabilityComponentInput = {
  id: string;
  sourceId: string;
  label: string;
  geography: string;
  frequency: string;
  detail: string;
  freshness: AnalyticalFreshness;
  measures: DirectionalMeasure[];
};

export type ViabilityComponent = ViabilityComponentInput & {
  direction: AnalyticalDirection;
  comparableMeasureCount: number;
};

export type SectorViability = {
  sector: "music" | "film" | "theatre" | "gaming";
  label: string;
  basis: "viability" | "activity-proxy";
  direction: AnalyticalDirection;
  components: ViabilityComponent[];
  degradedComponentCount: number;
  comparableComponentCount: number;
};

export type IndustryViability = {
  state:
    | "broadly-improving"
    | "broadly-pressured"
    | "stable"
    | "mixed"
    | "insufficient";
  label: string;
  directionLabel: string;
  sectors: SectorViability[];
  coveredSectorCount: number;
  improvingSectorCount: number;
  pressuredSectorCount: number;
  stableSectorCount: number;
  mixedSectorCount: number;
  degradedComponentCount: number;
};

export type AiDisruptionState = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type AiDisruptionDirection =
  "increasing" | "stable" | "easing" | "insufficient-baseline";

export type AiDisruptionIndicator = {
  state: AiDisruptionState;
  direction: AiDisruptionDirection;
  score: number;
  previousScore: number;
  clusterCount: number;
  previousClusterCount: number;
  sectorBreadth: number;
  sectors: string[];
  rightsPolicyLaborCount: number;
  adoptionToolCount: number;
  correctedClusterCount: number;
  duplicateArticlesCollapsed: number;
  notRelevantExclusions: number;
  baselineLimited: boolean;
  clusters: MediaStoryCluster[];
};

export type MiddleTierAssessment = {
  status: "pending" | "ready";
  label: string;
  availableEvidence: string[];
  missingRequirements: string[];
};

export function percentChange(
  current: number | null,
  comparison: number | null,
): number | null {
  if (current === null || comparison === null || comparison === 0) return null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

export function indexToBaseline(
  value: number | null,
  baseline: number | null,
): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return (value / baseline) * 100;
}

export function completeObservations<T extends { periodEnd: Date }>(
  observations: readonly T[],
  now: Date,
): T[] {
  return observations.filter((observation) => observation.periodEnd < now);
}

export function classifyDirectionalChange(
  valuePct: number | null,
  neutralBandPct: number,
  positiveWhenUp = true,
): AnalyticalDirection {
  if (valuePct === null || !Number.isFinite(valuePct)) return "insufficient";
  if (Math.abs(valuePct) <= neutralBandPct) return "stable";
  const positive = positiveWhenUp ? valuePct > 0 : valuePct < 0;
  return positive ? "improving" : "pressured";
}

export function summarizeDirections(
  directions: readonly AnalyticalDirection[],
): AnalyticalDirection {
  const comparable = directions.filter((value) => value !== "insufficient");
  if (comparable.length === 0) return "insufficient";
  if (comparable.includes("mixed")) return "mixed";
  const improving = comparable.includes("improving");
  const pressured = comparable.includes("pressured");
  if (improving && pressured) return "mixed";
  if (improving) return "improving";
  if (pressured) return "pressured";
  return "stable";
}

export function buildViabilityComponent(
  input: ViabilityComponentInput,
): ViabilityComponent {
  const measureDirections = input.measures.map((measure) =>
    classifyDirectionalChange(
      measure.valuePct,
      measure.neutralBandPct,
      measure.positiveWhenUp,
    ),
  );
  return {
    ...input,
    direction: summarizeDirections(measureDirections),
    comparableMeasureCount: measureDirections.filter(
      (direction) => direction !== "insufficient",
    ).length,
  };
}

export function buildSectorViability(input: {
  sector: SectorViability["sector"];
  label: string;
  basis?: SectorViability["basis"];
  components: ViabilityComponentInput[];
}): SectorViability {
  const components = input.components.map(buildViabilityComponent);
  return {
    sector: input.sector,
    label: input.label,
    basis: input.basis ?? "viability",
    direction: summarizeDirections(
      components.map((component) => component.direction),
    ),
    components,
    degradedComponentCount: components.filter(
      (component) => component.freshness === "degraded",
    ).length,
    comparableComponentCount: components.filter(
      (component) => component.direction !== "insufficient",
    ).length,
  };
}

export function buildIndustryViability(
  sectors: readonly SectorViability[],
): IndustryViability {
  const eligible = sectors.filter(
    (sector) =>
      sector.basis === "viability" && sector.direction !== "insufficient",
  );
  const direction = summarizeDirections(
    eligible.map((sector) => sector.direction),
  );
  const state =
    direction === "improving"
      ? "broadly-improving"
      : direction === "pressured"
        ? "broadly-pressured"
        : direction === "stable"
          ? "stable"
          : direction === "mixed"
            ? "mixed"
            : "insufficient";
  const labels = {
    "broadly-improving": "Broadly improving",
    "broadly-pressured": "Broadly pressured",
    stable: "Stable",
    mixed: "Mixed",
    insufficient: "Insufficient coverage",
  } as const;
  const improvingSectorCount = eligible.filter(
    (sector) => sector.direction === "improving",
  ).length;
  const pressuredSectorCount = eligible.filter(
    (sector) => sector.direction === "pressured",
  ).length;
  const stableSectorCount = eligible.filter(
    (sector) => sector.direction === "stable",
  ).length;
  const mixedSectorCount = eligible.filter(
    (sector) => sector.direction === "mixed",
  ).length;
  const directionLabel =
    state === "mixed"
      ? pressuredSectorCount > improvingSectorCount
        ? "Pressure is broader than improvement"
        : improvingSectorCount > pressuredSectorCount
          ? "Improvement is broader than pressure"
          : "Improving and pressured signals coexist"
      : labels[state];
  return {
    state,
    label: labels[state],
    directionLabel,
    sectors: [...sectors],
    coveredSectorCount: eligible.length,
    improvingSectorCount,
    pressuredSectorCount,
    stableSectorCount,
    mixedSectorCount,
    degradedComponentCount: new Set(
      eligible.flatMap((sector) =>
        sector.components
          .filter((component) => component.freshness === "degraded")
          .map((component) => component.sourceId),
      ),
    ).size,
  };
}

export function operationalFreshness(
  status: string | null | undefined,
): AnalyticalFreshness {
  if (!status) return "unavailable";
  if (["CURRENT", "DUE_SOON", "RUNNING"].includes(status)) return "current";
  if (status === "STRUCTURAL") return "structural";
  return "degraded";
}

const HIGH_DISRUPTION_EVENTS = new Set([
  "AI_LABOR_DISPLACEMENT",
  "AI_UNION_DISPUTE",
]);
const RIGHTS_POLICY_EVENTS = new Set([
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_POLICY_REGULATION",
]);
const RIGHTS_POLICY_LABOR_IMPACTS = new Set([
  "CREATOR_NEGATIVE",
  "LABOR_DISPLACEMENT",
  "RIGHTS_LICENSING",
  "POLICY_REGULATION",
]);
const ADOPTION_TOOL_EVENTS = new Set([
  "AI_ADOPTION",
  "AI_CREATOR_TOOL",
  "AI_SYNTHETIC_CONTENT",
]);

function aiDisruptionMultiplier(cluster: MediaStoryCluster): number {
  if (
    (cluster.eventType && HIGH_DISRUPTION_EVENTS.has(cluster.eventType)) ||
    cluster.aiImpactType === "LABOR_DISPLACEMENT"
  )
    return 1.5;
  if (
    (cluster.eventType && RIGHTS_POLICY_EVENTS.has(cluster.eventType)) ||
    (cluster.aiImpactType &&
      RIGHTS_POLICY_LABOR_IMPACTS.has(cluster.aiImpactType))
  )
    return 1.25;
  if (
    (cluster.eventType && ADOPTION_TOOL_EVENTS.has(cluster.eventType)) ||
    ["CREATOR_POSITIVE", "INDUSTRY_EFFICIENCY", "TOOL_ADOPTION"].includes(
      cluster.aiImpactType ?? "",
    )
  )
    return 0.75;
  return 1;
}

function scoreAiCluster(cluster: MediaStoryCluster, now: Date): number {
  const confidence = { low: 0.5, medium: 0.75, high: 1 }[cluster.confidence];
  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(cluster.latestPublishedAt).getTime()) / DAY_MS,
  );
  const recency = Math.max(0.7, 1 - ageDays * 0.05);
  const corroboration = 1 + Math.min(0.15, (cluster.sourceCount - 1) * 0.05);
  return (
    cluster.importance *
    confidence *
    aiDisruptionMultiplier(cluster) *
    recency *
    corroboration
  );
}

function aiState(score: number): AiDisruptionState {
  if (score < 4) return "LOW";
  if (score < 10) return "MODERATE";
  if (score < 24) return "ELEVATED";
  return "HIGH";
}

function qualifyingAiClusters(articles: readonly MediaArticleView[]) {
  return buildMediaStoryClusters(articles).filter(isAiIntelligenceStory);
}

export function buildAiDisruptionIndicator(input: {
  now: Date;
  currentArticles: readonly MediaArticleView[];
  previousArticles: readonly MediaArticleView[];
}): AiDisruptionIndicator {
  const clusters = qualifyingAiClusters(input.currentArticles);
  const previousClusters = qualifyingAiClusters(input.previousArticles);
  const score = clusters.reduce(
    (sum, cluster) => sum + scoreAiCluster(cluster, input.now),
    0,
  );
  const previousScore = previousClusters.reduce(
    (sum, cluster) => sum + scoreAiCluster(cluster, input.now),
    0,
  );
  const change = percentChange(score, previousScore);
  const direction: AiDisruptionDirection =
    previousClusters.length === 0
      ? clusters.length === 0
        ? "stable"
        : "insufficient-baseline"
      : change !== null && change > 20
        ? "increasing"
        : change !== null && change < -20
          ? "easing"
          : "stable";
  const sectors = [
    ...new Set(
      clusters
        .map((cluster) => cluster.sector)
        .filter(
          (sector): sector is "music" | "film" | "theatre" | "gaming" =>
            sector !== null &&
            ["music", "film", "theatre", "gaming"].includes(sector),
        ),
    ),
  ].sort();
  const rightsPolicyLaborCount = clusters.filter(
    (cluster) =>
      (cluster.eventType &&
        [...HIGH_DISRUPTION_EVENTS, ...RIGHTS_POLICY_EVENTS].includes(
          cluster.eventType,
        )) ||
      (cluster.aiImpactType &&
        RIGHTS_POLICY_LABOR_IMPACTS.has(cluster.aiImpactType)),
  ).length;
  const adoptionToolCount = clusters.filter(
    (cluster) =>
      (cluster.eventType && ADOPTION_TOOL_EVENTS.has(cluster.eventType)) ||
      ["CREATOR_POSITIVE", "INDUSTRY_EFFICIENCY", "TOOL_ADOPTION"].includes(
        cluster.aiImpactType ?? "",
      ),
  ).length;
  const rawQualifyingAiArticleCount = input.currentArticles.filter(
    (article) => qualifyingAiClusters([article]).length > 0,
  ).length;
  return {
    state: aiState(score),
    direction,
    score: Number(score.toFixed(2)),
    previousScore: Number(previousScore.toFixed(2)),
    clusterCount: clusters.length,
    previousClusterCount: previousClusters.length,
    sectorBreadth: sectors.length,
    sectors,
    rightsPolicyLaborCount,
    adoptionToolCount,
    correctedClusterCount: clusters.filter(
      (cluster) => cluster.humanReviewState === "corrected",
    ).length,
    duplicateArticlesCollapsed: Math.max(
      0,
      rawQualifyingAiArticleCount - clusters.length,
    ),
    notRelevantExclusions: input.currentArticles.filter((article) =>
      article.classificationFeedback?.reasons.includes(
        "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
      ),
    ).length,
    baselineLimited: previousClusters.length < 3,
    clusters,
  };
}

export function assessMiddleTierHealth(input: {
  hasEntityScale: boolean;
  hasOwnershipClassification: boolean;
  hasEconomicDistribution: boolean;
  hasLongitudinalDistribution: boolean;
  sectorCoverage: number;
  availableEvidence: string[];
}): MiddleTierAssessment {
  const missingRequirements = [
    !input.hasEntityScale ? "entity scale or capacity" : null,
    !input.hasOwnershipClassification ? "ownership or independence" : null,
    !input.hasEconomicDistribution ? "revenue or income distribution" : null,
    !input.hasLongitudinalDistribution
      ? "comparable longitudinal distribution"
      : null,
    input.sectorCoverage < 2 ? "coverage across at least two sectors" : null,
  ].filter((value): value is string => value !== null);
  return {
    status: missingRequirements.length === 0 ? "ready" : "pending",
    label:
      missingRequirements.length === 0
        ? "Methodology ready"
        : "Methodology defined · distribution data required",
    availableEvidence: input.availableEvidence,
    missingRequirements,
  };
}
