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

  it("requires a demonstrated material capability delta", () => {
    expect(
      deriveSignalDirection({
        title: "OpenAI releases a new reasoning model",
        description:
          "Independent benchmark testing demonstrated materially stronger coding and inference performance.",
        eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "FRONTIER_MODEL_ADVANCEMENT",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "OpenAI launches a new model",
        description: "The company made the model available to users.",
        eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "FRONTIER_MODEL_ADVANCEMENT",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "Rumored model may lead benchmark rankings",
        eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
        claimKind: "PROPOSED_ACTION",
        aiCategory: "FRONTIER_MODEL_ADVANCEMENT",
      }),
    ).toBe("AMBIGUOUS");
  });

  it("recognizes measured inference efficiency without treating availability as improvement", () => {
    expect(
      deriveSignalDirection({
        title: "OpenAI inference chip benchmarks show higher throughput",
        description:
          "Testing registered more tokens per user and more throughput per kilowatt than the currently available state of the art.",
        eventType: "AI_ADOPTION",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_SEMICONDUCTORS",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "AI accelerator is now available",
        description: "The vendor claims benchmark-leading performance.",
        eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_SEMICONDUCTORS",
      }),
    ).toBe("AMBIGUOUS");
  });

  it("separates completed compute capacity from future infrastructure plans", () => {
    expect(
      deriveSignalDirection({
        title: "New AI data centre commissioned",
        description:
          "The operational facility brought 500MW of additional compute capacity online.",
        eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_INFRASTRUCTURE",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "Company announces roadmap for 500MW AI data centre",
        description: "The planned facility is expected to open in 2030.",
        eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
        claimKind: "PROPOSED_ACTION",
        aiCategory: "AI_INFRASTRUCTURE",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "Operator shuts down AI data centre",
        description:
          "The shutdown reduced available compute capacity after a major supply disruption.",
        eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_INFRASTRUCTURE",
      }),
    ).toBe("NEGATIVE");
  });

  it("requires measured benefits for positive AI adoption", () => {
    expect(
      deriveSignalDirection({
        title: "Bank deploys AI document workflow",
        description:
          "The deployed system produced a measured reduction in processing time and increased throughput.",
        eventType: "AI_ADOPTION",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_LABOUR_ADOPTION",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "Bank announces AI workflow integration",
        description: "The company says the tool could improve productivity.",
        eventType: "AI_ADOPTION",
        claimKind: "PROPOSED_ACTION",
        aiCategory: "AI_LABOUR_ADOPTION",
      }),
    ).toBe("AMBIGUOUS");
  });

  it("keeps licensing mixed unless completed compensation or harm is explicit", () => {
    expect(
      deriveSignalDirection({
        title: "Music service signs AI licensing agreement",
        description:
          "The completed deal pays royalties and expands authorized access to participating artists' recordings.",
        eventType: "AI_LICENSING",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_LICENSING",
      }),
    ).toBe("POSITIVE");
    expect(
      deriveSignalDirection({
        title: "AI licensing dispute remains before the court",
        description:
          "The unresolved case could change compensation arrangements.",
        eventType: "AI_LICENSING",
        claimKind: "ATTRIBUTED_ANALYSIS",
        aiCategory: "AI_LICENSING",
      }),
    ).toBe("AMBIGUOUS");
    expect(
      deriveSignalDirection({
        title: "AI company uses recordings without payment",
        description:
          "The documented uncompensated use caused creator revenue loss.",
        eventType: "AI_LICENSING",
        claimKind: "OBSERVED_ACTION",
        aiCategory: "AI_LICENSING",
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

  it.each([
    ["Venue closes permanently", "CLOSURE"],
    ["Company enters insolvency", "BANKRUPTCY_INSOLVENCY"],
    ["Studio announces observed layoffs", "LAYOFFS"],
    ["Tour cancellation confirmed", "CANCELLATION"],
    ["Revenue declined in the measured period", "REVENUE_DECLINE"],
  ] as const)(
    "keeps observed adverse events negative: %s",
    (title, eventType) => {
      expect(
        deriveSignalDirection({
          title,
          eventType,
          claimKind: "OBSERVED_ACTION",
        }),
      ).toBe("NEGATIVE");
    },
  );
});
