import { describe, expect, it } from "vitest";

import { formatResearchFailure } from "@/services/research/research-cli-output";
import { ResearchValidationError } from "@/services/research/research-runner";
import type {
  ResearchProviderResult,
  ResearchStage1RunResult,
} from "@/services/research/research-types";

function providerResult(
  requestId: string,
  outputText: string,
  nativeSearch: boolean,
): ResearchProviderResult {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: requestId,
    status: "completed",
    outputText,
    nativeSearchTrace: {
      calls: nativeSearch
        ? [
            {
              sequence: 1,
              item: {
                type: "web_search_call",
                id: "ws_safe",
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
      responseId: requestId,
      responseStatus: "completed",
      outputItemCount: nativeSearch ? 3 : 1,
      outputItemTypes: nativeSearch
        ? ["reasoning", "web_search_call", "message"]
        : ["message"],
      messageItems: [
        {
          sequence: nativeSearch ? 2 : 0,
          id: `${requestId}_message`,
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
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 10,
      totalTokens: 130,
    },
    latencyMs: 500,
  };
}

describe("research CLI failure output", () => {
  it("prints sanitized Stage-1 diagnostics for materialization failures", () => {
    const stage1Provider = providerResult(
      "resp_stage1",
      "RESEARCH_SUMMARY\nFound source.\nRESEARCH_LIMITATIONS\nBounded.",
      true,
    );
    const stage1: ResearchStage1RunResult = {
      artifact: stage1Provider.outputText,
      summary: "Found source.",
      researchLimitations: ["Bounded."],
      sources: [],
      provider: stage1Provider,
    };
    const error = new ResearchValidationError(
      "MATERIALIZATION_FAILURE",
      "Materialization failed for secret-value.",
      ["Output did not satisfy the local schema."],
      {
        stage1,
        providerResult: stage1Provider,
      },
    );

    const output = formatResearchFailure(error, ["secret-value"]);
    expect(output).toContain("Failure code: MATERIALIZATION_FAILURE");
    expect(output).toContain("Stage 1 response ID: resp_stage1");
    expect(output).toContain("reasoning -> web_search_call -> message");
    expect(output).toContain("https://example.gov.au/report");
    expect(output).toContain("Stage 1 total tokens: 130");
    expect(output).not.toContain("secret-value");
    expect(output).toContain("[REDACTED]");
  });

  it("does not expose hidden response text through diagnostics", () => {
    const stage1 = providerResult(
      "resp_stage1",
      "hidden output text with private reasoning",
      true,
    );
    const error = new ResearchValidationError(
      "MATERIALIZATION_FAILURE",
      "Schema failure.",
      ["Missing candidates."],
      { providerResult: stage1 },
    );
    expect(formatResearchFailure(error)).not.toContain(
      "hidden output text with private reasoning",
    );
  });

  it("prints sanitized bounded artifact field diagnostics", () => {
    const stage1 = providerResult("resp_stage1", "not printed", true);
    const error = new ResearchValidationError(
      "ARTIFACT_PARSE_FAILURE",
      "Artifact rejected.",
      ["Publication date was invalid."],
      {
        providerResult: stage1,
        artifactDiagnostics: [
          {
            sourceIndex: 1,
            field: "PUBLICATION_DATE",
            rejectedValue: "secret-value",
            failureReason: "Unsupported publication-date precision.",
          },
        ],
      },
    );
    const output = formatResearchFailure(error, ["secret-value"]);
    expect(output).toContain("source=1 field=PUBLICATION_DATE");
    expect(output).toContain("rejected=[REDACTED]");
    expect(output).not.toContain("secret-value");
  });
});
