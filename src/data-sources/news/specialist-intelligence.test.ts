import { describe, expect, it } from "vitest";

import { isSpecialistIntelligenceRelevant } from "@/data-sources/news/specialist-intelligence";
import type { MediaSourceArticle } from "@/data-sources/news/media-types";

function article(title: string, description: string | null = null) {
  return {
    sourceType: "RSS",
    externalId: null,
    url: "https://example.com/item",
    title,
    description,
    publisher: "Specialist",
    sourceDomain: "example.com",
    publishedAt: new Date("2026-08-25T00:00:00Z"),
    language: "en",
    sourceCountry: null,
    queryFamily: null,
    feedSlug: "specialist",
    sectorHint: "ai-policy",
    sourceMetadata: {},
  } satisfies MediaSourceArticle;
}

describe("specialist feed relevance", () => {
  it.each([
    "New empirical study of AI workplace adoption",
    "Court analysis examines copyright and training data",
    "Export controls reshape advanced semiconductor supply",
    "Competition policy and platform market power",
  ])("accepts a material specialist subject: %s", (title) => {
    expect(isSpecialistIntelligenceRelevant(article(title))).toBe(true);
  });

  it.each([
    "Organization announces a new board member",
    "A routine trademark filing update",
    "Unrelated cybersecurity patch notes",
  ])("rejects low-value feed membership alone: %s", (title) => {
    expect(isSpecialistIntelligenceRelevant(article(title))).toBe(false);
  });

  it("rejects protected placeholder posts", () => {
    expect(
      isSpecialistIntelligenceRelevant(
        article(
          "Protected: Tracking AI Chips",
          "There is no excerpt because this is a protected post.",
        ),
      ),
    ).toBe(false);
  });
});
