import { describe, expect, it } from "vitest";

import {
  RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS,
  RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS,
  ResearchStage1ArtifactError,
  parseResearchPublicationDate,
  validateResearchStage1Artifact,
} from "@/services/research/research-artifact";

const sourceBlock = `SOURCE
URL: https://www.apraamcos.com.au/about-us/news-and-events/year-in-review
PUBLISHER: APRA AMCOS
TITLE: Year in Review
PUBLICATION_DATE: 2026-08-01
REPORTING_PERIOD: 2025
GEOGRAPHY: Australia
SOURCE_ROLE: PRIMARY
CLAIM: The report recorded 1,000 venue performances.
OBSERVATION: METRIC=venue performances | VALUE=1,000 | UNIT=performances | QUALIFIER=NONE
OBSERVATION: METRIC=performance growth | VALUE=12.5 | UNIT=% | QUALIFIER=INCREASE
LIMITATIONS: This is an administrative count.`;

function artifact(blocks = sourceBlock) {
  return `RESEARCH_SUMMARY
One source was found.

${blocks}

RESEARCH_LIMITATIONS
The search was deliberately bounded.`;
}

describe("validateResearchStage1Artifact", () => {
  it("parses strict source and observation fields", () => {
    const result = validateResearchStage1Artifact(artifact());
    expect(result.summary).toBe("One source was found.");
    expect(result.researchLimitations).toEqual([
      "The search was deliberately bounded.",
    ]);
    expect(result.sources[0]).toMatchObject({
      publisher: "APRA AMCOS",
      geography: "Australia",
      publishedAt: "2026-08-01",
      observations: [
        {
          metric: "venue performances",
          value: "1,000",
          unit: "performances",
          qualifier: "NONE",
        },
        {
          metric: "performance growth",
          value: "12.5",
          unit: "%",
          qualifier: "INCREASE",
        },
      ],
    });
  });

  it.each([
    ["2026-02-24", "EXACT_DATE", "2026-02-24"],
    ["2026-02", "MONTH", null],
    ["February 2026", "MONTH", null],
    ["2026", "YEAR", null],
    ["UNKNOWN", "UNKNOWN", null],
  ] as const)(
    "accepts bounded publication-date evidence %s",
    (value, precision, exactDate) => {
      const parsed = parseResearchPublicationDate(value);
      expect(parsed).toMatchObject({ precision, exactDate });
      expect(
        validateResearchStage1Artifact(
          artifact(
            sourceBlock.replace(
              "PUBLICATION_DATE: 2026-08-01",
              `PUBLICATION_DATE: ${value}`,
            ),
          ),
        ).sources[0]?.publishedAt,
      ).toBe(parsed?.label);
    },
  );

  it.each([
    "recently",
    "last year",
    "around February sometime",
    "probably 2026",
    "2026-99-99",
    "2026-02-29",
    "2026-13",
  ])("rejects unsupported publication-date evidence %s", (value) => {
    expect(() =>
      validateResearchStage1Artifact(
        artifact(
          sourceBlock.replace(
            "PUBLICATION_DATE: 2026-08-01",
            `PUBLICATION_DATE: ${value}`,
          ),
        ),
      ),
    ).toThrow(
      "PUBLICATION_DATE must be YYYY-MM-DD, YYYY-MM, Month YYYY, YYYY, or UNKNOWN",
    );
  });

  it("reports bounded sanitized rejected publication-date values", () => {
    const unsafeValue = `sk-abcdefghijk${"x".repeat(
      RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS * 2,
    )}`;
    try {
      validateResearchStage1Artifact(
        artifact(
          sourceBlock.replace(
            "PUBLICATION_DATE: 2026-08-01",
            `PUBLICATION_DATE: ${unsafeValue}`,
          ),
        ),
      );
      throw new Error("Expected artifact validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchStage1ArtifactError);
      const diagnostic = (error as ResearchStage1ArtifactError).diagnostics[0];
      expect(diagnostic).toMatchObject({
        sourceIndex: 1,
        field: "PUBLICATION_DATE",
        failureReason:
          "Expected YYYY-MM-DD, YYYY-MM, Month YYYY, YYYY, or UNKNOWN.",
      });
      expect(diagnostic?.rejectedValue).toBe("[REDACTED]");
      expect(diagnostic?.rejectedValue).not.toContain("sk-abcdefghijk");
    }
  });

  it("truncates non-secret rejected publication-date values", () => {
    const rejectedValue = `not-a-date-${"x".repeat(
      RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS * 2,
    )}`;
    try {
      validateResearchStage1Artifact(
        artifact(
          sourceBlock.replace(
            "PUBLICATION_DATE: 2026-08-01",
            `PUBLICATION_DATE: ${rejectedValue}`,
          ),
        ),
      );
      throw new Error("Expected artifact validation to fail.");
    } catch (error) {
      const diagnostic = (error as ResearchStage1ArtifactError).diagnostics[0];
      expect(diagnostic?.rejectedValue).toHaveLength(
        RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS +
          "…[TRUNCATED]".length,
      );
      expect((diagnostic?.rejectedValue ?? "").endsWith("…[TRUNCATED]")).toBe(
        true,
      );
    }
  });

  it("accepts zero sources and OBSERVATION: NONE", () => {
    expect(
      validateResearchStage1Artifact(`RESEARCH_SUMMARY
No sufficiently supported source was found.

RESEARCH_LIMITATIONS
The search was deliberately bounded.`).sources,
    ).toEqual([]);
    expect(
      validateResearchStage1Artifact(
        artifact(
          sourceBlock
            .replace(/^OBSERVATION:.*$/gm, "")
            .replace("LIMITATIONS:", "OBSERVATION: NONE\nLIMITATIONS:"),
        ),
      ).sources[0]?.observations,
    ).toEqual([]);
  });

  it.each([
    ["URL", /^URL:.*$/m],
    ["GEOGRAPHY", /^GEOGRAPHY:.*$/m],
    ["PUBLICATION_DATE", /^PUBLICATION_DATE:.*$/m],
  ])("rejects a source block without %s", (_label, pattern) => {
    expect(() =>
      validateResearchStage1Artifact(
        artifact(sourceBlock.replace(pattern, "")),
      ),
    ).toThrow("failed local validation");
  });

  it("rejects malformed observation grammar and unsupported qualifiers", () => {
    expect(() =>
      validateResearchStage1Artifact(
        artifact(
          sourceBlock.replace(
            /^OBSERVATION:.*$/m,
            "OBSERVATION: venue performances / 1,000 / performances",
          ),
        ),
      ),
    ).toThrow("bounded METRIC/VALUE/UNIT/QUALIFIER grammar");
    expect(() =>
      validateResearchStage1Artifact(
        artifact(sourceBlock.replace("QUALIFIER=NONE", "QUALIFIER=GUESS")),
      ),
    ).toThrow("unsupported");
  });

  it("rejects more than two source blocks", () => {
    expect(() =>
      validateResearchStage1Artifact(
        artifact(`${sourceBlock}\n\n${sourceBlock}\n\n${sourceBlock}`),
      ),
    ).toThrow("maximum is 2");
  });

  it("rejects artifacts over the configured length bound", () => {
    expect(() =>
      validateResearchStage1Artifact(`RESEARCH_SUMMARY
${"x".repeat(RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS)}
RESEARCH_LIMITATIONS
Bounded.`),
    ).toThrow("exceeds");
  });
});
