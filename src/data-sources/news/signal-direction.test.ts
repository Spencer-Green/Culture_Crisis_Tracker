import { describe, expect, it } from "vitest";

import {
  combineSignalDirections,
  deriveSignalDirection,
} from "@/data-sources/news/signal-direction";

describe("signal direction", () => {
  it("uses structural event priors rather than article sentiment", () => {
    expect(
      deriveSignalDirection({
        title: "Production cancellation praised in upbeat statement",
        eventType: "CANCELLATION",
      }),
    ).toBe("NEGATIVE");
    expect(
      deriveSignalDirection({
        title: "Attendance growth reported despite cautious commentary",
        eventType: "ATTENDANCE_GROWTH",
      }),
    ).toBe("POSITIVE");
  });

  it("keeps structurally mixed rules and leadership changes ambiguous", () => {
    expect(
      deriveSignalDirection({
        title: "ARIA changes eligibility rules for AI-generated music",
        description:
          "Fully AI-generated songs are no longer eligible for chart accreditation.",
        eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "Infrastructure executive leaves major AI company",
        eventType: "EXECUTIVE_LEADERSHIP_CHANGE",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("AMBIGUOUS");
  });

  it("allows evidence to override an AI-adoption prior", () => {
    expect(
      deriveSignalDirection({
        title: "AI workflow deployed across studio",
        description:
          "The deployment produced measured efficiency gains and expanded capacity.",
        eventType: "AI_ADOPTION",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "AI workflow deployed across studio",
        description:
          "The documented substitution reduced employment and displaced roles.",
        eventType: "AI_ADOPTION",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("NEGATIVE");
  });

  it("treats mixed cross-sector effects conservatively", () => {
    expect(
      deriveSignalDirection({
        title: "AI deployment expands production capacity",
        description:
          "The deployment improved efficiency but reduced employment and artist revenue.",
        eventType: "AI_ADOPTION",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("AMBIGUOUS");
    expect(combineSignalDirections(["POSITIVE", "NEGATIVE"])).toBe("AMBIGUOUS");
  });

  it("does not convert forecasts or null-event analysis into observed direction", () => {
    expect(
      deriveSignalDirection({
        title: "Anthropic CEO says AI market could reach $30T",
        eventType: null,
        claimKind: "ATTRIBUTED_ANALYSIS",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "Study reports rising workplace productivity",
        description: "Measured productivity increased across the sample.",
        eventType: null,
        claimKind: "EMPIRICAL_FINDING",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "Tour event potentially cancelled after sponsor review",
        eventType: "CANCELLATION",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "Company announces roadmap to expand compute capacity",
        eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
      }),
    ).toBe("AMBIGUOUS");
  });

  it("does not treat investment as automatically favourable", () => {
    expect(
      deriveSignalDirection({
        title: "AI company announces $2 billion investment",
        eventType: "INVESTMENT",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "AI company completes investment that expands capacity",
        description: "The funded project added compute capacity.",
        eventType: "INVESTMENT",
        claimKind: "OBSERVED_ACTION",
      }),
    ).toBe("POSITIVE");
  });
});
