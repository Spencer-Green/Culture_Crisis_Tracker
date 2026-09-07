import { describe, expect, it } from "vitest";

import {
  buildDeepSeekNativeResearchRequest,
  buildDeepSeekStructuringRequest,
  DeepSeekResearchResponseError,
  extractNativeSearchTrace,
  extractResearchResponseDiagnostics,
  mapDeepSeekNativeResearchResponse,
  mapDeepSeekStructuringResponse,
  sanitizeResearchDiagnostic,
  sanitizeResearchTraceValue,
} from "@/services/research/deepseek-research-provider";
import { AU_LIVE_MUSIC_VENUE_VIABILITY_TASK } from "@/services/research/research-tasks";

const fixture = {
  id: "resp_test",
  status: "completed",
  model: "deepseek-v4-flash",
  output_text:
    '{"taskSummary":"No candidates.","candidates":[],"researchLimitations":[]}',
  output: [
    {
      type: "reasoning",
      id: "reasoning_test",
      content: [{ type: "reasoning_text", text: "hidden reasoning" }],
    },
    {
      type: "web_search_call",
      id: "ws_test",
      status: "completed",
      action: {
        type: "search",
        query: "Australian live music venue viability 2026",
        sources: [{ type: "url", url: "https://example.gov.au/report" }],
      },
    },
    {
      type: "message",
      id: "message_test",
      content: [
        {
          type: "output_text",
          text: "{}",
          annotations: [
            {
              type: "url_citation",
              title: "Report",
              url: "https://example.gov.au/report",
              start_index: 0,
              end_index: 2,
            },
          ],
        },
      ],
    },
  ],
  usage: {
    input_tokens: 500,
    input_tokens_details: { cached_tokens: 120 },
    output_tokens: 200,
    output_tokens_details: { reasoning_tokens: 80 },
    total_tokens: 700,
  },
};

function captureResponseError(
  response: unknown,
): DeepSeekResearchResponseError {
  try {
    mapDeepSeekNativeResearchResponse(response, 2_000);
  } catch (error) {
    expect(error).toBeInstanceOf(DeepSeekResearchResponseError);
    return error as DeepSeekResearchResponseError;
  }
  throw new Error("Expected DeepSeekResearchResponseError.");
}

describe("DeepSeek research provider mapping", () => {
  it("maps output, usage, and native search provenance without reasoning", () => {
    const result = mapDeepSeekNativeResearchResponse(fixture, 1_234);
    expect(result).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      providerRequestId: "resp_test",
      latencyMs: 1_234,
      usage: {
        inputTokens: 500,
        cachedInputTokens: 120,
        outputTokens: 200,
        reasoningTokens: 80,
        totalTokens: 700,
      },
    });
    expect(result.nativeSearchTrace.calls).toHaveLength(1);
    expect(result.nativeSearchTrace.annotations).toHaveLength(1);
    expect(result.responseDiagnostics).toMatchObject({
      responseId: "resp_test",
      responseStatus: "completed",
      outputItemCount: 3,
      outputItemTypes: ["reasoning", "web_search_call", "message"],
      messageItems: [
        {
          sequence: 2,
          id: "message_test",
          contentTypes: ["output_text"],
          outputTextPresent: true,
          annotationCount: 1,
        },
      ],
    });
    expect(JSON.stringify(result.nativeSearchTrace)).not.toContain(
      "hidden reasoning",
    );
  });

  it("fails when no native search call is observable", () => {
    expect(() =>
      mapDeepSeekNativeResearchResponse({ ...fixture, output: [] }, 10),
    ).toThrow("no native web_search_call");
  });

  it("diagnoses a completed response containing only search items", () => {
    const error = captureResponseError({
      ...fixture,
      output_text: "",
      output: fixture.output.filter((item) => item.type !== "message"),
    });
    expect(error.diagnostics).toMatchObject({
      providerRequestId: "resp_test",
      status: "completed",
      latencyMs: 2_000,
      usage: { totalTokens: 700 },
    });
    expect(error.diagnostics.nativeSearchTrace.calls).toHaveLength(1);
    expect(error.diagnostics.responseDiagnostics).toMatchObject({
      outputItemTypes: ["reasoning", "web_search_call"],
      messageItems: [],
    });
  });

  it("diagnoses an unexpected message content shape without exposing text", () => {
    const error = captureResponseError({
      ...fixture,
      output_text: "",
      output: [
        fixture.output[1],
        {
          type: "message",
          id: "message_unexpected",
          status: "completed",
          content: [{ type: "unexpected_content", text: "unsafe giant body" }],
        },
      ],
    });
    expect(error.diagnostics.responseDiagnostics.messageItems).toEqual([
      {
        sequence: 1,
        id: "message_unexpected",
        status: "completed",
        contentTypes: ["unexpected_content"],
        outputTextPresent: false,
        annotationCount: 0,
      },
    ]);
    expect(JSON.stringify(error.diagnostics)).not.toContain(
      "unsafe giant body",
    );
  });

  it("diagnoses incomplete responses and their reason", () => {
    const error = captureResponseError({
      ...fixture,
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    expect(error.message).toContain("max_output_tokens");
    expect(error.diagnostics.responseDiagnostics.incompleteDetails).toEqual({
      reason: "max_output_tokens",
    });
  });

  it("diagnoses failed responses and sanitizes the provider error", () => {
    const error = captureResponseError({
      ...fixture,
      status: "failed",
      error: {
        code: "provider_failure",
        message: "Authorization Bearer top-secret failed",
      },
    });
    expect(error.diagnostics.responseDiagnostics.error).toEqual({
      code: "provider_failure",
      message: "[REDACTED]",
    });
  });

  it("preserves action ordering from output sequence", () => {
    const trace = extractNativeSearchTrace({
      output: [
        { type: "message", content: [] },
        {
          type: "web_search_call",
          id: "first",
          action: { type: "search", query: "one" },
        },
        {
          type: "web_search_call",
          id: "second",
          action: { type: "open_page", url: "https://example.com" },
        },
      ],
    });
    expect(trace.calls.map((call) => call.sequence)).toEqual([1, 2]);
  });

  it("sanitizes key- and value-shaped secrets", () => {
    const sanitized = sanitizeResearchTraceValue(
      {
        authorization: "Bearer top-secret",
        nested: { apiKey: "secret-value", harmless: "sk-secretvalue" },
      },
      { secrets: ["secret-value"] },
    );
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("sk-secretvalue");
    expect(serialized).toContain("[REDACTED]");
    expect(
      sanitizeResearchDiagnostic("failure for secret-value", ["secret-value"]),
    ).toBe("failure for [REDACTED]");
    expect(
      JSON.stringify(sanitizeResearchTraceValue("x".repeat(2_000))),
    ).toContain("[TRUNCATED]");
  });

  it("summarizes response structure without retaining output text", () => {
    const diagnostics = extractResearchResponseDiagnostics(fixture);
    expect(diagnostics.outputItemTypes).toEqual([
      "reasoning",
      "web_search_call",
      "message",
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("No candidates");
    expect(JSON.stringify(diagnostics)).not.toContain("hidden reasoning");
  });

  it("builds Stage 1 with native search and without structured output", () => {
    const request = buildDeepSeekNativeResearchRequest({
      task: AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
      instructions: "Research safely.",
      input: "Find evidence.",
    });
    expect(request).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning: { effort: "high" },
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
    });
    expect(request).not.toHaveProperty("text");
    expect(request).not.toHaveProperty("store");
    expect(request).not.toHaveProperty("include");
  });

  it("builds Stage 2 with JSON Schema and no tools", () => {
    const request = buildDeepSeekStructuringRequest({
      task: AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
      instructions: "Structure faithfully.",
      input: "Stage 1 artifact.",
    });
    expect(request).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning: { effort: "high" },
      text: { format: { type: "json_schema" } },
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("tool_choice");
  });

  it("maps Stage 2 without requiring a web-search call", () => {
    const result = mapDeepSeekStructuringResponse(
      {
        ...fixture,
        output: fixture.output.filter((item) => item.type === "message"),
      },
      50,
    );
    expect(result.outputText).toBe(fixture.output_text);
    expect(result.nativeSearchTrace.calls).toEqual([]);
  });
});
