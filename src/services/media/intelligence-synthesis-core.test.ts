import { describe, expect, it, vi } from "vitest";

import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  buildMediaStoryClusters,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import {
  buildIntelligenceSynthesisEvidence,
  buildIntelligenceSynthesisRequest,
  INTELLIGENCE_SYNTHESIS_MAX_EVIDENCE_CHARACTERS,
  parseIntelligenceSynthesisOutput,
  selectIntelligenceSynthesisClusters,
  synthesizeIntelligenceClusters,
  type IntelligenceSynthesisResult,
} from "@/services/media/intelligence-synthesis-core";
import { StorySynthesisValidationError } from "@/services/media/story-synthesis-core";

function article(
  overrides: Partial<MediaArticleView> & Pick<MediaArticleView, "id" | "title">,
): MediaArticleView {
  return {
    sourceType: "RSS",
    canonicalUrl: `https://example.com/${overrides.id}`,
    description: "The regulator adopted a national rule governing AI systems.",
    publisher: "Policy Source",
    sourceDomain: "example.com",
    publishedAt: "2026-08-26T08:00:00.000Z",
    retrievedAt: "2026-08-26T09:00:00.000Z",
    countryCode: "US",
    sectorSlug: "ai-policy",
    eventType: "AI_POLICY_REGULATION",
    polarity: "neutral/ambiguous",
    signalDirection: "AMBIGUOUS",
    confidence: "high",
    importance: 5,
    aiImpactType: "POLICY_REGULATION",
    reviewState: "unreviewed",
    classificationRationale: "Fixture classification",
    classificationFeedback: null,
    storyFingerprint: overrides.id,
    possibleDuplicateStory: false,
    sourceMatches: ["RSS"],
    sourceEvidence: {
      evidenceRole: "PRIMARY_DOCUMENT",
      sourcePerspective: "OFFICIAL",
      jurisdiction: "US",
      sourceSpecialisms: ["AI_POLICY"],
      institution: "Policy Authority",
    },
    ...overrides,
  };
}

function clusters(): MediaStoryCluster[] {
  return buildMediaStoryClusters([
    article({ id: "rule", title: "Authority adopts national AI rule" }),
    article({
      id: "analysis",
      title: "Specialist analysis interprets the national AI rule",
      description:
        "The specialist argues that the rule may change model-governance practice.",
      eventType: null,
      importance: 4,
      publishedAt: "2026-08-22T08:00:00.000Z",
      sourceEvidence: {
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "LEGAL",
        jurisdiction: "US",
        sourceSpecialisms: ["AI_POLICY"],
        institution: "Policy Analysis",
      },
    }),
    article({
      id: "compute",
      title: "AI company announces major compute expansion",
      description:
        "The company announced a major investment to expand data-centre capacity.",
      eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      importance: 4,
      sourceEvidence: {
        evidenceRole: "JOURNALISTIC_REPORTING",
        sourcePerspective: "JOURNALISTIC",
        jurisdiction: "GLOBAL",
        sourceSpecialisms: ["AI_INFRASTRUCTURE"],
        institution: "Example News",
      },
    }),
  ]);
}

function validOutput(
  evidence: ReturnType<typeof buildIntelligenceSynthesisEvidence>,
): IntelligenceSynthesisResult {
  return {
    dominantSignal:
      "The supplied developments are concentrated in AI governance, with a rule and attributed analysis of its possible implications.",
    developments: evidence.clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      claimKind: cluster.claimDiscipline.dominantClaimKind,
      structuralSignificance:
        cluster.classification.eventType === "AI_POLICY_REGULATION"
          ? ("STRUCTURAL_DEVELOPMENT" as const)
          : ("SIGNAL" as const),
      contribution: `The supplied evidence supports the narrow claim associated with ${cluster.headline}.`,
    })),
    connections: evidence.relationshipHints.slice(0, 1).map((hint) => ({
      clusterIds: hint.clusterIds,
      relationship: "SHARED_STRUCTURAL_MECHANISM" as const,
      assessment:
        "The items concern the same governance mechanism, but the evidence does not establish causality.",
      causality: "NOT_ESTABLISHED" as const,
    })),
    temporalAssessment: {
      classification: evidence.temporalContext.historicalComparatorAvailable
        ? ("CONTINUATION" as const)
        : ("INSUFFICIENT_HISTORY" as const),
      assessment: evidence.temporalContext.historicalComparatorAvailable
        ? "The older analysis supplies limited context for the newer action without proving a trend."
        : "The packet lacks enough history to characterize a trend.",
    },
    contradictions: [],
    uncertainties: [
      {
        type: "TRAJECTORY" as const,
        statement:
          "The evidence does not establish whether similar rules will spread.",
      },
    ],
    whatToWatch: [
      "Whether another national regulator adopts a comparable rule.",
    ],
  };
}

describe("bounded intelligence synthesis", () => {
  it("selects a deterministic, related, bounded shortlist", () => {
    const candidates = clusters();
    const first = selectIntelligenceSynthesisClusters(candidates, 3);
    const second = selectIntelligenceSynthesisClusters(candidates, 3);

    expect(first.map((cluster) => cluster.clusterId)).toEqual(
      second.map((cluster) => cluster.clusterId),
    );
    expect(first).toHaveLength(3);
    expect(() => selectIntelligenceSynthesisClusters(candidates, 7)).toThrow(
      RangeError,
    );
  });

  it("does not multiply syndicated duplicate clusters in the shortlist", () => {
    const base = clusters();
    const duplicate = buildMediaStoryClusters([
      article({
        id: "duplicate-rule",
        title: "Authority adopts the national AI rule",
        publisher: "Syndicated Publisher",
        sourceDomain: "syndicated.example",
      }),
    ])[0];
    const selected = selectIntelligenceSynthesisClusters(
      [base[0], duplicate, ...base.slice(1)],
      4,
    );

    expect(
      selected.filter((cluster) =>
        /adopts?.*national ai rule/i.test(cluster.canonicalHeadline),
      ),
    ).toHaveLength(1);
  });

  it("builds a compact provenance-aware packet with bounded pair analysis", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });

    expect(evidence.bounds.includedClusters).toBe(3);
    expect(evidence.bounds.serializedCharacters).toBeLessThanOrEqual(
      INTELLIGENCE_SYNTHESIS_MAX_EVIDENCE_CHARACTERS,
    );
    expect(evidence.relationshipHints.length).toBeGreaterThan(0);
    expect(evidence.clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceComposition: expect.objectContaining({
            sourceIndependence: "NOT_ESTABLISHED",
          }),
        }),
      ]),
    );
  });

  it("marks explicit low-ranked packets as evaluation-only without changing labels", () => {
    const lowRanked = buildMediaStoryClusters([
      article({
        id: "forecast",
        title: "Executive estimates AI could address a very large market",
        description:
          "The executive said AI could address a very large market, but supplied no observed market result.",
        eventType: null,
        importance: 1,
        confidence: "low",
      }),
    ]);
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: lowRanked,
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
      evaluationOnly: true,
    });

    expect(evidence.evaluationOnly).toBe(true);
    expect(evidence.clusters[0].evaluationContext).toEqual({
      productionEligible: false,
      evaluationOnly: true,
    });
    expect(evidence.clusters[0].classification.importance).toBe(1);
  });

  it("keeps untrusted evidence outside trusted instructions and disables tools", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const request = buildIntelligenceSynthesisRequest(evidence);

    expect(request.input).toContain("BEGIN_UNTRUSTED_STORED_EVIDENCE");
    expect(request.instructions).toContain(
      "publisherCount is not independent confirmation",
    );
    expect(request.instructions).toContain(
      "Analysis with eventType=null is valid",
    );
    expect(request.instructions).toContain(
      "Do not use 'caused', 'causes', 'led to', 'resulted in', or 'proves'",
    );
    expect(request.instructions).toContain(
      "Do not write that an actor 'should' do something",
    );
    expect(request).not.toHaveProperty("tools");
    expect(request.store).toBe(false);
  });

  it("accepts null-event specialist interpretation without creating an event", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const parsed = parseIntelligenceSynthesisOutput(
      JSON.stringify(validOutput(evidence)),
      evidence,
    );
    const analytical = evidence.clusters.find(
      (cluster) => cluster.classification.eventType === null,
    )!;

    expect(analytical.claimDiscipline.dominantClaimKind).toBe(
      "ATTRIBUTED_FORECAST_OR_ANALYSIS",
    );
    expect(
      parsed.developments.find(
        (development) => development.clusterId === analytical.clusterId,
      )?.claimKind,
    ).toBe("ATTRIBUTED_FORECAST_OR_ANALYSIS");
  });

  it("rejects claim drift and invented cross-story relationships", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const output = validOutput(evidence);
    output.developments[0].claimKind = "GENERIC_MENTION";
    expect(() =>
      parseIntelligenceSynthesisOutput(JSON.stringify(output), evidence),
    ).toThrow("deterministic claim kind");

    const invented = validOutput(evidence);
    invented.connections = [
      {
        clusterIds: [evidence.clusters[0].clusterId, "missing-cluster"] as [
          string,
          string,
        ],
        relationship: "CONTRAST",
        assessment: "The stories conflict.",
        causality: "NOT_ESTABLISHED",
      },
    ];
    expect(() =>
      parseIntelligenceSynthesisOutput(JSON.stringify(invented), evidence),
    ).toThrow("unsupported cross-story relationship");
  });

  it("accepts a three-cluster connection when every pair is deterministically hinted", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const clusterIds = evidence.clusters.map((cluster) => cluster.clusterId);
    evidence.relationshipHints = [
      [0, 1],
      [0, 2],
      [1, 2],
    ].map(([left, right]) => ({
      clusterIds: [clusterIds[left], clusterIds[right]],
      sharedSignals: ["ai-category:AI_POLICY_REGULATION"],
      temporalOrder: "EARLIER_TO_LATER" as const,
      possibleContradiction: false,
    }));
    const output = validOutput(evidence);
    output.connections = [
      {
        clusterIds,
        relationship: "SHARED_STRUCTURAL_MECHANISM",
        assessment:
          "The supplied items share a governance mechanism, without establishing causality.",
        causality: "NOT_ESTABLISHED",
      },
    ];

    expect(
      parseIntelligenceSynthesisOutput(JSON.stringify(output), evidence)
        .connections[0].clusterIds,
    ).toEqual(clusterIds);
  });

  it("rejects temporal overstatement and unsupported causality", () => {
    const recent = clusters().map((cluster) => ({
      ...cluster,
      earliestPublishedAt: "2026-08-26T08:00:00.000Z",
      latestPublishedAt: "2026-08-26T08:00:00.000Z",
    }));
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: recent,
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const temporal = validOutput(evidence);
    temporal.temporalAssessment.classification = "POSSIBLE_INFLECTION";
    expect(() =>
      parseIntelligenceSynthesisOutput(JSON.stringify(temporal), evidence),
    ).toThrow("without a historical comparator");

    const causal = validOutput(evidence);
    causal.dominantSignal = "The policy action caused the compute expansion.";
    expect(() =>
      parseIntelligenceSynthesisOutput(JSON.stringify(causal), evidence),
    ).toThrow("unsupported cross-story causality");
  });

  it("makes one bounded API call and preserves usage without persistence", async () => {
    const selected = clusters();
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: selected,
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    const createResponse = vi.fn().mockResolvedValue({
      model: "gpt-5.6-luna",
      outputText: JSON.stringify(validOutput(evidence)),
      usage: {
        inputTokens: 2_000,
        cachedInputTokens: 500,
        outputTokens: 300,
        totalTokens: 2_300,
      },
    });
    const times = [100, 145];
    const result = await synthesizeIntelligenceClusters(
      selected,
      createResponse,
      {
        generatedAt: new Date("2026-08-27T00:00:00.000Z"),
        now: () => times.shift()!,
      },
    );

    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(result.latencyMs).toBe(45);
    expect(result.usage.totalTokens).toBe(2_300);
    expect(result.estimatedCost.totalUsd).toBeGreaterThan(0);
  });

  it("rejects malformed model output", () => {
    const evidence = buildIntelligenceSynthesisEvidence({
      clusters: clusters(),
      generatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    expect(() => parseIntelligenceSynthesisOutput("{}", evidence)).toThrow(
      StorySynthesisValidationError,
    );
  });
});
