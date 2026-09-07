import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildResearchStructuringInput,
  buildResearchTaskInput,
  ResearchExecutionError,
  RESEARCH_STAGE1_INSTRUCTIONS,
  RESEARCH_STAGE2_INSTRUCTIONS,
  ResearchValidationError,
  runResearchOnce,
} from "@/services/research/research-runner";
import { canonicalizeResearchUrl } from "@/services/research/research-provenance";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  ResearchProvider,
  ResearchProviderResult,
} from "@/services/research/research-types";

const stage1Artifact = `RESEARCH_SUMMARY
One useful primary source was found.

SOURCE
URL: https://example.gov.au/report
PUBLISHER: Example Department
TITLE: Australian live-music venue report
PUBLISHED_AT: 2026-08-30
REPORTING_PERIOD: 2025
SOURCE_ROLE: PRIMARY
CLAIM: The report recorded 1,000 venue performances during 2025.
OBSERVATION: Venue performances / 1,000 / performances / 2025
LIMITATIONS: Coverage depends on participating venues.

RESEARCH_LIMITATIONS
The native-web search was deliberately bounded.`;

function providerResult(
  outputText: string,
  options?: { nativeSearch?: boolean; requestId?: string },
): ResearchProviderResult {
  const nativeSearch = options?.nativeSearch ?? false;
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: options?.requestId ?? "resp_test",
    status: "completed",
    outputText,
    nativeSearchTrace: {
      calls: nativeSearch
        ? [
            {
              sequence: 0,
              item: {
                type: "web_search_call",
                id: "ws_test",
                action: { type: "search", query: "Australian live music" },
              },
            },
          ]
        : [],
      annotations: [],
    },
    responseDiagnostics: {
      responseId: options?.requestId ?? "resp_test",
      responseStatus: "completed",
      outputItemCount: nativeSearch ? 2 : 1,
      outputItemTypes: nativeSearch
        ? ["web_search_call", "message"]
        : ["message"],
      messageItems: [
        {
          sequence: nativeSearch ? 1 : 0,
          id: "message_test",
          status: "completed",
          contentTypes: ["output_text"],
          outputTextPresent: true,
          annotationCount: 0,
        },
      ],
      incompleteDetails: null,
      error: null,
    },
    usage: {
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 50,
      reasoningTokens: 10,
      totalTokens: 150,
    },
    latencyMs: 500,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
    source: {
      url: "https://example.gov.au/report",
      publisher: "Example Department",
      title: "Australian live-music venue report",
      publishedAt: "2026-08-30",
    },
    scope: {
      geography: "Australia",
      sector: "Music",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
    },
    evidence: {
      claim: "The report recorded venue performances during 2025.",
      observations: [
        {
          metric: "Venue performances",
          value: "1,000",
          unit: "performances",
          periodStart: null,
          periodEnd: null,
        },
      ],
      sourceRole: "PRIMARY",
      limitations: ["Coverage depends on participating venues."],
    },
    assessment: {
      authority: "HIGH",
      freshness: "COMPLEMENTARY",
      ingestionFeasibility: "MODERATE",
      confidence: "HIGH",
    },
    ...overrides,
  };
}

function structuredResult(candidates: unknown[] = [candidate()]): string {
  return JSON.stringify({
    taskSummary: "The bounded pass found supported evidence.",
    candidates,
    researchLimitations: ["The search was deliberately bounded."],
  });
}

function provider(options?: {
  stage1Text?: string;
  stage1Search?: boolean;
  stage2Text?: string;
}): ResearchProvider {
  return {
    researchWithNativeWeb: vi.fn().mockResolvedValue(
      providerResult(options?.stage1Text ?? stage1Artifact, {
        nativeSearch: options?.stage1Search ?? true,
        requestId: "resp_stage1",
      }),
    ),
    structureResearch: vi.fn().mockResolvedValue(
      providerResult(options?.stage2Text ?? structuredResult(), {
        requestId: "resp_stage2",
      }),
    ),
  };
}

async function captureValidationError(
  researchProvider: ResearchProvider,
): Promise<ResearchValidationError> {
  try {
    await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: researchProvider,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchValidationError);
    return error as ResearchValidationError;
  }
  throw new Error("Expected ResearchValidationError.");
}

describe("runResearchOnce", () => {
  it("encodes the bounded Stage-1 artifact contract", () => {
    const prompt = `${RESEARCH_STAGE1_INSTRUCTIONS}\n${buildResearchTaskInput(
      getResearchTask("au-live-music-venue-viability"),
      new Date("2026-09-03T00:00:00Z"),
    )}`;
    expect(prompt).toMatch(/MUST use live native web search/i);
    expect(prompt).toMatch(/at most 2 search actions/i);
    expect(prompt).toMatch(/at most 3 page opens total/i);
    expect(prompt).toMatch(/at most 1 find-in-page action/i);
    expect(prompt).toMatch(/no more than 3 distinct source documents/i);
    expect(prompt).toMatch(/no more than TWO source blocks/i);
    expect(prompt).toMatch(/compact plain-text template/i);
    expect(prompt).toMatch(/finding zero useful sources is acceptable/i);
    expect(prompt).not.toMatch(/output only the requested JSON Schema/i);
  });

  it("encodes a no-research Stage-2 transformation contract", () => {
    const input = buildResearchStructuringInput(
      getResearchTask("au-live-music-venue-viability"),
      stage1Artifact,
    );
    expect(RESEARCH_STAGE2_INSTRUCTIONS).toMatch(/Do not perform research/i);
    expect(RESEARCH_STAGE2_INSTRUCTIONS).toMatch(
      /Do not use outside knowledge/i,
    );
    expect(RESEARCH_STAGE2_INSTRUCTIONS).toMatch(/Do not add sources/i);
    expect(RESEARCH_STAGE2_INSTRUCTIONS).toMatch(/faithful transformation/i);
    expect(RESEARCH_STAGE2_INSTRUCTIONS).toMatch(
      /Prefer copying factual claim and metric wording from Stage 1/i,
    );
    expect(input).toContain(stage1Artifact);
  });

  it("fails unknown task IDs clearly", async () => {
    await expect(
      runResearchOnce({
        taskId: "unknown-task",
        apiKey: "test-key",
        provider: provider(),
      }),
    ).rejects.toThrow("Unknown research task");
  });

  it("fails for a missing key before invoking either provider operation", async () => {
    const researchProvider = provider();
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        provider: researchProvider,
      }),
    ).rejects.toBeInstanceOf(ResearchExecutionError);
    expect(researchProvider.researchWithNativeWeb).not.toHaveBeenCalled();
    expect(researchProvider.structureResearch).not.toHaveBeenCalled();
  });

  it("runs research then structuring and combines telemetry", async () => {
    const researchProvider = provider();
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: researchProvider,
      now: new Date("2026-09-03T00:00:00Z"),
    });
    expect(researchProvider.researchWithNativeWeb).toHaveBeenCalledTimes(1);
    expect(researchProvider.structureResearch).toHaveBeenCalledTimes(1);
    expect(result.crossStageValidation).toEqual({
      matchedCandidates: 1,
      reasons: [],
    });
    expect(result.usage).toEqual({ totalTokens: 300, totalLatencyMs: 1_000 });
  });

  it("accepts zero-source research and a zero-candidate result", async () => {
    const zeroArtifact = `RESEARCH_SUMMARY
No useful source was found.

RESEARCH_LIMITATIONS
The search was bounded.`;
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: provider({
        stage1Text: zeroArtifact,
        stage2Text: structuredResult([]),
      }),
    });
    expect(result.stage1.sources).toEqual([]);
    expect(result.result.candidates).toEqual([]);
  });

  it("rejects a Stage-1 result without native web search", async () => {
    const researchProvider = provider({ stage1Search: false });
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toMatchObject({ code: "STAGE1_NO_WEB_SEARCH" });
    expect(researchProvider.structureResearch).not.toHaveBeenCalled();
  });

  it("classifies missing Stage-1 final text", async () => {
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: provider({ stage1Text: "" }),
      }),
    ).rejects.toMatchObject({ code: "STAGE1_NO_FINAL_TEXT" });
  });

  it("classifies invalid Stage-1 artifacts before structuring", async () => {
    const researchProvider = provider({
      stage1Text: `RESEARCH_SUMMARY
One source was found.
SOURCE
PUBLISHER: Example Department
TITLE: Report
CLAIM: A claim.
RESEARCH_LIMITATIONS
Bounded.`,
    });
    const error = await captureValidationError(researchProvider);
    expect(error.code).toBe("STAGE1_ARTIFACT_INVALID");
    expect(error.providerResult?.providerRequestId).toBe("resp_stage1");
    expect(researchProvider.structureResearch).not.toHaveBeenCalled();
  });

  it("classifies Stage-1 execution failures", async () => {
    const researchProvider = provider();
    vi.mocked(researchProvider.researchWithNativeWeb).mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toMatchObject({ code: "STAGE1_EXECUTION_FAILURE" });
  });

  it("classifies malformed Stage-2 JSON and retains Stage-1 diagnostics", async () => {
    const error = await captureValidationError(
      provider({ stage2Text: "not json" }),
    );
    expect(error.code).toBe("STAGE2_JSON_PARSE_FAILURE");
    expect(error.stage1?.artifact).toBe(stage1Artifact);
    expect(error.stage1?.provider.providerRequestId).toBe("resp_stage1");
    expect(error.providerResult?.providerRequestId).toBe("resp_stage2");
  });

  it("classifies Stage-2 Zod failures", async () => {
    const error = await captureValidationError(
      provider({ stage2Text: JSON.stringify({ candidates: [] }) }),
    );
    expect(error.code).toBe("STAGE2_SCHEMA_FAILURE");
  });

  it("classifies missing Stage-2 final text while retaining Stage 1", async () => {
    const researchProvider = provider({ stage2Text: "" });
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toMatchObject({
      code: "STAGE2_NO_FINAL_TEXT",
      stage1: { artifact: stage1Artifact },
    });
  });

  it("classifies Stage-2 execution failures while retaining Stage 1", async () => {
    const researchProvider = provider();
    vi.mocked(researchProvider.structureResearch).mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toMatchObject({
      code: "STAGE2_EXECUTION_FAILURE",
      stage1: { artifact: stage1Artifact },
    });
  });

  it("rejects a URL invented by Stage 2", async () => {
    const error = await captureValidationError(
      provider({
        stage2Text: structuredResult([
          candidate({
            source: {
              url: "https://invented.example/report",
              publisher: "Example Department",
              title: "Australian live-music venue report",
              publishedAt: "2026-08-30",
            },
          }),
        ]),
      }),
    );
    expect(error.code).toBe("CROSS_STAGE_PROVENANCE_FAILURE");
    expect(error.reasons).toContain(
      "HARD_URL_MISMATCH: candidates.0.source.url was not present in Stage 1.",
    );
  });

  it("accepts a canonically equivalent Stage-1 URL", async () => {
    const equivalentCandidate = candidate({
      source: {
        url: "https://example.gov.au/report/#section",
        publisher: "Example Department",
        title: "Australian live-music venue report",
        publishedAt: "2026-08-30",
      },
    });
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: provider({
        stage2Text: structuredResult([equivalentCandidate]),
      }),
    });
    expect(result.result.candidates).toHaveLength(1);
    expect(canonicalizeResearchUrl("https://example.gov.au/report/")).toBe(
      canonicalizeResearchUrl("https://example.gov.au/report#fragment"),
    );
  });

  it("rejects an unsupported numeric observation", async () => {
    const unsupported = candidate();
    unsupported.evidence.observations[0]!.value = "9,999";
    const error = await captureValidationError(
      provider({ stage2Text: structuredResult([unsupported]) }),
    );
    expect(error.code).toBe("CROSS_STAGE_PROVENANCE_FAILURE");
    expect(error.reasons).toContain(
      "HARD_VALUE_MISMATCH: candidates.0 adds unsupported numeric value 9999.",
    );
  });

  it("has no persistence or scheduler dependency in the Phase A boundary", async () => {
    const sourceFiles = await Promise.all(
      [
        "research-runner.ts",
        "deepseek-research-provider.ts",
        "research-artifact.ts",
        "research-schema.ts",
        "research-tasks.ts",
      ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    );
    const source = sourceFiles.join("\n");
    expect(source).not.toMatch(
      /@\/lib\/prisma|scheduler-registry|MediaArticle|IndustryEvent|fetch\(/,
    );
  });
});
