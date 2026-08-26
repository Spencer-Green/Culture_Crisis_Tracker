import { describe, expect, it } from "vitest";

import {
  assessAiIntelligence,
  isMaterialAiAssessment,
} from "@/data-sources/news/ai-intelligence";

function assess(title: string, description?: string) {
  return assessAiIntelligence({ title, description });
}

describe("first-class AI intelligence assessment", () => {
  it.each([
    [
      "Government enacts national AI regulation",
      "The new law establishes binding safety rules for AI systems.",
      "AI_POLICY_REGULATION",
      5,
    ],
    [
      "Adobe Firefly launches generative AI audio tools globally",
      "The creative platform released music, voice and sound production tools.",
      "AI_CREATOR_TOOL",
      4,
    ],
    [
      "OpenAI releases new frontier model",
      "The next-generation model is now broadly available.",
      "FRONTIER_MODEL_ADVANCEMENT",
      4,
    ],
    [
      "Nvidia launches AI accelerator with major performance gains",
      "The new GPU expands training and inference capacity.",
      "AI_SEMICONDUCTORS",
      4,
    ],
    [
      "US adopts export controls on advanced AI chips",
      "The federal restrictions limit exports of accelerators.",
      "AI_EXPORT_CONTROLS",
      5,
    ],
    [
      "Microsoft invests $10 billion in AI data centre capacity",
      "The major expansion will add compute capacity.",
      "AI_INFRASTRUCTURE",
      4,
    ],
  ])(
    "recognises material AI development: %s",
    (title, description, category, importance) => {
      expect(assess(title, description)).toMatchObject({
        category,
        importance,
        confidence: "high",
        material: true,
      });
    },
  );

  it("distinguishes observed displacement from a labour-exposure forecast", () => {
    expect(
      assess(
        "Company replaces 500 roles with AI automation",
        "The company eliminated roles after deploying the system.",
      ),
    ).toMatchObject({
      category: "AI_LABOUR_DISPLACEMENT",
      eventType: "AI_LABOR_DISPLACEMENT",
      claimKind: "OBSERVED_ACTION",
      confidence: "high",
      importance: 4,
    });
    expect(
      assess(
        "Study estimates AI could affect millions of jobs",
        "The occupational exposure forecast does not report observed layoffs.",
      ),
    ).toMatchObject({
      category: "AI_LABOUR_DISPLACEMENT",
      eventType: null,
      claimKind: "ATTRIBUTED_ANALYSIS",
      confidence: "high",
      importance: 4,
    });
  });

  it("keeps an authoritative economic forecast attributed rather than factualising it", () => {
    expect(
      assess(
        "AI lab CEO estimates a $30T addressable market",
        "The chief executive predicts a very large market but reports no observed outcome.",
      ),
    ).toMatchObject({
      category: "AI_ECONOMICS",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      confidence: "high",
      importance: 4,
    });
  });

  it.each([
    ["Celebrity says AI is changing everything", 1],
    ["AI assistant gets a minor beta feature update", 2],
    ["How to use AI: beginner's tutorial", 1],
    ["Festival FAQ mentions AI-powered search", 1],
  ])("keeps low-signal AI noise ineligible: %s", (title, importance) => {
    const result = assess(title);
    expect(result?.importance).toBe(importance);
    expect(isMaterialAiAssessment(result)).toBe(false);
  });

  it("does not require a creative-sector term for structural AI materiality", () => {
    expect(
      isMaterialAiAssessment(
        assess(
          "Anthropic releases new frontier model",
          "The next-generation foundation model is broadly available.",
        ),
      ),
    ).toBe(true);
  });

  it("keeps confidence about an attributed statement distinct from outcome certainty", () => {
    const result = assess(
      "AI company CEO predicts $30 trillion market",
      "The founder stated the estimate in public remarks.",
    );
    expect(result).toMatchObject({
      confidence: "high",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
    });
  });
});
