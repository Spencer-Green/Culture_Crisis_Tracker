import { describe, expect, it, vi } from "vitest";

import {
  buildLlmSmokeRequest,
  diagnoseLlmSmokeError,
  LLM_SMOKE_MESSAGE,
  LLM_SMOKE_MODEL,
  LlmSmokeValidationError,
  parseLlmSmokeOutput,
  runLlmSmoke,
  sanitizeLlmDiagnosticMessage,
} from "@/lib/llm-smoke";

const validResponse = {
  model: LLM_SMOKE_MODEL,
  outputText: JSON.stringify({ status: "ok", message: LLM_SMOKE_MESSAGE }),
  usage: {
    inputTokens: 12,
    cachedInputTokens: 0,
    outputTokens: 8,
    totalTokens: 20,
  },
};

describe("LLM smoke test", () => {
  it("builds one minimal strict Responses API request", () => {
    const request = buildLlmSmokeRequest();

    expect(request).toMatchObject({
      model: LLM_SMOKE_MODEL,
      max_output_tokens: 64,
      reasoning: { effort: "none" },
      store: false,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          strict: true,
          schema: { additionalProperties: false },
        },
      },
    });
    expect(request).not.toHaveProperty("tools");
  });

  it("validates the exact structured response and reports usage", async () => {
    const createResponse = vi.fn().mockResolvedValue(validResponse);
    const timestamps = [100, 143];

    const result = await runLlmSmoke(createResponse, () => timestamps.shift()!);

    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      model: LLM_SMOKE_MODEL,
      response: { status: "ok", message: LLM_SMOKE_MESSAGE },
      latencyMs: 43,
      usage: validResponse.usage,
    });
  });

  it.each([
    ["not-json", "Response was not valid JSON."],
    [
      JSON.stringify({ status: "ok", message: "wrong" }),
      "Response did not match the required smoke-test schema.",
    ],
    [
      JSON.stringify({
        status: "ok",
        message: LLM_SMOKE_MESSAGE,
        extra: true,
      }),
      "Response did not match the required smoke-test schema.",
    ],
  ])("rejects malformed structured output", (output, expectedMessage) => {
    expect(() => parseLlmSmokeOutput(output)).toThrow(
      new LlmSmokeValidationError(expectedMessage),
    );
  });

  it.each([
    [401, "invalid_api_key", "authentication failure"],
    [403, "model_access_denied", "permission/model-access failure"],
    [404, "model_not_found", "model unavailable/not found"],
    [429, "insufficient_quota", "quota/rate-limit/billing failure"],
    [undefined, undefined, "network/API failure"],
  ] as const)(
    "classifies safe API diagnostics",
    (status, code, expectedCategory) => {
      const diagnostic = diagnoseLlmSmokeError({
        status,
        code,
        message: "request failed",
      });

      expect(diagnostic.category).toBe(expectedCategory);
      expect(diagnostic.status).toBe(status);
      expect(diagnostic.code).toBe(code);
    },
  );

  it("classifies structured-response validation failures", () => {
    expect(
      diagnoseLlmSmokeError(new LlmSmokeValidationError("invalid response")),
    ).toEqual({
      category: "malformed structured response",
      message: "invalid response",
    });
  });

  it("redacts API-key-like values from diagnostics", () => {
    const key = "sk-example-secret";
    expect(sanitizeLlmDiagnosticMessage(`failure for ${key}`, key)).toBe(
      "failure for [REDACTED]",
    );
  });
});
