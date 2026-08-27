import "server-only";

import type OpenAI from "openai";

import { buildIntelligenceSynthesisRequest } from "@/services/media/intelligence-synthesis-core";
import { getCurrentStorySynthesisCandidates } from "@/services/media/story-synthesis";
import {
  StorySynthesisValidationError,
  type StorySynthesisApiResponse,
} from "@/services/media/story-synthesis-core";

export type IntelligenceSynthesisRequest = ReturnType<
  typeof buildIntelligenceSynthesisRequest
>;

export async function getCurrentIntelligenceSynthesisCandidates(input?: {
  now?: Date;
  hours?: number;
}) {
  return getCurrentStorySynthesisCandidates({
    now: input?.now,
    hours: input?.hours ?? 336,
  });
}

export async function requestOpenAIIntelligenceSynthesis(
  client: OpenAI,
  request: IntelligenceSynthesisRequest,
): Promise<StorySynthesisApiResponse> {
  const response = await client.responses.create(request);
  if (!response.usage) {
    throw new StorySynthesisValidationError(
      "Model response did not include token usage.",
    );
  }
  return {
    model: response.model,
    outputText: response.output_text,
    usage: {
      inputTokens: response.usage.input_tokens,
      cachedInputTokens:
        response.usage.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.total_tokens,
    },
  };
}
