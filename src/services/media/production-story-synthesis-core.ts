import { createHash } from "node:crypto";

import { OPENAI_LUNA_MODEL } from "@/lib/openai-usage";
import { diagnoseLlmSmokeError } from "@/lib/llm-smoke";
import {
  buildStorySynthesisEvidence,
  isStorySynthesisEligible,
  STORY_SYNTHESIS_OUTPUT_SCHEMA_VERSION,
  STORY_SYNTHESIS_PROMPT_VERSION,
  StorySynthesisEvidenceError,
  StorySynthesisResponseValidationError,
  StorySynthesisValidationError,
  type StorySynthesisEvidence,
  type StorySynthesisExecution,
  type StorySynthesisResult,
} from "@/services/media/story-synthesis-core";
import type { MediaStoryCluster } from "@/services/media/daily-brief-core";

export const LUNA_STORY_SYNTHESIS_SOURCE_ID = "luna-story-synthesis";
export const LUNA_STORY_SYNTHESIS_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1_000;
export const LUNA_STORY_SYNTHESIS_LEASE_MS = 10 * 60 * 1_000;
export const LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT = 32;

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type ProductionStorySynthesisIdentity = {
  identityKey: string;
  storyKey: string;
  clusterId: string;
  representativeArticleId: string;
  evidenceFingerprint: string;
  evidenceVersion: string;
  promptVersion: string;
  outputSchemaVersion: string;
  requestedModel: string;
};

export function buildProductionStorySynthesisIdentity(
  evidence: StorySynthesisEvidence,
  options: {
    requestedModel?: string;
    storyKey?: string;
    promptVersion?: string;
    outputSchemaVersion?: string;
  } = {},
): ProductionStorySynthesisIdentity {
  const requestedModel = options.requestedModel ?? OPENAI_LUNA_MODEL;
  const storyKey = options.storyKey ?? evidence.clusterId;
  const evidenceFingerprint = sha256(stableJson(evidence));
  const versionedIdentity = {
    storyKey,
    clusterId: evidence.clusterId,
    evidenceFingerprint,
    evidenceVersion: evidence.evidenceVersion,
    promptVersion: options.promptVersion ?? STORY_SYNTHESIS_PROMPT_VERSION,
    outputSchemaVersion:
      options.outputSchemaVersion ?? STORY_SYNTHESIS_OUTPUT_SCHEMA_VERSION,
    requestedModel,
  };
  return {
    identityKey: sha256(stableJson(versionedIdentity)),
    representativeArticleId: evidence.representativeArticleId,
    ...versionedIdentity,
  };
}

export function buildProductionStoryEvidenceMetadata(
  evidence: StorySynthesisEvidence,
) {
  return {
    representativeHeadline: evidence.representativeHeadline,
    articleIds: evidence.articles.map((article) => article.articleId).sort(),
    publicationWindow: evidence.publicationWindow,
    effectiveClassification: evidence.effectiveClassification,
    claimDiscipline: evidence.claimDiscipline,
    evidenceComposition: evidence.evidenceComposition,
    includedArticles: evidence.bounds.includedArticles,
    omittedArticles: evidence.bounds.omittedArticles,
    excludedNotRelevantArticles: evidence.bounds.excludedNotRelevantArticles,
  };
}

export type ExistingSynthesisAttempt = {
  status: "PROCESSING" | "VALIDATED" | "FAILED";
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
};

export type SynthesisAcquisitionDecision =
  "ACQUIRE" | "REUSE" | "LOCKED" | "COOLDOWN";

export function synthesisAcquisitionDecision(
  existing: ExistingSynthesisAttempt | null,
  now: Date,
): SynthesisAcquisitionDecision {
  if (!existing) return "ACQUIRE";
  if (existing.status === "VALIDATED") return "REUSE";
  if (
    existing.status === "PROCESSING" &&
    existing.leaseExpiresAt !== null &&
    existing.leaseExpiresAt > now
  ) {
    return "LOCKED";
  }
  if (
    existing.status === "FAILED" &&
    existing.nextAttemptAt !== null &&
    existing.nextAttemptAt > now
  ) {
    return "COOLDOWN";
  }
  return "ACQUIRE";
}

export function selectProductionStorySynthesisShortlist(
  clusters: readonly MediaStoryCluster[],
  maximum: number,
): MediaStoryCluster[] {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 6) {
    throw new Error("Production Luna shortlist maximum must be 1–6.");
  }
  return clusters.filter(isStorySynthesisEligible).slice(0, maximum);
}

export type ValidatedStorySynthesisArtifact = {
  identityKey: string;
  storyKey: string;
  clusterId: string;
  representativeArticleId: string;
  evidenceArticleIds: string[];
  evidenceFingerprint: string;
  evidenceVersion: string;
  promptVersion: string;
  outputSchemaVersion: string;
  requestedModel: string;
  responseModel: string;
  synthesis: StorySynthesisResult;
  generatedAt: string;
  latencyMs: number | null;
};

export function selectLatestValidatedStoryArtifact(input: {
  currentIdentity: ProductionStorySynthesisIdentity;
  currentEvidenceArticleIds: readonly string[];
  candidates: readonly ValidatedStorySynthesisArtifact[];
}): ValidatedStorySynthesisArtifact | null {
  const currentArticleIds = new Set(input.currentEvidenceArticleIds);
  return (
    input.candidates.find((candidate) => {
      const sameStory =
        candidate.storyKey === input.currentIdentity.storyKey ||
        currentArticleIds.has(candidate.representativeArticleId);
      const priorEvidenceStillEligible = candidate.evidenceArticleIds.every(
        (articleId) => currentArticleIds.has(articleId),
      );
      return sameStory && priorEvidenceStillEligible;
    }) ?? null
  );
}

export type StorySynthesisReadResult = {
  freshness: "CURRENT" | "STALE" | "MISSING";
  artifact: ValidatedStorySynthesisArtifact | null;
};

export function buildStorySynthesisReadResult(input: {
  currentIdentity: ProductionStorySynthesisIdentity;
  latestValidated: ValidatedStorySynthesisArtifact | null;
}): StorySynthesisReadResult {
  if (!input.latestValidated) return { freshness: "MISSING", artifact: null };
  return {
    freshness:
      input.latestValidated.identityKey === input.currentIdentity.identityKey
        ? "CURRENT"
        : "STALE",
    artifact: input.latestValidated,
  };
}

export type ProductionSynthesisFailure = {
  kind: "VALIDATION" | "API" | "EVIDENCE" | "UNKNOWN";
  message: string;
  fatal: boolean;
  diagnostics?: Pick<
    StorySynthesisExecution,
    "model" | "latencyMs" | "usage" | "estimatedCost"
  >;
};

export function classifyProductionSynthesisFailure(
  error: unknown,
  apiKey?: string,
): ProductionSynthesisFailure {
  if (error instanceof StorySynthesisResponseValidationError) {
    return {
      kind: "VALIDATION",
      message: error.message,
      fatal: false,
      diagnostics: {
        model: error.model,
        latencyMs: error.latencyMs,
        usage: error.usage,
        estimatedCost: error.estimatedCost,
      },
    };
  }
  if (error instanceof StorySynthesisEvidenceError) {
    return { kind: "EVIDENCE", message: error.message, fatal: false };
  }
  if (error instanceof StorySynthesisValidationError) {
    return { kind: "VALIDATION", message: error.message, fatal: false };
  }
  const diagnostic = diagnoseLlmSmokeError(error, apiKey);
  return {
    kind: "API",
    message: [
      diagnostic.category,
      diagnostic.status ? `status ${diagnostic.status}` : null,
      diagnostic.code ?? null,
      diagnostic.message,
    ]
      .filter(Boolean)
      .join(" · "),
    fatal: true,
  };
}

export type ProductionSynthesisStore = {
  countAttemptsSince(since: Date): Promise<number>;
  acquire(input: {
    identity: ProductionStorySynthesisIdentity;
    evidenceMetadata: ReturnType<typeof buildProductionStoryEvidenceMetadata>;
    leaseId: string;
    attemptedAt: Date;
    leaseExpiresAt: Date;
  }): Promise<SynthesisAcquisitionDecision>;
  markValidated(input: {
    identityKey: string;
    leaseId: string;
    execution: StorySynthesisExecution;
    generatedAt: Date;
  }): Promise<boolean>;
  markFailed(input: {
    identityKey: string;
    leaseId: string;
    failure: ProductionSynthesisFailure;
    failedAt: Date;
    nextAttemptAt: Date;
  }): Promise<boolean>;
};

export type ProductionStorySynthesisCycleResult = {
  eligibleClusters: number;
  scannedClusters: number;
  callsAttempted: number;
  validated: number;
  failed: number;
  reused: number;
  locked: number;
  cooldown: number;
  dailyCapacityRemaining: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  stoppedAfterFatalFailure: boolean;
};

export async function runProductionStorySynthesisCycleCore(input: {
  clusters: readonly MediaStoryCluster[];
  maximumCalls: number;
  dailyCallLimit: number;
  store: ProductionSynthesisStore;
  synthesize: (
    evidence: StorySynthesisEvidence,
  ) => Promise<StorySynthesisExecution>;
  classifyFailure: (error: unknown) => ProductionSynthesisFailure;
  now?: () => Date;
  createLeaseId: () => string;
}): Promise<ProductionStorySynthesisCycleResult> {
  if (
    !Number.isInteger(input.maximumCalls) ||
    input.maximumCalls < 1 ||
    input.maximumCalls > 6
  ) {
    throw new Error("Production Luna maximumCalls must be 1–6.");
  }
  if (!Number.isInteger(input.dailyCallLimit) || input.dailyCallLimit < 1) {
    throw new Error("Production Luna dailyCallLimit must be positive.");
  }
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const attemptsToday = await input.store.countAttemptsSince(
    new Date(startedAt.getTime() - 24 * 60 * 60 * 1_000),
  );
  const dailyCapacityRemaining = Math.max(
    0,
    input.dailyCallLimit - attemptsToday,
  );
  const callLimit = Math.min(input.maximumCalls, dailyCapacityRemaining);
  const eligible = input.clusters.filter(isStorySynthesisEligible);
  const candidates = eligible.slice(
    0,
    LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT,
  );
  const result: ProductionStorySynthesisCycleResult = {
    eligibleClusters: eligible.length,
    scannedClusters: 0,
    callsAttempted: 0,
    validated: 0,
    failed: 0,
    reused: 0,
    locked: 0,
    cooldown: 0,
    dailyCapacityRemaining,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    stoppedAfterFatalFailure: false,
  };
  for (const cluster of candidates) {
    if (result.callsAttempted >= callLimit) break;
    result.scannedClusters += 1;
    const evidence = buildStorySynthesisEvidence(cluster);
    const identity = buildProductionStorySynthesisIdentity(evidence, {
      storyKey: cluster.comparisonKey,
    });
    const leaseId = input.createLeaseId();
    const attemptedAt = now();
    const acquisition = await input.store.acquire({
      identity,
      evidenceMetadata: buildProductionStoryEvidenceMetadata(evidence),
      leaseId,
      attemptedAt,
      leaseExpiresAt: new Date(
        attemptedAt.getTime() + LUNA_STORY_SYNTHESIS_LEASE_MS,
      ),
    });
    if (acquisition === "REUSE") {
      result.reused += 1;
      continue;
    }
    if (acquisition === "LOCKED") {
      result.locked += 1;
      continue;
    }
    if (acquisition === "COOLDOWN") {
      result.cooldown += 1;
      continue;
    }
    result.callsAttempted += 1;
    try {
      const execution = await input.synthesize(evidence);
      const persisted = await input.store.markValidated({
        identityKey: identity.identityKey,
        leaseId,
        execution,
        generatedAt: now(),
      });
      result.inputTokens += execution.usage.inputTokens;
      result.cachedInputTokens += execution.usage.cachedInputTokens;
      result.outputTokens += execution.usage.outputTokens;
      result.totalTokens += execution.usage.totalTokens;
      result.estimatedCostUsd += execution.estimatedCost.totalUsd;
      if (!persisted) {
        result.failed += 1;
        result.stoppedAfterFatalFailure = true;
        break;
      }
      result.validated += 1;
    } catch (error) {
      const failure = input.classifyFailure(error);
      await input.store.markFailed({
        identityKey: identity.identityKey,
        leaseId,
        failure,
        failedAt: now(),
        nextAttemptAt: new Date(
          now().getTime() + LUNA_STORY_SYNTHESIS_RETRY_COOLDOWN_MS,
        ),
      });
      result.failed += 1;
      if (failure.diagnostics) {
        result.inputTokens += failure.diagnostics.usage.inputTokens;
        result.cachedInputTokens += failure.diagnostics.usage.cachedInputTokens;
        result.outputTokens += failure.diagnostics.usage.outputTokens;
        result.totalTokens += failure.diagnostics.usage.totalTokens;
        result.estimatedCostUsd += failure.diagnostics.estimatedCost.totalUsd;
      }
      if (failure.fatal) {
        result.stoppedAfterFatalFailure = true;
        break;
      }
    }
  }
  return result;
}
