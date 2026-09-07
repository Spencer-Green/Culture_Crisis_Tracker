import { describe, expect, it } from "vitest";

import { classifyProductionSynthesisFailure } from "@/services/media/production-story-synthesis-core";
import { StorySynthesisResponseValidationError } from "@/services/media/story-synthesis-core";

describe("production Luna failure classification", () => {
  it("fails closed on semantic validation while preserving billed usage", () => {
    const failure = classifyProductionSynthesisFailure(
      new StorySynthesisResponseValidationError("Unsupported causal claim.", {
        model: "gpt-5.6-luna",
        latencyMs: 8_000,
        usage: {
          inputTokens: 2_700,
          cachedInputTokens: 0,
          outputTokens: 400,
          totalTokens: 3_100,
        },
      }),
    );
    expect(failure).toMatchObject({
      kind: "VALIDATION",
      fatal: false,
      diagnostics: {
        model: "gpt-5.6-luna",
        latencyMs: 8_000,
        usage: { totalTokens: 3_100 },
      },
    });
    expect(failure.diagnostics?.estimatedCost.totalUsd).toBeGreaterThan(0);
  });

  it("stops a cycle on provider/network failure and redacts credentials", () => {
    const apiKey = "sk-secret-value";
    const failure = classifyProductionSynthesisFailure(
      Object.assign(new Error(`timeout using ${apiKey}`), {
        code: "ETIMEDOUT",
      }),
      apiKey,
    );
    expect(failure).toMatchObject({ kind: "API", fatal: true });
    expect(failure.message).toContain("network/API failure");
    expect(failure.message).not.toContain(apiKey);
  });
});
