import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildStorySynthesisRequest } from "@/services/media/story-synthesis-core";
import { requestOpenAIStorySynthesis } from "@/services/media/story-synthesis";

const request = buildStorySynthesisRequest({
  evidenceVersion: "story-synthesis-evidence-v2",
  clusterId: "cluster",
  representativeArticleId: "article",
  representativeHeadline: "Headline",
  effectiveClassification: {
    sector: "film",
    eventType: "LAYOFFS",
    aiImpactType: null,
    importance: 4,
    confidence: "high",
    labelSources: {
      sector: "MACHINE",
      eventType: "MACHINE",
      aiImpactType: "MACHINE",
      importance: "MACHINE",
      confidence: "MACHINE",
    },
    ambiguousHumanCorrections: false,
  },
  allowedAffectedSectors: ["film"],
  publicationWindow: {
    earliestPublishedAt: "2026-08-24T08:00:00.000Z",
    latestPublishedAt: "2026-08-24T08:00:00.000Z",
  },
  independentPublisherCount: 1,
  publishers: ["Publisher"],
  articles: [],
  bounds: {
    maximumCharacters: 12_000,
    serializedCharacters: 500,
    maximumArticles: 6,
    includedArticles: 1,
    omittedArticles: 0,
    excludedNotRelevantArticles: 0,
    truncatedFields: [],
  },
});

describe("OpenAI story synthesis adapter", () => {
  it("extracts only the response text, model, and usage", async () => {
    const create = vi.fn().mockResolvedValue({
      model: "gpt-5.6-luna",
      output_text: '{"eventSummary":"ok"}',
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens: 40,
        total_tokens: 160,
      },
    });
    const client = { responses: { create } } as unknown as OpenAI;

    await expect(requestOpenAIStorySynthesis(client, request)).resolves.toEqual(
      {
        model: "gpt-5.6-luna",
        outputText: '{"eventSummary":"ok"}',
        usage: {
          inputTokens: 120,
          cachedInputTokens: 20,
          outputTokens: 40,
          totalTokens: 160,
        },
      },
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("fails closed when usage metadata is absent", async () => {
    const create = vi.fn().mockResolvedValue({
      model: "gpt-5.6-luna",
      output_text: "{}",
    });
    const client = { responses: { create } } as unknown as OpenAI;

    await expect(requestOpenAIStorySynthesis(client, request)).rejects.toThrow(
      "did not include token usage",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
