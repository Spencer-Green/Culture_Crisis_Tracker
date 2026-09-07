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

  it("classifies a strategically significant senior departure without treating routine departures as structural", () => {
    expect(
      assess(
        "OpenAI loses a top data center exec as stream of high-profile departures continues",
        "OpenAI said it recently reorganized its infrastructure organization after the executive's departure.",
      ),
    ).toMatchObject({
      category: "AI_INFRASTRUCTURE",
      claimKind: "OBSERVED_ACTION",
      eventType: "EXECUTIVE_LEADERSHIP_CHANGE",
      aiImpactType: "AMBIGUOUS",
      confidence: "high",
      importance: 4,
    });
    expect(
      assess(
        "AI startup employee leaves the company",
        "The routine staff departure does not involve a senior leadership role.",
      )?.eventType,
    ).not.toBe("EXECUTIVE_LEADERSHIP_CHANGE");
    expect(
      assess(
        "Replit CEO joins the conference stage",
        "The founder will appear for an interview about AI products.",
      )?.eventType,
    ).not.toBe("EXECUTIVE_LEADERSHIP_CHANGE");
  });

  it("distinguishes major capability releases from routine or future product updates", () => {
    expect(
      assess(
        "Anthropic releases new multimodal reasoning model",
        "The deployed system delivers major performance gains and a materially new capability.",
      ),
    ).toMatchObject({
      category: "FRONTIER_MODEL_ADVANCEMENT",
      claimKind: "OBSERVED_ACTION",
      eventType: "MAJOR_PRODUCT_CAPABILITY_RELEASE",
      confidence: "high",
      importance: 4,
    });
    expect(
      assess(
        "AI lab announces a planned next-generation model",
        "The company will release the system next year.",
      ),
    ).toMatchObject({
      claimKind: "PROPOSED_ACTION",
      eventType: null,
      confidence: "medium",
    });
    expect(
      assess("AI assistant gets a minor beta feature update")?.eventType,
    ).not.toBe("MAJOR_PRODUCT_CAPABILITY_RELEASE");
  });

  it("requires concrete action for compute infrastructure expansion", () => {
    expect(
      assess(
        "Microsoft invests $10 billion in AI data centre capacity",
        "The company expanded its compute campus and added training capacity.",
      ),
    ).toMatchObject({
      category: "AI_INFRASTRUCTURE",
      claimKind: "OBSERVED_ACTION",
      eventType: "COMPUTE_INFRASTRUCTURE_EXPANSION",
      confidence: "high",
      importance: 4,
    });
    expect(
      assess(
        "Analysts forecast rising AI data center demand",
        "The discussion estimates future compute requirements without reporting a build or investment.",
      )?.eventType,
    ).not.toBe("COMPUTE_INFRASTRUCTURE_EXPANSION");
  });

  it("separates enacted cultural eligibility rules from commentary proposing them", () => {
    expect(
      assess(
        "ARIA sets AI eligibility rules for its charts",
        "The chart authority bans wholly AI-generated songs and withdraws their accreditation.",
      ),
    ).toMatchObject({
      claimKind: "OBSERVED_ACTION",
      eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
      aiImpactType: "POLICY_REGULATION",
      confidence: "high",
      importance: 5,
    });
    expect(
      assessAiIntelligence({
        title: "Commentary: AI music should be excluded from charts",
        description:
          "The author argues that chart eligibility rules should change.",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "ANALYTICAL",
      }),
    ).toMatchObject({
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
    });
  });

  it("uses existing general event types where they already express the action", () => {
    expect(
      assess(
        "Stability AI raises $76 million in fresh funding",
        "The financing brings the company's fundraising total to $232 million.",
      ),
    ).toMatchObject({
      category: "AI_CAPITAL_INVESTMENT",
      eventType: "INVESTMENT",
      importance: 3,
    });
    expect(
      assess(
        "FTC opens an AI enforcement action",
        "The federal regulator initiated enforcement under national AI rules.",
      ),
    ).toMatchObject({
      category: "AI_POLICY_REGULATION",
      eventType: "AI_POLICY_REGULATION",
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

  it("allows high-materiality specialist analysis to retain a null event", () => {
    expect(
      assessAiIntelligence({
        title: "Study finds AI adoption across the national workforce",
        description:
          "The empirical research reports broad workplace adoption and productivity evidence.",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "ACADEMIC",
      }),
    ).toMatchObject({
      category: "AI_ECONOMICS",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      confidence: "high",
      importance: 4,
    });
  });

  it("does not convert specialist legal analysis into a ruling", () => {
    expect(
      assessAiIntelligence({
        title: "Why a court decision may reshape AI training and fair use",
        description:
          "Legal analysis examines the copyright implications for creators.",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "LEGAL",
      }),
    ).toMatchObject({
      category: "AI_COPYRIGHT",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "RIGHTS_LICENSING",
    });
  });

  it("treats specialist policy argument as material analysis rather than an enacted event", () => {
    expect(
      assessAiIntelligence({
        title: "Colombia is preparing a poor copy of the EU's AI Act",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "POLICY",
      }),
    ).toMatchObject({
      category: "AI_POLICY_REGULATION",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      importance: 3,
      confidence: "medium",
    });
  });

  it("does not treat effects on decision-making as workforce displacement", () => {
    const result = assessAiIntelligence({
      title: "How AI could hollow out military decision-making",
      description:
        "The analysis considers effects on human judgment and operational decisions.",
      evidenceRole: "SPECIALIST_ANALYSIS",
      sourcePerspective: "RESEARCH",
    });
    expect(result?.category).not.toBe("AI_LABOUR_DISPLACEMENT");
    expect(result?.eventType).not.toBe("AI_LABOR_DISPLACEMENT");
    expect(result).toMatchObject({
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      importance: 2,
    });
  });

  it("does not turn low-signal specialist commentary into an adoption event", () => {
    expect(
      assessAiIntelligence({
        title: "Opinion: AI is changing everything",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "ANALYTICAL",
      }),
    ).toMatchObject({
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      importance: 1,
    });
  });

  it.each([
    "No generative AI was used in production.",
    "The game was made without AI.",
    "The studio did not use AI for the project.",
    "The production remained AI-free.",
    "The developers rejected generative AI use.",
  ])("does not treat explicit AI non-use as adoption: %s", (title) => {
    expect(assess(title)).toMatchObject({
      category: "AI_ADOPTION",
      claimKind: "GENERAL_MENTION",
      eventType: null,
      importance: 1,
    });
  });

  it("retains genuine deployment evidence", () => {
    expect(
      assess(
        "The studio built and deployed generative-AI tools in production.",
      ),
    ).toMatchObject({
      eventType: "AI_ADOPTION",
    });
  });

  it("does not turn an AI restriction into adoption", () => {
    expect(
      assess(
        "The national competition bans AI-generated entries",
        "The authority adopted new eligibility rules for creative submissions.",
      ),
    ).toMatchObject({
      eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
    });
  });

  it("keeps independent deployment evidence in a mixed article", () => {
    expect(
      assess(
        "The development team avoided generative AI.",
        "The publisher separately deployed an AI moderation system in production.",
      ),
    ).toMatchObject({
      eventType: "AI_ADOPTION",
    });
  });
});
