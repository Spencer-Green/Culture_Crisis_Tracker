import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { DeepSeekResearchResponseError } from "@/services/research/deepseek-research-provider";
import {
  buildResearchTaskInput,
  RESEARCH_CONTRACT_VERSION,
  RESEARCH_MATERIALIZER_VERSION,
  ResearchExecutionError,
  RESEARCH_STAGE1_INSTRUCTIONS,
  RESEARCH_STAGE1_PROMPT_VERSION,
  ResearchValidationError,
  runResearchOnce,
} from "@/services/research/research-runner";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  NativeSearchTraceV1,
  ResearchProvider,
  ResearchProviderResult,
} from "@/services/research/research-types";

const basicArtifact = `RESEARCH_SUMMARY
One useful primary source was found.

SOURCE
URL: https://example.gov.au/report
PUBLISHER: Example Department
TITLE: Australian live-music venue report
PUBLICATION_DATE: 2026-08-30
REPORTING_PERIOD: 2025
GEOGRAPHY: Australia
SOURCE_ROLE: PRIMARY
CLAIM: The report recorded 1,000 venue performances during 2025.
OBSERVATION: METRIC=venue performances | VALUE=1,000 | UNIT=performances | QUALIFIER=NONE
LIMITATIONS: Coverage depends on participating venues.

RESEARCH_LIMITATIONS
The native-web search was deliberately bounded.`;

const liveMusicVictoriaAndAbcArtifact = `RESEARCH_SUMMARY
Two bounded sources were found; all evidence remained search-mediated.

SOURCE
URL: https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/
PUBLISHER: Music Victoria (with Creative Victoria, Victorian Government)
TITLE: Music Victoria Releases 2025 Victorian Live Music Venue Audit
PUBLICATION_DATE: 2026-02-25
REPORTING_PERIOD: 2025 audit fieldwork, benchmarked against 2019
GEOGRAPHY: Victoria
SOURCE_ROLE: PRIMARY
CLAIM: The 2025 Victorian Live Music Venue Audit counted 2,441 live music venues across Victoria, while secondary coverage reported weekly presenters fell 19.4% since 2019 and the audit summary identified 302 venues hosting at least two gigs per week.
OBSERVATION: METRIC=live music venue count | VALUE=2,441 | UNIT=venues | QUALIFIER=NONE
OBSERVATION: METRIC=weekly live music presenters | VALUE=19.4 | UNIT=% | QUALIFIER=DECLINE
OBSERVATION: METRIC=venues hosting at least two gigs per week | VALUE=302 | UNIT=venues | QUALIFIER=NONE
LIMITATIONS: Source page returned HTTP 403; figures came from search snippets and secondary coverage, not verified full-report text. The 19.4% figure has secondary mediation. This is Victorian, not national, evidence and does not measure profitability.

SOURCE
URL: https://www.abc.net.au/news/2026-08-18/sydney-live-music-venue-closures-diy-community/107049086
PUBLISHER: ABC News (Australia)
TITLE: Sydney music venues closing rapidly as owners seek 'DIY' alternatives
PUBLICATION_DATE: 2026-08-18
REPORTING_PERIOD: July 2025 – June 2026
GEOGRAPHY: Sydney
SOURCE_ROLE: SECONDARY_REPORTING
CLAIM: ABC reports that subsequently shuttered Sydney venues hosted more than 690 live music events between July 2025 and June 2026.
OBSERVATION: METRIC=live music events hosted by subsequently shuttered venues | VALUE=690 | UNIT=events | QUALIFIER=OVER
LIMITATIONS: Page retrieval failed, so only the observed search snippet supports the figure. This is Sydney gig-guide evidence, not an official closure census or a national profitability measure.

RESEARCH_LIMITATIONS
Search was bounded and no full page body was successfully inspected.`;

function providerResult(
  outputText: string,
  options?: { trace?: NativeSearchTraceV1; requestId?: string },
): ResearchProviderResult {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: options?.requestId ?? "resp_stage1",
    status: "completed",
    outputText,
    nativeSearchTrace: options?.trace ?? {
      calls: [
        {
          sequence: 0,
          item: {
            type: "web_search_call",
            id: "ws_test",
            status: "completed",
            action: { type: "search", query: "Australian live music", sources: [{ url: "https://example.gov.au/report" }] },
          },
        },
      ],
      annotations: [],
    },
    responseDiagnostics: {
      responseId: options?.requestId ?? "resp_stage1",
      responseStatus: "completed",
      outputItemCount: 2,
      outputItemTypes: ["web_search_call", "message"],
      messageItems: [
        {
          sequence: 1,
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

function provider(
  artifact = basicArtifact,
  trace?: NativeSearchTraceV1,
): ResearchProvider {
  return {
    researchWithNativeWeb: vi
      .fn()
      .mockResolvedValue(providerResult(artifact, { trace })),
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

describe("runResearchOnce staged evidence pipeline", () => {
  it("encodes bounded native acquisition separately from extraction", () => {
    const prompt = `${RESEARCH_STAGE1_INSTRUCTIONS}\n${buildResearchTaskInput(
      getResearchTask("au-live-music-venue-viability"),
      new Date("2026-09-09T00:00:00Z"),
    )}`;
    expect(prompt).toMatch(/MUST use live native web search/i);
    expect(prompt).toMatch(/at most 2 search actions/i);
    expect(prompt).toMatch(/separate no-tools phase/i);
    expect(prompt).toMatch(/Failed opens must remain failed/i);
    expect(RESEARCH_STAGE1_PROMPT_VERSION).toContain("v7");
    expect(RESEARCH_CONTRACT_VERSION).toBe("research-result-v3");
    expect(RESEARCH_MATERIALIZER_VERSION).toBe("local-evidence-materializer-v2");
  });

  it("invokes the provider pipeline once and materializes locally", async () => {
    const researchProvider = provider();
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: researchProvider,
      now: new Date("2026-09-09T00:00:00Z"),
    });
    expect(researchProvider.researchWithNativeWeb).toHaveBeenCalledTimes(1);
    expect(Object.keys(researchProvider)).toEqual(["researchWithNativeWeb"]);
    expect(result.result.candidates).toHaveLength(1);
    expect(result.result.candidates[0]?.scope).toEqual({
      geography: "Australia",
      sector: "Music",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
    });
    expect(result.result.candidates[0]?.evidence.observations[0]).toMatchObject(
      {
        metric: "venue performances",
        value: "1,000",
        unit: "performances",
        qualifier: "NONE",
        periodStart: null,
        periodEnd: null,
      },
    );
    expect(result.provenanceValidation).toEqual({
      matchedCandidates: 1,
      reasons: [],
    });
    expect(result.usage).toEqual({ totalTokens: 150, totalLatencyMs: 500 });
  });

  it("materializes the live Music Victoria and ABC evidence without exact-date invention", async () => {
    const trace: NativeSearchTraceV1 = {
      calls: [
        {
          sequence: 0,
          item: {
            type: "web_search_call",
            status: "completed",
            action: { type: "search", query: "bounded venue research" },
          },
        },
        {
          sequence: 1,
          item: {
            type: "web_search_call",
            status: "failed",
            action: {
              type: "open_page",
              url: "https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/",
            },
          },
        },
        {
          sequence: 2,
          item: {
            type: "web_search_call",
            status: "failed",
            action: {
              type: "open_page",
              url: "https://www.abc.net.au/news/2026-08-18/sydney-live-music-venue-closures-diy-community/107049086",
            },
          },
        },
      ],
      annotations: [],
    };
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: provider(liveMusicVictoriaAndAbcArtifact, trace),
    });
    expect(result.result.candidates).toHaveLength(2);
    expect(result.result.candidates.map((item) => item.scope.sector)).toEqual([
      "Music",
      "Music",
    ]);
    expect(
      result.result.candidates.map((item) => [
        item.scope.reportingPeriodStart,
        item.scope.reportingPeriodEnd,
      ]),
    ).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(result.stage1.sources.map((item) => item.traceStatus)).toEqual([
      "TRACE_ATTEMPTED",
      "TRACE_ATTEMPTED",
    ]);
    expect(result.result.candidates[0]?.evidence.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "2,441", unit: "venues" }),
        expect.objectContaining({ value: "19.4", qualifier: "DECLINE" }),
        expect.objectContaining({ value: "302", unit: "venues" }),
      ]),
    );
    expect(result.result.candidates[1]?.evidence.observations[0]).toMatchObject(
      {
        value: "690",
        unit: "events",
        qualifier: "OVER",
      },
    );
  });

  it("accepts a searched zero-source artifact without another provider call", async () => {
    const researchProvider = provider(`RESEARCH_SUMMARY
No useful source was found.

RESEARCH_LIMITATIONS
The search was bounded.`);
    const result = await runResearchOnce({
      taskId: "au-live-music-venue-viability",
      apiKey: "test-key",
      provider: researchProvider,
    });
    expect(result.result.candidates).toEqual([]);
    expect(researchProvider.researchWithNativeWeb).toHaveBeenCalledTimes(1);
  });

  it("fails unknown tasks and missing keys before provider execution", async () => {
    const researchProvider = provider();
    await expect(
      runResearchOnce({
        taskId: "unknown-task",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toThrow("Unknown research task");
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        provider: researchProvider,
      }),
    ).rejects.toBeInstanceOf(ResearchExecutionError);
    expect(researchProvider.researchWithNativeWeb).not.toHaveBeenCalled();
  });

  it("fails closed when native search or final text is absent", async () => {
    const noSearch = provider();
    vi.mocked(noSearch.researchWithNativeWeb).mockResolvedValueOnce(
      providerResult(basicArtifact, {
        trace: { calls: [], annotations: [] },
      }),
    );
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: noSearch,
      }),
    ).rejects.toMatchObject({ code: "STAGE1_NO_WEB_SEARCH" });

    const noText = provider();
    vi.mocked(noText.researchWithNativeWeb).mockResolvedValueOnce(
      providerResult(""),
    );
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: noText,
      }),
    ).rejects.toMatchObject({ code: "STAGE1_NO_FINAL_TEXT" });
  });

  it("classifies malformed source grammar as an artifact parse failure", async () => {
    const error = await captureValidationError(
      provider(
        basicArtifact.replace("URL: https://example.gov.au/report\n", ""),
      ),
    );
    expect(error.code).toBe("ARTIFACT_PARSE_FAILURE");
    expect(error.providerResult?.providerRequestId).toBe("resp_stage1");
  });

  it("retains bounded field diagnostics for artifact parse failures", async () => {
    const error = await captureValidationError(
      provider(
        basicArtifact.replace(
          "PUBLICATION_DATE: 2026-08-30",
          "PUBLICATION_DATE: recently",
        ),
      ),
    );
    expect(error.artifactDiagnostics).toEqual([
      {
        sourceIndex: 1,
        field: "PUBLICATION_DATE",
        rejectedValue: "recently",
        failureReason:
          "Expected YYYY-MM-DD, YYYY-MM, Month YYYY, YYYY, or UNKNOWN.",
      },
    ]);
  });

  it("does not retry a provider execution failure", async () => {
    const researchProvider = provider();
    vi.mocked(researchProvider.researchWithNativeWeb).mockRejectedValueOnce(
      new DeepSeekResearchResponseError(
        "provider unavailable",
        {
          providerRequestId: "failed",
          model: "deepseek-v4-flash",
          status: "failed",
          nativeSearchTrace: { calls: [], annotations: [] },
          responseDiagnostics: {
            responseId: "failed",
            responseStatus: "failed",
            outputItemCount: 0,
            outputItemTypes: [],
            messageItems: [],
            incompleteDetails: null,
            error: { code: "provider_failure" },
          },
          usage: null,
          latencyMs: 10,
        },
        "EXECUTION_FAILURE",
      ),
    );
    await expect(
      runResearchOnce({
        taskId: "au-live-music-venue-viability",
        apiKey: "test-key",
        provider: researchProvider,
      }),
    ).rejects.toMatchObject({ code: "STAGE1_EXECUTION_FAILURE" });
    expect(researchProvider.researchWithNativeWeb).toHaveBeenCalledTimes(1);
  });

  it("has no persistence, scheduler or crawler dependency", async () => {
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
    expect(source).not.toMatch(/structureResearch|tool_choice: "auto"/i);
  });
});
