import { describe, expect, it } from "vitest";

import type { ClassifiedMediaArticle } from "@/data-sources/news/media-types";
import {
  bundleMediaArticles,
  MediaRequestBudget,
} from "@/services/media/media-ingestion-core";

function article(
  sourceType: "THENEWSAPI" | "RSS",
  importance: 1 | 2 | 3 | 4 | 5,
): ClassifiedMediaArticle {
  return {
    sourceType,
    externalId: `${sourceType}-1`,
    url: "https://publisher.example/story?utm_source=test",
    canonicalUrl: "https://publisher.example/story",
    title: "Major music venue announces investment",
    description: "A concrete cultural-industry development.",
    publisher: "Publisher",
    sourceDomain: "publisher.example",
    publishedAt: new Date("2026-08-13T05:00:00Z"),
    language: "en",
    sourceCountry: "us",
    queryFamily: sourceType === "THENEWSAPI" ? "positive-investment" : null,
    feedSlug: sourceType === "RSS" ? "publisher" : null,
    sectorHint: "music",
    sourceMetadata: {},
    countryCode: "US",
    sectorSlug: "music",
    eventType: "INVESTMENT",
    polarity: "positive",
    confidence: "high",
    importance,
    aiImpactType: null,
    reviewState: "unreviewed",
    classificationRationale: "Explicit investment terminology.",
    storyFingerprint: "fingerprint",
  };
}

describe("media ingestion core", () => {
  it("enforces the per-run NewsAPI request budget", () => {
    const budget = new MediaRequestBudget(2);
    budget.consume();
    budget.consume();
    expect(budget.requestsUsed).toBe(2);
    expect(() => budget.consume()).toThrow("request budget is exhausted");
  });

  it("rejects budgets above the application hard cap", () => {
    expect(() => new MediaRequestBudget(26)).toThrow(
      "must be between 1 and 25",
    );
  });

  it("bundles matching NewsAPI and RSS URLs while retaining provenance", () => {
    const result = bundleMediaArticles([
      article("THENEWSAPI", 3),
      article("RSS", 4),
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].article.sourceType).toBe("RSS");
    expect(result.bundles[0].matches.map((match) => match.sourceType)).toEqual([
      "THENEWSAPI",
      "RSS",
    ]);
  });
});
