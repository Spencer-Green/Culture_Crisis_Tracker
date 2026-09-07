import { describe, expect, it } from "vitest";

import { validateResearchStage1Artifact } from "@/services/research/research-artifact";
import {
  classifyResearchSourceTrace,
  validateCrossStageProvenance,
} from "@/services/research/research-provenance";
import {
  ResearchResultV1Schema,
  type ResearchCandidateV1,
  type ResearchResultV1,
} from "@/services/research/research-schema";
import { AU_LIVE_MUSIC_VENUE_VIABILITY_TASK } from "@/services/research/research-tasks";
import type { NativeSearchTraceV1 } from "@/services/research/research-types";

const liveRunArtifact = `RESEARCH_SUMMARY
Two recent primary-source candidates were found within the bounded search.

SOURCE
URL: https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/
PUBLISHER: Music Victoria (audit commissioned by Creative Victoria)
TITLE: Music Victoria Releases 2025 Victorian Live Music Venue Audit
PUBLISHED_AT: 2026-02-24
REPORTING_PERIOD: 2025 audit year
SOURCE_ROLE: PRIMARY
CLAIM: The audit identified 2,441 live music venues across Victoria, including 655 venues hosting at least one gig per week, with approximately 45% in regional Victoria.
OBSERVATION: 2,441 live music venues counted; 655 venues hosting at least one gig per week; approximately 45% in regional Victoria.
LIMITATIONS: Primary page retrieval failed; figures were extracted from search-result snippets. This is a Victorian stock count, not a national census or profitability measure.

SOURCE
URL: https://creative.gov.au/sites/creative-australia/files/documents/2026-07/Music%20Australia%20-%20The%20Bass%20Line%20Second%20Edition.pdf
PUBLISHER: Music Australia / Creative Australia (Australian Government)
TITLE: Music Australia - The Bass Line, Second Edition
PUBLISHED_AT: UNKNOWN
REPORTING_PERIOD: FY2024-25 income and 2025 survey
SOURCE_ROLE: PRIMARY
CLAIM: Live performance was the largest artist music-income stream at A$410 million in FY2024-25; pubs, hotels and registered clubs accounted for 23.3% of surveyed live performances in 2025.
OBSERVATION: A$410 million artist income from live performance; 23.3% of live performances in pubs, hotels and registered clubs.
LIMITATIONS: Primary PDF retrieval failed; figures were extracted from search-result snippets. This is not a direct venue-profitability or closure measure.

RESEARCH_LIMITATIONS
The search was bounded and both primary document retrieval attempts failed.`;

const failedTrace: NativeSearchTraceV1 = {
  calls: [
    {
      sequence: 1,
      item: {
        type: "web_search_call",
        id: "call_music_victoria",
        status: "failed",
        action: {
          type: "open_page",
          url: "https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/#trace",
        },
      },
    },
    {
      sequence: 2,
      item: {
        type: "web_search_call",
        id: "call_creative_australia",
        status: "failed",
        action: {
          type: "open_page",
          url: "https://creative.gov.au/sites/creative-australia/files/documents/2026-07/Music%20Australia%20-%20The%20Bass%20Line%20Second%20Edition.pdf#trace",
        },
      },
    },
  ],
  annotations: [],
};

function stage1Sources() {
  return validateResearchStage1Artifact(liveRunArtifact).sources.map(
    (source) => ({
      ...source,
      traceStatus: classifyResearchSourceTrace(source.url, failedTrace),
    }),
  );
}

function musicVictoriaCandidate(): ResearchCandidateV1 {
  return {
    candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
    source: {
      url: "https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/",
      publisher: "Music Victoria",
      title: "Music Victoria Releases 2025 Victorian Live Music Venue Audit",
      publishedAt: "2026-02-24",
    },
    scope: {
      geography: "Australia / Victoria",
      sector: "Music",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
    },
    evidence: {
      claim:
        "The audit identified 2,441 live-music venues in Victoria, including 655 venues hosting at least one weekly gig, with approximately 45% in regional Victoria.",
      observations: [
        {
          metric: "number of live-music venues",
          value: "2,441",
          unit: "count",
          periodStart: null,
          periodEnd: null,
        },
        {
          metric: "weekly live music venues",
          value: "655",
          unit: "venues",
          periodStart: null,
          periodEnd: null,
        },
        {
          metric: "percentage of venues in regional Victoria",
          value: "45",
          unit: "percent",
          periodStart: null,
          periodEnd: null,
        },
      ],
      sourceRole: "PRIMARY",
      limitations: [
        "Primary-page retrieval failed; values were extracted from search-result snippets.",
        "The count covers Victoria and does not establish national venue profitability.",
      ],
    },
    assessment: {
      authority: "HIGH",
      freshness: "NEWER_THAN_EXISTING",
      ingestionFeasibility: "MODERATE",
      confidence: "MEDIUM",
    },
  };
}

function creativeAustraliaCandidate(): ResearchCandidateV1 {
  return {
    candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
    source: {
      url: "https://creative.gov.au/sites/creative-australia/files/documents/2026-07/Music%20Australia%20-%20The%20Bass%20Line%20Second%20Edition.pdf",
      publisher: "Music Australia / Creative Australia",
      title: "Music Australia - The Bass Line, Second Edition",
      publishedAt: null,
    },
    scope: {
      geography: "Australia",
      sector: "Music",
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
    },
    evidence: {
      claim:
        "Live performance was the largest artist music-income stream at A$410 million; pubs, hotels and registered clubs accounted for 23.3% of surveyed live performances.",
      observations: [
        {
          metric: "artist live-performance income",
          value: "410 million",
          unit: "AUD",
          periodStart: null,
          periodEnd: null,
        },
        {
          metric:
            "share of live performances in pubs, hotels and registered clubs",
          value: "23.3",
          unit: "%",
          periodStart: null,
          periodEnd: null,
        },
      ],
      sourceRole: "PRIMARY",
      limitations: [
        "Primary-PDF retrieval failed; values were extracted from search-result snippets.",
        "The evidence does not directly measure venue profitability or closures.",
      ],
    },
    assessment: {
      authority: "HIGH",
      freshness: "COMPLEMENTARY",
      ingestionFeasibility: "MODERATE",
      confidence: "MEDIUM",
    },
  };
}

function result(candidates: ResearchCandidateV1[]): ResearchResultV1 {
  return ResearchResultV1Schema.parse({
    taskSummary: "Two primary-source candidates were structured faithfully.",
    candidates,
    researchLimitations: ["Primary document retrieval failed."],
  });
}

function reasonsFor(candidates: ResearchCandidateV1[]) {
  return validateCrossStageProvenance(
    AU_LIVE_MUSIC_VENUE_VIABILITY_TASK,
    stage1Sources(),
    result(candidates),
  );
}

describe("cross-stage research provenance", () => {
  it("accepts faithful semantic normalization of the live-run fixture", () => {
    expect(
      reasonsFor([musicVictoriaCandidate(), creativeAustraliaCandidate()]),
    ).toEqual([]);
  });

  it("accepts Victoria and Australia/Victoria within the Australian task hierarchy", () => {
    const victoria = musicVictoriaCandidate();
    victoria.scope.geography = "Victoria";
    const qualified = musicVictoriaCandidate();
    qualified.scope.geography = "Australia / Victoria";
    expect(reasonsFor([victoria])).toEqual([]);
    expect(reasonsFor([qualified])).toEqual([]);
  });

  it("distinguishes failed trace attempts from successful opens", () => {
    expect(stage1Sources().map((source) => source.traceStatus)).toEqual([
      "TRACE_ATTEMPTED",
      "TRACE_ATTEMPTED",
    ]);
    expect(
      classifyResearchSourceTrace(
        "https://not-in-trace.example/report",
        failedTrace,
      ),
    ).toBe("MODEL_REPORTED_ONLY");
    expect(
      classifyResearchSourceTrace("https://example.gov.au/opened", {
        calls: [
          {
            sequence: 0,
            item: {
              type: "web_search_call",
              status: "completed",
              action: {
                type: "open_page",
                url: "https://example.gov.au/opened#trace",
              },
            },
          },
        ],
        annotations: [],
      }),
    ).toBe("TRACE_OPENED");
  });

  it.each([
    ["2,441 → 2,941", 0, 0, "2,941"],
    ["A$410 million → A$510 million", 1, 0, "510 million"],
    ["23.3% → 32.3%", 1, 1, "32.3"],
  ])(
    "rejects changed hard values: %s",
    (_label, candidateIndex, observationIndex, value) => {
      const candidates = [
        musicVictoriaCandidate(),
        creativeAustraliaCandidate(),
      ];
      candidates[candidateIndex]!.evidence.observations[
        observationIndex
      ]!.value = value;
      expect(
        reasonsFor(candidates).some((reason) =>
          reason.startsWith("HARD_VALUE_MISMATCH"),
        ),
      ).toBe(true);
    },
  );

  it("rejects changed numeric scale", () => {
    const candidates = [musicVictoriaCandidate(), creativeAustraliaCandidate()];
    candidates[1]!.evidence.observations[0]!.value = "410 billion";
    expect(
      reasonsFor(candidates).some((reason) =>
        reason.startsWith("HARD_VALUE_MISMATCH"),
      ),
    ).toBe(true);
  });

  it("rejects unsupported foreign geography", () => {
    const candidate = musicVictoriaCandidate();
    candidate.scope.geography = "United Kingdom";
    expect(reasonsFor([candidate])).toContain(
      "GEOGRAPHY_SCOPE_MISMATCH: candidates.0.scope.geography is not supported by Stage 1.",
    );
    candidate.scope.geography = "California";
    expect(reasonsFor([candidate])).toContain(
      "GEOGRAPHY_SCOPE_MISMATCH: candidates.0.scope.geography is not supported by Stage 1.",
    );
  });

  it("rejects an invented URL", () => {
    const candidate = musicVictoriaCandidate();
    candidate.source.url = "https://invented.example/report";
    expect(reasonsFor([candidate])[0]).toMatch(/^HARD_URL_MISMATCH/);
  });

  it("rejects an invented publication date", () => {
    const candidate = creativeAustraliaCandidate();
    candidate.source.publishedAt = "2026-07-01";
    expect(reasonsFor([candidate])).toContain(
      "HARD_DATE_MISMATCH: candidates.0 adds unsupported date 2026-07-01.",
    );
  });

  it("rejects unsupported venue-profitability claims", () => {
    const candidate = musicVictoriaCandidate();
    candidate.evidence.claim =
      "The audit found that venue profitability improved in 2025.";
    expect(
      reasonsFor([candidate]).some((reason) =>
        reason.includes("venue-profitability"),
      ),
    ).toBe(true);
  });

  it("rejects unsupported national extrapolation", () => {
    const candidate = musicVictoriaCandidate();
    candidate.scope.geography = "Australia";
    candidate.evidence.claim =
      "Across Australia, 2,441 venues hosted live music during 2025.";
    const reasons = reasonsFor([candidate]);
    expect(
      reasons.some((reason) => reason.startsWith("GEOGRAPHY_SCOPE_MISMATCH")),
    ).toBe(true);
    expect(
      reasons.some((reason) => reason.includes("extrapolates subnational")),
    ).toBe(true);
  });

  it("rejects unsupported causal claims", () => {
    const candidate = musicVictoriaCandidate();
    candidate.evidence.claim =
      "Government commissioning caused Victoria to retain 2,441 live-music venues.";
    expect(
      reasonsFor([candidate]).some((reason) =>
        reason.includes("unsupported causality"),
      ),
    ).toBe(true);
  });

  it("requires snippet mediation to survive structuring", () => {
    const candidate = musicVictoriaCandidate();
    candidate.evidence.limitations = ["Coverage is limited to Victoria."];
    expect(
      reasonsFor([candidate]).some((reason) =>
        reason.startsWith("EVIDENCE_MEDIATION_MISMATCH"),
      ),
    ).toBe(true);
  });
});
