import { readFile } from "node:fs/promises";

import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadResearchSchedulerDecision,
  runScheduledResearch,
  type ResearchSchedulerHistoryStore,
} from "@/services/research/research-scheduler";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  ResearchProvider,
  ResearchProviderResult,
  ResearchRunResult,
} from "@/services/research/research-types";

const NOW = new Date("2026-09-07T00:00:00Z");

function historyStore(input?: {
  rollingRunCount?: number;
  completedAt?: string;
  status?: "SUCCEEDED" | "FAILED";
}): ResearchSchedulerHistoryStore {
  return {
    loadHistory: vi.fn().mockResolvedValue({
      rollingRunCount: input?.rollingRunCount ?? 0,
      runs: input?.completedAt
        ? [
            {
              researchTaskId: "au-live-music-venue-viability",
              researchTaskVersion: "au-live-music-venue-viability-v1",
              status: input.status ?? "SUCCEEDED",
              startedAt: new Date(
                new Date(input.completedAt).getTime() - 1_000,
              ),
              completedAt: new Date(input.completedAt),
            },
          ]
        : [],
    }),
  };
}

function providerResult(stage: 1 | 2): ResearchProviderResult {
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

function successfulRun(): ResearchRunResult {
  return {
    task: getResearchTask("au-live-music-venue-viability"),
    result: {
      taskSummary: "Found one source.",
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
            claim: "The report counted 100 venues.",
            observations: [
              {
                metric: "venue count",
                value: "100",
                unit: "venues",
                periodStart: "2025-01-01",
                periodEnd: "2025-12-31",
              },
            ],
            sourceRole: "PRIMARY",
            limitations: ["Bounded coverage."],
          },
          assessment: {
            authority: "HIGH",
            freshness: "COMPLEMENTARY",
            ingestionFeasibility: "MODERATE",
            confidence: "HIGH",
          },
        },
      ],
      researchLimitations: ["Bounded pass."],
    },
    stage1: {
      artifact: "RESEARCH_SUMMARY\nFound one source.",
      sources: [
        {
          url: "https://example.gov.au/report",
          publisher: "Example Department",
          title: "Venue report",
          publishedAt: "2026-08-30",
          reportingPeriod: "2025",
          sourceRole: "PRIMARY",
          claim: "The report counted 100 venues.",
          observation: "venue count / 100 / venues / 2025",
          limitations: "Bounded coverage.",
          rawBlock: "fixture",
          traceStatus: "TRACE_OPENED",
        },
      ],
      provider: providerResult(1),
    },
    stage2: { provider: providerResult(2) },
    startedAt: NOW,
    completedAt: new Date(NOW.getTime() + 200),
    crossStageValidation: { matchedCandidates: 1, reasons: [] },
    usage: { totalTokens: 30, totalLatencyMs: 200 },
  };
}

const unusedProvider: ResearchProvider = {
  researchWithNativeWeb: vi.fn(),
  structureResearch: vi.fn(),
};

function prisma(): PrismaClient {
  return {} as PrismaClient;
}

describe("scheduled research execution", () => {
  it("does not execute or persist while disabled", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const result = await runScheduledResearch({
      prisma: prisma(),
      historyStore: historyStore(),
      enabled: false,
      apiKey: "configured",
      now: NOW,
      executeResearch,
      persistDraft,
    });
    expect(result).toMatchObject({ status: "SKIPPED", skipReason: "DISABLED" });
    expect(executeResearch).not.toHaveBeenCalled();
    expect(persistDraft).not.toHaveBeenCalled();
  });

  it("executes one due task through the existing research runner and persists validated candidates", async () => {
    const executeResearch = vi.fn().mockResolvedValue(successfulRun());
    const persistDraft = vi.fn().mockResolvedValue({
      runId: "run-1",
      sourceDocumentIds: ["source-1"],
      candidateIds: ["candidate-1"],
    });
    const providerFactory = vi.fn().mockReturnValue(unusedProvider);
    const result = await runScheduledResearch({
      prisma: prisma(),
      historyStore: historyStore(),
      enabled: true,
      apiKey: "configured",
      now: NOW,
      executeResearch,
      persistDraft,
      providerFactory,
    });
    expect(result.status).toBe("EXECUTED");
    expect(executeResearch).toHaveBeenCalledTimes(1);
    expect(executeResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "au-live-music-venue-viability",
        provider: unusedProvider,
      }),
    );
    expect(persistDraft).toHaveBeenCalledTimes(1);
    expect(persistDraft.mock.calls[0]?.[1]).toMatchObject({
      status: "SUCCEEDED",
      candidates: [expect.objectContaining({ candidateIndex: 0 })],
    });
  });

  it("skips safely at the rolling execution ceiling", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const result = await runScheduledResearch({
      prisma: prisma(),
      historyStore: historyStore({ rollingRunCount: 2 }),
      enabled: true,
      apiKey: "configured",
      now: NOW,
      executeResearch,
      persistDraft,
    });
    expect(result.skipReason).toBe("ROLLING_EXECUTION_LIMIT");
    expect(executeResearch).not.toHaveBeenCalled();
    expect(persistDraft).not.toHaveBeenCalled();
  });

  it("does not create a false research run for missing-key preflight", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    await expect(
      runScheduledResearch({
        prisma: prisma(),
        historyStore: historyStore(),
        enabled: true,
        now: NOW,
        executeResearch,
        persistDraft,
      }),
    ).rejects.toThrow("DEEPSEEK_API_KEY is missing");
    expect(executeResearch).not.toHaveBeenCalled();
    expect(persistDraft).not.toHaveBeenCalled();
  });

  it("persists a safe failed run and never creates a validated candidate", async () => {
    const executeResearch = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));
    const persistDraft = vi.fn().mockResolvedValue({
      runId: "failed-run",
      sourceDocumentIds: [],
      candidateIds: [],
    });
    await expect(
      runScheduledResearch({
        prisma: prisma(),
        historyStore: historyStore(),
        enabled: true,
        apiKey: "configured",
        now: NOW,
        executeResearch,
        persistDraft,
        providerFactory: () => unusedProvider,
      }),
    ).rejects.toThrow("failure run failed-run was staged");
    expect(persistDraft.mock.calls[0]?.[1]).toMatchObject({
      status: "FAILED",
      candidates: [],
    });
  });

  it("does not execute when the task cadence is not due", async () => {
    const executeResearch = vi.fn();
    const result = await runScheduledResearch({
      prisma: prisma(),
      historyStore: historyStore({ completedAt: "2026-09-06T12:00:00Z" }),
      enabled: true,
      apiKey: "configured",
      now: NOW,
      executeResearch,
      persistDraft: vi.fn(),
    });
    expect(result.skipReason).toBe("NO_TASK_DUE");
    expect(executeResearch).not.toHaveBeenCalled();
  });

  it("exposes due task, next due, rolling count, and skip reason for inspection", async () => {
    const decision = await loadResearchSchedulerDecision({
      historyStore: historyStore({
        completedAt: "2026-09-06T12:00:00Z",
        status: "FAILED",
      }),
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
    });
    expect(decision).toMatchObject({
      taskCount: 1,
      rollingRunCount: 0,
      skipReason: "NO_TASK_DUE",
      lastRun: { status: "FAILED" },
    });
    expect(decision.nextDueAt?.toISOString()).toBe("2026-09-07T12:00:00.000Z");
  });

  it("has no canonical ingestion, review, external search, or startup dependency", async () => {
    const source = await readFile(
      new URL("./research-scheduler.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/MetricObservation|MediaArticle|IndustryEvent/);
    expect(source).not.toMatch(/appendResearchCandidateReview|research:review/);
    expect(source).not.toMatch(/Brave|Tavily|SerpAPI|Bing|Google Search/i);
    expect(source).not.toMatch(/npm run dev|next build|postinstall/);
  });
});
