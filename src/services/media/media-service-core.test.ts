import { describe, expect, it } from "vitest";

import {
  buildMediaHighlights,
  buildSectorMediaTiers,
  collapseDuplicateStories,
  filterMediaArticles,
  isAiCreativeWorkEligible,
  isCuratedPresentationEligible,
  isTopDevelopmentEligible,
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
  classificationFeedback: null,
  storyFingerprint: "story-1",
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
      {
        ...base,
        id: "2",
        canonicalUrl: "https://example.com/2",
        title: "Music label announces major layoffs",
        storyFingerprint: "story-2",
        importance: 5,
        polarity: "negative",
        eventType: "LAYOFFS",
      },
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

  it("excludes generic AI cybersecurity from Film and creative-AI intelligence", () => {
    const cyberArticle: MediaArticleView = {
      ...base,
      title:
        "China-Linked Hackers Use Autonomous AI Agents to Breach Taiwan Government Systems",
      description: null,
      sectorSlug: "film",
      eventType: "AI_POLICY_REGULATION",
      aiImpactType: "POLICY_REGULATION",
      polarity: "neutral/ambiguous",
      importance: 5,
      confidence: "high",
    };

    expect(isTopDevelopmentEligible(cyberArticle)).toBe(false);
    expect(isAiCreativeWorkEligible(cyberArticle)).toBe(false);
    const highlights = buildMediaHighlights([cyberArticle]);
    expect(highlights.topDevelopments).toEqual([]);
    expect(highlights.aiAndCreativeWork).toEqual([]);
  });

  it("routes Film consolidation to Top Developments", () => {
    const consolidation: MediaArticleView = {
      ...base,
      title:
        "DGA and IATSE Push Rob Bonta to Allow Paramount-Warner Bros. Merger With Conditions",
      sectorSlug: "film",
      eventType: "CONSOLIDATION_ACQUISITION",
      polarity: "neutral/ambiguous",
      importance: 5,
      confidence: "high",
    };

    expect(isTopDevelopmentEligible(consolidation)).toBe(true);
    expect(buildMediaHighlights([consolidation]).topDevelopments).toEqual([
      consolidation,
    ]);
  });

  it("requires both AI and creative-industry evidence for AI & Creative Work", () => {
    const creativeAi: MediaArticleView = {
      ...base,
      title: "Musicians secure licensing deal for generative AI training data",
      sectorSlug: "music",
      eventType: "AI_LICENSING",
      aiImpactType: "RIGHTS_LICENSING",
      polarity: "neutral/ambiguous",
      importance: 4,
      confidence: "high",
    };
    const genericPolicy: MediaArticleView = {
      ...creativeAi,
      id: "2",
      title: "Government publishes new AI safety regulation framework",
      sectorSlug: "ai-policy",
      eventType: "AI_POLICY_REGULATION",
      aiImpactType: "POLICY_REGULATION",
      storyFingerprint: "story-2",
    };

    expect(isAiCreativeWorkEligible(creativeAi)).toBe(true);
    expect(isAiCreativeWorkEligible(genericPolicy)).toBe(false);
    const highlights = buildMediaHighlights([creativeAi, genericPolicy]);
    expect(highlights.aiAndCreativeWork.map((article) => article.id)).toEqual([
      "1",
    ]);
    expect(highlights.topDevelopments).toEqual([]);
  });

  it("collapses syndicated headlines but preserves similar distinct developments", () => {
    const original = {
      ...base,
      title: "Major music company announces investment in touring artists",
    };
    const syndicated = {
      ...original,
      id: "2",
      canonicalUrl: "https://syndicator.example/story",
      publisher: "Syndicator",
      publishedAt: "2026-08-13T06:00:00.000Z",
      storyFingerprint: "different-ingestion-day-key",
    };
    const distinct = {
      ...base,
      id: "3",
      canonicalUrl: "https://example.com/distinct",
      title: "Music investment fund opens applications for touring artists",
      publishedAt: "2026-08-13T06:30:00.000Z",
      storyFingerprint: "story-3",
    };

    const collapsed = collapseDuplicateStories([
      original,
      syndicated,
      distinct,
    ]);
    expect(collapsed.articles).toHaveLength(2);
    expect(collapsed.suppressedCount).toBe(1);
    expect(collapsed.articles.map((article) => article.id)).toContain("3");
    const highlights = buildMediaHighlights([original, syndicated, distinct]);
    expect(highlights.topDevelopments).toHaveLength(2);
    expect(highlights.diagnostics.topCandidatesBeforeDeduplication).toBe(3);
    expect(highlights.diagnostics.topCandidatesAfterDeduplication).toBe(2);
  });

  it("retains low-signal or irrelevant assignments in the broader sector feed", () => {
    const genericCyberArticle: MediaArticleView = {
      ...base,
      title: "Autonomous AI agents breach government systems",
      sectorSlug: "film",
      eventType: "AI_POLICY_REGULATION",
      aiImpactType: "POLICY_REGULATION",
      polarity: "neutral/ambiguous",
      importance: 5,
      confidence: "high",
    };
    const tiers = buildSectorMediaTiers([genericCyberArticle]);

    expect(tiers.industrySignals).toEqual([]);
    expect(tiers.sectorFeed).toEqual([genericCyberArticle]);
  });

  it("rejects an ambiguous administration match from Top Developments", () => {
    const civicCelebration: MediaArticleView = {
      ...base,
      title:
        "Independence Day celebrations to feature fireworks and folk music",
      description:
        "The district administration is organising the public celebration.",
      eventType: "BANKRUPTCY_INSOLVENCY",
      polarity: "neutral/ambiguous",
      importance: 3,
      confidence: "high",
    };

    expect(isTopDevelopmentEligible(civicCelebration)).toBe(false);
  });

  it("excludes manually irrelevant articles from curated surfaces but retains them in broader feeds", () => {
    const flagged: MediaArticleView = {
      ...base,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_EVENT_TYPE", "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
        correctedSector: null,
        correctedEventType: "EXPANSION",
        correctedAiTag: null,
        correctedImportance: null,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-17T08:00:00.000Z",
      },
    };
    const flaggedAi: MediaArticleView = {
      ...flagged,
      id: "2",
      canonicalUrl: "https://example.com/2",
      title: "Musicians secure licensing deal for generative AI training data",
      eventType: "AI_LICENSING",
      aiImpactType: "RIGHTS_LICENSING",
      storyFingerprint: "story-2",
    };

    const highlights = buildMediaHighlights([flagged, flaggedAi]);
    expect(highlights.topDevelopments).toEqual([]);
    expect(highlights.aiAndCreativeWork).toEqual([]);
    expect(highlights.industryHealth).toEqual([]);
    expect(highlights.positiveSignals).toEqual([]);

    const tiers = buildSectorMediaTiers([flagged]);
    expect(tiers.industrySignals).toEqual([]);
    expect(tiers.sectorFeed).toEqual([flagged]);

    expect(
      filterMediaArticles(
        [flagged],
        { hours: 168 },
        new Date("2026-08-17T08:00:00Z"),
      ),
    ).toEqual([flagged]);
  });

  it("keeps feedback-only error dimensions eligible under machine classification", () => {
    const flagged: MediaArticleView = {
      ...base,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: [
          "WRONG_SECTOR",
          "WRONG_EVENT_TYPE",
          "WRONG_AI_TAG",
          "WRONG_IMPORTANCE",
        ],
        correctedSector: "gaming",
        correctedEventType: "EXPANSION",
        correctedAiTag: "TOOL_ADOPTION",
        correctedImportance: 1,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-17T08:00:00.000Z",
      },
    };

    expect(buildMediaHighlights([flagged]).topDevelopments).toEqual([flagged]);
    expect(buildSectorMediaTiers([flagged]).industrySignals).toEqual([flagged]);
  });

  it("keeps positive validation inert for ranking, routing, and eligibility", () => {
    const verified: MediaArticleView = {
      ...base,
      classificationFeedback: {
        reviewState: "CORRECT",
        reasons: [],
        correctedSector: null,
        correctedEventType: null,
        correctedAiTag: null,
        correctedImportance: null,
        approvedMachineClassification: {
          sector: base.sectorSlug,
          eventType: base.eventType,
          aiTag: base.aiImpactType,
          importance: base.importance as 4,
          confidence: base.confidence,
        },
        evaluationState: "CORRECT",
        reviewedAt: "2026-08-17T08:00:00.000Z",
      },
    };

    const verifiedHighlights = buildMediaHighlights([verified]);
    const unreviewedHighlights = buildMediaHighlights([base]);
    for (const key of [
      "topDevelopments",
      "aiAndCreativeWork",
      "industryHealth",
      "positiveSignals",
    ] as const) {
      expect(verifiedHighlights[key].map((article) => article.id)).toEqual(
        unreviewedHighlights[key].map((article) => article.id),
      );
    }
    expect(buildSectorMediaTiers([verified])).toMatchObject({
      industrySignals: [verified],
      sectorFeed: [],
    });
    expect(isCuratedPresentationEligible(verified)).toBe(true);
  });
});
