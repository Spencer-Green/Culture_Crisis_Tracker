import { describe, expect, it } from "vitest";

import {
  RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS,
  validateResearchStage1Artifact,
} from "@/services/research/research-artifact";

const sourceBlock = `SOURCE
URL: https://www.apraamcos.com.au/about-us/news-and-events/year-in-review
PUBLISHER: APRA AMCOS
TITLE: Year in Review
PUBLISHED_AT: 2026-08-01
REPORTING_PERIOD: 2025
SOURCE_ROLE: PRIMARY
CLAIM: The report recorded 1,000 venue performances.
OBSERVATION: venue performances / 1,000 / performances / 2025
LIMITATIONS: This is an administrative count.`;

describe("validateResearchStage1Artifact", () => {
  it("accepts a valid compact Stage-1 artifact", () => {
    const result = validateResearchStage1Artifact(`RESEARCH_SUMMARY
One source was found.

${sourceBlock}

RESEARCH_LIMITATIONS
The search was deliberately bounded.`);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.publisher).toBe("APRA AMCOS");
  });

  it("accepts a successful zero-source artifact", () => {
    const result = validateResearchStage1Artifact(`RESEARCH_SUMMARY
No sufficiently supported source was found.

RESEARCH_LIMITATIONS
The search was deliberately bounded.`);
    expect(result.sources).toEqual([]);
  });

  it("rejects a source block without a URL", () => {
    expect(() =>
      validateResearchStage1Artifact(`RESEARCH_SUMMARY
One source.

${sourceBlock.replace(/^URL:.*$/m, "")}

RESEARCH_LIMITATIONS
Bounded.`),
    ).toThrow("failed local validation");
  });

  it("rejects more than two source blocks", () => {
    expect(() =>
      validateResearchStage1Artifact(`RESEARCH_SUMMARY
Three sources.

${sourceBlock}

${sourceBlock}

${sourceBlock}

RESEARCH_LIMITATIONS
Bounded.`),
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
