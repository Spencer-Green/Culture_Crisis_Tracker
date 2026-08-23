import { describe, expect, it } from "vitest";

import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  assessMiddleTierHealth,
  buildAiDisruptionIndicator,
  buildIndustryViability,
  buildSectorViability,
  classifyDirectionalChange,
  completeObservations,
  indexToBaseline,
  operationalFreshness,
  percentChange,
} from "@/services/overview-analytics-core";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function article(
  overrides: Partial<MediaArticleView> & Pick<MediaArticleView, "id" | "title">,
): MediaArticleView {
  return {
    sourceType: "RSS",
    canonicalUrl: `https://example.com/${overrides.id}`,
    description:
      "A film studio and creators reached an agreement governing generative AI rights and creative work.",
    publisher: "Example Trade",
    sourceDomain: "example.com",
    publishedAt: "2026-08-21T12:00:00.000Z",
    retrievedAt: "2026-08-21T13:00:00.000Z",
    countryCode: "US",
    sectorSlug: "film",
    eventType: "AI_LICENSING",
    polarity: "neutral/ambiguous",
    confidence: "high",
    importance: 4,
    aiImpactType: "RIGHTS_LICENSING",
    reviewState: "unreviewed",
    classificationRationale: "Fixture classification",
    classificationFeedback: null,
    storyFingerprint: null,
    possibleDuplicateStory: false,
    sourceMatches: ["RSS"],
    ...overrides,
  };
}

describe("overview normalization", () => {
  it("calculates changes and indexes without converting missing values to zero", () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(null, 100)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
    expect(indexToBaseline(75, 50)).toBe(150);
    expect(indexToBaseline(75, null)).toBeNull();
  });

  it("excludes incomplete and future periods", () => {
    const observations = [
      { id: "complete", periodEnd: new Date("2026-07-31T23:59:59.999Z") },
      { id: "partial", periodEnd: new Date("2026-08-31T23:59:59.999Z") },
      { id: "future", periodEnd: new Date("2026-09-30T23:59:59.999Z") },
    ];
    expect(
      completeObservations(observations, NOW).map((item) => item.id),
    ).toEqual(["complete"]);
  });

  it("uses transparent neutral bands and direction semantics", () => {
    expect(classifyDirectionalChange(1.5, 2)).toBe("stable");
    expect(classifyDirectionalChange(3, 2)).toBe("improving");
    expect(classifyDirectionalChange(-3, 2)).toBe("pressured");
    expect(classifyDirectionalChange(null, 2)).toBe("insufficient");
  });
});

describe("industry viability breadth", () => {
  const component = (
    id: string,
    valuePct: number | null,
    freshness: "current" | "degraded" = "current",
  ) => ({
    id,
    sourceId: id,
    label: id,
    geography: "Test market",
    frequency: "annual",
    detail: "Test component",
    freshness,
    measures: [{ label: id, valuePct, neutralBandPct: 2 }],
  });

  it("reports mixed breadth instead of averaging unrelated percentages", () => {
    const result = buildIndustryViability([
      buildSectorViability({
        sector: "music",
        label: "Music",
        components: [component("music", -12)],
      }),
      buildSectorViability({
        sector: "film",
        label: "Film",
        components: [component("film", 25)],
      }),
      buildSectorViability({
        sector: "theatre",
        label: "Theatre",
        components: [component("theatre", -4)],
      }),
      buildSectorViability({
        sector: "gaming",
        label: "Gaming activity",
        basis: "activity-proxy",
        components: [component("gaming", 8)],
      }),
    ]);
    expect(result).toMatchObject({
      state: "mixed",
      coveredSectorCount: 3,
      improvingSectorCount: 1,
      pressuredSectorCount: 2,
    });
  });

  it("preserves stale inputs as degraded rather than neutral", () => {
    const sector = buildSectorViability({
      sector: "film",
      label: "Film",
      components: [component("film", 10, "degraded")],
    });
    expect(sector.direction).toBe("improving");
    expect(sector.degradedComponentCount).toBe(1);
    expect(operationalFreshness("FAILED_RECENTLY")).toBe("degraded");
    expect(operationalFreshness("CURRENT")).toBe("current");
    expect(operationalFreshness("STRUCTURAL")).toBe("structural");
  });
});

describe("AI creative disruption", () => {
  it("scores syndicated coverage once at story level", () => {
    const single = buildAiDisruptionIndicator({
      now: NOW,
      currentArticles: [
        article({
          id: "one",
          title: "Actors reach AI likeness licensing deal",
        }),
      ],
      previousArticles: [],
    });
    const syndicated = buildAiDisruptionIndicator({
      now: NOW,
      currentArticles: [
        article({
          id: "one",
          title: "Actors reach AI likeness licensing deal",
          storyFingerprint: "same-story",
        }),
        article({
          id: "two",
          title: "Actors reach AI likeness licensing deal",
          canonicalUrl: "https://publisher.example/two",
          publisher: "Second Publisher",
          storyFingerprint: "same-story",
        }),
      ],
      previousArticles: [],
    });
    expect(syndicated.clusterCount).toBe(1);
    expect(syndicated.duplicateArticlesCollapsed).toBe(1);
    expect(syndicated.score).toBeLessThan(single.score * 1.2);
  });

  it("uses human corrections for analytical routing without mutating machine labels", () => {
    const machine = article({
      id: "corrected",
      title:
        "Actors union reaches generative AI likeness licensing agreement with film studio",
      eventType: "INVESTMENT",
      aiImpactType: null,
      importance: 2,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_EVENT_TYPE", "WRONG_AI_TAG", "WRONG_IMPORTANCE"],
        correctedSector: null,
        correctedEventType: "AI_LICENSING",
        correctedAiTag: "RIGHTS_LICENSING",
        correctedImportance: 5,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-22T10:00:00.000Z",
      },
    });
    const result = buildAiDisruptionIndicator({
      now: NOW,
      currentArticles: [machine],
      previousArticles: [],
    });
    expect(result.clusterCount).toBe(1);
    expect(result.correctedClusterCount).toBe(1);
    expect(result.clusters[0]).toMatchObject({
      eventType: "AI_LICENSING",
      aiImpactType: "RIGHTS_LICENSING",
      importance: 5,
    });
    expect(machine).toMatchObject({
      eventType: "INVESTMENT",
      aiImpactType: null,
      importance: 2,
    });
  });

  it("excludes NOT_RELEVANT feedback from the signal", () => {
    const result = buildAiDisruptionIndicator({
      now: NOW,
      currentArticles: [
        article({
          id: "excluded",
          title: "Actors reach AI likeness licensing deal",
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
      ],
      previousArticles: [],
    });
    expect(result.clusterCount).toBe(0);
    expect(result.notRelevantExclusions).toBe(1);
  });

  it("is deterministic and gives importance priority over source volume", () => {
    const input = {
      now: NOW,
      currentArticles: [
        article({
          id: "high",
          title:
            "Actors union wins major generative AI likeness rights ruling for film work",
          importance: 5,
        }),
        article({
          id: "low",
          title:
            "Film studio tests generative AI creator tool for actors and screen production",
          eventType: "AI_CREATOR_TOOL" as const,
          aiImpactType: "TOOL_ADOPTION" as const,
          importance: 1,
        }),
      ],
      previousArticles: [
        article({
          id: "previous",
          title:
            "Actors union reaches AI likeness licensing agreement with film studio",
          publishedAt: "2026-08-12T12:00:00.000Z",
          importance: 1,
        }),
      ],
    };
    expect(buildAiDisruptionIndicator(input)).toEqual(
      buildAiDisruptionIndicator(input),
    );
    expect(buildAiDisruptionIndicator(input).direction).toBe("increasing");
  });
});

describe("middle-tier readiness", () => {
  it("remains pending when distribution concepts are not observed", () => {
    const result = assessMiddleTierHealth({
      hasEntityScale: false,
      hasOwnershipClassification: false,
      hasEconomicDistribution: false,
      hasLongitudinalDistribution: true,
      sectorCoverage: 2,
      availableEvidence: ["events per venue", "publisher release share"],
    });
    expect(result.status).toBe("pending");
    expect(result.label).toContain("distribution data required");
    expect(result.missingRequirements).toContain("entity scale or capacity");
  });
});
