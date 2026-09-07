import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseResearchInspectOptions } from "@/services/research/research-cli-core";
import {
  formatResearchInspection,
  getResearchInspectionWithPrisma,
} from "@/services/research/research-staging-read";

function fakePrisma(options?: { reviewDecision?: string }) {
  const runFindMany = vi.fn().mockResolvedValue([
    {
      id: "run-1",
      status: "SUCCEEDED",
      researchTaskId: "au-live-music-venue-viability",
      startedAt: new Date("2026-09-04T00:00:00Z"),
      createdAt: new Date("2026-09-04T00:00:00Z"),
      failureKind: null,
      failureMessage: null,
      _count: { sourceOccurrences: 1, candidateOccurrences: 1 },
    },
  ]);
  const candidateFindMany = vi.fn().mockResolvedValue([
    {
      id: "candidate-1",
      researchTaskId: "au-live-music-venue-viability",
      traceConfidence: "TRACE_ATTEMPTED",
      claim: "A venue count was reported.",
      observations: [{ metric: "venues", value: "100", unit: "count" }],
      authority: "HIGH",
      freshness: "COMPLEMENTARY",
      ingestionFeasibility: "MODERATE",
      confidence: "MEDIUM",
      firstSeenAt: new Date("2026-09-04T00:00:00Z"),
      lastSeenAt: new Date("2026-09-04T00:00:00Z"),
      occurrenceCount: 1,
      createdAt: new Date("2026-09-04T00:00:00Z"),
      sourceDocument: {
        publisher: "Example Department",
        title: "Venue report",
        canonicalUrl: "https://example.gov.au/report",
        publishedAt: new Date("2026-08-30T00:00:00Z"),
        publishedAtRaw: "2026-08-30",
        reportingPeriodRaw: "2025",
      },
      reviewEvents: options?.reviewDecision
        ? [{ decision: options.reviewDecision, reason: "Reviewed." }]
        : [],
      _count: { runOccurrences: 1, reviewEvents: 0 },
    },
  ]);
  return {
    prisma: {
      researchRun: { findMany: runFindMany },
      researchCandidate: { findMany: candidateFindMany },
    } as unknown as PrismaClient,
    runFindMany,
    candidateFindMany,
  };
}

describe("research staging inspection", () => {
  it("parses all bounded inspection filters", () => {
    expect(
      parseResearchInspectOptions([
        "--task=au-live-music-venue-viability",
        "--status=review-required",
        "--candidate=candidate-1",
        "--run=run-1",
        "--limit=5",
      ]),
    ).toEqual({
      taskId: "au-live-music-venue-viability",
      status: "review-required",
      candidateId: "candidate-1",
      runId: "run-1",
      limit: 5,
    });
  });

  it("derives REVIEW_REQUIRED when no review ledger event exists", async () => {
    const fake = fakePrisma();
    const result = await getResearchInspectionWithPrisma(fake.prisma, {
      limit: 20,
    });
    expect(result.candidates[0]?.currentReviewState).toBe("REVIEW_REQUIRED");
  });

  it("derives the effective state from the current append-only review event", async () => {
    const fake = fakePrisma({ reviewDecision: "REJECTED" });
    const result = await getResearchInspectionWithPrisma(fake.prisma, {
      limit: 20,
    });
    expect(result.candidates[0]?.currentReviewState).toBe("REJECTED");
    expect(result.candidates[0]?.currentReviewReason).toBe("Reviewed.");
  });

  it("applies task, run, candidate, status, and limit filters to bounded queries", async () => {
    const fake = fakePrisma();
    await getResearchInspectionWithPrisma(fake.prisma, {
      taskId: "au-live-music-venue-viability",
      runId: "run-1",
      candidateId: "candidate-1",
      status: "review-required",
      limit: 5,
    });
    expect(fake.runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    expect(fake.candidateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    const candidateQuery = fake.candidateFindMany.mock.calls[0]?.[0];
    expect(candidateQuery.where).toMatchObject({
      researchTaskId: "au-live-music-venue-viability",
      id: "candidate-1",
      runOccurrences: { some: { runId: "run-1" } },
      reviewEvents: { none: {} },
    });
  });

  it("formats compact dates, provenance, observations, and review state", async () => {
    const fake = fakePrisma({
      reviewDecision: "APPROVED_FOR_INGESTION_INVESTIGATION",
    });
    const result = await getResearchInspectionWithPrisma(fake.prisma, {
      limit: 20,
    });
    const output = formatResearchInspection(result);
    expect(output).toContain("candidate-1");
    expect(output).toContain("APPROVED_FOR_INGESTION_INVESTIGATION");
    expect(output).toContain("reporting=2025");
    expect(output).toContain("TRACE_ATTEMPTED");
  });

  it("rejects unknown inspection status values", async () => {
    const fake = fakePrisma();
    await expect(
      getResearchInspectionWithPrisma(fake.prisma, {
        status: "canonical",
        limit: 20,
      }),
    ).rejects.toThrow("Invalid research review decision");
  });
});
