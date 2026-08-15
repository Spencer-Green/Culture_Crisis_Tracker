import { describe, expect, it } from "vitest";

import {
  buildMediaHighlights,
  buildSectorMediaTiers,
  filterMediaArticles,
  type MediaArticleView,
} from "@/services/media/media-service-core";

const base: MediaArticleView = {
  id: "1",
  sourceType: "RSS",
  canonicalUrl: "https://example.com/1",
  title: "Music investment",
  description: null,
  publisher: "Example",
  sourceDomain: "example.com",
  publishedAt: "2026-08-13T05:00:00.000Z",
  retrievedAt: "2026-08-13T06:00:00.000Z",
  countryCode: null,
  sectorSlug: "music",
  eventType: "INVESTMENT",
  polarity: "positive",
  confidence: "high",
  importance: 4,
  aiImpactType: null,
  reviewState: "unreviewed",
  classificationRationale: "test",
  possibleDuplicateStory: false,
  sourceMatches: ["RSS"],
};

describe("media service presentation", () => {
  it("applies 24h, 3d, 7d, sector, and AI filters", () => {
    const articles = [
      base,
      {
        ...base,
        id: "2",
        publishedAt: "2026-08-10T06:00:00.000Z",
        sectorSlug: "gaming" as const,
        aiImpactType: "TOOL_ADOPTION" as const,
      },
    ];
    const now = new Date("2026-08-13T06:00:00Z");
    expect(filterMediaArticles(articles, { hours: 24 }, now)).toHaveLength(1);
    expect(filterMediaArticles(articles, { hours: 72 }, now)).toHaveLength(2);
    expect(
      filterMediaArticles(
        articles,
        { hours: 168, sector: "gaming", aiOnly: true },
        now,
      ).map((item) => item.id),
    ).toEqual(["2"]);
  });
  it("orders high-signal sections by tracker-derived importance", () => {
    const highlights = buildMediaHighlights([
      base,
      { ...base, id: "2", importance: 5, polarity: "negative" },
    ]);
    expect(highlights.topDevelopments[0].id).toBe("2");
    expect(highlights.positiveSignals).toHaveLength(1);
  });

  it("keeps every article across deterministic Industry Signals and Sector Feed tiers", () => {
    const articles = [
      base,
      {
        ...base,
        id: "2",
        eventType: null,
        importance: 1,
        confidence: "low" as const,
        aiImpactType: null,
        publishedAt: "2026-08-13T06:00:00.000Z",
      },
      { ...base, id: "3", importance: 5, confidence: "medium" as const },
    ];
    const tiers = buildSectorMediaTiers(articles);
    expect(tiers.industrySignals.map((article) => article.id)).toEqual([
      "3",
      "1",
    ]);
    expect(tiers.sectorFeed.map((article) => article.id)).toEqual(["2"]);
    expect(
      new Set(
        [...tiers.industrySignals, ...tiers.sectorFeed].map(
          (article) => article.id,
        ),
      ).size,
    ).toBe(articles.length);
  });
});
