import {
  isAiIntelligenceStory,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import { likelyDuplicateStory } from "@/data-sources/news/media-dedup";
import {
  buildStorySynthesisEvidence,
  STORY_SYNTHESIS_INSTRUCTIONS,
  synthesizeMediaStoryCluster,
  StorySynthesisResponseValidationError,
  type StoryMaterialityLevel,
  type StorySynthesisApiResponse,
  type StorySynthesisExecution,
  type StorySynthesisResult,
} from "@/services/media/story-synthesis-core";
import {
  estimateOpenAICost,
  OPENAI_LUNA_MODEL,
  type EstimatedOpenAICost,
  type OpenAITokenUsage,
} from "@/lib/openai-usage";

const MATERIALITY_ORDER: Record<StoryMaterialityLevel, number> = {
  VERY_LOW: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  VERY_HIGH: 4,
};

export type MaterialityComparisonDirection =
  "ALIGNED" | "LLM_HIGHER" | "LLM_LOWER";

export type MaterialityComparison = {
  machineImportance: number;
  expectedMateriality: StoryMaterialityLevel;
  llmMateriality: StoryMaterialityLevel;
  direction: MaterialityComparisonDirection;
  magnitude: number;
  magnitudeBand: "0" | "1" | "2+";
};

export const STORY_EVALUATION_FLAGS = [
  "SINGLE_SOURCE",
  "MULTI_SOURCE",
  "HUMAN_CORRECTED",
  "HUMAN_CONFIRMED",
  "MACHINE_LLM_MATERIALITY_DISAGREEMENT",
  "LOW_EVIDENCE_HIGH_MATERIALITY",
  "AI_RELATED",
] as const;

export type StoryEvaluationFlag = (typeof STORY_EVALUATION_FLAGS)[number];

export type HumanStoryEvaluation = {
  synthesisQuality: 1 | 2 | 3 | 4 | 5 | null;
  materialityJudgment: "TOO_LOW" | "ABOUT_RIGHT" | "TOO_HIGH" | null;
  groundingJudgment:
    "UNSUPPORTED_INCORRECT" | "MINOR_OVERREACH" | "FULLY_GROUNDED" | null;
  note: string | null;
};

export type StoryEvaluationClusterSummary = {
  clusterId: string;
  representativeArticleId: string;
  headline: string;
  sector: string | null;
  eventType: string | null;
  signalDirection: string;
  legacyAiImpactType: string | null;
  machineImportance: number;
  effectiveImportance: number;
  confidence: string;
  humanReviewState: string;
  articleCount: number;
  sourceCount: number;
  publishers: string[];
};

export type StoryEvaluationSuccess = {
  status: "SUCCESS";
  cluster: StoryEvaluationClusterSummary;
  execution: StorySynthesisExecution;
  comparison: MaterialityComparison;
  flags: StoryEvaluationFlag[];
  humanEvaluation: HumanStoryEvaluation | null;
};

export type StoryEvaluationFailure = {
  status: "FAILURE";
  cluster: StoryEvaluationClusterSummary;
  error: string;
  flags: StoryEvaluationFlag[];
  latencyMs: number | null;
  usage: OpenAITokenUsage | null;
  estimatedCost: EstimatedOpenAICost | null;
};

export type StoryEvaluationRecord =
  StoryEvaluationSuccess | StoryEvaluationFailure;

export type StoryEvaluationSummary = {
  calls: number;
  successes: number;
  failures: number;
  usage: OpenAITokenUsage;
  estimatedCost: EstimatedOpenAICost;
  averageCostPerSuccessUsd: number;
  averageCostPerMeteredCallUsd: number;
  meteredCalls: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
};

export type StoryEvaluationRun = {
  dryRun: boolean;
  selectedClusters: StoryEvaluationClusterSummary[];
  records: StoryEvaluationRecord[];
  summary: StoryEvaluationSummary;
};

export type StoryReviewAudit = {
  totalArticles: number;
  reviewedArticles: number;
  correctArticles: number;
  wrongArticles: number;
  correctionCoverage: {
    sector: number;
    eventType: number;
    aiTag: number;
    signalDirection: number;
    importance: number;
  };
  eligibleClusters: number;
  reviewedEligibleClusters: number;
  confirmedEligibleClusters: number;
  correctedEligibleClusters: number;
  ambiguousEligibleClusters: number;
};

export type StoryEvaluationArtifact = {
  artifactVersion: "story-synthesis-evaluation-v1";
  generatedAt: string;
  model: typeof OPENAI_LUNA_MODEL;
  evidenceVersion: string;
  reviewAudit: StoryReviewAudit;
  run: StoryEvaluationRun;
};

export class StoryEvaluationConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryEvaluationConfirmationError";
  }
}

export function expectedMaterialityForImportance(
  importance: number,
): StoryMaterialityLevel {
  if (importance <= 1) return "VERY_LOW";
  if (importance === 2) return "LOW";
  if (importance === 3) return "MODERATE";
  if (importance === 4) return "HIGH";
  return "VERY_HIGH";
}

export function compareMachineAndLlmMateriality(
  importance: number,
  llmMateriality: StoryMaterialityLevel,
): MaterialityComparison {
  const expectedMateriality = expectedMaterialityForImportance(importance);
  const delta =
    MATERIALITY_ORDER[llmMateriality] - MATERIALITY_ORDER[expectedMateriality];
  const magnitude = Math.abs(delta);
  return {
    machineImportance: importance,
    expectedMateriality,
    llmMateriality,
    direction: delta === 0 ? "ALIGNED" : delta > 0 ? "LLM_HIGHER" : "LLM_LOWER",
    magnitude,
    magnitudeBand: magnitude === 0 ? "0" : magnitude === 1 ? "1" : "2+",
  };
}

function hasCorrectReview(cluster: MediaStoryCluster): boolean {
  return cluster.articles.some(
    (article) => article.classificationFeedback?.reviewState === "CORRECT",
  );
}

function hasHumanCorrection(cluster: MediaStoryCluster): boolean {
  return cluster.articles.some((article) => {
    const feedback = article.classificationFeedback;
    return (
      feedback?.correctedSector != null ||
      feedback?.correctedEventType != null ||
      feedback?.correctedEventTypeToNull === true ||
      feedback?.correctedAiTag != null ||
      feedback?.correctedSignalDirection != null ||
      feedback?.correctedImportance != null
    );
  });
}

function isAiRelated(cluster: MediaStoryCluster): boolean {
  return isAiIntelligenceStory(cluster);
}

export function storyEvaluationFlags(
  cluster: MediaStoryCluster,
  synthesis?: StorySynthesisResult,
): StoryEvaluationFlag[] {
  const flags = new Set<StoryEvaluationFlag>();
  flags.add(cluster.sourceCount > 1 ? "MULTI_SOURCE" : "SINGLE_SOURCE");
  if (hasHumanCorrection(cluster)) flags.add("HUMAN_CORRECTED");
  if (hasCorrectReview(cluster)) flags.add("HUMAN_CONFIRMED");
  if (isAiRelated(cluster)) flags.add("AI_RELATED");
  if (synthesis) {
    const comparison = compareMachineAndLlmMateriality(
      cluster.machineImportance,
      synthesis.materialityLevel,
    );
    if (comparison.direction !== "ALIGNED")
      flags.add("MACHINE_LLM_MATERIALITY_DISAGREEMENT");
    if (
      synthesis.evidenceStrength === "LOW" &&
      ["HIGH", "VERY_HIGH"].includes(synthesis.materialityLevel)
    ) {
      flags.add("LOW_EVIDENCE_HIGH_MATERIALITY");
    }
  }
  return [...flags].sort();
}

export function storyEvaluationClusterSummary(
  cluster: MediaStoryCluster,
): StoryEvaluationClusterSummary {
  return {
    clusterId: cluster.clusterId,
    representativeArticleId: cluster.representativeArticleId,
    headline: cluster.canonicalHeadline,
    sector: cluster.sector,
    eventType: cluster.eventType,
    signalDirection: cluster.signalDirection,
    legacyAiImpactType: cluster.aiImpactType,
    machineImportance: cluster.machineImportance,
    effectiveImportance: cluster.importance,
    confidence: cluster.confidence,
    humanReviewState: cluster.humanReviewState,
    articleCount: cluster.articleIds.length,
    sourceCount: cluster.sourceCount,
    publishers: cluster.publishers,
  };
}

function eventTheme(cluster: MediaStoryCluster): string {
  switch (cluster.eventType) {
    case "CONSOLIDATION_ACQUISITION":
      return "consolidation";
    case "LAYOFFS":
    case "AI_LABOR_DISPLACEMENT":
    case "AI_UNION_DISPUTE":
      return "labour";
    case "CLOSURE":
    case "AT_RISK":
    case "BANKRUPTCY_INSOLVENCY":
      return "closure-insolvency";
    case "AI_ADOPTION":
    case "AI_CREATOR_TOOL":
    case "AI_SYNTHETIC_CONTENT":
      return "ai-tools";
    case "AI_COPYRIGHT":
    case "AI_LICENSING":
      return "ai-rights";
    case "AI_POLICY_REGULATION":
      return "policy-regulation";
    case "OPENING":
    case "INVESTMENT":
    case "HIRING":
    case "FUNDING_INCREASE":
    case "EXPANSION":
      return "expansion-investment";
    case "DEMAND_WEAKNESS":
    case "REVENUE_DECLINE":
    case "ATTENDANCE_GROWTH":
    case "REVENUE_GROWTH":
      return "demand-audience";
    default:
      return cluster.eventType ?? "unclassified";
  }
}

function samplingFeatures(cluster: MediaStoryCluster): Map<string, number> {
  const features = new Map<string, number>();
  if (cluster.sector) features.set(`sector:${cluster.sector}`, 10);
  if (cluster.eventType) features.set(`event:${cluster.eventType}`, 2);
  features.set(`theme:${eventTheme(cluster)}`, 7);
  features.set(cluster.sourceCount > 1 ? "multi-source" : "single-source", 4);
  features.set(
    cluster.importance <= 2
      ? "importance:low"
      : cluster.importance >= 4
        ? "importance:high"
        : "importance:moderate",
    4,
  );
  if (cluster.signalDirection === "POSITIVE") features.set("positive", 5);
  if (isAiRelated(cluster)) features.set("ai-related", 7);
  if (hasCorrectReview(cluster)) features.set("human-confirmed", 14);
  if (hasHumanCorrection(cluster)) features.set("human-corrected", 18);
  return features;
}

const SAMPLE_HEADLINE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "over",
  "that",
  "the",
  "to",
  "with",
]);

function headlineTokens(headline: string): Set<string> {
  return new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(
        (token) => token.length > 1 && !SAMPLE_HEADLINE_STOP_WORDS.has(token),
      ),
  );
}

function likelyDuplicateEvaluationCandidate(
  left: MediaStoryCluster,
  right: MediaStoryCluster,
): boolean {
  if (left.sector !== right.sector || left.eventType !== right.eventType) {
    return false;
  }
  if (
    likelyDuplicateStory(
      {
        title: left.canonicalHeadline,
        publishedAt: new Date(left.earliestPublishedAt),
      },
      {
        title: right.canonicalHeadline,
        publishedAt: new Date(right.earliestPublishedAt),
      },
    )
  ) {
    return true;
  }
  const leftTokens = headlineTokens(left.canonicalHeadline);
  const rightTokens = headlineTokens(right.canonicalHeadline);
  const shared = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return (
    shared >= 5 && shared / Math.min(leftTokens.size, rightTokens.size) >= 0.5
  );
}

export function selectRepresentativeStorySample(
  candidates: readonly MediaStoryCluster[],
  limit: number,
): MediaStoryCluster[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("Evaluation limit must be an integer from 1 to 20.");
  }
  const culturalSectors = new Set(["music", "film", "theatre", "gaming"]);
  const culturalCandidates = candidates.filter(
    (cluster) => cluster.sector !== null && culturalSectors.has(cluster.sector),
  );
  const primaryCandidates =
    culturalCandidates.length >= Math.min(limit, candidates.length)
      ? culturalCandidates
      : [
          ...culturalCandidates,
          ...candidates.filter(
            (cluster) =>
              cluster.sector === null || !culturalSectors.has(cluster.sector),
          ),
        ];
  const remaining = primaryCandidates.map((cluster, index) => ({
    cluster,
    index,
  }));
  const selected: MediaStoryCluster[] = [];
  const coverage = new Map<string, number>();
  while (remaining.length > 0 && selected.length < limit) {
    remaining.sort((left, right) => {
      const score = (cluster: MediaStoryCluster) =>
        [...samplingFeatures(cluster)].reduce(
          (total, [feature, weight]) =>
            total + weight / (1 + (coverage.get(feature) ?? 0) ** 2),
          0,
        );
      return (
        score(right.cluster) - score(left.cluster) ||
        right.cluster.importance - left.cluster.importance ||
        right.cluster.sourceCount - left.cluster.sourceCount ||
        left.index - right.index
      );
    });
    const next = remaining.shift()!;
    selected.push(next.cluster);
    for (const feature of samplingFeatures(next.cluster).keys()) {
      coverage.set(feature, (coverage.get(feature) ?? 0) + 1);
    }
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index].cluster;
      if (likelyDuplicateEvaluationCandidate(candidate, next.cluster)) {
        remaining.splice(index, 1);
      }
    }
  }
  return selected;
}

export function estimateStoryEvaluationUpperBound(
  sample: readonly MediaStoryCluster[],
): {
  estimatedUsage: OpenAITokenUsage;
  estimatedCost: EstimatedOpenAICost;
} {
  const estimatedInputTokens = sample.reduce((total, cluster) => {
    const evidence = buildStorySynthesisEvidence(cluster);
    return (
      total +
      Math.ceil(
        (evidence.bounds.serializedCharacters +
          STORY_SYNTHESIS_INSTRUCTIONS.length) /
          2,
      ) +
      2_000
    );
  }, 0);
  const estimatedOutputTokens = sample.length * 800;
  const estimatedUsage = {
    inputTokens: estimatedInputTokens,
    cachedInputTokens: 0,
    outputTokens: estimatedOutputTokens,
    totalTokens: estimatedInputTokens + estimatedOutputTokens,
  };
  return {
    estimatedUsage,
    estimatedCost: estimateOpenAICost(estimatedUsage),
  };
}

function percentile(values: readonly number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index];
}

export function aggregateStoryEvaluation(
  records: readonly StoryEvaluationRecord[],
): StoryEvaluationSummary {
  const successes = records.filter(
    (record): record is StoryEvaluationSuccess => record.status === "SUCCESS",
  );
  const meteredRecords = records.flatMap((record) => {
    if (record.status === "SUCCESS") {
      return [
        {
          usage: record.execution.usage,
          latencyMs: record.execution.latencyMs,
        },
      ];
    }
    return record.usage && record.latencyMs !== null
      ? [{ usage: record.usage, latencyMs: record.latencyMs }]
      : [];
  });
  const usage = meteredRecords.reduce<OpenAITokenUsage>(
    (total, record) => ({
      inputTokens: total.inputTokens + record.usage.inputTokens,
      cachedInputTokens:
        total.cachedInputTokens + record.usage.cachedInputTokens,
      outputTokens: total.outputTokens + record.usage.outputTokens,
      totalTokens: total.totalTokens + record.usage.totalTokens,
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  const estimatedCost = estimateOpenAICost(usage);
  const latencies = meteredRecords.map((record) => record.latencyMs);
  const sortedLatencies = latencies.slice().sort((left, right) => left - right);
  const middle = Math.floor(sortedLatencies.length / 2);
  const medianLatencyMs =
    sortedLatencies.length === 0
      ? null
      : sortedLatencies.length % 2 === 0
        ? (sortedLatencies[middle - 1] + sortedLatencies[middle]) / 2
        : sortedLatencies[middle];
  return {
    calls: records.length,
    successes: successes.length,
    failures: records.length - successes.length,
    usage,
    estimatedCost,
    averageCostPerSuccessUsd:
      successes.length === 0 ? 0 : estimatedCost.totalUsd / successes.length,
    averageCostPerMeteredCallUsd:
      meteredRecords.length === 0
        ? 0
        : estimatedCost.totalUsd / meteredRecords.length,
    meteredCalls: meteredRecords.length,
    medianLatencyMs,
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

export async function runStorySynthesisEvaluation(input: {
  sample: readonly MediaStoryCluster[];
  limit: number;
  dryRun: boolean;
  confirmed: boolean;
  createResponse: (
    request: Parameters<typeof synthesizeMediaStoryCluster>[1] extends (
      request: infer Request,
    ) => Promise<StorySynthesisApiResponse>
      ? Request
      : never,
  ) => Promise<StorySynthesisApiResponse>;
  collectHumanEvaluation?: (
    result: StoryEvaluationSuccess,
  ) => Promise<HumanStoryEvaluation | null>;
  errorMessage?: (error: unknown) => string;
}): Promise<StoryEvaluationRun> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20)
    throw new RangeError("Evaluation limit must be an integer from 1 to 20.");
  const sample = input.sample.slice(0, input.limit);
  const selectedClusters = sample.map(storyEvaluationClusterSummary);
  if (input.dryRun) {
    return {
      dryRun: true,
      selectedClusters,
      records: [],
      summary: aggregateStoryEvaluation([]),
    };
  }
  if (!input.confirmed) {
    throw new StoryEvaluationConfirmationError(
      "Explicit confirmation is required before live story evaluation.",
    );
  }
  const records: StoryEvaluationRecord[] = [];
  for (const cluster of sample) {
    const summary = storyEvaluationClusterSummary(cluster);
    try {
      const execution = await synthesizeMediaStoryCluster(
        cluster,
        input.createResponse,
      );
      const comparison = compareMachineAndLlmMateriality(
        cluster.machineImportance,
        execution.synthesis.materialityLevel,
      );
      const initial: StoryEvaluationSuccess = {
        status: "SUCCESS",
        cluster: summary,
        execution,
        comparison,
        flags: storyEvaluationFlags(cluster, execution.synthesis),
        humanEvaluation: null,
      };
      initial.humanEvaluation = input.collectHumanEvaluation
        ? await input.collectHumanEvaluation(initial)
        : null;
      records.push(initial);
    } catch (error) {
      const responseFailure =
        error instanceof StorySynthesisResponseValidationError ? error : null;
      records.push({
        status: "FAILURE",
        cluster: summary,
        error:
          input.errorMessage?.(error) ??
          (error instanceof Error ? error.message : "Story synthesis failed."),
        flags: storyEvaluationFlags(cluster),
        latencyMs: responseFailure?.latencyMs ?? null,
        usage: responseFailure?.usage ?? null,
        estimatedCost: responseFailure?.estimatedCost ?? null,
      });
    }
  }
  return {
    dryRun: false,
    selectedClusters,
    records,
    summary: aggregateStoryEvaluation(records),
  };
}

export function serializeStoryEvaluationArtifact(
  artifact: StoryEvaluationArtifact,
  forbiddenSecrets: readonly string[] = [],
): string {
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const secret of forbiddenSecrets.filter(Boolean)) {
    if (serialized.includes(secret)) {
      throw new Error("Evaluation artifact contained a forbidden secret.");
    }
  }
  return serialized;
}
