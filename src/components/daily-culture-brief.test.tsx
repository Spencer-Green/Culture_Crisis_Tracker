import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DailyBriefFull,
  DailyBriefOverview,
} from "@/components/daily-culture-brief";
import type { DailyCultureBrief } from "@/services/media/daily-brief";
import type { MediaStoryCluster } from "@/services/media/daily-brief-core";

function story(): MediaStoryCluster {
  return {
    clusterId: "cluster-one",
    comparisonKey: "LAYOFFS:studio-layoffs",
    representativeArticleId: "article-one",
    articleIds: ["article-one", "article-two"],
    sourceCount: 2,
    publishers: ["Film Trade", "General News"],
    canonicalHeadline: "Film studio announces production layoffs",
    snippet: "The studio announced workforce reductions.",
    earliestPublishedAt: "2026-08-22T08:00:00.000Z",
    latestPublishedAt: "2026-08-22T09:00:00.000Z",
    sector: "film",
    eventType: "LAYOFFS",
    aiImpactType: null,
    polarity: "negative",
    importance: 4,
    machineImportance: 3,
    confidence: "high",
    humanReviewState: "corrected",
    correctedSector: null,
    correctedEventType: null,
    correctedAiTag: null,
    correctedImportance: 4,
    ambiguousHumanCorrections: false,
    whyItMatters:
      "Workforce reductions are a direct creative-employment and production-capacity development.",
    sources: [
      {
        articleId: "article-one",
        headline: "Film studio announces production layoffs",
        publisher: "Film Trade",
        url: "https://example.com/film-trade",
        publishedAt: "2026-08-22T09:00:00.000Z",
      },
      {
        articleId: "article-two",
        headline: "Production layoffs announced at film studio",
        publisher: "General News",
        url: "https://example.com/general-news",
        publishedAt: "2026-08-22T08:00:00.000Z",
      },
    ],
    articles: [],
  };
}

function brief(withStory = true): DailyCultureBrief {
  const item = story();
  return {
    generatedAt: "2026-08-22T12:00:00.000Z",
    windowStart: "2026-08-21T12:00:00.000Z",
    windowEnd: "2026-08-22T12:00:00.000Z",
    previousWindowStart: "2026-08-20T12:00:00.000Z",
    previousWindowEnd: "2026-08-21T12:00:00.000Z",
    topLine: withStory
      ? ["One material development was identified."]
      : ["Culture Intelligence was relatively quiet over the last 24 hours."],
    topDevelopments: withStory ? [item] : [],
    aiAndCreativeWork: [],
    sectors: { music: [], film: [], theatre: [], gaming: [] },
    positiveSignals: [],
    delta: {
      newStoryCount: withStory ? 1 : 0,
      newHighImportanceCount: withStory ? 1 : 0,
      currentQualifyingCount: withStory ? 1 : 0,
      previousQualifyingCount: 0,
      sectorChanges: {
        music: 0,
        film: withStory ? 1 : 0,
        theatre: 0,
        gaming: 0,
      },
      aiChange: 0,
      positiveChange: 0,
      bullets: ["No one-day count is presented as a trend."],
    },
    diagnostics: {
      currentWindowArticles: withStory ? 2 : 0,
      rawEligibleArticles: withStory ? 2 : 0,
      storyClusters: withStory ? 1 : 0,
      duplicateArticlesCollapsed: withStory ? 1 : 0,
      notRelevantExclusions: 0,
      humanCorrectedStoriesUsed: withStory ? 1 : 0,
      previousWindowArticles: 0,
      previousStoryClusters: 0,
    },
    mediaLastRefresh: "2026-08-22T10:00:00.000Z",
    mediaFreshnessWarning: null,
    schedulerFreshness: {
      databaseStatus: "available",
      summary: {
        CURRENT: 2,
        DUE_SOON: 0,
        STALE: 0,
        OVERDUE: 0,
        BLOCKED: 0,
        MANUAL: 0,
        STRUCTURAL: 0,
        DISABLED: 0,
        RUNNING: 0,
        FAILED_RECENTLY: 0,
      },
    },
    marketContext: [],
  };
}

describe("Daily Culture Brief UI", () => {
  it("renders source provenance and a reviewed marker", () => {
    const html = renderToStaticMarkup(<DailyBriefFull brief={brief()} />);
    expect(html).toContain("Reported by 2 sources");
    expect(html).toContain("Film Trade");
    expect(html).toContain("General News");
    expect(html).toContain("Reviewed");
    expect(html).toContain("https://example.com/film-trade");
  });

  it("renders compact Overview navigation to the full brief", () => {
    const html = renderToStaticMarkup(<DailyBriefOverview brief={brief()} />);
    expect(html).toContain("Daily Culture Brief");
    expect(html).toContain('href="/brief"');
  });

  it("renders quiet and empty-section states without fabricated stories", () => {
    const html = renderToStaticMarkup(<DailyBriefFull brief={brief(false)} />);
    expect(html).toContain("relatively quiet");
    expect(html).toContain("No story met the materiality");
    expect(html).toContain(
      "No qualifying material AI development was identified",
    );
  });
});
