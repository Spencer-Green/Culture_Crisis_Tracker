import { createHash } from "node:crypto";

import {
  sanitizeResearchDiagnostic,
  sanitizeResearchTraceValue,
} from "@/services/research/deepseek-research-provider";
import { canonicalizeResearchUrl } from "@/services/research/research-provenance";
import { parseResearchPublicationDate } from "@/services/research/research-artifact";
import { RESEARCH_EXTRACTION_VERSION } from "@/services/research/research-extraction";
import type {
  ResearchCandidateV1,
  ResearchObservationV1,
} from "@/services/research/research-schema";
import {
  RESEARCH_CONTRACT_VERSION,
  RESEARCH_MATERIALIZER_VERSION,
  ResearchExecutionError,
  RESEARCH_STAGE1_PROMPT_VERSION,
  ResearchValidationError,
} from "@/services/research/research-runner";
import type {
  NativeSearchTraceV1,
  ResearchProviderResult,
  ResearchRunResult,
  ResearchSourceTraceStatus,
  ResearchStage1RunResult,
  ResearchStage1SourceV1,
  ResearchTaskV1,
  SanitizedResearchValue,
  ResearchPhaseTelemetry,
} from "@/services/research/research-types";

export const RESEARCH_STAGING_CONTRACT_VERSION = "research-staging-v2";
export const RESEARCH_PERSISTED_TRACE_CALL_MAXIMUM = 32;
export const RESEARCH_PERSISTED_ANNOTATION_MAXIMUM = 16;
export const RESEARCH_INSPECTION_LIMIT_DEFAULT = 20;
export const RESEARCH_INSPECTION_LIMIT_MAXIMUM = 100;

export const RESEARCH_REVIEW_DECISIONS = [
  "APPROVED_FOR_INGESTION_INVESTIGATION",
  "REJECTED",
  "ALREADY_COVERED",
  "NOT_USEFUL",
  "SUPERSEDED",
] as const;

export type ResearchReviewDecision = (typeof RESEARCH_REVIEW_DECISIONS)[number];

export type ResearchEvidenceMediation =
  "DIRECTLY_OPENED" | "SEARCH_MEDIATED" | "MODEL_REPORTED";

export type ResearchProviderTelemetryDraft = {
  providerId: string;
  modelId: string;
  responseId: string | null;
  status: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  responseDiagnostics: SanitizedResearchValue;
};

export type ResearchSourcePersistenceDraft = {
  sourceIndex: number;
  sourceFingerprint: string;
  sourceUrl: string;
  canonicalUrl: string;
  publisher: string;
  title: string;
  publishedAt: Date | null;
  publishedAtRaw: string;
  reportingPeriodStart: Date | null;
  reportingPeriodEnd: Date | null;
  reportingPeriodRaw: string;
  sourceRole: string;
  claim: string;
  observation: {
    text: string;
    observations?: ResearchStage1SourceV1["observations"];
  };
  limitations: string[];
  traceConfidence: ResearchSourceTraceStatus;
  evidenceMediation: ResearchEvidenceMediation;
};

export type ResearchCandidatePersistenceDraft = {
  candidateIndex: number;
  sourceIndex: number;
  candidateFingerprint: string;
  candidate: ResearchCandidateV1;
  traceConfidence: ResearchSourceTraceStatus;
};

export type ResearchRunPersistenceDraft = {
  /** Reserved before the provider call; finalized once in the staging transaction. */
  runId?: string;
  researchTaskId: string;
  researchTaskVersion: string;
  providerId: string;
  modelId: string;
  stage1PromptVersion: string;
  stage2PromptVersion: string;
  contractVersion: string;
  status: "SUCCEEDED" | "FAILED";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  stage1: ResearchProviderTelemetryDraft | null;
  stage2: ResearchProviderTelemetryDraft | null;
  combinedTotalTokens: number | null;
  combinedLatencyMs: number | null;
  stage1Artifact: string | null;
  resultSummary: string | null;
  researchLimitations: string[];
  nativeSearchTrace: NativeSearchTraceV1 | null;
  responseDiagnostics: SanitizedResearchValue;
  failureKind: string | null;
  failureMessage: string | null;
  failureReasons: string[];
  sources: ResearchSourcePersistenceDraft[];
  candidates: ResearchCandidatePersistenceDraft[];
};

export type ResearchInspectFilters = {
  taskId?: string;
  status?: string;
  candidateId?: string;
  runId?: string;
  limit: number;
};

function canonicaliseJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicaliseJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicaliseJson(item)]),
    );
  }
  return value;
}

export function stableResearchJson(value: unknown): string {
  return JSON.stringify(canonicaliseJson(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ResearchSourceIdentityInput = {
  canonicalUrl: string;
  reportingPeriod: string;
  title: string;
};

function hasVersionedDocumentPath(canonicalUrl: string): boolean {
  const pathname = decodeURIComponent(new URL(canonicalUrl).pathname);
  return /(?:^|[\/_-])(?:19|20)\d{2}(?:$|[\/_-])/.test(pathname);
}

function normalizedReportingIdentity(
  reportingPeriod: string,
  title: string,
): string {
  const normalized = normalizeIdentityText(reportingPeriod);
  if (!normalized || normalized === "unknown") {
    return `title:${normalizeIdentityText(title)}`;
  }

  const exactDates = [
    ...reportingPeriod.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
  ].map((match) => match[0]);
  if (exactDates.length > 0) return `dates:${exactDates.join(",")}`;

  const monthYears = [
    ...reportingPeriod.matchAll(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}\b/gi,
    ),
  ].map((match) => normalizeIdentityText(match[0]));
  if (monthYears.length > 0) return `months:${monthYears.join(",")}`;

  const years = [...new Set(reportingPeriod.match(/\b(?:19|20)\d{2}\b/g) ?? [])]
    .sort()
    .join(",");
  return years ? `years:${years}` : `text:${normalized}`;
}

export function buildResearchSourceIdentityKey(
  input: ResearchSourceIdentityInput,
): string {
  if (hasVersionedDocumentPath(input.canonicalUrl)) {
    return `versioned-url:${input.canonicalUrl}`;
  }
  return `reusable-url:${input.canonicalUrl}|${normalizedReportingIdentity(
    input.reportingPeriod,
    input.title,
  )}`;
}

export function researchSourceIdentityMatches(
  left: ResearchSourceIdentityInput,
  right: ResearchSourceIdentityInput,
): boolean {
  return (
    buildResearchSourceIdentityKey(left) ===
    buildResearchSourceIdentityKey(right)
  );
}

function normalizedObservationIdentity(
  observations: ResearchObservationV1[],
): unknown[] {
  return observations.map((observation) => ({
    metric: normalizeIdentityText(observation.metric),
    value: normalizeIdentityText(observation.value),
    unit: normalizeIdentityText(observation.unit),
    qualifier: observation.qualifier ?? "NONE",
    periodStart: observation.periodStart,
    periodEnd: observation.periodEnd,
  }));
}

export function buildResearchSourceFingerprint(input: {
  researchTaskId: string;
  source: ResearchStage1SourceV1;
}): string {
  const canonicalUrl = canonicalizeResearchUrl(input.source.url);
  if (!canonicalUrl) throw new Error("Research source URL is invalid.");
  return sha256(
    stableResearchJson({
      researchTaskId: input.researchTaskId,
      sourceIdentity: buildResearchSourceIdentityKey({
        canonicalUrl,
        reportingPeriod: input.source.reportingPeriod,
        title: input.source.title,
      }),
    }),
  );
}

export function buildResearchCandidateFingerprint(input: {
  researchTaskId: string;
  candidate: ResearchCandidateV1;
  evidenceContext?: { sourceIdentity: string; reportingPeriod: string };
}): string {
  const canonicalUrl = canonicalizeResearchUrl(input.candidate.source.url);
  if (!canonicalUrl) throw new Error("Research candidate URL is invalid.");
  const observations = normalizedObservationIdentity(
    input.candidate.evidence.observations,
  );
  return sha256(
    stableResearchJson({
      ...(input.evidenceContext
        ? {
            identityVersion: "candidate-evidence-v2",
            sourceIdentity: input.evidenceContext.sourceIdentity,
            reportingPeriodRaw: normalizeIdentityText(
              input.evidenceContext.reportingPeriod,
            ),
            geography: normalizeIdentityText(input.candidate.scope.geography),
            sector: input.candidate.scope.sector,
            sourceRole: input.candidate.evidence.sourceRole,
          }
        : {}),
      researchTaskId: input.researchTaskId,
      canonicalUrl,
      reportingPeriodStart: input.candidate.scope.reportingPeriodStart,
      reportingPeriodEnd: input.candidate.scope.reportingPeriodEnd,
      candidateType: input.candidate.candidateType,
      evidenceIdentity:
        observations.length > 0
          ? observations
          : normalizeIdentityText(input.candidate.evidence.claim),
    }),
  );
}

function parseKnownDate(value: string | null): Date | null {
  if (!value || value.toUpperCase() === "UNKNOWN") return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseExactPublicationDate(value: string): Date | null {
  const exactDate = parseResearchPublicationDate(value)?.exactDate ?? null;
  return exactDate ? parseKnownDate(exactDate) : null;
}

function mediationForTrace(
  traceConfidence: ResearchSourceTraceStatus,
): ResearchEvidenceMediation {
  if (traceConfidence === "TRACE_OPENED") return "DIRECTLY_OPENED";
  if (traceConfidence === "TRACE_ATTEMPTED") return "SEARCH_MEDIATED";
  return "MODEL_REPORTED";
}

function telemetryFromProvider(
  provider: ResearchProviderResult,
): ResearchProviderTelemetryDraft {
  return {
    providerId: provider.provider,
    modelId: provider.model,
    responseId: provider.providerRequestId,
    status: provider.responseDiagnostics.responseStatus,
    inputTokens: provider.usage.inputTokens,
    cachedInputTokens: provider.usage.cachedInputTokens,
    outputTokens: provider.usage.outputTokens,
    reasoningTokens: provider.usage.reasoningTokens,
    totalTokens: provider.usage.totalTokens,
    latencyMs: provider.latencyMs,
    responseDiagnostics:
      provider.responseDiagnostics as unknown as SanitizedResearchValue,
  };
}

function phaseTelemetry(
  phase: ResearchPhaseTelemetry | undefined,
): ResearchProviderTelemetryDraft | null {
  if (!phase) return null;
  return {
    providerId: "deepseek",
    modelId: phase.model ?? "unknown",
    responseId: phase.responseId,
    status: phase.status,
    inputTokens: phase.usage?.inputTokens ?? null,
    cachedInputTokens: phase.usage?.cachedInputTokens ?? null,
    outputTokens: phase.usage?.outputTokens ?? null,
    reasoningTokens: phase.usage?.reasoningTokens ?? null,
    totalTokens: phase.usage?.totalTokens ?? null,
    latencyMs: phase.latencyMs,
    responseDiagnostics: { phase: phase.phase, status: phase.status },
  };
}

function boundedTrace(trace: NativeSearchTraceV1): NativeSearchTraceV1 {
  return {
    calls: trace.calls
      .slice(0, RESEARCH_PERSISTED_TRACE_CALL_MAXIMUM)
      .map((call) => ({
        sequence: call.sequence,
        item: sanitizeResearchTraceValue(call.item),
      })),
    annotations: trace.annotations
      .slice(0, RESEARCH_PERSISTED_ANNOTATION_MAXIMUM)
      .map((annotation) => ({
        ...annotation,
        annotation: sanitizeResearchTraceValue(annotation.annotation),
      })),
  };
}

function candidateSourceIndex(
  candidate: ResearchCandidateV1,
  sources: ResearchStage1SourceV1[],
): number {
  const candidateUrl = canonicalizeResearchUrl(candidate.source.url);
  const index = sources.findIndex(
    (source) => canonicalizeResearchUrl(source.url) === candidateUrl,
  );
  if (index < 0) {
    throw new Error("Validated candidate has no matching Stage-1 source.");
  }
  return index;
}

function sourceDraft(
  task: ResearchTaskV1,
  source: ResearchStage1SourceV1,
  sourceIndex: number,
  candidates: ResearchCandidateV1[],
): ResearchSourcePersistenceDraft {
  const matchingCandidate = candidates.find(
    (candidate) =>
      canonicalizeResearchUrl(candidate.source.url) ===
      canonicalizeResearchUrl(source.url),
  );
  const canonicalUrl = canonicalizeResearchUrl(source.url);
  if (!canonicalUrl)
    throw new Error("Validated Stage-1 source URL is invalid.");
  return {
    sourceIndex,
    sourceFingerprint: buildResearchSourceFingerprint({
      researchTaskId: task.id,
      source,
    }),
    sourceUrl: source.url,
    canonicalUrl,
    publisher: source.publisher,
    title: source.title,
    publishedAt: parseExactPublicationDate(source.publishedAt),
    publishedAtRaw: source.publishedAt,
    reportingPeriodStart: parseKnownDate(
      matchingCandidate?.scope.reportingPeriodStart ?? null,
    ),
    reportingPeriodEnd: parseKnownDate(
      matchingCandidate?.scope.reportingPeriodEnd ?? null,
    ),
    reportingPeriodRaw: source.reportingPeriod,
    sourceRole: source.sourceRole,
    claim: source.claim,
    observation: {
      text: source.observation,
      observations: source.observations,
    },
    limitations: [source.limitations],
    traceConfidence: source.traceStatus,
    evidenceMediation: mediationForTrace(source.traceStatus),
  };
}

export function buildSuccessfulResearchRunDraft(
  run: ResearchRunResult,
): ResearchRunPersistenceDraft {
  const phases = run.stage1.provider.responseDiagnostics.phases;
  const stage1 =
    phaseTelemetry(phases?.find((item) => item.phase === "acquisition")) ??
    telemetryFromProvider(run.stage1.provider);
  const stage2 = phaseTelemetry(
    phases?.find((item) => item.phase === "extraction"),
  );
  return {
    researchTaskId: run.task.id,
    researchTaskVersion: run.task.version,
    providerId: stage1.providerId,
    modelId: stage1.modelId,
    stage1PromptVersion: RESEARCH_STAGE1_PROMPT_VERSION,
    stage2PromptVersion: stage2
      ? RESEARCH_EXTRACTION_VERSION
      : RESEARCH_MATERIALIZER_VERSION,
    contractVersion: RESEARCH_CONTRACT_VERSION,
    status: "SUCCEEDED",
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.completedAt.getTime() - run.startedAt.getTime(),
    stage1,
    stage2,
    combinedTotalTokens:
      run.stage1.provider.responseDiagnostics.usageComplete === false
        ? null
        : run.usage.totalTokens,
    combinedLatencyMs: run.usage.totalLatencyMs,
    stage1Artifact: run.stage1.artifact,
    resultSummary: run.result.taskSummary,
    researchLimitations: run.result.researchLimitations,
    nativeSearchTrace: boundedTrace(run.stage1.provider.nativeSearchTrace),
    responseDiagnostics: {
      ...run.stage1.provider.responseDiagnostics,
      stage1: stage1.responseDiagnostics,
      materializer: {
        version: RESEARCH_MATERIALIZER_VERSION,
        status: "completed",
      },
      stagingContractVersion: RESEARCH_STAGING_CONTRACT_VERSION,
    },
    failureKind: null,
    failureMessage: null,
    failureReasons: [],
    sources: run.stage1.sources.map((source, index) =>
      sourceDraft(run.task, source, index, run.result.candidates),
    ),
    candidates: run.result.candidates.map((candidate, candidateIndex) => ({
      candidateIndex,
      sourceIndex: candidateSourceIndex(candidate, run.stage1.sources),
      candidateFingerprint: buildResearchCandidateFingerprint({
        researchTaskId: run.task.id,
        candidate,
        ...(run.stage1.provider.responseDiagnostics.pipelineVersion
          ? {
              evidenceContext: {
                sourceIdentity: buildResearchSourceIdentityKey({
                  canonicalUrl: canonicalizeResearchUrl(candidate.source.url)!,
                  title: candidate.source.title,
                  reportingPeriod:
                    run.stage1.sources[
                      candidateSourceIndex(candidate, run.stage1.sources)
                    ]!.reportingPeriod,
                }),
                reportingPeriod:
                  run.stage1.sources[
                    candidateSourceIndex(candidate, run.stage1.sources)
                  ]!.reportingPeriod,
              },
            }
          : {}),
      }),
      candidate,
      traceConfidence:
        run.stage1.sources[candidateSourceIndex(candidate, run.stage1.sources)]!
          .traceStatus,
    })),
  };
}

function providerFromFailure(
  error: ResearchExecutionError | ResearchValidationError,
): ResearchProviderResult | null {
  if (error instanceof ResearchValidationError) return error.providerResult;
  return null;
}

function validatedStage1FromFailure(
  error: ResearchExecutionError | ResearchValidationError,
): ResearchStage1RunResult | null {
  return error.stage1;
}

export function buildFailedResearchRunDraft(input: {
  task: ResearchTaskV1;
  providerId: string;
  modelId: string;
  error: unknown;
  startedAt: Date;
  completedAt: Date;
  secrets?: readonly string[];
}): ResearchRunPersistenceDraft {
  const error = input.error;
  const typedError =
    error instanceof ResearchExecutionError ||
    error instanceof ResearchValidationError
      ? error
      : null;
  const stage1 = typedError ? validatedStage1FromFailure(typedError) : null;
  const resultProvider = typedError ? providerFromFailure(typedError) : null;
  const failingDiagnostics =
    typedError instanceof ResearchExecutionError
      ? typedError.providerDiagnostics
      : null;
  let stage1Telemetry = stage1
    ? telemetryFromProvider(stage1.provider)
    : resultProvider
      ? telemetryFromProvider(resultProvider)
      : failingDiagnostics
        ? {
            providerId: input.providerId,
            modelId: failingDiagnostics.model ?? input.modelId,
            responseId: failingDiagnostics.providerRequestId,
            status: failingDiagnostics.status,
            inputTokens: failingDiagnostics.usage?.inputTokens ?? null,
            cachedInputTokens:
              failingDiagnostics.usage?.cachedInputTokens ?? null,
            outputTokens: failingDiagnostics.usage?.outputTokens ?? null,
            reasoningTokens: failingDiagnostics.usage?.reasoningTokens ?? null,
            totalTokens: failingDiagnostics.usage?.totalTokens ?? null,
            latencyMs: failingDiagnostics.latencyMs,
            responseDiagnostics:
              failingDiagnostics.responseDiagnostics as unknown as SanitizedResearchValue,
          }
        : null;
  const responseDiagnostics =
    resultProvider?.responseDiagnostics ??
    failingDiagnostics?.responseDiagnostics;
  const phases = responseDiagnostics?.phases;
  stage1Telemetry =
    phaseTelemetry(phases?.find((item) => item.phase === "acquisition")) ??
    stage1Telemetry;
  const stage2Telemetry = phaseTelemetry(
    phases?.find((item) => item.phase === "extraction"),
  );
  const message =
    error instanceof Error
      ? error.message
      : "Unknown research execution failure.";
  const reasons = error instanceof ResearchValidationError ? error.reasons : [];
  const artifactDiagnostics =
    error instanceof ResearchValidationError
      ? error.artifactDiagnostics.map((diagnostic) => ({
          sourceIndex: diagnostic.sourceIndex,
          field: sanitizeResearchDiagnostic(
            diagnostic.field,
            input.secrets,
            80,
          ),
          rejectedValue:
            diagnostic.rejectedValue === null
              ? null
              : sanitizeResearchDiagnostic(
                  diagnostic.rejectedValue,
                  input.secrets,
                  200,
                ),
          failureReason: sanitizeResearchDiagnostic(
            diagnostic.failureReason,
            input.secrets,
            500,
          ),
        }))
      : [];
  const trace =
    stage1?.provider.nativeSearchTrace ??
    resultProvider?.nativeSearchTrace ??
    failingDiagnostics?.nativeSearchTrace ??
    null;
  const sourceCandidates: ResearchCandidateV1[] = [];
  return {
    researchTaskId: input.task.id,
    researchTaskVersion: input.task.version,
    providerId: input.providerId,
    modelId: input.modelId,
    stage1PromptVersion: RESEARCH_STAGE1_PROMPT_VERSION,
    stage2PromptVersion: stage2Telemetry
      ? RESEARCH_EXTRACTION_VERSION
      : RESEARCH_MATERIALIZER_VERSION,
    contractVersion: RESEARCH_CONTRACT_VERSION,
    status: "FAILED",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
    stage1: stage1Telemetry,
    stage2: stage2Telemetry,
    combinedTotalTokens:
      responseDiagnostics?.usageComplete === false
        ? null
        : (failingDiagnostics?.usage?.totalTokens ??
          resultProvider?.usage.totalTokens ??
          stage1Telemetry?.totalTokens ??
          null),
    combinedLatencyMs:
      failingDiagnostics?.latencyMs ??
      resultProvider?.latencyMs ??
      stage1Telemetry?.latencyMs ??
      null,
    stage1Artifact: stage1?.artifact ?? null,
    resultSummary: null,
    researchLimitations: [],
    nativeSearchTrace: trace ? boundedTrace(trace) : null,
    responseDiagnostics: {
      ...responseDiagnostics,
      stage1: stage1Telemetry?.responseDiagnostics ?? null,
      materializer: {
        version: RESEARCH_MATERIALIZER_VERSION,
        status: stage1 ? "failed" : "not_started",
      },
      artifactValidation: {
        status: artifactDiagnostics.length > 0 ? "failed" : "not_applicable",
        issues: artifactDiagnostics,
      },
      stagingContractVersion: RESEARCH_STAGING_CONTRACT_VERSION,
    },
    failureKind: typedError?.code ?? "STAGE1_EXECUTION_FAILURE",
    failureMessage: sanitizeResearchDiagnostic(message, input.secrets, 2_000),
    failureReasons: reasons.map((reason) =>
      sanitizeResearchDiagnostic(reason, input.secrets, 1_000),
    ),
    sources:
      stage1?.sources.map((source, index) =>
        sourceDraft(input.task, source, index, sourceCandidates),
      ) ?? [],
    candidates: [],
  };
}

export function parseResearchReviewDecision(
  value: string,
): ResearchReviewDecision {
  const normalized = value.trim().toLowerCase();
  const mapping: Record<string, ResearchReviewDecision> = {
    "approve-for-investigation": "APPROVED_FOR_INGESTION_INVESTIGATION",
    reject: "REJECTED",
    "already-covered": "ALREADY_COVERED",
    "not-useful": "NOT_USEFUL",
    superseded: "SUPERSEDED",
  };
  const decision = mapping[normalized];
  if (!decision) throw new Error(`Invalid research review decision: ${value}`);
  return decision;
}

export function validateResearchReviewReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) throw new Error("A review reason is required.");
  if (normalized.length > 2_000) {
    throw new Error("Review reason must be at most 2,000 characters.");
  }
  return normalized;
}

export function parseResearchInspectionLimit(
  value: string | undefined,
): number {
  if (value === undefined) return RESEARCH_INSPECTION_LIMIT_DEFAULT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return Math.min(parsed, RESEARCH_INSPECTION_LIMIT_MAXIMUM);
}
