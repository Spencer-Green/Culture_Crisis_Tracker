import { describe, expect, it } from "vitest";

import {
  estimateOpenAICost,
  GPT_5_6_LUNA_STANDARD_PRICING,
} from "@/lib/openai-usage";

describe("OpenAI usage cost estimation", () => {
  it("prices uncached, cached, and output tokens separately", () => {
    const cost = estimateOpenAICost({
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 100_000,
      totalTokens: 1_100_000,
    });

    expect(cost.currency).toBe("USD");
    expect(cost.uncachedInputUsd).toBeCloseTo(0.15, 12);
    expect(cost.cachedInputUsd).toBeCloseTo(0.005, 12);
    expect(cost.outputUsd).toBeCloseTo(0.12, 12);
    expect(cost.totalUsd).toBeCloseTo(0.275, 12);
  });

  it("accepts configurable pricing without scattered model rates", () => {
    const cost = estimateOpenAICost(
      {
        inputTokens: 1_000,
        cachedInputTokens: 0,
        outputTokens: 500,
        totalTokens: 1_500,
      },
      {
        ...GPT_5_6_LUNA_STANDARD_PRICING,
        perMillionTokens: { input: 1, cachedInput: 0.1, output: 2 },
      },
    );
    expect(cost.totalUsd).toBe(0.002);
  });

  it("bounds invalid cached-token counts to the input total", () => {
    const cost = estimateOpenAICost({
      inputTokens: 10,
      cachedInputTokens: 20,
      outputTokens: 0,
      totalTokens: 10,
    });
    expect(cost.uncachedInputUsd).toBe(0);
    expect(cost.cachedInputUsd).toBeCloseTo(0.0000002, 12);
  });
});
