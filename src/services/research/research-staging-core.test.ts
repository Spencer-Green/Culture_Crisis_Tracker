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

function providerResult(stage: 1): ResearchProviderResult {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    providerRequestId: `response-${stage}`,
    status: "completed",
    outputText: "artifact",
    nativeSearchTrace: {
      calls: [
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
      ],
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
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 120,
    },
    latencyMs: 500,
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
    geography: "Australia",
    sourceRole: "PRIMARY",
    claim: "The report recorded 1,000 venue performances during 2025.",
    observation: "Venue performances / 1,000 / performances / 2025",
    observations: [
      {
        metric: "Venue performances",
        value: "1,000",
        unit: "performances",
        qualifier: "NONE",
      },
    ],
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
      summary: "A bounded source was found.",
      researchLimitations: ["Bounded research."],
      sources: [researchSource],
      provider: providerResult(1),
    },
    startedAt: new Date("2026-09-04T00:00:00Z"),
    completedAt: new Date("2026-09-04T00:00:01.500Z"),
    provenanceValidation: { matchedCandidates: 1, reasons: [] },
    usage: { totalTokens: 120, totalLatencyMs: 500 },
  };
}

describe("research staging core", () => {
  it("persists separate native acquisition/extraction telemetry and evidence bindings", () => {
    const run = successfulRun();
    const usage = run.stage1.provider.usage;
    run.stage1.provider.responseDiagnostics.phases = [
      {
        phase: "acquisition",
        responseId: "acq",
        model: "deepseek-v4-pro",
        status: "completed",
        usage,
        latencyMs: 100,
      },
      {
        phase: "extraction",
        responseId: "ext",
        model: "deepseek-v4-pro",
        status: "completed",
        usage: { ...usage, reasoningTokens: 0 },
        latencyMs: 50,
      },
    ];
    run.stage1.provider.responseDiagnostics.evidenceBindings = [
      {
        url: "https://example.gov.au/report",
        callId: "open-1",
        mediation: "DIRECTLY_OPENED",
        quote: "An attributed excerpt.",
        observationQuotes: [],
      },
    ];
    const draft = buildSuccessfulResearchRunDraft(run);
    expect(draft.stage1?.responseId).toBe("acq");
    expect(draft.stage2?.responseId).toBe("ext");
    expect(draft.stage2?.reasoningTokens).toBe(0);
    expect(draft.responseDiagnostics).toMatchObject({
      evidenceBindings: [expect.objectContaining({ callId: "open-1" })],
    });
  });
  it("never reports partial streaming usage as a complete total", () => {
    const run = successfulRun();
    run.stage1.provider.responseDiagnostics.usageComplete = false;
    expect(buildSuccessfulResearchRunDraft(run).combinedTotalTokens).toBeNull();
  });
  it("builds a successful one-stage persisted-run draft", () => {
    const draft = buildSuccessfulResearchRunDraft(successfulRun());
    expect(draft.status).toBe("SUCCEEDED");
    expect(draft.stage1?.responseId).toBe("response-1");
    expect(draft.stage2).toBeNull();
    expect(draft.combinedTotalTokens).toBe(120);
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

  it.each(["2026-02", "February 2026", "2026", "UNKNOWN"])(
    "persists coarse publication evidence %s without an exact date",
    (publishedAt) => {
      const draft = buildSuccessfulResearchRunDraft(
        successfulRun(
          { publishedAt },
          { source: { ...candidate().source, publishedAt: null } },
        ),
      );
      expect(draft.sources[0]?.publishedAt).toBeNull();
      expect(draft.sources[0]?.publishedAtRaw).toBe(publishedAt);
      expect(draft.sources[0]).toMatchObject({
        sourceRole: "PRIMARY",
        traceConfidence: "TRACE_OPENED",
        evidenceMediation: "DIRECTLY_OPENED",
      });
    },
  );

  it("persists sanitized artifact field diagnostics without raw output", () => {
    const provider = providerResult(1);
    const draft = buildFailedResearchRunDraft({
      task: getResearchTask("au-live-music-venue-viability"),
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
      error: new ResearchValidationError(
        "ARTIFACT_PARSE_FAILURE",
        "Publication date rejected.",
        ["Publication date rejected."],
        {
          providerResult: provider,
          artifactDiagnostics: [
            {
              sourceIndex: 1,
              field: "PUBLICATION_DATE",
              rejectedValue: "secret-value",
              failureReason: "Unsupported precision.",
            },
          ],
        },
      ),
      startedAt: new Date("2026-09-04T00:00:00Z"),
      completedAt: new Date("2026-09-04T00:00:01Z"),
      secrets: ["secret-value"],
    });
    expect(draft.stage1Artifact).toBeNull();
    expect(draft.responseDiagnostics).toMatchObject({
      artifactValidation: {
        status: "failed",
        issues: [{ rejectedValue: "[REDACTED]" }],
      },
    });
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

  it("separates new candidate scope and coarse reporting context without changing legacy hashes", () => {
    const base = {
      researchTaskId: "au-live-music-venue-viability",
      candidate: candidate(),
    };
    const context = {
      sourceIdentity: "same-source",
      reportingPeriod: "2025 audit",
    };
    const hash = buildResearchCandidateFingerprint({
      ...base,
      evidenceContext: context,
    });
    expect(hash).not.toBe(
      buildResearchCandidateFingerprint({
        ...base,
        evidenceContext: { ...context, reportingPeriod: "2026 audit" },
      }),
    );
    expect(hash).not.toBe(
      buildResearchCandidateFingerprint({
        ...base,
        candidate: {
          ...base.candidate,
          scope: { ...base.candidate.scope, geography: "Victoria" },
        },
        evidenceContext: context,
      }),
    );
    expect(hash).not.toBe(buildResearchCandidateFingerprint(base));
    expect(buildResearchCandidateFingerprint(base)).toBe(
      buildResearchCandidateFingerprint({ ...base }),
    );
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

  it("deduplicates descriptive variants of the same versioned document URL", () => {
    const taskId = "au-live-music-venue-viability";
    const url =
      "https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/";
    expect(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({
          url,
          publisher: "Music Victoria",
          title:
            "Music Victoria Releases 2025 Victorian Live Music Venue Audit",
          reportingPeriod: "2025 (audit snapshot year)",
        }),
      }),
    ).toBe(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({
          url: `${url}#summary`,
          publisher:
            "Music Victoria (state live-music peak body; audit commissioned by Creative Victoria)",
          title:
            "Music Victoria: releases 2025 Victorian live-music venue audit",
          reportingPeriod:
            "2025 audit fieldwork, benchmarked against 2019 baseline",
        }),
      }),
    );
  });

  it("keeps distinct editions on a reusable URL separate", () => {
    const taskId = "au-live-music-venue-viability";
    expect(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({
          url: "https://example.gov.au/live-music/report",
          reportingPeriod: "2025 audit fieldwork",
        }),
      }),
    ).not.toBe(
      buildResearchSourceFingerprint({
        researchTaskId: taskId,
        source: source({
          url: "https://example.gov.au/live-music/report",
          reportingPeriod: "2026 audit fieldwork",
        }),
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
      "MATERIALIZATION_FAILURE",
      "Invalid output.",
      ["candidate was malformed"],
      {
        stage1: successfulRun().stage1,
        providerResult: providerResult(1),
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
    expect(draft.failureKind).toBe("MATERIALIZATION_FAILURE");
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
