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
  it("prints Stage-1 and Stage-2 diagnostics for validation failures", () => {
    const stage1Provider = providerResult(
      "resp_stage1",
      "RESEARCH_SUMMARY\nFound source.\nRESEARCH_LIMITATIONS\nBounded.",
      true,
    );
    const stage1: ResearchStage1RunResult = {
      artifact: stage1Provider.outputText,
      sources: [],
      provider: stage1Provider,
    };
    const error = new ResearchValidationError(
      "STAGE2_JSON_PARSE_FAILURE",
      "Stage 2 failed for secret-value.",
      ["Output was not JSON."],
      {
        stage1,
        providerResult: providerResult("resp_stage2", "not json", false),
      },
    );

    const output = formatResearchFailure(error, ["secret-value"]);
    expect(output).toContain("Failure code: STAGE2_JSON_PARSE_FAILURE");
    expect(output).toContain("Stage 1 response ID: resp_stage1");
    expect(output).toContain("Stage 2 response ID: resp_stage2");
    expect(output).toContain("reasoning -> web_search_call -> message");
    expect(output).toContain("https://example.gov.au/report");
    expect(output).toContain("Stage 1 total tokens: 130");
    expect(output).toContain("Stage 2 total tokens: 130");
    expect(output).not.toContain("secret-value");
    expect(output).toContain("[REDACTED]");
  });

  it("does not expose hidden response text through diagnostics", () => {
    const stage2 = providerResult(
      "resp_stage2",
      "hidden output text with private reasoning",
      false,
    );
    const error = new ResearchValidationError(
      "STAGE2_SCHEMA_FAILURE",
      "Schema failure.",
      ["Missing candidates."],
      { providerResult: stage2 },
    );
    expect(formatResearchFailure(error)).not.toContain(
      "hidden output text with private reasoning",
    );
  });
});
