export const OPENAI_LUNA_MODEL = "gpt-5.6-luna";

export type OpenAITokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type OpenAIModelPricing = {
  model: string;
  currency: "USD";
  perMillionTokens: {
    input: number;
    cachedInput: number;
    output: number;
  };
};

export const GPT_5_6_LUNA_STANDARD_PRICING: OpenAIModelPricing = {
  model: OPENAI_LUNA_MODEL,
  currency: "USD",
  perMillionTokens: {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
  },
};

export type EstimatedOpenAICost = {
  currency: "USD";
  uncachedInputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  totalUsd: number;
};

export function estimateOpenAICost(
  usage: OpenAITokenUsage,
  pricing: OpenAIModelPricing = GPT_5_6_LUNA_STANDARD_PRICING,
): EstimatedOpenAICost {
  const cachedInputTokens = Math.max(
    0,
    Math.min(usage.inputTokens, usage.cachedInputTokens),
  );
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - cachedInputTokens,
  );
  const uncachedInputUsd =
    (uncachedInputTokens / 1_000_000) * pricing.perMillionTokens.input;
  const cachedInputUsd =
    (cachedInputTokens / 1_000_000) * pricing.perMillionTokens.cachedInput;
  const outputUsd =
    (Math.max(0, usage.outputTokens) / 1_000_000) *
    pricing.perMillionTokens.output;

  return {
    currency: pricing.currency,
    uncachedInputUsd,
    cachedInputUsd,
    outputUsd,
    totalUsd: uncachedInputUsd + cachedInputUsd + outputUsd,
  };
}
