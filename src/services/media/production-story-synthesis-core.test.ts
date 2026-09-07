import { describe, expect, it, vi } from "vitest";

import {
  buildProductionStorySynthesisIdentity,
  buildStorySynthesisReadResult,
  LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT,
  runProductionStorySynthesisCycleCore,
  selectLatestValidatedStoryArtifact,
  selectProductionStorySynthesisShortlist,
  stableJson,
  synthesisAcquisitionDecision,
  type ProductionSynthesisStore,
} from "@/services/media/production-story-synthesis-core";
import {
  buildMediaStoryClusters,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import type { MediaArticleView } from "@/services/media/media-service-core";
import {
  buildStorySynthesisEvidence,
  type StorySynthesisEvidence,
  type StorySynthesisExecution,
} from "@/services/media/story-synthesis-core";

function evidence(
  overrides: Partial<StorySynthesisEvidence> = {},
): StorySynthesisEvidence {
  return {
    evidenceVersion: "story-synthesis-evidence-v5",
    evaluationContext: { productionEligible: true, evaluationOnly: false },
    clusterId: "fingerprint:story",
    representativeArticleId: "00000000-0000-0000-0000-000000000001",
    representativeHeadline: "A material development",
    effectiveClassification: {
      sector: "music",
      eventType: "INVESTMENT",
      signalDirection: "AMBIGUOUS",
      importance: 4,
      confidence: "high",
      labelSources: {
        sector: "MACHINE",
        eventType: "MACHINE",
        signalDirection: "MACHINE",
        importance: "MACHINE",
        confidence: "MACHINE",
      },
      ambiguousHumanCorrections: false,
    },
    allowedAffectedSectors: ["music"],
    publicationWindow: {
      earliestPublishedAt: "2026-08-27T00:00:00.000Z",
      latestPublishedAt: "2026-08-27T00:00:00.000Z",
    },
    publisherCount: 1,
    publishers: ["Example"],
    evidenceComposition: {
      primaryDocuments: 0,
      journalism: 1,
      specialistAnalysis: 0,
      translatedOrSummarised: 0,
      sourceIndependence: "NOT_ESTABLISHED",
    },
    claimDiscipline: {
      dominantClaimKind: "OBSERVED_ACTION_OR_EVENT",
      suppliedClaimKinds: ["OBSERVED_ACTION_OR_EVENT"],
      attributionRequired: false,
      proposalStatusMustBePreserved: false,
      observedDisplacementSupported: false,
      deploymentSupported: false,
      directCausalitySupported: false,
      historicalTrendSupported: false,
    },
    articles: [],
    bounds: {
      maximumCharacters: 12_000,
      serializedCharacters: 1_000,
      maximumArticles: 6,
      includedArticles: 1,
      omittedArticles: 0,
      excludedNotRelevantArticles: 0,
      truncatedFields: [],
    },
    ...overrides,
  };
}

function article(
  overrides: Partial<MediaArticleView> & Pick<MediaArticleView, "id" | "title">,
): MediaArticleView {
  return {
    sourceType: "RSS",
    canonicalUrl: `https://example.com/${overrides.id}`,
    description: "A major company announced a material workforce reduction.",
    publisher: "Example Trade",
    sourceDomain: "example.com",
    publishedAt: "2026-08-27T00:00:00.000Z",
    retrievedAt: "2026-08-27T01:00:00.000Z",
    countryCode: "US",
    sectorSlug: "film",
    eventType: "LAYOFFS",
    polarity: "negative",
    signalDirection: "NEGATIVE",
    confidence: "high",
    importance: 5,
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

function cluster(id: string, importance = 5): MediaStoryCluster {
  const [value] = buildMediaStoryClusters([
    article({
      id,
      title: `Major film company announces layoffs ${id}`,
      importance,
    }),
  ]);
  if (!value) throw new Error("Fixture did not create a cluster.");
  return value;
}

function execution(): StorySynthesisExecution {
  return {
    evidence: evidence(),
    synthesis: {} as never,
    model: "gpt-5.6-luna",
    latencyMs: 100,
    usage: {
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 20,
      totalTokens: 120,
    },
    estimatedCost: {
      currency: "USD",
      uncachedInputUsd: 0.00001,
      cachedInputUsd: 0.000001,
      outputUsd: 0.00002,
      totalUsd: 0.000031,
    },
  };
}

function store(
  acquisition: "ACQUIRE" | "REUSE" | "LOCKED" | "COOLDOWN" = "ACQUIRE",
): ProductionSynthesisStore {
  return {
    countAttemptsSince: vi.fn().mockResolvedValue(0),
    acquire: vi.fn().mockResolvedValue(acquisition),
    markValidated: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
  };
}

function storeWithDecisions(
  decisions: readonly ("ACQUIRE" | "REUSE" | "LOCKED" | "COOLDOWN")[],
): ProductionSynthesisStore {
  const persistence = store();
  let index = 0;
  vi.mocked(persistence.acquire).mockImplementation(async () => {
    const decision = decisions[index] ?? "ACQUIRE";
    index += 1;
    return decision;
  });
  return persistence;
}

describe("production story synthesis identity", () => {
  it("is stable across object-key ordering and unchanged evidence", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(buildProductionStorySynthesisIdentity(evidence())).toEqual(
      buildProductionStorySynthesisIdentity(evidence()),
    );
  });

  it("invalidates for new evidence and relevant human corrections", () => {
    const current = buildProductionStorySynthesisIdentity(evidence());
    const joined = buildProductionStorySynthesisIdentity(
      evidence({ publishers: ["Example", "Second source"] }),
    );
    const correctedEvent = buildProductionStorySynthesisIdentity(
      evidence({
        effectiveClassification: {
          ...evidence().effectiveClassification,
          eventType: "AI_POLICY_REGULATION",
          labelSources: {
            ...evidence().effectiveClassification.labelSources,
            eventType: "HUMAN_CORRECTED",
          },
        },
      }),
    );
    const correctedSignal = buildProductionStorySynthesisIdentity(
      evidence({
        effectiveClassification: {
          ...evidence().effectiveClassification,
          signalDirection: "NEGATIVE",
          labelSources: {
            ...evidence().effectiveClassification.labelSources,
            signalDirection: "HUMAN_CORRECTED",
          },
        },
      }),
    );
    const correctedImportance = buildProductionStorySynthesisIdentity(
      evidence({
        effectiveClassification: {
          ...evidence().effectiveClassification,
          importance: 5,
          labelSources: {
            ...evidence().effectiveClassification.labelSources,
            importance: "HUMAN_CORRECTED",
          },
        },
      }),
    );

    for (const changed of [
      joined,
      correctedEvent,
      correctedSignal,
      correctedImportance,
    ]) {
      expect(changed.identityKey).not.toBe(current.identityKey);
    }
  });

  it("changes the evidence identity for an explicit human null event", () => {
    const machineArticle = article({
      id: "event-machine",
      title: "Developers discuss AI use in a game project",
      sectorSlug: "gaming",
      eventType: "AI_ADOPTION",
      signalDirection: "AMBIGUOUS",
      importance: 1,
      confidence: "low",
    });
    const correctedArticle = article({
      ...machineArticle,
      classificationFeedback: {
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_EVENT_TYPE"],
        correctedSector: null,
        correctedEventType: null,
        correctedEventTypeToNull: true,
        correctedAiTag: null,
        correctedSignalDirection: null,
        correctedImportance: null,
        approvedMachineClassification: null,
        evaluationState: "WRONG_CLASSIFICATION",
        reviewedAt: "2026-08-30T00:00:00.000Z",
      },
    });
    const [machineCluster] = buildMediaStoryClusters([machineArticle]);
    const [correctedCluster] = buildMediaStoryClusters([correctedArticle]);
    const machineIdentity = buildProductionStorySynthesisIdentity(
      buildStorySynthesisEvidence(machineCluster, { evaluationOnly: true }),
    );
    const correctedEvidence = buildStorySynthesisEvidence(correctedCluster, {
      evaluationOnly: true,
    });
    const correctedIdentity =
      buildProductionStorySynthesisIdentity(correctedEvidence);

    expect(correctedEvidence.effectiveClassification).toMatchObject({
      eventType: null,
      labelSources: { eventType: "HUMAN_CORRECTED" },
    });
    expect(correctedIdentity.identityKey).not.toBe(machineIdentity.identityKey);
  });

  it("invalidates when NOT_RELEVANT changes the eligible packet", () => {
    const current = buildProductionStorySynthesisIdentity(evidence());
    const excluded = buildProductionStorySynthesisIdentity(
      evidence({
        bounds: {
          ...evidence().bounds,
          excludedNotRelevantArticles: 1,
        },
      }),
    );
    expect(excluded.identityKey).not.toBe(current.identityKey);
  });

  it("invalidates for evidence, prompt, schema, or model version changes", () => {
    const current = buildProductionStorySynthesisIdentity(evidence());
    expect(
      buildProductionStorySynthesisIdentity({
        ...evidence(),
        evidenceVersion: "future-evidence-version",
      } as unknown as StorySynthesisEvidence).identityKey,
    ).not.toBe(current.identityKey);
    expect(
      buildProductionStorySynthesisIdentity(evidence(), {
        requestedModel: "future-model",
      }).identityKey,
    ).not.toBe(current.identityKey);
    expect(
      buildProductionStorySynthesisIdentity(evidence(), {
        promptVersion: "future-prompt",
      }).identityKey,
    ).not.toBe(current.identityKey);
    expect(
      buildProductionStorySynthesisIdentity(evidence(), {
        outputSchemaVersion: "future-output-schema",
      }).identityKey,
    ).not.toBe(current.identityKey);
    expect(current.promptVersion).toBe("story-synthesis-prompt-v5.1");
    expect(current.outputSchemaVersion).toBe("story-synthesis-output-v2");
  });
});

describe("production artifact reuse and fallback", () => {
  it("reuses validated identity and locks duplicate processing", () => {
    const now = new Date("2026-08-28T00:00:00.000Z");
    expect(
      synthesisAcquisitionDecision(
        { status: "VALIDATED", leaseExpiresAt: null, nextAttemptAt: null },
        now,
      ),
    ).toBe("REUSE");
    expect(
      synthesisAcquisitionDecision(
        {
          status: "PROCESSING",
          leaseExpiresAt: new Date("2026-08-28T00:05:00.000Z"),
          nextAttemptAt: null,
        },
        now,
      ),
    ).toBe("LOCKED");
  });

  it("preserves a stale last-known-good artifact", () => {
    const currentIdentity = buildProductionStorySynthesisIdentity(evidence());
    const staleArtifact = {
      identityKey: "different",
      storyKey: currentIdentity.storyKey,
      clusterId: currentIdentity.clusterId,
      representativeArticleId: currentIdentity.representativeArticleId,
      evidenceArticleIds: [currentIdentity.representativeArticleId],
      evidenceFingerprint: "old",
      evidenceVersion: currentIdentity.evidenceVersion,
      promptVersion: currentIdentity.promptVersion,
      outputSchemaVersion: currentIdentity.outputSchemaVersion,
      requestedModel: currentIdentity.requestedModel,
      responseModel: currentIdentity.requestedModel,
      synthesis: {} as never,
      generatedAt: "2026-08-27T00:00:00.000Z",
      latencyMs: 1,
    };
    expect(
      buildStorySynthesisReadResult({
        currentIdentity,
        latestValidated: staleArtifact,
      }),
    ).toEqual({ freshness: "STALE", artifact: staleArtifact });
  });

  it("keeps last-known-good discoverable when a joined article changes cluster ID", () => {
    const oldIdentity = buildProductionStorySynthesisIdentity(
      evidence({ clusterId: "articles:one" }),
      { storyKey: "LAYOFFS:stable-story" },
    );
    const currentIdentity = buildProductionStorySynthesisIdentity(
      evidence({ clusterId: "articles:one,two", publisherCount: 2 }),
      { storyKey: "LAYOFFS:stable-story" },
    );
    expect(oldIdentity.storyKey).toBe(currentIdentity.storyKey);
    expect(oldIdentity.identityKey).not.toBe(currentIdentity.identityKey);
    const oldArtifact = {
      identityKey: oldIdentity.identityKey,
      storyKey: oldIdentity.storyKey,
      clusterId: oldIdentity.clusterId,
      representativeArticleId: "one",
      evidenceArticleIds: ["one"],
      evidenceFingerprint: oldIdentity.evidenceFingerprint,
      evidenceVersion: oldIdentity.evidenceVersion,
      promptVersion: oldIdentity.promptVersion,
      outputSchemaVersion: oldIdentity.outputSchemaVersion,
      requestedModel: oldIdentity.requestedModel,
      responseModel: oldIdentity.requestedModel,
      synthesis: {} as never,
      generatedAt: "2026-08-27T00:00:00.000Z",
      latencyMs: 1,
    };
    expect(
      selectLatestValidatedStoryArtifact({
        currentIdentity,
        currentEvidenceArticleIds: ["one", "two"],
        candidates: [oldArtifact],
      }),
    ).toBe(oldArtifact);
  });

  it("does not expose a stale artifact after its evidence is NOT_RELEVANT", () => {
    const currentIdentity = buildProductionStorySynthesisIdentity(evidence());
    const artifact = {
      identityKey: "old",
      storyKey: currentIdentity.storyKey,
      clusterId: currentIdentity.clusterId,
      representativeArticleId: "excluded",
      evidenceArticleIds: ["excluded"],
      evidenceFingerprint: "old",
      evidenceVersion: currentIdentity.evidenceVersion,
      promptVersion: currentIdentity.promptVersion,
      outputSchemaVersion: currentIdentity.outputSchemaVersion,
      requestedModel: currentIdentity.requestedModel,
      responseModel: currentIdentity.requestedModel,
      synthesis: {} as never,
      generatedAt: "2026-08-27T00:00:00.000Z",
      latencyMs: 1,
    };
    expect(
      selectLatestValidatedStoryArtifact({
        currentIdentity,
        currentEvidenceArticleIds: ["still-eligible"],
        candidates: [artifact],
      }),
    ).toBeNull();
  });
});

describe("production shortlist", () => {
  it("uses existing eligibility and rank order without a second score", () => {
    const eligible = cluster("eligible");
    const ineligible = cluster("ineligible", 1);
    expect(
      selectProductionStorySynthesisShortlist([eligible, ineligible], 1),
    ).toEqual([eligible]);
  });

  it("reuses unchanged artifacts without invoking Luna", async () => {
    const persistence = store("REUSE");
    const synthesize = vi.fn();
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("reuse")],
      maximumCalls: 1,
      dailyCallLimit: 4,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      callsAttempted: 0,
      reused: 1,
      validated: 0,
    });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("records validator rejection and continues without retrying", async () => {
    const persistence = store();
    const synthesize = vi.fn().mockRejectedValue(new Error("invalid output"));
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("invalid")],
      maximumCalls: 1,
      dailyCallLimit: 4,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "VALIDATION",
        message: "invalid output",
        fatal: false,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      callsAttempted: 1,
      failed: 1,
      validated: 0,
    });
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(persistence.markFailed).toHaveBeenCalledTimes(1);
  });

  it("stops after one fatal API failure and never retries", async () => {
    const persistence = store();
    const synthesize = vi
      .fn()
      .mockRejectedValue(new Error("network unavailable"));
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("first"), cluster("second")],
      maximumCalls: 2,
      dailyCallLimit: 4,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "API",
        message: "network unavailable",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      callsAttempted: 1,
      failed: 1,
      stoppedAfterFatalFailure: true,
    });
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it("accounts for accepted usage only after lease-safe persistence", async () => {
    const persistence = store();
    vi.mocked(persistence.markValidated).mockResolvedValue(false);
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("lost-lease")],
      maximumCalls: 1,
      dailyCallLimit: 4,
      store: persistence,
      synthesize: vi.fn().mockResolvedValue(execution()),
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      callsAttempted: 1,
      failed: 1,
      validated: 0,
      totalTokens: 120,
      stoppedAfterFatalFailure: true,
    });
  });

  it("enforces the rolling daily call cap before acquisition", async () => {
    const persistence = store();
    vi.mocked(persistence.countAttemptsSince).mockResolvedValue(4);
    const synthesize = vi.fn();
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("daily-cap")],
      maximumCalls: 1,
      dailyCallLimit: 4,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      dailyCapacityRemaining: 0,
      callsAttempted: 0,
    });
    expect(persistence.acquire).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("continues past reusable top-ranked artifacts to fill acquisition capacity", async () => {
    const persistence = storeWithDecisions([
      "REUSE",
      "REUSE",
      "REUSE",
      "REUSE",
      "ACQUIRE",
      "ACQUIRE",
      "ACQUIRE",
      "ACQUIRE",
    ]);
    const synthesize = vi.fn().mockResolvedValue(execution());
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [
        cluster("one"),
        cluster("two"),
        cluster("three"),
        cluster("four"),
        cluster("five"),
        cluster("six"),
        cluster("seven"),
        cluster("eight"),
      ],
      maximumCalls: 4,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      eligibleClusters: 8,
      scannedClusters: 8,
      reused: 4,
      callsAttempted: 4,
      validated: 4,
    });
    expect(persistence.acquire).toHaveBeenCalledTimes(8);
    expect(synthesize).toHaveBeenCalledTimes(4);
  });

  it("stops after four missing candidates without acquiring rank five", async () => {
    const persistence = store();
    const synthesize = vi.fn().mockResolvedValue(execution());
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [
        cluster("one"),
        cluster("two"),
        cluster("three"),
        cluster("four"),
        cluster("five"),
      ],
      maximumCalls: 4,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({ scannedClusters: 4, callsAttempted: 4 });
    expect(persistence.acquire).toHaveBeenCalledTimes(4);
    expect(synthesize).toHaveBeenCalledTimes(4);
  });

  it("lets rolling daily capacity override the per-cycle acquisition limit", async () => {
    const persistence = store();
    vi.mocked(persistence.countAttemptsSince).mockResolvedValue(14);
    const synthesize = vi.fn().mockResolvedValue(execution());
    const result = await runProductionStorySynthesisCycleCore({
      clusters: [cluster("one"), cluster("two"), cluster("three")],
      maximumCalls: 4,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      dailyCapacityRemaining: 2,
      scannedClusters: 2,
      callsAttempted: 2,
    });
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it("reaches a lower-ranked missing candidate after a reusable sequence", async () => {
    const persistence = storeWithDecisions([
      "REUSE",
      "REUSE",
      "REUSE",
      "REUSE",
      "REUSE",
      "REUSE",
      "ACQUIRE",
    ]);
    const synthesize = vi.fn().mockResolvedValue(execution());
    const result = await runProductionStorySynthesisCycleCore({
      clusters: Array.from({ length: 7 }, (_, index) =>
        cluster(`rank-${index + 1}`),
      ),
      maximumCalls: 1,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      scannedClusters: 7,
      reused: 6,
      callsAttempted: 1,
    });
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it("stops reusable candidate inspection at the explicit scan ceiling", async () => {
    const persistence = store("REUSE");
    const synthesize = vi.fn();
    const result = await runProductionStorySynthesisCycleCore({
      clusters: Array.from(
        { length: LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT + 1 },
        (_, index) => cluster(`rank-${index + 1}`),
      ),
      maximumCalls: 4,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(result).toMatchObject({
      scannedClusters: LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT,
      reused: LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT,
      callsAttempted: 0,
    });
    expect(persistence.acquire).toHaveBeenCalledTimes(
      LUNA_STORY_SYNTHESIS_CANDIDATE_SCAN_LIMIT,
    );
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("preserves deterministic candidate order while scanning past reuse", async () => {
    const persistence = storeWithDecisions(["REUSE", "REUSE", "ACQUIRE"]);
    const synthesize = vi.fn().mockResolvedValue(execution());
    const ranked = [
      cluster("rank-one"),
      cluster("rank-two"),
      cluster("rank-three"),
    ];
    await runProductionStorySynthesisCycleCore({
      clusters: ranked,
      maximumCalls: 1,
      dailyCallLimit: 16,
      store: persistence,
      synthesize,
      classifyFailure: () => ({
        kind: "UNKNOWN",
        message: "unexpected",
        fatal: true,
      }),
      createLeaseId: () => "00000000-0000-0000-0000-000000000099",
    });
    expect(
      vi
        .mocked(persistence.acquire)
        .mock.calls.map(([input]) => input.identity.clusterId),
    ).toEqual(ranked.map((item) => item.clusterId));
  });
});
