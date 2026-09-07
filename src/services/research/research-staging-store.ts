import "server-only";

import {
  Prisma,
  type PrismaClient,
  type ResearchTraceConfidence,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type {
  ResearchReviewDecision,
  ResearchRunPersistenceDraft,
} from "@/services/research/research-staging-core";
import { validateResearchReviewReason } from "@/services/research/research-staging-core";

export type PersistedResearchRunResult = {
  runId: string;
  sourceDocumentIds: string[];
  candidateIds: string[];
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const TRACE_STRENGTH: Record<ResearchTraceConfidence, number> = {
  MODEL_REPORTED_ONLY: 0,
  TRACE_ATTEMPTED: 1,
  TRACE_OPENED: 2,
};

function strongestTrace(
  first: ResearchTraceConfidence,
  second: ResearchTraceConfidence,
): ResearchTraceConfidence {
  return TRACE_STRENGTH[first] >= TRACE_STRENGTH[second] ? first : second;
}

function mediationForTrace(
  trace: ResearchTraceConfidence,
): "DIRECTLY_OPENED" | "SEARCH_MEDIATED" | "MODEL_REPORTED" {
  if (trace === "TRACE_OPENED") return "DIRECTLY_OPENED";
  if (trace === "TRACE_ATTEMPTED") return "SEARCH_MEDIATED";
  return "MODEL_REPORTED";
}

function runData(draft: ResearchRunPersistenceDraft) {
  const stage1 = draft.stage1;
  const stage2 = draft.stage2;
  return {
    researchTaskId: draft.researchTaskId,
    researchTaskVersion: draft.researchTaskVersion,
    providerId: draft.providerId,
    modelId: draft.modelId,
    stage1PromptVersion: draft.stage1PromptVersion,
    stage2PromptVersion: draft.stage2PromptVersion,
    contractVersion: draft.contractVersion,
    status: draft.status,
    startedAt: draft.startedAt,
    completedAt: draft.completedAt,
    durationMs: draft.durationMs,
    stage1ResponseId: stage1?.responseId ?? null,
    stage1Status: stage1?.status ?? null,
    stage1InputTokens: stage1?.inputTokens ?? null,
    stage1CachedInputTokens: stage1?.cachedInputTokens ?? null,
    stage1OutputTokens: stage1?.outputTokens ?? null,
    stage1ReasoningTokens: stage1?.reasoningTokens ?? null,
    stage1TotalTokens: stage1?.totalTokens ?? null,
    stage1LatencyMs: stage1?.latencyMs ?? null,
    stage2ResponseId: stage2?.responseId ?? null,
    stage2Status: stage2?.status ?? null,
    stage2InputTokens: stage2?.inputTokens ?? null,
    stage2CachedInputTokens: stage2?.cachedInputTokens ?? null,
    stage2OutputTokens: stage2?.outputTokens ?? null,
    stage2ReasoningTokens: stage2?.reasoningTokens ?? null,
    stage2TotalTokens: stage2?.totalTokens ?? null,
    stage2LatencyMs: stage2?.latencyMs ?? null,
    combinedTotalTokens: draft.combinedTotalTokens,
    combinedLatencyMs: draft.combinedLatencyMs,
    stage1Artifact: draft.stage1Artifact,
    resultSummary: draft.resultSummary,
    researchLimitations: inputJson(draft.researchLimitations),
    ...(draft.nativeSearchTrace
      ? { nativeSearchTrace: inputJson(draft.nativeSearchTrace) }
      : {}),
    responseDiagnostics: inputJson(draft.responseDiagnostics),
    failureKind: draft.failureKind,
    failureMessage: draft.failureMessage,
    failureReasons: inputJson(draft.failureReasons),
  };
}

export async function persistResearchRunDraft(
  prisma: PrismaClient,
  draft: ResearchRunPersistenceDraft,
): Promise<PersistedResearchRunResult> {
  if (draft.status === "FAILED" && draft.candidates.length > 0) {
    throw new Error("Failed research runs cannot persist valid candidates.");
  }
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.researchRun.create({
      data: runData(draft),
      select: { id: true },
    });
    const sourceDocumentIds: string[] = [];
    const sourceIdByIndex = new Map<number, string>();

    for (const source of draft.sources) {
      const existing = await transaction.researchSourceDocument.findUnique({
        where: { sourceFingerprint: source.sourceFingerprint },
        select: {
          id: true,
          firstSeenAt: true,
          lastSeenAt: true,
          traceConfidence: true,
        },
      });
      const strongestSourceTrace = existing
        ? strongestTrace(existing.traceConfidence, source.traceConfidence)
        : source.traceConfidence;
      const sourceDocument = existing
        ? await transaction.researchSourceDocument.update({
            where: { id: existing.id },
            data: {
              researchTaskVersion: draft.researchTaskVersion,
              firstSeenAt:
                existing.firstSeenAt < draft.completedAt
                  ? existing.firstSeenAt
                  : draft.completedAt,
              lastSeenAt:
                existing.lastSeenAt > draft.completedAt
                  ? existing.lastSeenAt
                  : draft.completedAt,
              occurrenceCount: { increment: 1 },
              traceConfidence: strongestSourceTrace,
              evidenceMediation: mediationForTrace(strongestSourceTrace),
            },
            select: { id: true },
          })
        : await transaction.researchSourceDocument.create({
            data: {
              researchTaskId: draft.researchTaskId,
              researchTaskVersion: draft.researchTaskVersion,
              sourceFingerprint: source.sourceFingerprint,
              sourceUrl: source.sourceUrl,
              canonicalUrl: source.canonicalUrl,
              publisher: source.publisher,
              title: source.title,
              publishedAt: source.publishedAt,
              publishedAtRaw: source.publishedAtRaw,
              reportingPeriodStart: source.reportingPeriodStart,
              reportingPeriodEnd: source.reportingPeriodEnd,
              reportingPeriodRaw: source.reportingPeriodRaw,
              sourceRole: source.sourceRole,
              claim: source.claim,
              observation: inputJson(source.observation),
              limitations: inputJson(source.limitations),
              traceConfidence: source.traceConfidence,
              evidenceMediation: source.evidenceMediation,
              firstSeenAt: draft.completedAt,
              lastSeenAt: draft.completedAt,
            },
            select: { id: true },
          });
      sourceDocumentIds.push(sourceDocument.id);
      sourceIdByIndex.set(source.sourceIndex, sourceDocument.id);
      await transaction.researchRunSource.create({
        data: {
          runId: run.id,
          sourceDocumentId: sourceDocument.id,
          sourceIndex: source.sourceIndex,
          traceConfidence: source.traceConfidence,
          evidenceMediation: source.evidenceMediation,
          claimSnapshot: source.claim,
          observationSnapshot: inputJson(source.observation),
          limitationsSnapshot: inputJson(source.limitations),
          retrievedAt: draft.completedAt,
        },
      });
    }

    const candidateIds: string[] = [];
    for (const item of draft.candidates) {
      const sourceDocumentId = sourceIdByIndex.get(item.sourceIndex);
      if (!sourceDocumentId) {
        throw new Error("Candidate source occurrence was not persisted.");
      }
      const existing = await transaction.researchCandidate.findUnique({
        where: { candidateFingerprint: item.candidateFingerprint },
        select: {
          id: true,
          firstSeenAt: true,
          lastSeenAt: true,
          traceConfidence: true,
        },
      });
      const candidate = existing
        ? await transaction.researchCandidate.update({
            where: { id: existing.id },
            data: {
              researchTaskVersion: draft.researchTaskVersion,
              firstSeenAt:
                existing.firstSeenAt < draft.completedAt
                  ? existing.firstSeenAt
                  : draft.completedAt,
              lastSeenAt:
                existing.lastSeenAt > draft.completedAt
                  ? existing.lastSeenAt
                  : draft.completedAt,
              occurrenceCount: { increment: 1 },
              traceConfidence: strongestTrace(
                existing.traceConfidence,
                item.traceConfidence,
              ),
            },
            select: { id: true },
          })
        : await transaction.researchCandidate.create({
            data: {
              sourceDocumentId,
              researchTaskId: draft.researchTaskId,
              researchTaskVersion: draft.researchTaskVersion,
              candidateFingerprint: item.candidateFingerprint,
              candidateType: item.candidate.candidateType,
              geography: item.candidate.scope.geography,
              sector: item.candidate.scope.sector,
              reportingPeriodStart: item.candidate.scope.reportingPeriodStart
                ? new Date(item.candidate.scope.reportingPeriodStart)
                : null,
              reportingPeriodEnd: item.candidate.scope.reportingPeriodEnd
                ? new Date(item.candidate.scope.reportingPeriodEnd)
                : null,
              claim: item.candidate.evidence.claim,
              observations: inputJson(item.candidate.evidence.observations),
              sourceRole: item.candidate.evidence.sourceRole,
              limitations: inputJson(item.candidate.evidence.limitations),
              authority: item.candidate.assessment.authority,
              freshness: item.candidate.assessment.freshness,
              ingestionFeasibility:
                item.candidate.assessment.ingestionFeasibility,
              confidence: item.candidate.assessment.confidence,
              traceConfidence: item.traceConfidence,
              validationState: "VALIDATED",
              firstSeenAt: draft.completedAt,
              lastSeenAt: draft.completedAt,
            },
            select: { id: true },
          });
      candidateIds.push(candidate.id);
      await transaction.researchRunCandidate.create({
        data: {
          runId: run.id,
          candidateId: candidate.id,
          candidateIndex: item.candidateIndex,
          observedAt: draft.completedAt,
        },
      });
    }

    return { runId: run.id, sourceDocumentIds, candidateIds };
  });
}

export async function persistResearchRun(
  draft: ResearchRunPersistenceDraft,
): Promise<PersistedResearchRunResult> {
  return persistResearchRunDraft(getPrisma(), draft);
}

export async function appendResearchCandidateReview(input: {
  candidateId: string;
  decision: ResearchReviewDecision;
  reason: string;
  reviewerId?: string | null;
  reviewedAt?: Date;
}): Promise<{ id: string; supersedesReviewEventId: string | null }> {
  return appendResearchCandidateReviewWithPrisma(getPrisma(), input);
}

export async function appendResearchCandidateReviewWithPrisma(
  prisma: PrismaClient,
  input: {
    candidateId: string;
    decision: ResearchReviewDecision;
    reason: string;
    reviewerId?: string | null;
    reviewedAt?: Date;
  },
): Promise<{ id: string; supersedesReviewEventId: string | null }> {
  const reason = validateResearchReviewReason(input.reason);
  return prisma.$transaction(async (transaction) => {
    const candidate = await transaction.researchCandidate.findUnique({
      where: { id: input.candidateId },
      include: {
        sourceDocument: {
          select: {
            canonicalUrl: true,
            publisher: true,
            title: true,
            publishedAt: true,
            reportingPeriodRaw: true,
            sourceRole: true,
            evidenceMediation: true,
          },
        },
      },
    });
    if (!candidate) throw new Error("Unknown research candidate.");
    const previous = await transaction.researchCandidateReviewEvent.findFirst({
      where: {
        candidateId: candidate.id,
        supersededByReviewEvent: { is: null },
      },
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const review = await transaction.researchCandidateReviewEvent.create({
      data: {
        candidateId: candidate.id,
        supersedesReviewEventId: previous?.id ?? null,
        decision: input.decision,
        reason,
        candidateFingerprint: candidate.candidateFingerprint,
        candidateSnapshot: inputJson({
          candidateType: candidate.candidateType,
          geography: candidate.geography,
          sector: candidate.sector,
          reportingPeriodStart:
            candidate.reportingPeriodStart?.toISOString() ?? null,
          reportingPeriodEnd:
            candidate.reportingPeriodEnd?.toISOString() ?? null,
          claim: candidate.claim,
          observations: candidate.observations,
          sourceRole: candidate.sourceRole,
          limitations: candidate.limitations,
          authority: candidate.authority,
          freshness: candidate.freshness,
          ingestionFeasibility: candidate.ingestionFeasibility,
          confidence: candidate.confidence,
          traceConfidence: candidate.traceConfidence,
          source: {
            ...candidate.sourceDocument,
            publishedAt:
              candidate.sourceDocument.publishedAt?.toISOString() ?? null,
          },
        }),
        reviewerId: input.reviewerId?.trim() || null,
        reviewedAt: input.reviewedAt ?? new Date(),
      },
      select: { id: true, supersedesReviewEventId: true },
    });
    return review;
  });
}
