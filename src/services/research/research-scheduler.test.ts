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
  const rollingRunCount = input?.rollingRunCount ?? 0;
  const rollingRuns = Array.from({ length: rollingRunCount }, (_, index) => ({
    id: `rolling-run-${index + 1}`,
    researchTaskId: "au-live-music-venue-viability",
    researchTaskVersion: "au-live-music-venue-viability-v1",
    status: "FAILED" as const,
    startedAt: new Date(NOW.getTime() - (index + 1) * 2_000),
    completedAt: new Date(NOW.getTime() - (index + 1) * 1_000),
  }));
  return {
    loadHistory: vi.fn().mockResolvedValue({
      rollingRunCount,
      rollingRuns,
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

function providerResult(stage: 1): ResearchProviderResult {
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
          geography: "Australia",
          sourceRole: "PRIMARY",
          claim: "The report counted 100 venues.",
          observation: "venue count / 100 / venues / 2025",
          observations: [
            {
              metric: "venue count",
              value: "100",
              unit: "venues",
              qualifier: "NONE",
            },
          ],
          limitations: "Bounded coverage.",
          rawBlock: "fixture",
          traceStatus: "TRACE_OPENED",
        },
      ],
      summary: "Found one source.",
      researchLimitations: ["Bounded pass."],
      provider: providerResult(1),
    },
    startedAt: NOW,
    completedAt: new Date(NOW.getTime() + 200),
    provenanceValidation: { matchedCandidates: 1, reasons: [] },
    usage: { totalTokens: 15, totalLatencyMs: 100 },
  };
}

const unusedProvider: ResearchProvider = {
  researchWithNativeWeb: vi.fn(),
};

function prisma(): PrismaClient {
  return {} as PrismaClient;
}

describe("scheduled research execution", () => {
  it("does not execute or persist while disabled", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const result = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
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

  it("does not dispatch when durable attempt reservation fails", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    await expect(
      runScheduledResearch({
        reserveRun: async () => {
          throw new Error("reservation unavailable");
        },
        prisma: prisma(),
        historyStore: historyStore(),
        enabled: true,
        apiKey: "configured",
        now: NOW,
        executeResearch,
        persistDraft,
        providerFactory: () => unusedProvider,
      }),
    ).rejects.toThrow("reservation unavailable");
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
      reserveRun: async () => "reserved-test-run",
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
      runId: "reserved-test-run",
      candidates: [expect.objectContaining({ candidateIndex: 0 })],
    });
  });

  it("skips safely at the rolling execution ceiling", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const result = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
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
        reserveRun: async () => "reserved-test-run",
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
        reserveRun: async () => "reserved-test-run",
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
      reserveRun: async () => "reserved-test-run",
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

  it("executes one task when an operator explicitly forces cadence", async () => {
    const executeResearch = vi.fn().mockResolvedValue(successfulRun());
    const persistDraft = vi.fn().mockResolvedValue({
      runId: "forced-run",
      sourceDocumentIds: ["source-1"],
      candidateIds: ["candidate-1"],
    });
    const onCadenceOverride = vi.fn();
    const store = historyStore({ completedAt: "2026-09-06T12:00:00Z" });
    const result = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
      prisma: prisma(),
      historyStore: store,
      enabled: true,
      apiKey: "configured",
      now: NOW,
      forceTaskCadence: true,
      onCadenceOverride,
      executeResearch,
      persistDraft,
      providerFactory: () => unusedProvider,
    });
    expect(result).toMatchObject({
      status: "EXECUTED",
      cadenceBypassed: true,
      taskId: "au-live-music-venue-viability",
    });
    expect(executeResearch).toHaveBeenCalledTimes(1);
    expect(persistDraft).toHaveBeenCalledTimes(1);
    expect(onCadenceOverride).toHaveBeenCalledWith(
      expect.stringContaining("bypassed cadence only"),
    );
    expect(store.loadHistory).toHaveBeenCalledTimes(1);
  });

  it("does not force through disabled, missing-key, or rolling-limit gates", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const disabled = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
      prisma: prisma(),
      historyStore: historyStore({ completedAt: "2026-09-06T12:00:00Z" }),
      enabled: false,
      apiKey: "configured",
      now: NOW,
      forceTaskCadence: true,
      executeResearch,
      persistDraft,
    });
    expect(disabled.skipReason).toBe("DISABLED");
    await expect(
      runScheduledResearch({
        reserveRun: async () => "reserved-test-run",
        prisma: prisma(),
        historyStore: historyStore({ completedAt: "2026-09-06T12:00:00Z" }),
        enabled: true,
        now: NOW,
        forceTaskCadence: true,
        executeResearch,
        persistDraft,
      }),
    ).rejects.toThrow("DEEPSEEK_API_KEY is missing");
    const limited = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
      prisma: prisma(),
      historyStore: historyStore({
        completedAt: "2026-09-06T12:00:00Z",
        rollingRunCount: 2,
      }),
      enabled: true,
      apiKey: "configured",
      now: NOW,
      forceTaskCadence: true,
      executeResearch,
      persistDraft,
    });
    expect(limited.skipReason).toBe("ROLLING_EXECUTION_LIMIT");
    expect(executeResearch).not.toHaveBeenCalled();
    expect(persistDraft).not.toHaveBeenCalled();
  });

  it("executes once above the rolling ceiling only with the explicit override", async () => {
    const executeResearch = vi.fn().mockResolvedValue(successfulRun());
    const persistDraft = vi.fn().mockResolvedValue({
      runId: "rolling-forced-run",
      sourceDocumentIds: ["source-1"],
      candidateIds: ["candidate-1"],
    });
    const onRollingLimitOverride = vi.fn();
    const store = historyStore({
      completedAt: "2026-09-06T23:00:00Z",
      rollingRunCount: 2,
      status: "FAILED",
    });
    const result = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
      prisma: prisma(),
      historyStore: store,
      enabled: true,
      apiKey: "configured",
      now: NOW,
      forceTaskCadence: true,
      forceRollingLimit: true,
      onRollingLimitOverride,
      executeResearch,
      persistDraft,
      providerFactory: () => unusedProvider,
    });
    expect(result).toMatchObject({
      status: "EXECUTED",
      cadenceBypassed: true,
      rollingLimitBypassed: true,
    });
    expect(executeResearch).toHaveBeenCalledTimes(1);
    expect(persistDraft).toHaveBeenCalledTimes(1);
    expect(onRollingLimitOverride).toHaveBeenCalledWith(
      expect.stringContaining("observed rolling executions 2/2"),
    );
    expect(onRollingLimitOverride).toHaveBeenCalledWith(
      expect.stringContaining("rolling-run-1"),
    );
    expect(onRollingLimitOverride).toHaveBeenCalledWith(
      expect.stringContaining("bypassed only the rolling ceiling"),
    );
    expect(store.loadHistory).toHaveBeenCalledTimes(1);
  });

  it("does not let the rolling override bypass disabled or missing-key preflight", async () => {
    const executeResearch = vi.fn();
    const persistDraft = vi.fn();
    const disabled = await runScheduledResearch({
      reserveRun: async () => "reserved-test-run",
      prisma: prisma(),
      historyStore: historyStore({ rollingRunCount: 2 }),
      enabled: false,
      apiKey: "configured",
      now: NOW,
      forceTaskCadence: true,
      forceRollingLimit: true,
      executeResearch,
      persistDraft,
    });
    expect(disabled.skipReason).toBe("DISABLED");
    await expect(
      runScheduledResearch({
        reserveRun: async () => "reserved-test-run",
        prisma: prisma(),
        historyStore: historyStore({ rollingRunCount: 2 }),
        enabled: true,
        now: NOW,
        forceTaskCadence: true,
        forceRollingLimit: true,
        executeResearch,
        persistDraft,
      }),
    ).rejects.toThrow("DEEPSEEK_API_KEY is missing");
    expect(executeResearch).not.toHaveBeenCalled();
    expect(persistDraft).not.toHaveBeenCalled();
  });

  it("keeps normal post-run due semantics unchanged after a forced execution", async () => {
    const decision = await loadResearchSchedulerDecision({
      historyStore: historyStore({ completedAt: NOW.toISOString() }),
      enabled: true,
      apiKeyConfigured: true,
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(decision.skipReason).toBe("NO_TASK_DUE");
    expect(decision.cadenceBypassed).toBe(false);
    expect(decision.nextDueAt?.toISOString()).toBe("2026-09-08T00:00:00.000Z");
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
