import { describe, expect, it } from "vitest";

import {
  RESEARCH_CANDIDATE_MAXIMUM,
  ResearchCandidateV1Schema,
  ResearchResultV1Schema,
  type ResearchCandidateV1,
} from "@/services/research/research-schema";

function candidate(
  overrides: Partial<ResearchCandidateV1> = {},
): ResearchCandidateV1 {
  return {
    candidateType: "STRUCTURED_OBSERVATION_CANDIDATE",
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
      claim: "The report publishes a national venue count.",
      observations: [
        {
          metric: "Live-music venues",
          value: "100",
          unit: "venues",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
        },
      ],
      sourceRole: "PRIMARY",
      limitations: ["Coverage depends on participating venues."],
    },
    assessment: {
      authority: "HIGH",
      freshness: "NEWER_THAN_EXISTING",
      ingestionFeasibility: "MODERATE",
      confidence: "HIGH",
    },
    ...overrides,
  };
}

describe("ResearchCandidateV1Schema", () => {
  it("accepts a fully supported candidate", () => {
    expect(ResearchCandidateV1Schema.parse(candidate())).toEqual(candidate());
  });

  it("rejects a missing source URL", () => {
    const input = candidate() as unknown as Record<string, unknown>;
    input.source = { publisher: "Example", title: "Report", publishedAt: null };
    expect(ResearchCandidateV1Schema.safeParse(input).success).toBe(false);
  });

  it("rejects an invalid enum", () => {
    const input = candidate() as unknown as Record<string, unknown>;
    input.candidateType = "CANONICAL_TRUTH";
    expect(ResearchCandidateV1Schema.safeParse(input).success).toBe(false);
  });

  it("rejects reversed reporting periods", () => {
    const input = candidate({
      scope: {
        geography: "Australia",
        sector: "Music",
        reportingPeriodStart: "2026-01-01",
        reportingPeriodEnd: "2025-01-01",
      },
    });
    expect(ResearchCandidateV1Schema.safeParse(input).success).toBe(false);
  });
});

describe("ResearchResultV1Schema", () => {
  it("accepts successful research with zero discoveries", () => {
    expect(
      ResearchResultV1Schema.parse({
        taskSummary: "No sufficiently supported new evidence was found.",
        candidates: [],
        researchLimitations: ["Search coverage was bounded."],
      }).candidates,
    ).toEqual([]);
  });

  it("rejects more than the candidate maximum", () => {
    const result = ResearchResultV1Schema.safeParse({
      taskSummary: "Too many candidates.",
      candidates: Array.from({ length: RESEARCH_CANDIDATE_MAXIMUM + 1 }, () =>
        candidate(),
      ),
      researchLimitations: [],
    });
    expect(result.success).toBe(false);
  });
});
