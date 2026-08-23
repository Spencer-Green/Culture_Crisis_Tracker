import { describe, expect, it } from "vitest";

import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  buildDailyCultureBriefCore,
  buildMediaStoryClusters,
  deriveBriefMediaFreshness,
  isCreativeAiStory,
  isPositiveCounterSignal,
  mediaArticlesInWindow,
  rankClusters,
} from "@/services/media/daily-brief-core";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function article(
  overrides: Partial<MediaArticleView> & Pick<MediaArticleView, "id" | "title">,
): MediaArticleView {
  return {
    sourceType: "RSS",
    canonicalUrl: `https://example.com/${overrides.id}`,
    description:
      "A cultural-industry organization announced a material development affecting creators and audiences.",
    publisher: "Example Trade",
    sourceDomain: "example.com",
    publishedAt: "2026-08-22T08:00:00.000Z",
    retrievedAt: "2026-08-22T09:00:00.000Z",
    countryCode: "US",
    sectorSlug: "music",
    eventType: "LAYOFFS",
    polarity: "negative",
    confidence: "high",
    importance: 3,
    aiImpactType: null,
    reviewState: "unreviewed",
    classificationRationale: "Fixture classification",
    classificationFeedback: null,
    storyFingerprint: null,
    possibleDuplicateStory: false,
    sourceMatches: ["RSS"],
    ...overrides,
  };
}

describe("daily brief story clustering", () => {
  it("collapses syndicated duplicates and preserves provenance", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "one",
        title: "Major label announces workforce layoffs after review",
        storyFingerprint: "shared-story",
        publisher: "Music Trade",
      }),
      article({
        id: "two",
        title: "Major label announces workforce layoffs after review",
        storyFingerprint: "shared-story",
        publisher: "General News",
        canonicalUrl: "https://news.example/two",
      }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      sourceCount: 2,
      articleIds: ["one", "two"],
    });
    expect(clusters[0].sources.map((source) => source.publisher)).toEqual([
      "Music Trade",
      "General News",
    ]);
  });

  it("keeps separate same-company developments with different event types", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "closure",
        title: "Netflix closes animation studio after strategic review",
        sectorSlug: "film",
        eventType: "CLOSURE",
      }),
      article({
        id: "acquisition",
        title:
          "Netflix announces animation company acquisition after strategic review",
        sectorSlug: "film",
        eventType: "CONSOLIDATION_ACQUISITION",
      }),
    ]);

    expect(clusters).toHaveLength(2);
  });

  it("uses human corrections without mutating machine article labels", () => {
    const machine = article({
      id: "corrected",
      title: "Studio investment expands music production capacity",
      sectorSlug: "film",
      eventType: "CLOSURE",
      importance: 2,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_SECTOR", "WRONG_EVENT_TYPE", "WRONG_IMPORTANCE"],
        correctedSector: "music",
        correctedEventType: "INVESTMENT",
        correctedAiTag: null,
        correctedImportance: 5,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-22T10:00:00.000Z",
      },
    });

    const [cluster] = buildMediaStoryClusters([machine]);
    expect(cluster).toMatchObject({
      sector: "music",
      eventType: "INVESTMENT",
      importance: 5,
      machineImportance: 2,
      humanReviewState: "corrected",
    });
    expect(machine).toMatchObject({
      sectorSlug: "film",
      eventType: "CLOSURE",
      importance: 2,
    });
  });

  it("marks conflicting human corrections ambiguous and routes conservatively", () => {
    const feedbackBase = {
      reviewState: "WRONG_CLASSIFICATION" as const,
      reasons: ["WRONG_SECTOR"] as const,
      correctedEventType: null,
      correctedAiTag: null,
      correctedImportance: null,
      approvedMachineClassification: null,
      evaluationState: "WRONG_CLASSIFICATION" as const,
      reviewedAt: "2026-08-22T10:00:00.000Z",
    };
    const [cluster] = buildMediaStoryClusters([
      article({
        id: "music",
        title: "Company announces creative workforce layoffs",
        storyFingerprint: "conflict",
        classificationFeedback: {
          ...feedbackBase,
          reasons: [...feedbackBase.reasons],
          correctedSector: "music",
        },
      }),
      article({
        id: "film",
        title: "Company announces creative workforce layoffs",
        storyFingerprint: "conflict",
        classificationFeedback: {
          ...feedbackBase,
          reasons: [...feedbackBase.reasons],
          correctedSector: "film",
        },
      }),
    ]);

    expect(cluster.sector).toBeNull();
    expect(cluster.ambiguousHumanCorrections).toBe(true);
    expect(cluster.humanReviewState).toBe("ambiguous");
  });

  it("excludes not-relevant articles and drops fully excluded clusters", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "excluded",
        title: "Unrelated corporate development",
        classificationFeedback: {
          reviewState: "WRONG_CLASSIFICATION",
          reasons: ["NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
          correctedSector: null,
          correctedEventType: null,
          correctedAiTag: null,
          correctedImportance: null,
          approvedMachineClassification: null,
          evaluationState: "WRONG_CLASSIFICATION",
          reviewedAt: "2026-08-22T10:00:00.000Z",
        },
      }),
    ]);
    expect(clusters).toEqual([]);
  });
});

describe("daily brief eligibility and ranking", () => {
  it("excludes generic AI and includes genuine creative AI", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "generic-ai",
        title: "Enterprise AI platform launches new cybersecurity tools",
        description:
          "A software company launched enterprise cybersecurity tools.",
        sectorSlug: "ai-policy",
        eventType: "AI_POLICY_REGULATION",
        aiImpactType: "POLICY_REGULATION",
      }),
      article({
        id: "creative-ai",
        title:
          "Actors union reaches AI likeness licensing agreement with film studio",
        description:
          "The agreement covers actor voice and likeness rights in generative AI film production.",
        sectorSlug: "film",
        eventType: "AI_LICENSING",
        aiImpactType: "RIGHTS_LICENSING",
      }),
    ]);

    expect(
      isCreativeAiStory(
        clusters.find((item) => item.clusterId.includes("generic-ai"))!,
      ),
    ).toBe(false);
    expect(
      isCreativeAiStory(
        clusters.find((item) => item.clusterId.includes("creative-ai"))!,
      ),
    ).toBe(true);
  });

  it("includes positive counter-signals without a sentiment score", () => {
    const [cluster] = buildMediaStoryClusters([
      article({
        id: "opening",
        title: "New independent music venue opens in regional city",
        eventType: "OPENING",
        polarity: "positive",
      }),
    ]);
    expect(isPositiveCounterSignal(cluster)).toBe(true);
  });

  it("rejects event-label false positives without rewriting the classifier", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "background-layoffs",
        title: "Studio makes a comeback after earlier layoffs",
        sectorSlug: "gaming",
        eventType: "LAYOFFS",
        importance: 4,
      }),
      article({
        id: "not-an-opening",
        title: "Artist dominates global impact list for first half of year",
        description:
          "A separate item in the same roundup celebrates the opening of a local venue.",
        eventType: "OPENING",
        polarity: "positive",
      }),
    ]);
    const brief = buildDailyCultureBriefCore({
      now: NOW,
      articles: clusters.flatMap((cluster) => cluster.articles),
    });
    expect(brief.topDevelopments).toEqual([]);
    expect(brief.positiveSignals).toEqual([]);
  });

  it("ranks human-corrected importance ahead of lower importance", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "machine-four",
        title: "Film studio announces production layoffs",
        sectorSlug: "film",
        importance: 4,
      }),
      article({
        id: "corrected-five",
        title: "Music venue announces permanent closure",
        eventType: "CLOSURE",
        importance: 1,
        classificationFeedback: {
          reviewState: "WRONG_CLASSIFICATION",
          reasons: ["WRONG_IMPORTANCE"],
          correctedSector: null,
          correctedEventType: null,
          correctedAiTag: null,
          correctedImportance: 5,
          approvedMachineClassification: null,
          evaluationState: "WRONG_CLASSIFICATION",
          reviewedAt: "2026-08-22T10:00:00.000Z",
        },
      }),
    ]).sort(rankClusters);
    expect(clusters[0].representativeArticleId).toBe("corrected-five");
  });

  it("uses source count only after importance and confidence", () => {
    const manyLow = ["a", "b", "c"].map((id) =>
      article({
        id,
        title: "Music company reports demand weakness in latest period",
        storyFingerprint: "many",
        importance: 2,
        publisher: `Publisher ${id}`,
      }),
    );
    const clusters = buildMediaStoryClusters([
      ...manyLow,
      article({
        id: "important",
        title: "Theatre operator files for bankruptcy protection",
        sectorSlug: "theatre",
        eventType: "BANKRUPTCY_INSOLVENCY",
        importance: 4,
      }),
    ]).sort(rankClusters);
    expect(clusters[0].representativeArticleId).toBe("important");
  });
});

describe("daily brief windows and deltas", () => {
  it("uses publication time rather than retrieval time", () => {
    const oldPublication = article({
      id: "old",
      title: "Old story reingested today",
      publishedAt: "2026-08-19T08:00:00.000Z",
      retrievedAt: "2026-08-22T11:00:00.000Z",
    });
    expect(
      mediaArticlesInWindow(
        [oldPublication],
        new Date("2026-08-21T12:00:00.000Z"),
        NOW,
      ),
    ).toEqual([]);
  });

  it("separates current and previous 24-hour windows", () => {
    const brief = buildDailyCultureBriefCore({
      now: NOW,
      articles: [
        article({
          id: "current",
          title: "Music company announces workforce layoffs",
          publishedAt: "2026-08-22T08:00:00.000Z",
        }),
        article({
          id: "previous",
          title: "Film company announces workforce layoffs",
          sectorSlug: "film",
          publishedAt: "2026-08-21T08:00:00.000Z",
        }),
      ],
    });
    expect(brief.diagnostics.currentWindowArticles).toBe(1);
    expect(brief.diagnostics.previousWindowArticles).toBe(1);
    expect(brief.delta.sectorChanges.music).toBe(1);
    expect(brief.delta.sectorChanges.film).toBe(-1);
  });

  it("reports new stories and avoids calling one-day changes trends", () => {
    const brief = buildDailyCultureBriefCore({
      now: NOW,
      articles: [
        article({
          id: "new-high",
          title: "Major theatre operator files for bankruptcy protection",
          sectorSlug: "theatre",
          eventType: "BANKRUPTCY_INSOLVENCY",
          importance: 5,
        }),
      ],
    });
    expect(brief.delta.newStoryCount).toBe(1);
    expect(brief.delta.newHighImportanceCount).toBe(1);
    expect(brief.delta.bullets.join(" ").toLowerCase()).not.toContain("trend");
  });

  it("keeps quiet days quiet", () => {
    const brief = buildDailyCultureBriefCore({ articles: [], now: NOW });
    expect(brief.topDevelopments).toEqual([]);
    expect(brief.topLine[0]).toContain("relatively quiet");
    expect(brief.delta.bullets).toEqual([
      "No material change in qualifying story counts was observed versus the previous 24 hours.",
    ]);
  });

  it("prefers a secondary sector story over duplicating Top Developments", () => {
    const brief = buildDailyCultureBriefCore({
      now: NOW,
      articles: [
        article({
          id: "top",
          title: "Major music company announces broad workforce layoffs",
          importance: 5,
        }),
        article({
          id: "secondary",
          title: "Regional music venue receives new public investment",
          eventType: "INVESTMENT",
          polarity: "positive",
          importance: 2,
        }),
      ],
    });
    expect(brief.topDevelopments[0].representativeArticleId).toBe("top");
    expect(brief.sectors.music[0].representativeArticleId).toBe("secondary");
  });
});

describe("daily brief freshness", () => {
  it("keeps observation freshness separate and reports the latest media refresh", () => {
    const result = deriveBriefMediaFreshness({
      databaseAvailable: true,
      sources: [
        {
          sourceId: "rss",
          status: "CURRENT",
          lastSuccessAt: "2026-08-22T09:00:00.000Z",
        },
        {
          sourceId: "thenewsapi",
          status: "CURRENT",
          lastSuccessAt: "2026-08-22T10:00:00.000Z",
        },
        {
          sourceId: "ticketmaster",
          status: "OVERDUE",
          lastSuccessAt: "2026-08-20T10:00:00.000Z",
        },
      ],
    });
    expect(result).toEqual({
      mediaLastRefresh: "2026-08-22T10:00:00.000Z",
      mediaFreshnessWarning: null,
    });
  });

  it("warns when an existing media source is overdue", () => {
    const result = deriveBriefMediaFreshness({
      databaseAvailable: true,
      sources: [
        {
          sourceId: "rss",
          status: "OVERDUE",
          lastSuccessAt: "2026-08-21T10:00:00.000Z",
        },
      ],
    });
    expect(result.mediaFreshnessWarning).toContain("rss is not current");
  });
});
