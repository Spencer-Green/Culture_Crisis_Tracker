import { describe, expect, it, vi } from "vitest";

import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  buildMediaStoryClusters,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import {
  aggregateStoryEvaluation,
  compareMachineAndLlmMateriality,
  estimateStoryEvaluationUpperBound,
  expectedMaterialityForImportance,
  runStorySynthesisEvaluation,
  selectRepresentativeStorySample,
  serializeStoryEvaluationArtifact,
  storyEvaluationFlags,
  type StoryEvaluationArtifact,
} from "@/services/media/story-synthesis-evaluation-core";

function article(
  overrides: Partial<MediaArticleView> & Pick<MediaArticleView, "id" | "title">,
): MediaArticleView {
  return {
    sourceType: "RSS",
    canonicalUrl: `https://example.com/${overrides.id}`,
    description: "A specific cultural-economy development was announced.",
    publisher: "Publisher",
    sourceDomain: "example.com",
    publishedAt: "2026-08-24T08:00:00.000Z",
    retrievedAt: "2026-08-24T09:00:00.000Z",
    countryCode: "US",
    sectorSlug: "film",
    eventType: "LAYOFFS",
    polarity: "negative",
    confidence: "high",
    importance: 4,
    aiImpactType: null,
    reviewState: "unreviewed",
    classificationRationale: "Fixture",
    classificationFeedback: null,
    storyFingerprint: overrides.id,
    possibleDuplicateStory: false,
    sourceMatches: ["RSS"],
    ...overrides,
  };
}

function cluster(
  id: string,
  overrides: Partial<MediaArticleView> = {},
): MediaStoryCluster {
  const [value] = buildMediaStoryClusters([
    article({ id, title: `${id} announces workforce layoffs`, ...overrides }),
  ]);
  if (!value) throw new Error("Fixture cluster missing.");
  return value;
}

function validOutput(sector = "film") {
  return JSON.stringify({
    eventSummary: "The supplied evidence reports a specific development.",
    whyItMatters: "The development may affect cultural-economy capacity.",
    affectedSectors: [sector],
    mechanisms: ["PRODUCTION_CAPACITY"],
    evidenceStrength: "HIGH",
    uncertainties: [],
    materialityLevel: "HIGH",
    materialityRationale:
      "The supported development has meaningful implications for production capacity.",
  });
}

describe("materiality comparison", () => {
  it("maps deterministic importance to transparent qualitative bands", () => {
    expect([1, 2, 3, 4, 5].map(expectedMaterialityForImportance)).toEqual([
      "VERY_LOW",
      "LOW",
      "MODERATE",
      "HIGH",
      "VERY_HIGH",
    ]);
  });

  it.each([
    [2, "HIGH", "LLM_HIGHER", 2, "2+"],
    [5, "HIGH", "LLM_LOWER", 1, "1"],
    [3, "MODERATE", "ALIGNED", 0, "0"],
  ] as const)(
    "identifies direction and magnitude without changing importance",
    (importance, llm, direction, magnitude, magnitudeBand) => {
      expect(compareMachineAndLlmMateriality(importance, llm)).toMatchObject({
        machineImportance: importance,
        direction,
        magnitude,
        magnitudeBand,
      });
    },
  );

  it("flags low-evidence high-materiality results independently", () => {
    expect(
      storyEvaluationFlags(cluster("ai"), {
        ...JSON.parse(validOutput()),
        evidenceStrength: "LOW",
        materialityLevel: "HIGH",
      }),
    ).toContain("LOW_EVIDENCE_HIGH_MATERIALITY");
  });
});

describe("representative evaluation sampling", () => {
  it("selects deterministic sector/event diversity and prefers reviewed data", () => {
    const correctFeedback = {
      reviewState: "CORRECT" as const,
      reasons: [],
      correctedSector: null,
      correctedEventType: null,
      correctedAiTag: null,
      correctedImportance: null,
      approvedMachineClassification: {
        sector: "music" as const,
        eventType: "AI_CREATOR_TOOL" as const,
        aiTag: "TOOL_ADOPTION" as const,
        importance: 2 as const,
        confidence: "medium" as const,
      },
      evaluationState: "CORRECT" as const,
      reviewedAt: "2026-08-24T10:00:00.000Z",
    };
    const correctedFeedback = {
      reviewState: "WRONG_CLASSIFICATION" as const,
      reasons: ["WRONG_IMPORTANCE" as const],
      correctedSector: null,
      correctedEventType: null,
      correctedAiTag: null,
      correctedImportance: 4 as const,
      approvedMachineClassification: null,
      evaluationState: "WRONG_CLASSIFICATION" as const,
      reviewedAt: "2026-08-24T10:00:00.000Z",
    };
    const candidates = [
      cluster("film", { sectorSlug: "film", eventType: "LAYOFFS" }),
      cluster("music-ai", {
        sectorSlug: "music",
        eventType: "AI_CREATOR_TOOL",
        aiImpactType: "TOOL_ADOPTION",
        importance: 2,
        confidence: "medium",
        classificationFeedback: correctFeedback,
        title: "Music platform launches broad AI creator tools",
      }),
      cluster("theatre", {
        sectorSlug: "theatre",
        eventType: "CLOSURE",
        title: "Regional theatre announces permanent closure",
        classificationFeedback: correctedFeedback,
      }),
      cluster("gaming", {
        sectorSlug: "gaming",
        eventType: "INVESTMENT",
        polarity: "positive",
        title: "Game studio announces major production investment",
      }),
      cluster("film-two", {
        sectorSlug: "film",
        eventType: "CONSOLIDATION_ACQUISITION",
        title: "Film companies announce merger",
      }),
    ];

    const first = selectRepresentativeStorySample(candidates, 4);
    const second = selectRepresentativeStorySample(candidates, 4);

    expect(first.map((item) => item.clusterId)).toEqual(
      second.map((item) => item.clusterId),
    );
    expect(new Set(first.map((item) => item.sector)).size).toBe(4);
    expect(first.some((item) => item.humanReviewState === "corrected")).toBe(
      true,
    );
    expect(
      first.some((item) =>
        item.articles.some(
          (entry) => entry.classificationFeedback?.reviewState === "CORRECT",
        ),
      ),
    ).toBe(true);
  });

  it("enforces the 20-call maximum", () => {
    expect(() => selectRepresentativeStorySample([cluster("one")], 21)).toThrow(
      "1 to 20",
    );
  });

  it("does not spend evaluation slots on likely duplicate clusters", () => {
    const candidates = [
      cluster("duplicate-one", {
        title:
          "Mark Ruffalo fires back after Paramount calls merger attack dishonest",
      }),
      cluster("duplicate-two", {
        title:
          "Mark Ruffalo blasts Paramount over dishonest response to merger criticism",
      }),
      cluster("distinct", {
        sectorSlug: "music",
        eventType: "CANCELLATION",
        title: "Music festival announces cancellation",
      }),
    ];
    const sample = selectRepresentativeStorySample(candidates, 3);
    expect(sample).toHaveLength(2);
    expect(sample.some((item) => item.sector === "music")).toBe(true);
  });
});

describe("evaluation execution and artifacts", () => {
  it("makes zero API calls for dry runs", async () => {
    const createResponse = vi.fn();
    const run = await runStorySynthesisEvaluation({
      sample: [cluster("dry")],
      limit: 1,
      dryRun: true,
      confirmed: false,
      createResponse,
    });
    expect(run.dryRun).toBe(true);
    expect(run.summary.calls).toBe(0);
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before live calls", async () => {
    const createResponse = vi.fn();
    await expect(
      runStorySynthesisEvaluation({
        sample: [cluster("confirmation")],
        limit: 1,
        dryRun: false,
        confirmed: false,
        createResponse,
      }),
    ).rejects.toThrow("Explicit confirmation");
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("calls each cluster once, records failures, and never retries", async () => {
    const createResponse = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({
        model: "gpt-5.6-luna",
        outputText: validOutput(),
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 50,
          totalTokens: 150,
        },
      });
    const run = await runStorySynthesisEvaluation({
      sample: [cluster("failure"), cluster("success")],
      limit: 2,
      dryRun: false,
      confirmed: true,
      createResponse,
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(run.records.map((record) => record.status)).toEqual([
      "FAILURE",
      "SUCCESS",
    ]);
  });

  it("retains usage and latency when a billed response fails validation", async () => {
    const run = await runStorySynthesisEvaluation({
      sample: [cluster("invalid-response")],
      limit: 1,
      dryRun: false,
      confirmed: true,
      createResponse: vi.fn().mockResolvedValue({
        model: "gpt-5.6-luna",
        outputText: "{}",
        usage: {
          inputTokens: 120,
          cachedInputTokens: 20,
          outputTokens: 30,
          totalTokens: 150,
        },
      }),
    });
    expect(run.records[0]).toMatchObject({
      status: "FAILURE",
      latencyMs: expect.any(Number),
      usage: { totalTokens: 150 },
    });
    expect(run.summary).toMatchObject({
      calls: 1,
      successes: 0,
      failures: 1,
      meteredCalls: 1,
      usage: { totalTokens: 150 },
    });
  });

  it("aggregates cost plus median and p95 latency", () => {
    const execution = (latencyMs: number) => ({
      model: "gpt-5.6-luna",
      synthesis: JSON.parse(validOutput()),
      evidence: {} as never,
      latencyMs,
      usage: {
        inputTokens: 1_000,
        cachedInputTokens: 0,
        outputTokens: 100,
        totalTokens: 1_100,
      },
      estimatedCost: {
        currency: "USD" as const,
        uncachedInputUsd: 0.0002,
        cachedInputUsd: 0,
        outputUsd: 0.00012,
        totalUsd: 0.00032,
      },
    });
    const records = [100, 200, 300].map((latencyMs, index) => ({
      status: "SUCCESS" as const,
      cluster: {
        clusterId: String(index),
        representativeArticleId: String(index),
        headline: "Headline",
        sector: "film",
        eventType: "LAYOFFS",
        aiImpactType: null,
        machineImportance: 4,
        effectiveImportance: 4,
        confidence: "high",
        humanReviewState: "unreviewed",
        articleCount: 1,
        sourceCount: 1,
        publishers: ["Publisher"],
      },
      execution: execution(latencyMs),
      comparison: compareMachineAndLlmMateriality(4, "HIGH"),
      flags: ["SINGLE_SOURCE" as const],
      humanEvaluation: null,
    }));
    const summary = aggregateStoryEvaluation(records);
    expect(summary.medianLatencyMs).toBe(200);
    expect(summary.p95LatencyMs).toBe(300);
    expect(summary.usage.totalTokens).toBe(3_300);
    expect(summary.estimatedCost.totalUsd).toBeCloseTo(0.00096, 12);
  });

  it("calculates a conservative upper-bound spend", () => {
    const estimate = estimateStoryEvaluationUpperBound([cluster("estimate")]);
    expect(estimate.estimatedUsage.inputTokens).toBeGreaterThan(2_000);
    expect(estimate.estimatedUsage.outputTokens).toBe(800);
    expect(estimate.estimatedCost.totalUsd).toBeGreaterThan(0);
  });

  it("serializes local evaluation data without secrets", () => {
    const artifact: StoryEvaluationArtifact = {
      artifactVersion: "story-synthesis-evaluation-v1",
      generatedAt: "2026-08-25T00:00:00.000Z",
      model: "gpt-5.6-luna",
      evidenceVersion: "story-synthesis-evidence-v1",
      reviewAudit: {
        totalArticles: 1,
        reviewedArticles: 0,
        correctArticles: 0,
        wrongArticles: 0,
        correctionCoverage: {
          sector: 0,
          eventType: 0,
          aiTag: 0,
          importance: 0,
        },
        eligibleClusters: 1,
        reviewedEligibleClusters: 0,
        confirmedEligibleClusters: 0,
        correctedEligibleClusters: 0,
        ambiguousEligibleClusters: 0,
      },
      run: {
        dryRun: true,
        selectedClusters: [],
        records: [],
        summary: aggregateStoryEvaluation([]),
      },
    };
    const serialized = serializeStoryEvaluationArtifact(artifact, [
      "sk-test-secret",
    ]);
    expect(serialized).toContain("story-synthesis-evaluation-v1");
    expect(serialized).not.toContain("sk-test-secret");
    expect(() =>
      serializeStoryEvaluationArtifact(
        { ...artifact, evidenceVersion: "sk-test-secret" },
        ["sk-test-secret"],
      ),
    ).toThrow("forbidden secret");
  });
});
