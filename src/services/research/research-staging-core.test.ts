import { describe, expect, it, vi } from "vitest";

import {
  parseResearchOnceOptions,
  parseResearchReviewOptions,
  persistResearchResultWhenRequested,
} from "@/services/research/research-cli-core";
import {
  buildFailedResearchRunDraft,
  buildResearchCandidateFingerprint,
  buildResearchSourceFingerprint,
  buildSuccessfulResearchRunDraft,
  parseResearchInspectionLimit,
  parseResearchReviewDecision,
} from "@/services/research/research-staging-core";
import { ResearchValidationError } from "@/services/research/research-runner";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  ResearchProviderResult,
  ResearchRunResult,
  ResearchStage1SourceV1,
} from "@/services/research/research-types";

function providerResult(stage: 1 | 2): ResearchProviderResult {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: `response-${stage}`,
    status: "completed",
    outputText: stage === 1 ? "artifact" : "{}",
    nativeSearchTrace: {
      calls:
        stage === 1
          ? [
              {
                sequence: 0,
                item: {
                  type: "web_search_call",
                  id: "call-1",
                  status: "completed",
                  action: {
                    type: "open_page",
                    url: "https://example.gov.au/report",
                  },
                },
              },
            ]
          : [],
      annotations: [],
    },
    responseDiagnostics: {
      responseId: `response-${stage}`,
      responseStatus: "completed",
      outputItemCount: 1,
      outputItemTypes: ["message"],
      messageItems: [],
      incompleteDetails: null,
      error: null,
    },
    usage: {
      inputTokens: 100 * stage,
      cachedInputTokens: 10 * stage,
      outputTokens: 20 * stage,
      reasoningTokens: 5 * stage,
      totalTokens: 120 * stage,
    },
    latencyMs: 500 * stage,
  };
}

function source(
  overrides: Partial<ResearchStage1SourceV1> = {},
): ResearchStage1SourceV1 {
  return {
    url: "https://example.gov.au/report",
    publisher: "Example Department",
    title: "Australian live-music venue report",
    publishedAt: "2026-08-30",
    reportingPeriod: "2025",
    sourceRole: "PRIMARY",
    claim: "The report recorded 1,000 venue performances during 2025.",
    observation: "Venue performances / 1,000 / performances / 2025",
    limitations: "Coverage depends on participating venues.",
    rawBlock: "fixture",
    traceStatus: "TRACE_OPENED",
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateType: "STRUCTURED_OBSERVATION_CANDIDATE" as const,
    source: {
      url: "https://example.gov.au/report",
      publisher: "Example Department",
      title: "Australian live-music venue report",
      publishedAt: "2026-08-30",
    },
    scope: {
      geography: "Australia",
      sector: "Music",
      reportingPeriodStart: "2025-01-01",
      reportingPeriodEnd: "2025-12-31",
    },
    evidence: {
      claim: "The report recorded 1,000 venue performances during 2025.",
      observations: [
        {
          metric: "Venue performances",
          value: "1,000",
          unit: "performances",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
        },
      ],
      sourceRole: "PRIMARY" as const,
      limitations: ["Coverage depends on participating venues."],
    },
    assessment: {
      authority: "HIGH" as const,
      freshness: "NEWER_THAN_EXISTING" as const,
      ingestionFeasibility: "MODERATE" as const,
      confidence: "HIGH" as const,
    },
    ...overrides,
  };
}

function successfulRun(
  sourceOverrides: Partial<ResearchStage1SourceV1> = {},
  candidateOverrides: Record<string, unknown> = {},
): ResearchRunResult {
  const researchSource = source(sourceOverrides);
  const researchCandidate = candidate(candidateOverrides);
  return {
    task: getResearchTask("au-live-music-venue-viability"),
    result: {
      taskSummary: "A bounded source was found.",
      candidates: [researchCandidate],
      researchLimitations: ["Bounded research."],
    },
    stage1: {
      artifact: "RESEARCH_SUMMARY\nFixture",
      sources: [researchSource],
      provider: providerResult(1),
    },
    stage2: { provider: providerResult(2) },
    startedAt: new Date("2026-09-04T00:00:00Z"),
    completedAt: new Date("2026-09-04T00:00:01.500Z"),
    crossStageValidation: { matchedCandidates: 1, reasons: [] },
    usage: { totalTokens: 360, totalLatencyMs: 1_500 },
  };
}

describe("research staging core", () => {
  it("builds a successful persisted-run draft with separate stage telemetry", () => {
    const draft = buildSuccessfulResearchRunDraft(successfulRun());
    expect(draft.status).toBe("SUCCEEDED");
    expect(draft.stage1?.responseId).toBe("response-1");
    expect(draft.stage2?.responseId).toBe("response-2");
    expect(draft.combinedTotalTokens).toBe(360);
    expect(draft.sources).toHaveLength(1);
    expect(draft.candidates).toHaveLength(1);
  });

  it("keeps publication, reporting, and retrieval timestamps distinct", () => {
    const draft = buildSuccessfulResearchRunDraft(successfulRun());
    expect(draft.sources[0]?.publishedAt?.toISOString()).toBe(
      "2026-08-30T00:00:00.000Z",
    );
    expect(draft.sources[0]?.reportingPeriodStart?.toISOString()).toBe(
      "2025-01-01T00:00:00.000Z",
    );
    expect(draft.completedAt.toISOString()).toBe("2026-09-04T00:00:01.500Z");
  });

  it.each([
    ["TRACE_OPENED", "DIRECTLY_OPENED"],
    ["TRACE_ATTEMPTED", "SEARCH_MEDIATED"],
    ["MODEL_REPORTED_ONLY", "MODEL_REPORTED"],
  ] as const)("maps %s to %s mediation", (trace, mediation) => {
    const draft = buildSuccessfulResearchRunDraft(
      successfulRun({ traceStatus: trace }),
    );
    expect(draft.sources[0]?.traceConfidence).toBe(trace);
    expect(draft.sources[0]?.evidenceMediation).toBe(mediation);
  });

  it("canonicalizes source URLs for stable source fingerprints", () => {
    const taskId = "au-live-music-venue-viability";
    expect(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source(),
      }),
    ).toBe(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({ url: "https://EXAMPLE.gov.au/report/#section" }),
      }),
    );
  });

  it("changes the source fingerprint for a changed reporting period", () => {
    const taskId = "au-live-music-venue-viability";
    expect(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source(),
      }),
    ).not.toBe(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({ reportingPeriod: "2026" }),
      }),
    );
  });

  it("normalizes candidate metric casing and punctuation", () => {
    const taskId = "au-live-music-venue-viability";
    const first = candidate();
    const second = candidate({
      evidence: {
        ...candidate().evidence,
        observations: [
          {
            ...candidate().evidence.observations[0],
            metric: "venue—performances",
          },
        ],
      },
    });
    expect(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: first,
      }),
    ).toBe(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: second,
      }),
    );
  });

  it("creates a distinct candidate for a changed numeric value", () => {
    const taskId = "au-live-music-venue-viability";
    const changed = candidate({
      evidence: {
        ...candidate().evidence,
        observations: [
          { ...candidate().evidence.observations[0], value: "1,100" },
        ],
      },
    });
    expect(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: candidate(),
      }),
    ).not.toBe(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: changed,
      }),
    );
  });

  it("creates a distinct candidate for a changed reporting period", () => {
    const taskId = "au-live-music-venue-viability";
    const changed = candidate({
      scope: {
        ...candidate().scope,
        reportingPeriodStart: "2026-01-01",
        reportingPeriodEnd: "2026-12-31",
      },
    });
    expect(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: candidate(),
      }),
    ).not.toBe(
      buildResearchCandidateFingerprint({
        researchTaskId: taskId,
        candidate: changed,
      }),
    );
  });

  it("builds a failed run without valid candidates", () => {
    const error = new ResearchValidationError(
      "STAGE2_SCHEMA_FAILURE",
      "Invalid output.",
      ["candidate was malformed"],
      {
        stage1: successfulRun().stage1,
        providerResult: providerResult(2),
      },
    );
    const draft = buildFailedResearchRunDraft({
      task: getResearchTask("au-live-music-venue-viability"),
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
      error,
      startedAt: new Date("2026-09-04T00:00:00Z"),
      completedAt: new Date("2026-09-04T00:00:02Z"),
    });
    expect(draft.status).toBe("FAILED");
    expect(draft.failureKind).toBe("STAGE2_SCHEMA_FAILURE");
    expect(draft.sources).toHaveLength(1);
    expect(draft.candidates).toEqual([]);
  });

  it("redacts hidden reasoning and secrets before trace persistence", () => {
    const run = successfulRun();
    run.stage1.provider.nativeSearchTrace.calls[0]!.item = {
      reasoning: "sk-secretvalue",
      action: { type: "search", query: "venues" },
    };
    const serialized = JSON.stringify(buildSuccessfulResearchRunDraft(run));
    expect(serialized).not.toContain("sk-secretvalue");
    expect(serialized).toContain("[REDACTED]");
  });

  it("parses explicit persistence without changing the default", () => {
    expect(
      parseResearchOnceOptions(["--task=au-live-music-venue-viability"])
        .persist,
    ).toBe(false);
    expect(
      parseResearchOnceOptions([
        "--task=au-live-music-venue-viability",
        "--persist",
      ]).persist,
    ).toBe(true);
  });

  it("does not reach persistence for an ephemeral run", async () => {
    const writer = vi.fn();
    await persistResearchResultWhenRequested({
      persist: false,
      value: buildSuccessfulResearchRunDraft(successfulRun()),
      writer,
    });
    expect(writer).not.toHaveBeenCalled();
  });

  it("parses supported review decisions and requires a reason", () => {
    expect(parseResearchReviewDecision("approve-for-investigation")).toBe(
      "APPROVED_FOR_INGESTION_INVESTIGATION",
    );
    expect(() => parseResearchReviewDecision("canonicalize")).toThrow(
      "Invalid research review decision",
    );
    expect(() =>
      parseResearchReviewOptions([
        "--candidate=candidate-1",
        "--decision=reject",
      ]),
    ).toThrow("Usage");
  });

  it("bounds inspection limits", () => {
    expect(parseResearchInspectionLimit(undefined)).toBe(20);
    expect(parseResearchInspectionLimit("500")).toBe(100);
    expect(() => parseResearchInspectionLimit("zero")).toThrow();
  });
});
