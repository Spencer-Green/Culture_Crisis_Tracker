import { describe, expect, it } from "vitest";

import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  assignFullBriefSection,
  buildDailyCultureBriefCore,
  buildFullBriefSections,
  buildMediaStoryClusters,
  deriveBriefMediaFreshness,
  isAiIntelligenceStory,
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

function correctedEventFeedback(
  eventType: NonNullable<
    NonNullable<
      MediaArticleView["classificationFeedback"]
    >["correctedEventType"]
  >,
): NonNullable<MediaArticleView["classificationFeedback"]> {
  return {
    reviewState: "WRONG_CLASSIFICATION",
    reasons: ["WRONG_EVENT_TYPE"],
    correctedSector: null,
    correctedEventType: eventType,
    correctedAiTag: null,
    correctedImportance: null,
    approvedMachineClassification: null,
    evaluationState: "WRONG_CLASSIFICATION",
    reviewedAt: "2026-08-22T10:00:00.000Z",
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

  it("preserves direct fingerprint matches outside the semantic time window", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "older-direct",
        title: "Music company announces workforce layoffs",
        publishedAt: "2026-08-18T08:00:00.000Z",
        storyFingerprint: "stable-direct-match",
      }),
      article({
        id: "newer-direct",
        title: "Updated report on music company layoffs",
        publishedAt: "2026-08-22T08:00:00.000Z",
        storyFingerprint: "stable-direct-match",
      }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleIds).toEqual(["newer-direct", "older-direct"]);
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

  it("clusters the same chart rule reported with generic, specific, and corrected event labels", () => {
    const corrected = article({
      id: "aria-corrected",
      title: "AI-generated songs banned from Australian charts",
      description:
        "The releases will no longer be eligible for the ARIA Charts under the updated accreditation rules.",
      publisher: "NME Music",
      countryCode: "AU",
      sectorSlug: "ai-policy",
      eventType: "AI_ADOPTION",
      aiImpactType: "AMBIGUOUS",
      importance: 2,
      confidence: "low",
      classificationFeedback: {
        ...correctedEventFeedback("AI_POLICY_REGULATION"),
        reasons: ["WRONG_EVENT_TYPE", "WRONG_AI_TAG", "WRONG_IMPORTANCE"],
        correctedAiTag: "POLICY_REGULATION",
        correctedImportance: 5,
      },
    });
    const clusters = buildMediaStoryClusters([
      article({
        id: "aria-generic",
        title: "AI-generated music banned from Australian charts",
        description:
          "AI-generated music will be excluded from Australia's official music charts.",
        publisher: "TechCentral",
        countryCode: "AU",
        eventType: "AI_POLICY_REGULATION",
        aiImpactType: "POLICY_REGULATION",
        importance: 5,
      }),
      article({
        id: "aria-specific",
        title:
          "Australia bans largely AI-generated songs from official music charts",
        description:
          "The chart eligibility change excludes largely AI-generated music.",
        publisher: "LiveMint",
        countryCode: "AU",
        eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
        aiImpactType: "POLICY_REGULATION",
        importance: 5,
      }),
      corrected,
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      articleIds: ["aria-corrected", "aria-generic", "aria-specific"],
      sourceCount: 3,
      eventType: "AI_POLICY_REGULATION",
      humanReviewState: "corrected",
    });
    expect(corrected).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_ADOPTION",
      importance: 2,
    });
  });

  it("unites earlier groups when a later report bridges compatible story labels", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "early-made",
        title:
          "Australia bans AI-made music from its charts unless humans created most of it",
        description:
          "The Australian Recording Industry Association updated its charts code to distinguish AI-generated and AI-assisted music.",
        publishedAt: "2026-08-22T06:00:00.000Z",
        countryCode: "AU",
        eventType: "AI_ADOPTION",
        confidence: "low",
      }),
      article({
        id: "early-generated",
        title:
          "Keep It Real: AI-Generated Songs Banned from Australian Music Charts",
        description:
          "A new prohibition excludes AI-created songs from the official charts.",
        publishedAt: "2026-08-22T07:00:00.000Z",
        countryCode: "AU",
        eventType: "AI_ADOPTION",
        confidence: "low",
      }),
      article({
        id: "later-policy",
        title: "AI-generated music banned from Australian charts",
        description:
          "The Australian Recording Industry Association said AI-generated music will be excluded from Australia's music charts under its updated code.",
        publishedAt: "2026-08-22T08:00:00.000Z",
        countryCode: "AU",
        eventType: "AI_POLICY_REGULATION",
      }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleIds).toEqual([
      "early-generated",
      "early-made",
      "later-policy",
    ]);
  });

  it("keeps a chart eligibility rule separate from a licensing agreement", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "chart-rule",
        title: "ARIA changes AI chart eligibility for music releases",
        description:
          "The association excluded fully AI-generated tracks from its charts.",
        countryCode: "AU",
        eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
        aiImpactType: "POLICY_REGULATION",
      }),
      article({
        id: "licensing-deal",
        title: "Record label signs AI music licensing agreement",
        description:
          "A separate label licensed recordings for a generative AI service.",
        countryCode: "AU",
        eventType: "AI_LICENSING",
        aiImpactType: "RIGHTS_LICENSING",
      }),
    ]);

    expect(clusters).toHaveLength(2);
  });

  it("keeps separate policy actions by the same regulator", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "proposal",
        title: "FTC proposes AI transparency rule for music platforms",
        description:
          "The regulator proposed disclosure requirements for AI systems.",
        countryCode: "US",
        sectorSlug: "ai-policy",
        eventType: "AI_POLICY_REGULATION",
      }),
      article({
        id: "enforcement",
        title:
          "FTC opens unrelated AI competition enforcement action against cloud provider",
        description: "The regulator opened a separate antitrust investigation.",
        countryCode: "US",
        sectorSlug: "ai-policy",
        eventType: "AI_POLICY_REGULATION",
      }),
    ]);

    expect(clusters).toHaveLength(2);
  });

  it("clusters corrected and machine-labelled duplicates without mutating either label", () => {
    const machine = article({
      id: "machine-policy",
      title: "AI-generated music banned from Australian charts",
      description:
        "Australia's official music charts excluded AI-generated tracks.",
      countryCode: "AU",
      eventType: "AI_POLICY_REGULATION",
    });
    const corrected = article({
      id: "corrected-rights",
      title: "Australia bars AI-generated songs from official music charts",
      description:
        "The new chart rule makes fully generated releases ineligible.",
      countryCode: "AU",
      eventType: "AI_ADOPTION",
      confidence: "low",
      classificationFeedback: correctedEventFeedback(
        "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
      ),
    });

    expect(buildMediaStoryClusters([machine, corrected])).toHaveLength(1);
    expect(machine.eventType).toBe("AI_POLICY_REGULATION");
    expect(corrected.eventType).toBe("AI_ADOPTION");
    expect(corrected.classificationFeedback?.correctedEventType).toBe(
      "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
    );
  });

  it("treats generic policy and a compatible specific subtype as one story", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "broad-policy",
        title: "Australian music charts ban AI-generated tracks",
        description:
          "The policy excludes wholly generated music from official charts.",
        countryCode: "AU",
        eventType: "AI_POLICY_REGULATION",
      }),
      article({
        id: "specific-policy",
        title:
          "Australia excludes AI-generated songs from official music charts",
        description:
          "The eligibility rule removes fully generated tracks from the charts.",
        countryCode: "AU",
        eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
      }),
    ]);

    expect(clusters).toHaveLength(1);
  });

  it("does not merge generic AI policy stories on jurisdiction and event family alone", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "procurement",
        title: "Australia proposes AI safety code for government procurement",
        description:
          "The proposal would govern public-sector purchases of AI systems.",
        countryCode: "AU",
        sectorSlug: "ai-policy",
        eventType: "AI_POLICY_REGULATION",
      }),
      article({
        id: "copyright",
        title: "Australia opens AI copyright consultation for publishers",
        description:
          "The consultation concerns training data and author compensation.",
        countryCode: "AU",
        sectorSlug: "ai-policy",
        eventType: "AI_POLICY_REGULATION",
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

describe("full Daily Brief domain assignment", () => {
  it("gives material AI precedence over music and film sectors", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "aria-rule",
        title: "ARIA sets AI eligibility rules for its charts",
        description:
          "The chart authority bans wholly AI-generated songs and withdraws their accreditation.",
        countryCode: "AU",
        sectorSlug: "music",
        eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
        aiImpactType: "POLICY_REGULATION",
        importance: 5,
      }),
      article({
        id: "film-ai",
        title:
          "Anthropic releases new multimodal reasoning model for film production",
        description:
          "The deployed system delivers major performance gains and a materially new capability for film production.",
        sectorSlug: "film",
        eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
        aiImpactType: "INDUSTRY_EFFICIENCY",
        importance: 4,
      }),
    ]);
    const sections = buildFullBriefSections(clusters);

    expect(
      sections["ai-intelligence"].map(
        (cluster) => cluster.representativeArticleId,
      ),
    ).toEqual(["aria-rule", "film-ai"]);
    expect(sections.music).toEqual([]);
    expect(sections.film).toEqual([]);
    expect(
      Object.values(sections)
        .flat()
        .map((cluster) => cluster.clusterId),
    ).toHaveLength(2);
  });

  it("assigns non-AI material stories to their effective sectors", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "music-acquisition",
        title: "Major record label acquires independent music company",
        sectorSlug: "music",
        eventType: "CONSOLIDATION_ACQUISITION",
        importance: 5,
      }),
      article({
        id: "film-merger",
        title: "Major film studios complete production merger",
        sectorSlug: "film",
        eventType: "CONSOLIDATION_ACQUISITION",
        importance: 4,
      }),
      article({
        id: "incidental-ai",
        title: "Music label invests in expanded catalog operations",
        description:
          "The investment expands music operations; an internal pilot also mentions AI-assisted tagging.",
        sectorSlug: "music",
        eventType: "INVESTMENT",
        aiImpactType: "AMBIGUOUS",
        importance: 3,
      }),
    ]);
    const sections = buildFullBriefSections(clusters);

    expect(
      sections.music.map((cluster) => cluster.representativeArticleId),
    ).toEqual(["music-acquisition", "incidental-ai"]);
    expect(
      sections.film.map((cluster) => cluster.representativeArticleId),
    ).toEqual(["film-merger"]);
    expect(sections["ai-intelligence"]).toEqual([]);
  });

  it("uses a human-corrected sector without mutating the machine label", () => {
    const machine = article({
      id: "corrected-sector",
      title: "Independent music label receives major investment",
      sectorSlug: "film",
      eventType: "INVESTMENT",
      importance: 4,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_SECTOR"],
        correctedSector: "music",
        correctedEventType: null,
        correctedAiTag: null,
        correctedImportance: null,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-22T10:00:00.000Z",
      },
    });
    const [cluster] = buildMediaStoryClusters([machine]);

    expect(assignFullBriefSection(cluster)).toBe("music");
    expect(cluster.sector).toBe("music");
    expect(machine.sectorSlug).toBe("film");
  });

  it("excludes manually not-relevant clusters from presentation assignment", () => {
    const [cluster] = buildMediaStoryClusters([
      article({
        id: "later-rejected",
        title: "Music company announces major investment",
        eventType: "INVESTMENT",
        importance: 4,
      }),
    ]);
    cluster.articles[0].classificationFeedback = {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
      correctedSector: null,
      correctedEventType: null,
      correctedAiTag: null,
      correctedImportance: null,
      approvedMachineClassification: null,
      evaluationState: "WRONG_CLASSIFICATION",
      reviewedAt: "2026-08-22T10:00:00.000Z",
    };

    expect(assignFullBriefSection(cluster)).toBeNull();
    expect(buildFullBriefSections([cluster]).music).toEqual([]);
  });

  it("preserves deterministic ranking and per-section limits", () => {
    const clusters = buildMediaStoryClusters([
      article({
        id: "lower",
        title: "Regional music company announces investment",
        eventType: "INVESTMENT",
        importance: 3,
      }),
      article({
        id: "higher",
        title: "Major music company announces record investment",
        eventType: "INVESTMENT",
        importance: 5,
      }),
    ]);

    expect(
      buildFullBriefSections(clusters).music.map(
        (cluster) => cluster.representativeArticleId,
      ),
    ).toEqual(["higher", "lower"]);
    expect(buildFullBriefSections(clusters, 1).music).toHaveLength(1);
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

  it("routes material structural AI without requiring a creative-sector term", () => {
    const [cluster] = buildMediaStoryClusters([
      article({
        id: "frontier-model",
        title: "OpenAI releases new frontier model",
        description:
          "The next-generation foundation model is now broadly available.",
        sectorSlug: "ai-policy",
        eventType: "AI_ADOPTION",
        aiImpactType: "INDUSTRY_EFFICIENCY",
        importance: 4,
        confidence: "high",
      }),
    ]);

    expect(isCreativeAiStory(cluster)).toBe(false);
    expect(isAiIntelligenceStory(cluster)).toBe(true);
    expect(
      buildDailyCultureBriefCore({ now: NOW, articles: cluster.articles })
        .aiAndCreativeWork,
    ).toHaveLength(1);
  });

  it("uses corrected ARIA policy labels for AI and Top Developments eligibility", () => {
    const aria = article({
      id: "aria-ai-chart-policy",
      title: "AI-generated songs banned from Australian charts",
      description:
        "Songs made entirely using AI may have accreditations withdrawn and will no longer be eligible for the ARIA Charts.",
      sectorSlug: "ai-policy",
      eventType: "AI_ADOPTION",
      aiImpactType: "AMBIGUOUS",
      importance: 2,
      confidence: "low",
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_EVENT_TYPE", "WRONG_AI_TAG", "WRONG_IMPORTANCE"],
        correctedSector: null,
        correctedEventType: "AI_POLICY_REGULATION",
        correctedAiTag: "POLICY_REGULATION",
        correctedImportance: 5,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-22T10:00:00.000Z",
      },
    });

    const brief = buildDailyCultureBriefCore({ now: NOW, articles: [aria] });
    expect(brief.aiAndCreativeWork).toHaveLength(1);
    expect(brief.topDevelopments).toHaveLength(1);
    expect(brief.topDevelopments[0]).toMatchObject({
      eventType: "AI_POLICY_REGULATION",
      importance: 5,
      humanReviewState: "corrected",
    });
    expect(aria).toMatchObject({
      eventType: "AI_ADOPTION",
      importance: 2,
      confidence: "low",
    });
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
