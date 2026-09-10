import { describe, expect, it } from "vitest";

import {
  canonicalizeResearchUrl,
  classifyResearchSourceTrace,
  materializeResearchResult,
  validateResearchMaterializationProvenance,
} from "@/services/research/research-provenance";
import { getResearchTask } from "@/services/research/research-tasks";
import type {
  ResearchStage1SourceV1,
  ResearchStage1ObservationV1,
} from "@/services/research/research-types";

const task = getResearchTask("au-live-music-venue-viability");

function observation(
  metric: string,
  value: string,
  unit: string,
  qualifier: ResearchStage1ObservationV1["qualifier"] = "NONE",
): ResearchStage1ObservationV1 {
  return { metric, value, unit, qualifier };
}

function source(
  overrides: Partial<ResearchStage1SourceV1> = {},
): ResearchStage1SourceV1 {
  const observations = [
    observation("number of live-music venues", "2,441", "venues"),
  ];
  return {
    url: "https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/",
    publisher: "Music Victoria",
    title: "2025 Victorian Live Music Venue Audit",
    publishedAt: "2026-02-24",
    reportingPeriod: "2025 audit fieldwork, benchmarked against 2019",
    geography: "Victoria",
    sourceRole: "PRIMARY",
    claim: "The audit counted 2,441 Victorian live music venues.",
    observation:
      "METRIC=number of live-music venues | VALUE=2,441 | UNIT=venues | QUALIFIER=NONE",
    observations,
    limitations:
      "HTTP 403 prevented retrieval; evidence remained search-snippet mediated and was not inspected in the page body.",
    rawBlock: "fixture",
    traceStatus: "TRACE_ATTEMPTED",
    ...overrides,
  };
}

function materialize(sources: ResearchStage1SourceV1[]) {
  return materializeResearchResult({
    task,
    summary: "Bounded evidence was found.",
    researchLimitations: ["The search was deliberately bounded."],
    sources,
  });
}

describe("deterministic research materialization", () => {
  it("materializes Music Victoria with task-owned sector and coarse dates", () => {
    const musicVictoria = source({
      claim:
        "The audit counted 2,441 venues; weekly presenters declined 19.4%; and 302 venues hosted at least two weekly gigs.",
      observation:
        "METRIC=number of live-music venues | VALUE=2,441 | UNIT=venues | QUALIFIER=NONE; METRIC=weekly live music presenters | VALUE=19.4 | UNIT=% | QUALIFIER=DECLINE; METRIC=venues hosting at least two gigs per week | VALUE=302 | UNIT=venues | QUALIFIER=NONE",
      observations: [
        observation("number of live-music venues", "2,441", "venues"),
        observation("weekly live music presenters", "19.4", "%", "DECLINE"),
        observation(
          "venues hosting at least two gigs per week",
          "302",
          "venues",
        ),
      ],
    });
    const result = materialize([musicVictoria]);
    expect(result.candidates[0]).toMatchObject({
      candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
      scope: {
        geography: "Victoria",
        sector: "Music",
        reportingPeriodStart: null,
        reportingPeriodEnd: null,
      },
      evidence: {
        observations: [
          { metric: "number of live-music venues", value: "2,441" },
          {
            metric: "weekly live music presenters",
            value: "19.4",
            qualifier: "DECLINE",
          },
          { value: "302", unit: "venues" },
        ],
      },
    });
    expect(
      validateResearchMaterializationProvenance(task, [musicVictoria], result),
    ).toEqual([]);
  });

  it("materializes ABC without inventing day-level reporting boundaries", () => {
    const abc = source({
      url: "https://www.abc.net.au/news/2026-08-18/sydney-live-music-venue-closures-diy-community/107049086",
      publisher: "ABC News",
      title: "Sydney music venues closing rapidly",
      publishedAt: "2026-08-18",
      reportingPeriod: "July 2025–June 2026",
      geography: "Sydney",
      sourceRole: "SECONDARY_REPORTING",
      claim:
        "Subsequently shuttered Sydney venues hosted more than 690 live music events between July 2025 and June 2026.",
      observation:
        "METRIC=events hosted by subsequently shuttered venues | VALUE=690 | UNIT=events | QUALIFIER=OVER",
      observations: [
        observation(
          "events hosted by subsequently shuttered venues",
          "690",
          "events",
          "OVER",
        ),
      ],
      limitations:
        "Page retrieval failed; only a search snippet supported the figure, which is a Sydney indicator rather than a national census.",
    });
    const result = materialize([abc]);
    expect(result.candidates[0]).toMatchObject({
      candidateType: "LIVE_WEB_INDICATOR",
      scope: {
        geography: "Sydney",
        reportingPeriodStart: null,
        reportingPeriodEnd: null,
      },
      evidence: {
        observations: [{ value: "690", unit: "events", qualifier: "OVER" }],
      },
    });
    expect(
      validateResearchMaterializationProvenance(task, [abc], result),
    ).toEqual([]);
  });

  it("materializes Beat while preserving model-reported mediation", () => {
    const beat = source({
      url: "https://beat.com.au/melbourne-has-lost-one-in-four-regular-live-music-venues-since-2019/",
      publisher: "Beat Magazine",
      title:
        "Melbourne has lost one in four regular live music venues since 2019",
      publishedAt: "UNKNOWN",
      reportingPeriod: "2019 baseline vs 2025 audit",
      geography: "Melbourne",
      sourceRole: "SECONDARY_REPORTING",
      claim:
        "Weekly live-music presenters fell from 813 to 655, while Beat described a one-in-four Melbourne regular-venue loss.",
      observation:
        "METRIC=weekly live music presenters | VALUE=813 -> 655 | UNIT=venues | QUALIFIER=FROM_TO",
      observations: [
        observation(
          "weekly live music presenters",
          "813 -> 655",
          "venues",
          "FROM_TO",
        ),
      ],
      limitations:
        "The URL was not opened or found in trace; evidence remained model-reported from search snippets.",
      traceStatus: "MODEL_REPORTED_ONLY",
    });
    const result = materialize([beat]);
    expect(result.candidates[0]).toMatchObject({
      source: { publishedAt: null },
      assessment: { confidence: "LOW", ingestionFeasibility: "LOW" },
      evidence: {
        observations: [
          {
            metric: "weekly live music presenters",
            value: "813 -> 655",
            qualifier: "FROM_TO",
          },
        ],
      },
    });
    expect(
      validateResearchMaterializationProvenance(task, [beat], result),
    ).toEqual([]);
  });

  it.each(["2026-02", "February 2026", "2026", "UNKNOWN"])(
    "preserves coarse publication evidence %s without synthetic precision",
    (publishedAt) => {
      const evidence = source({ publishedAt });
      const result = materialize([evidence]);
      expect(result.candidates[0]?.source.publishedAt).toBeNull();
      expect(result.candidates[0]?.evidence.sourceRole).toBe("PRIMARY");
      expect(result.candidates[0]?.assessment.confidence).toBe("LOW");
      expect(
        validateResearchMaterializationProvenance(task, [evidence], result),
      ).toEqual([]);
    },
  );

  it("materializes an exact publication date without mutation", () => {
    const evidence = source({ publishedAt: "2026-02-24" });
    const result = materialize([evidence]);
    expect(result.candidates[0]?.source.publishedAt).toBe("2026-02-24");
    expect(
      validateResearchMaterializationProvenance(task, [evidence], result),
    ).toEqual([]);
  });

  it("retains unknown faithful metric wording", () => {
    const evidence = source({
      claim: "The report counted 77 late-night venue sessions.",
      observation:
        "METRIC=late-night venue sessions | VALUE=77 | UNIT=sessions | QUALIFIER=NONE",
      observations: [
        observation("late-night venue sessions", "77", "sessions"),
      ],
    });
    expect(
      materialize([evidence]).candidates[0]?.evidence.observations[0]?.metric,
    ).toBe("late-night venue sessions");
  });

  it("keeps trace confidence independent from primary source role", () => {
    const attempted = source({
      sourceRole: "PRIMARY",
      traceStatus: "TRACE_ATTEMPTED",
    });
    const reported = source({
      url: "https://example.org/secondary",
      sourceRole: "SECONDARY_REPORTING",
      traceStatus: "MODEL_REPORTED_ONLY",
    });
    expect(materialize([attempted]).candidates[0]?.assessment.confidence).toBe(
      "LOW",
    );
    expect(materialize([reported]).candidates[0]?.assessment.confidence).toBe(
      "LOW",
    );
  });
});

describe("materialization provenance closure", () => {
  function mutatedResult(
    mutate: (
      candidate: ReturnType<typeof materialize>["candidates"][number],
    ) => void,
    evidence = source(),
  ) {
    const result = structuredClone(materialize([evidence]));
    mutate(result.candidates[0]!);
    return {
      reasons: validateResearchMaterializationProvenance(
        task,
        [evidence],
        result,
      ),
      result,
    };
  }

  it.each([
    ["2,941", "HARD_VALUE_MISMATCH"],
    ["29.4", "HARD_VALUE_MISMATCH"],
    ["320", "HARD_VALUE_MISMATCH"],
    ["960", "HARD_VALUE_MISMATCH"],
  ])("rejects invented numeric value %s", (value, reason) => {
    const outcome = mutatedResult((candidate) => {
      candidate.evidence.observations[0]!.value = value;
    });
    expect(outcome.reasons.some((item) => item.includes(reason))).toBe(true);
  });

  it("rejects invented URLs and publication dates", () => {
    expect(
      mutatedResult((candidate) => {
        candidate.source.url = "https://invented.example/report";
      }).reasons,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("HARD_URL_MISMATCH")]),
    );
    expect(
      mutatedResult((candidate) => {
        candidate.source.publishedAt = "2026-03-01";
      }).reasons,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("HARD_DATE_MISMATCH")]),
    );
  });

  it.each(["2026-02", "February 2026", "2026", "UNKNOWN"])(
    "rejects publication-date precision strengthening from %s",
    (publishedAt) => {
      const reasons = mutatedResult((candidate) => {
        candidate.source.publishedAt = "2026-02-01";
      }, source({ publishedAt })).reasons;
      expect(reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("HARD_DATE_MISMATCH")]),
      );
    },
  );

  it("rejects unsupported exact dates and foreign geography", () => {
    const dateReasons = mutatedResult((candidate) => {
      candidate.scope.reportingPeriodStart = "2025-01-01";
      candidate.scope.reportingPeriodEnd = "2025-12-31";
    }).reasons;
    expect(
      dateReasons.some((item) => item.includes("HARD_DATE_MISMATCH")),
    ).toBe(true);
    expect(
      mutatedResult((candidate) => {
        candidate.scope.geography = "United Kingdom";
      }).reasons,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("GEOGRAPHY_SCOPE_MISMATCH"),
      ]),
    );
  });

  it.each([
    ["The venues became profitable.", "venue-profitability"],
    ["The audit caused venue closures.", "causality"],
    ["Australian venues declined nationwide.", "nationally"],
  ])("rejects stronger unsupported claim: %s", (claim, fragment) => {
    const reasons = mutatedResult((candidate) => {
      candidate.evidence.claim = claim;
    }).reasons;
    expect(reasons.some((item) => item.includes(fragment))).toBe(true);
  });

  it("rejects removed search mediation", () => {
    const reasons = mutatedResult((candidate) => {
      candidate.evidence.limitations = ["Coverage was bounded."];
    }).reasons;
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("EVIDENCE_MEDIATION_MISMATCH"),
      ]),
    );
  });

  it("rejects candidates without source evidence and excess candidates", () => {
    const evidence = source();
    const result = materialize([evidence]);
    const invented = structuredClone(result.candidates[0]!);
    invented.source.url = "https://invented.example/no-source";
    result.candidates.push(invented, structuredClone(invented));
    const reasons = validateResearchMaterializationProvenance(
      task,
      [evidence],
      result,
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SOURCE_LINKAGE_MISMATCH"),
        expect.stringContaining("HARD_URL_MISMATCH"),
      ]),
    );
  });
});

describe("native search trace classification", () => {
  it("distinguishes opened, attempted, and model-reported sources", () => {
    const url = "https://example.gov.au/report";
    expect(
      classifyResearchSourceTrace(url, {
        calls: [
          {
            sequence: 0,
            item: {
              type: "web_search_call",
              status: "completed",
              action: { type: "open_page", url },
            },
          },
        ],
        annotations: [],
      }),
    ).toBe("TRACE_OPENED");
    expect(
      classifyResearchSourceTrace(url, {
        calls: [
          {
            sequence: 0,
            item: {
              type: "web_search_call",
              status: "failed",
              action: { type: "open_page", url },
            },
          },
        ],
        annotations: [],
      }),
    ).toBe("TRACE_ATTEMPTED");
    expect(
      classifyResearchSourceTrace(url, { calls: [], annotations: [] }),
    ).toBe("MODEL_REPORTED_ONLY");
  });

  it("canonicalizes equivalent HTTP URLs", () => {
    expect(canonicalizeResearchUrl("https://EXAMPLE.com/report/#part")).toBe(
      canonicalizeResearchUrl("https://example.com/report"),
    );
  });
});
