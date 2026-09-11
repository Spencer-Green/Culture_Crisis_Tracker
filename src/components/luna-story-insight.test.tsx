import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LunaStoryInsight } from "@/components/luna-story-insight";
import type { StorySynthesisReadResult } from "@/services/media/production-story-synthesis-core";

function result(
  freshness: "CURRENT" | "STALE" = "CURRENT",
): StorySynthesisReadResult {
  return {
    freshness,
    artifact: {
      identityKey: "identity",
      storyKey: "story",
      clusterId: "cluster",
      representativeArticleId: "article",
      evidenceArticleIds: ["article"],
      evidenceFingerprint: "fingerprint",
      evidenceVersion: "story-synthesis-evidence-v5",
      promptVersion: "story-synthesis-prompt-v5.1",
      outputSchemaVersion: "story-synthesis-output-v2",
      requestedModel: "gpt-5.6-luna",
      responseModel: "gpt-5.6-luna",
      generatedAt: "2026-08-28T00:00:00.000Z",
      latencyMs: 8_000,
      synthesis: {
        eventSummary: "The institution changed an eligibility rule.",
        whyItMatters:
          "The rule changes how AI-generated work can enter an established market-recognition system.",
        affectedSectors: ["music"],
        mechanisms: ["RIGHTS_IP", "DISTRIBUTION"],
        evidenceStrength: "HIGH",
        claimKind: "OBSERVED_ACTION_OR_EVENT",
        structuralSignificance: "STRUCTURAL_DEVELOPMENT",
        connections: [],
        uncertainties: [
          {
            type: "MAGNITUDE",
            statement:
              "The downstream chart and revenue effects are not measured.",
          },
        ],
        whatToWatch: ["Whether comparable chart bodies adopt similar rules."],
        materialityLevel: "VERY_HIGH",
        materialityRationale:
          "The action changes national market-access rules for AI-generated recordings.",
      },
    },
  };
}

describe("Luna story insight", () => {
  it("renders concise current interpretation without deterministic badges", () => {
    const html = renderToStaticMarkup(<LunaStoryInsight result={result()} />);
    expect(html).toContain("Luna interpretation");
    expect(html).toContain("how AI-generated work can enter");
    expect(html).toContain("Uncertainty:");
    expect(html).toContain("What to watch:");
    expect(html).toContain('data-luna-freshness="CURRENT"');
    expect(html).not.toContain("importance");
    expect(html).not.toContain("confidence");
  });

  it("marks last-known-good synthesis subtly when stale", () => {
    const html = renderToStaticMarkup(
      <LunaStoryInsight result={result("STALE")} />,
    );
    expect(html).toContain("earlier interpretation · evidence has changed");
    expect(html).toContain('data-luna-freshness="STALE"');
  });

  it("renders nothing for missing synthesis", () => {
    expect(
      renderToStaticMarkup(
        <LunaStoryInsight result={{ freshness: "MISSING", artifact: null }} />,
      ),
    ).toBe("");
  });
});
