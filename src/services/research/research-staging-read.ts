import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  parseResearchReviewDecision,
  type ResearchInspectFilters,
} from "@/services/research/research-staging-core";

export type ResearchInspection = Awaited<
  ReturnType<typeof getResearchInspection>
>;

function normalizedStatus(status: string | undefined): {
  runStatus?: "RUNNING" | "SUCCEEDED" | "FAILED";
  reviewStatus?:
    "REVIEW_REQUIRED" | ReturnType<typeof parseResearchReviewDecision>;
} {
  if (!status) return {};
  const normalized = status.trim().toUpperCase().replaceAll("-", "_");
  if (
    normalized === "RUNNING" ||
    normalized === "SUCCEEDED" ||
    normalized === "FAILED"
  ) {
    return { runStatus: normalized };
  }
  if (normalized === "REVIEW_REQUIRED") {
    return { reviewStatus: "REVIEW_REQUIRED" };
  }
  return { reviewStatus: parseResearchReviewDecision(status) };
}

export async function getResearchInspection(filters: ResearchInspectFilters) {
  return getResearchInspectionWithPrisma(getPrisma(), filters);
}

export async function getResearchInspectionWithPrisma(
  prisma: PrismaClient,
  filters: ResearchInspectFilters,
) {
  const status = normalizedStatus(filters.status);
  const runWhere: Prisma.ResearchRunWhereInput = {
    ...(filters.taskId ? { researchTaskId: filters.taskId } : {}),
    ...(filters.runId ? { id: filters.runId } : {}),
    ...(status.runStatus ? { status: status.runStatus } : {}),
  };
  const candidateWhere: Prisma.ResearchCandidateWhereInput = {
    ...(filters.taskId ? { researchTaskId: filters.taskId } : {}),
    ...(filters.candidateId ? { id: filters.candidateId } : {}),
    ...(filters.runId
      ? { runOccurrences: { some: { runId: filters.runId } } }
      : {}),
    ...(status.reviewStatus === "REVIEW_REQUIRED"
      ? { reviewEvents: { none: {} } }
      : status.reviewStatus
        ? {
            reviewEvents: {
              some: {
                decision: status.reviewStatus,
                supersededByReviewEvent: { is: null },
              },
            },
          }
        : {}),
  };
  const [runs, candidates] = await Promise.all([
    prisma.researchRun.findMany({
      where: runWhere,
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: filters.limit,
      include: {
        _count: {
          select: { sourceOccurrences: true, candidateOccurrences: true },
        },
      },
    }),
    prisma.researchCandidate.findMany({
      where: candidateWhere,
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      take: filters.limit,
      include: {
        sourceDocument: true,
        reviewEvents: {
          where: { supersededByReviewEvent: { is: null } },
          orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
        _count: { select: { runOccurrences: true, reviewEvents: true } },
      },
    }),
  ]);
  return {
    filters,
    runs,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      currentReviewState:
        candidate.reviewEvents[0]?.decision ?? "REVIEW_REQUIRED",
      currentReviewReason: candidate.reviewEvents[0]?.reason ?? null,
    })),
  };
}

function oneLine(value: string, maximum = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum)}…`;
}

export function formatResearchInspection(
  inspection: ResearchInspection,
): string {
  const lines = ["RESEARCH STAGING", "----------------"];
  lines.push(`Runs: ${inspection.runs.length}`);
  for (const run of inspection.runs) {
    lines.push(
      `${run.id} | ${run.status} | ${run.researchTaskId} | ${run.startedAt.toISOString()} | sources=${run._count.sourceOccurrences} candidates=${run._count.candidateOccurrences}`,
    );
    if (run.failureKind) {
      lines.push(
        `  failure: ${run.failureKind} — ${oneLine(run.failureMessage ?? "unspecified")}`,
      );
    }
  }
  lines.push("", `Candidates: ${inspection.candidates.length}`);
  for (const candidate of inspection.candidates) {
    lines.push(
      `${candidate.id} | ${candidate.validationState} | ${candidate.currentReviewState} | ${candidate.researchTaskId} | ${candidate.traceConfidence}`,
    );
    lines.push(
      `  ${candidate.sourceDocument.publisher}: ${candidate.sourceDocument.title}`,
    );
    lines.push(`  ${candidate.sourceDocument.canonicalUrl}`);
    lines.push(
      `  published=${candidate.sourceDocument.publishedAt?.toISOString() ?? candidate.sourceDocument.publishedAtRaw} reporting=${candidate.sourceDocument.reportingPeriodRaw} retrieved=${candidate.lastSeenAt.toISOString()}`,
    );
    lines.push(`  claim: ${oneLine(candidate.claim)}`);
    lines.push(`  observations: ${JSON.stringify(candidate.observations)}`);
    lines.push(
      `  authority=${candidate.authority} freshness=${candidate.freshness} feasibility=${candidate.ingestionFeasibility} confidence=${candidate.confidence}`,
    );
    lines.push(
      `  first=${candidate.firstSeenAt.toISOString()} last=${candidate.lastSeenAt.toISOString()} occurrences=${candidate.occurrenceCount}`,
    );
  }
  return lines.join("\n");
}
