import "server-only";

import OpenAI from "openai";

import {
  buildMediaStoryClusters,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import { getMediaArticlesPublishedBetween } from "@/services/media/media";
import {
  isStorySynthesisEligible,
  StorySynthesisValidationError,
  type StorySynthesisApiResponse,
  type buildStorySynthesisRequest,
} from "@/services/media/story-synthesis-core";

export type StorySynthesisRequest = ReturnType<
  typeof buildStorySynthesisRequest
>;

export async function getCurrentStorySynthesisCandidates(input?: {
  now?: Date;
  hours?: number;
}): Promise<MediaStoryCluster[]> {
  const clusters = await getCurrentStorySynthesisClusters(input);
  return clusters.filter(isStorySynthesisEligible);
}

export async function getCurrentStorySynthesisClusters(input?: {
  now?: Date;
  hours?: number;
}): Promise<MediaStoryCluster[]> {
  const now = input?.now ?? new Date();
  const hours = input?.hours ?? 168;
  const start = new Date(now.getTime() - hours * 60 * 60 * 1_000);
  const articles = await getMediaArticlesPublishedBetween({ start, end: now });
  return buildMediaStoryClusters(articles);
}

export async function resolveStorySynthesisCluster(
  identifier: string,
  input?: { now?: Date; hours?: number; evaluationOnly?: boolean },
): Promise<MediaStoryCluster | null> {
  const candidates = input?.evaluationOnly
    ? await getCurrentStorySynthesisClusters(input)
    : await getCurrentStorySynthesisCandidates(input);
  return (
    candidates.find(
      (cluster) =>
        cluster.clusterId === identifier ||
        cluster.representativeArticleId === identifier ||
        cluster.articleIds.includes(identifier),
    ) ?? null
  );
}

export function createOpenAIStorySynthesisClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 45_000,
  });
}

export async function requestOpenAIStorySynthesis(
  client: OpenAI,
  request: StorySynthesisRequest,
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
