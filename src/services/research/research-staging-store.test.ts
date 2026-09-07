import { readFile } from "node:fs/promises";

import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildSuccessfulResearchRunDraft,
  type ResearchRunPersistenceDraft,
} from "@/services/research/research-staging-core";
import {
  appendResearchCandidateReviewWithPrisma,
  persistResearchRunDraft,
} from "@/services/research/research-staging-store";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  ResearchProviderResult,
  ResearchRunResult,
} from "@/services/research/research-types";

type Row = Record<string, unknown> & { id: string };

class InMemoryResearchPrisma {
  runs: Row[] = [];
  sources = new Map<string, Row>();
  candidates = new Map<string, Row>();
  runSources: Row[] = [];
  runCandidates: Row[] = [];
  reviews: Row[] = [];

  $transaction = async <Result>(
    callback: (transaction: InMemoryResearchPrisma) => Promise<Result>,
  ) => callback(this);

  researchRun = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `run-${this.runs.length + 1}`, ...data };
      this.runs.push(row);
      return { id: row.id };
    },
  };

  researchSourceDocument = {
    findUnique: async ({ where }: { where: { sourceFingerprint: string } }) => {
      const row = this.sources.get(where.sourceFingerprint);
      return row
        ? {
            id: row.id,
            firstSeenAt: row.firstSeenAt,
            lastSeenAt: row.lastSeenAt,
            traceConfidence: row.traceConfidence,
          }
        : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `source-${this.sources.size + 1}`,
        occurrenceCount: 1,
        ...data,
      };
      this.sources.set(String(data.sourceFingerprint), row);
      return { id: row.id };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const entry = [...this.sources.entries()].find(
        ([, row]) => row.id === where.id,
      );
      if (!entry) throw new Error("source missing");
      const [fingerprint, row] = entry;
      const increment = data.occurrenceCount as { increment?: number };
      Object.assign(row, data, {
        occurrenceCount:
          Number(row.occurrenceCount ?? 0) + Number(increment.increment ?? 0),
      });
      this.sources.set(fingerprint, row);
      return { id: row.id };
    },
  };

  researchRunSource = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `run-source-${this.runSources.length + 1}`, ...data };
      this.runSources.push(row);
      return row;
    },
  };

  researchCandidate = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { candidateFingerprint?: string; id?: string };
      include?: unknown;
    }) => {
      const row = where.candidateFingerprint
        ? this.candidates.get(where.candidateFingerprint)
        : [...this.candidates.values()].find((item) => item.id === where.id);
      if (!row) return null;
      if (include) {
        const source = [...this.sources.values()].find(
          (item) => item.id === row.sourceDocumentId,
        );
        return { ...row, sourceDocument: source };
      }
      return {
        id: row.id,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        traceConfidence: row.traceConfidence,
      };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `candidate-${this.candidates.size + 1}`,
        occurrenceCount: 1,
        ...data,
      };
      this.candidates.set(String(data.candidateFingerprint), row);
      return { id: row.id };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const entry = [...this.candidates.entries()].find(
        ([, row]) => row.id === where.id,
      );
      if (!entry) throw new Error("candidate missing");
      const [fingerprint, row] = entry;
      const increment = data.occurrenceCount as { increment?: number };
      Object.assign(row, data, {
        occurrenceCount:
          Number(row.occurrenceCount ?? 0) + Number(increment.increment ?? 0),
      });
      this.candidates.set(fingerprint, row);
      return { id: row.id };
    },
  };

  researchRunCandidate = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `run-candidate-${this.runCandidates.length + 1}`,
        ...data,
      };
      this.runCandidates.push(row);
      return row;
    },
  };

  researchCandidateReviewEvent = {
    findFirst: async ({ where }: { where: { candidateId: string } }) => {
      const candidateReviews = this.reviews.filter(
        (review) => review.candidateId === where.candidateId,
      );
      const superseded = new Set(
        candidateReviews.map((review) => review.supersedesReviewEventId),
      );
      const current = candidateReviews.find(
        (review) => !superseded.has(review.id),
      );
      return current ? { id: current.id } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `review-${this.reviews.length + 1}`, ...data };
      this.reviews.push(row);
      return {
        id: row.id,
        supersedesReviewEventId:
          (data.supersedesReviewEventId as string | null) ?? null,
      };
    },
  };
}

function provider(stage: 1 | 2): ResearchProviderResult {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: `response-${stage}`,
    status: "completed",
    outputText: stage === 1 ? "artifact" : "{}",
    nativeSearchTrace: {
      calls:
        stage === 1
          ? [
              {
                sequence: 0,
                item: {
                  id: "call-1",
                  type: "web_search_call",
                  status: "completed",
                  action: {
                    type: "open_page",
                    url: "https://example.gov.au/report",
                  },
                },
              },
            ]
          : [],
      annotations: [],
    },
    responseDiagnostics: {
      responseId: `response-${stage}`,
      responseStatus: "completed",
      outputItemCount: 1,
      outputItemTypes: ["message"],
      messageItems: [],
      incompleteDetails: null,
      error: null,
    },
    usage: {
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 5,
      reasoningTokens: 1,
      totalTokens: 15,
    },
    latencyMs: 100,
  };
}

function run(value = "1,000", completedAt = "2026-09-04T00:00:01Z") {
  const task = getResearchTask("au-live-music-venue-viability");
  return {
    task,
    result: {
      taskSummary: "Found evidence.",
      candidates: [
        {
          candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
          source: {
            url: "https://example.gov.au/report",
            publisher: "Example Department",
            title: "Venue report",
            publishedAt: "2026-08-30",
          },
          scope: {
            geography: "Australia",
            sector: "Music",
            reportingPeriodStart: "2025-01-01",
            reportingPeriodEnd: "2025-12-31",
          },
          evidence: {
            claim: `The report recorded ${value} performances.`,
            observations: [
              {
                metric: "venue performances",
                value,
                unit: "performances",
                periodStart: "2025-01-01",
                periodEnd: "2025-12-31",
              },
            ],
            sourceRole: "PRIMARY",
            limitations: ["Bounded source coverage."],
          },
          assessment: {
            authority: "HIGH",
            freshness: "NEWER_THAN_EXISTING",
            ingestionFeasibility: "MODERATE",
            confidence: "HIGH",
          },
        },
      ],
      researchLimitations: ["Bounded pass."],
    },
    stage1: {
      artifact: "RESEARCH_SUMMARY\nFound evidence.",
      sources: [
        {
          url: "https://example.gov.au/report",
          publisher: "Example Department",
          title: "Venue report",
          publishedAt: "2026-08-30",
          reportingPeriod: "2025",
          sourceRole: "PRIMARY",
          claim: `The report recorded ${value} performances.`,
          observation: `performances / ${value} / count / 2025`,
          limitations: "Bounded source coverage.",
          rawBlock: "fixture",
          traceStatus: "TRACE_OPENED",
        },
      ],
      provider: provider(1),
    },
    stage2: { provider: provider(2) },
    startedAt: new Date("2026-09-04T00:00:00Z"),
    completedAt: new Date(completedAt),
    crossStageValidation: { matchedCandidates: 1, reasons: [] },
    usage: { totalTokens: 30, totalLatencyMs: 200 },
  } satisfies ResearchRunResult;
}

function prisma(fake: InMemoryResearchPrisma): PrismaClient {
  return fake as unknown as PrismaClient;
}

describe("research staging store", () => {
  it("persists a successful run, source, candidate, and occurrence links", async () => {
    const fake = new InMemoryResearchPrisma();
    const result = await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run()),
    );
    expect(result.runId).toBe("run-1");
    expect(fake.runs).toHaveLength(1);
    expect(fake.sources).toHaveLength(1);
    expect(fake.candidates).toHaveLength(1);
    expect(fake.runSources).toHaveLength(1);
    expect(fake.runCandidates).toHaveLength(1);
  });

  it("deduplicates rediscovered sources and candidates while preserving both run occurrences", async () => {
    const fake = new InMemoryResearchPrisma();
    await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run()),
    );
    await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run("1,000", "2026-09-05T00:00:01Z")),
    );
    expect(fake.runs).toHaveLength(2);
    expect(fake.sources).toHaveLength(1);
    expect(fake.candidates).toHaveLength(1);
    expect(fake.runSources).toHaveLength(2);
    expect(fake.runCandidates).toHaveLength(2);
    expect([...fake.sources.values()][0]?.occurrenceCount).toBe(2);
    expect([...fake.candidates.values()][0]?.occurrenceCount).toBe(2);
    expect(
      ([...fake.candidates.values()][0]?.lastSeenAt as Date).toISOString(),
    ).toBe("2026-09-05T00:00:01.000Z");
  });

  it("creates a distinct candidate when the numeric value changes", async () => {
    const fake = new InMemoryResearchPrisma();
    await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run()),
    );
    await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run("1,100")),
    );
    expect(fake.sources).toHaveLength(1);
    expect(fake.candidates).toHaveLength(2);
  });

  it("persists failed runs without valid candidates", async () => {
    const fake = new InMemoryResearchPrisma();
    const draft: ResearchRunPersistenceDraft = {
      ...buildSuccessfulResearchRunDraft(run()),
      status: "FAILED",
      failureKind: "STAGE2_SCHEMA_FAILURE",
      failureMessage: "Invalid response.",
      candidates: [],
    };
    await persistResearchRunDraft(prisma(fake), draft);
    expect(fake.runs[0]?.status).toBe("FAILED");
    expect(fake.candidates).toHaveLength(0);
  });

  it("refuses candidate persistence on failed runs", async () => {
    const fake = new InMemoryResearchPrisma();
    const draft = buildSuccessfulResearchRunDraft(run());
    await expect(
      persistResearchRunDraft(prisma(fake), { ...draft, status: "FAILED" }),
    ).rejects.toThrow("Failed research runs cannot persist valid candidates");
  });

  it("preserves trace confidence on source and candidate records", async () => {
    const fake = new InMemoryResearchPrisma();
    await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run()),
    );
    expect([...fake.sources.values()][0]?.traceConfidence).toBe("TRACE_OPENED");
    expect([...fake.candidates.values()][0]?.traceConfidence).toBe(
      "TRACE_OPENED",
    );
  });

  it("appends review events and links supersession without mutating candidate evidence", async () => {
    const fake = new InMemoryResearchPrisma();
    const persisted = await persistResearchRunDraft(
      prisma(fake),
      buildSuccessfulResearchRunDraft(run()),
    );
    const originalClaim = [...fake.candidates.values()][0]?.claim;
    const first = await appendResearchCandidateReviewWithPrisma(prisma(fake), {
      candidateId: persisted.candidateIds[0]!,
      decision: "APPROVED_FOR_INGESTION_INVESTIGATION",
      reason: "Primary source merits adapter investigation.",
      reviewedAt: new Date("2026-09-04T01:00:00Z"),
    });
    const second = await appendResearchCandidateReviewWithPrisma(prisma(fake), {
      candidateId: persisted.candidateIds[0]!,
      decision: "REJECTED",
      reason: "The source was later found to be duplicative.",
      reviewedAt: new Date("2026-09-04T02:00:00Z"),
    });
    expect(fake.reviews).toHaveLength(2);
    expect(first.supersedesReviewEventId).toBeNull();
    expect(second.supersedesReviewEventId).toBe(first.id);
    expect([...fake.candidates.values()][0]?.claim).toBe(originalClaim);
  });

  it("fails review for an unknown candidate", async () => {
    const fake = new InMemoryResearchPrisma();
    await expect(
      appendResearchCandidateReviewWithPrisma(prisma(fake), {
        candidateId: "missing",
        decision: "REJECTED",
        reason: "Not found.",
      }),
    ).rejects.toThrow("Unknown research candidate");
  });

  it("contains no canonical write or scheduler dependency", async () => {
    const source = await readFile(
      new URL("./research-staging-store.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/MetricObservation|MediaArticle|IndustryEvent/);
    expect(source).not.toMatch(/LunaStorySynthesis|scheduler/i);
  });
});
