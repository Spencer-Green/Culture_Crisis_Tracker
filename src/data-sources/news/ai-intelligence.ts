import type {
  AiImpactType,
  MediaConfidence,
  MediaEventType,
  MediaPolarity,
} from "@/data-sources/news/media-types";

export const AI_INTELLIGENCE_CATEGORIES = [
  "FRONTIER_MODEL_ADVANCEMENT",
  "AI_ADOPTION",
  "AI_CREATOR_TOOL",
  "AI_POLICY_REGULATION",
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_LABOUR_DISPLACEMENT",
  "AI_LABOUR_ADOPTION",
  "AI_SAFETY_GOVERNANCE",
  "AI_COMPUTE",
  "AI_SEMICONDUCTORS",
  "AI_INFRASTRUCTURE",
  "AI_ENERGY",
  "AI_CAPITAL_INVESTMENT",
  "AI_ECONOMICS",
  "AI_COMPETITION",
  "AI_EXPORT_CONTROLS",
] as const;

export type AiIntelligenceCategory =
  (typeof AI_INTELLIGENCE_CATEGORIES)[number];
export type IntelligenceClaimKind =
  | "OBSERVED_ACTION"
  | "PROPOSED_ACTION"
  | "ATTRIBUTED_ANALYSIS"
  | "GENERAL_MENTION";

export type AiIntelligenceAssessment = {
  category: AiIntelligenceCategory;
  claimKind: IntelligenceClaimKind;
  eventType: MediaEventType | null;
  aiImpactType: AiImpactType;
  polarity: MediaPolarity;
  confidence: MediaConfidence;
  importance: 1 | 2 | 3 | 4 | 5;
  material: boolean;
  rationale: string;
};

export type AiIntelligenceInput = {
  title: string;
  description?: string | null;
  evidenceRole?: string | null;
  sourcePerspective?: string | null;
};

const AI_PATTERN =
  /\b(ai|artificial intelligence|generative ai|foundation models?|large language models?|llms?)\b/i;
const AI_PRODUCT_PATTERN =
  /\b(openai|chatgpt|claude|gemini|copilot|firefly|midjourney|sora|dall-?e)\b/i;
const CREATIVE_PATTERN =
  /\b(music|songs?|recordings?|charts?|aria charts?|artists?|authors?|writers?|actors?|voice|likeness|film|movies?|television|gaming|games?|creative|copyright|publishing|audio|video|images?)\b/i;
const COMPLETED_POLICY_ACTION_PATTERN =
  /\b(adopts?|adopted|enacts?|enacted|bans?|banned|prohibits?|prohibited|blocks?|blocked|publishes?|requires?|required|mandates?|mandated|finali[sz]es?|final rule|new (?:ai )?(?:regulation|rule|standard)|issues? (?:a )?(?:rule|order|standard)|enforces?|enforcement action|no longer (?:eligible|permitted|allowed)|withdraw(?:s|n)? accreditation|accreditations? withdrawn|eligibility (?:rule|rules|change|changes)|export restrictions?|export controls?)\b/i;
const PROPOSED_POLICY_ACTION_PATTERN =
  /\b(proposes?|proposed|proposal|draft (?:law|bill|rule|standard)|consultation|plans? to (?:regulate|ban|require|restrict|label)|will (?:require|restrict|label|add labels?)|to add labels?|bill introduced|framework for regulating)\b/i;
const POLICY_SUBJECT_PATTERN =
  /\b(regulat\w*|legislation|lawmakers?|government|policy|rules?|standards?|eligibility|accreditation|synthetic media|labels?|labelling|labeling|disclosure|transparency requirement|digital replicas?|procurement|competition authorit|antitrust|export controls?|export restrictions?)\b/i;
const MAJOR_POLICY_SCOPE_PATTERN =
  /\b(national|nationwide|federal|government|regulator|commission|authority|parliament|congress|court|industry-wide|sector-wide|international|european union|united states|australia|australian|united kingdom|chart authority|aria charts?)\b/i;
const COPYRIGHT_PATTERN =
  /\b(copyright\w*|training data|fair use|infringement|authors? rights?|creator rights?|digital replicas?|likeness rights?)\b/i;
const LICENSING_PATTERN =
  /\b(licens\w*|royalt\w*|rights deal|consent|compensation|collective licens\w*)\b/i;
const OBSERVED_LABOUR_PATTERN =
  /\b(replaces?|replaced|cuts? (?:jobs|roles|staff)|job cuts?|layoffs?|laid off|redundan\w*|eliminates? roles?|workforce reduction|automates? (?:jobs|roles|tasks))\b/i;
const LABOUR_FORECAST_PATTERN =
  /\b(jobs? at risk|occupational exposure|could (?:replace|displace|affect)|may (?:replace|displace|affect)|forecast\w*|estimates?[^.]{0,50}(?:jobs?|workers?)|study[^.]{0,60}(?:jobs?|workers?))\b/i;
const LABOUR_ADOPTION_PATTERN =
  /\b(workplace|workforce|employees?|workers?|jobs?|hiring|recruitment|productivity)\b/i;
const CREATOR_TOOL_ACTION_PATTERN =
  /\b(launch(?:es|ed)?|release[sd]?|rolls? out|introduc(?:es|ed)|adds?|integrat(?:es|ed|ion)|makes? available|deploys?)\b/i;
const TOOL_PATTERN =
  /\b(tool|suite|platform|assistant|workflow|generator|audio tools?|music tools?|video tools?|image tools?|voice tools?)\b/i;
const FRONTIER_MODEL_PATTERN =
  /\b(frontier model|foundation model|large language model|reasoning model|multimodal model|new model|next-generation model)\b/i;
const MODEL_ACTION_PATTERN =
  /\b(announc(?:es|ed)|built|debuts?|launch(?:es|ed)?|release[sd]?|reveals?|unveil(?:s|ed)?|introduc(?:es|ed)|deploys?|makes? available)\b/i;
const MAJOR_AI_ORGANISATION_PATTERN =
  /\b(openai|anthropic|google|deepmind|microsoft|meta|amazon|apple|adobe|nvidia|amd|xai)\b/i;
const COMPUTE_PATTERN =
  /\b(compute|gpu|gpus|accelerator|accelerators|data cent(?:er|re)|data centres|cloud capacity|training capacity|inference capacity)\b/i;
const SEMICONDUCTOR_PATTERN =
  /\b(semiconductor|chip|chips|gpu|gpus|accelerator|accelerators|nvidia|amd|tsmc)\b/i;
const INFRASTRUCTURE_PATTERN =
  /\b(data cent(?:er|re)|data centres|infrastructure|compute capacity|cloud capacity|power grid|electricity supply|energy demand|nuclear power)\b/i;
const LARGE_ECONOMIC_SCALE_PATTERN =
  /(?:\$|usd\s*)?\d+(?:\.\d+)?\s*(?:billion|trillion|bn|tn|b|t)\b|\bmajor (?:investment|deal|expansion|capacity)|\brecord investment\b/i;
const MATERIAL_ECONOMIC_SCALE_PATTERN =
  /(?:\$|usd\s*)?\d+(?:\.\d+)?\s*(?:million|billion|trillion|m|bn|tn|b|t)\b|\bmajor (?:investment|deal|expansion|capacity)|\brecord investment\b/i;
const INVESTMENT_PATTERN =
  /\b(invest(?:s|ed|ment|ing)|capital expenditure|capex|funding|financing|deal)\b/i;
const SAFETY_GOVERNANCE_PATTERN =
  /\b(ai safety|model safety|frontier safety|governance|risk management framework|model evaluation|safety institute)\b/i;
const ECONOMIC_FORECAST_PATTERN =
  /\b(addressable market|market size|economic impact|productivity|gdp|forecast|predicts?|predict(?:ion|ed)|estimates?|expectation)\b/i;
const ATTRIBUTED_SPEAKER_PATTERN =
  /\b(ceo|chief executive|founder|chair|president|investor|economist|researcher|analyst|regulator)\b/i;
const SYNTHETIC_PUBLICATION_PATTERN =
  /\b(entirely|fully|wholly)\s+(?:ai-generated|generated (?:by|using) ai)[^.]{0,60}\b(op-ed|essay|article|song|album|film|video)\b|\b(op-ed|essay|article|song|album|film|video)\b[^.]{0,60}\b(entirely|fully|wholly)\s+(?:ai-generated|generated (?:by|using) ai)\b/i;
const LOW_SIGNAL_PATTERN =
  /\b(how to|tutorial|tips? for|beginner'?s guide|what is ai|explainer|opinion:|celebrity[^.]{0,30}(?:says?|thinks?)|could change everything|is changing everything)\b/i;
const MINOR_FEATURE_PATTERN =
  /\b(minor|small|experimental|beta)\b[^.]{0,30}\b(feature|update|tool)\b|\bfeature update\b/i;
const PRIMARY_ANALYSIS_TITLE_PATTERN =
  /\b(analysis|discussion paper|guidance|policy paper|report|research|remarks|study|white paper)\b/i;

function textFor(input: AiIntelligenceInput): string {
  return `${input.title}. ${input.description ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
}

function assessment(
  values: Omit<AiIntelligenceAssessment, "material">,
): AiIntelligenceAssessment {
  return { ...values, material: values.importance >= 3 };
}

export function assessAiIntelligence(
  input: AiIntelligenceInput,
): AiIntelligenceAssessment | null {
  const text = textFor(input);
  if (!AI_PATTERN.test(text) && !AI_PRODUCT_PATTERN.test(text)) return null;

  if (LOW_SIGNAL_PATTERN.test(text))
    return assessment({
      category: "AI_ADOPTION",
      claimKind: "GENERAL_MENTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "AMBIGUOUS",
      polarity: "neutral/ambiguous",
      confidence: "low",
      importance: 1,
      rationale:
        "The supplied text is generic AI commentary or instructional material without a material supported development.",
    });

  if (
    input.evidenceRole === "PRIMARY_DOCUMENT" &&
    PRIMARY_ANALYSIS_TITLE_PATTERN.test(input.title) &&
    !COMPLETED_POLICY_ACTION_PATTERN.test(text) &&
    !PROPOSED_POLICY_ACTION_PATTERN.test(text) &&
    !LABOUR_FORECAST_PATTERN.test(text) &&
    !LARGE_ECONOMIC_SCALE_PATTERN.test(text)
  )
    return assessment({
      category: "AI_ADOPTION",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "AMBIGUOUS",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: 2,
      rationale:
        "The primary source published analysis, but the supplied text does not establish a material completed AI action or quantified structural finding.",
    });

  const completedPolicy =
    COMPLETED_POLICY_ACTION_PATTERN.test(text) &&
    (POLICY_SUBJECT_PATTERN.test(text) || /\bai-generated\b/i.test(text));
  const proposedPolicy =
    PROPOSED_POLICY_ACTION_PATTERN.test(text) &&
    POLICY_SUBJECT_PATTERN.test(text);
  if (completedPolicy || proposedPolicy) {
    const exportControls = /\bexport controls?|export restrictions?\b/i.test(
      text,
    );
    const competition = /\b(competition|antitrust|market power)\b/i.test(text);
    const safety = SAFETY_GOVERNANCE_PATTERN.test(text);
    const majorScope = MAJOR_POLICY_SCOPE_PATTERN.test(text);
    const marketAccess =
      /\b(no longer eligible|eligibility|accreditation|banned from|prohibited from|market access|charts?)\b/i.test(
        text,
      );
    return assessment({
      category: exportControls
        ? "AI_EXPORT_CONTROLS"
        : competition
          ? "AI_COMPETITION"
          : safety
            ? "AI_SAFETY_GOVERNANCE"
            : "AI_POLICY_REGULATION",
      claimKind: completedPolicy ? "OBSERVED_ACTION" : "PROPOSED_ACTION",
      eventType: "AI_POLICY_REGULATION",
      aiImpactType: "POLICY_REGULATION",
      polarity: "neutral/ambiguous",
      confidence: completedPolicy ? "high" : "medium",
      importance: completedPolicy
        ? majorScope || marketAccess
          ? 5
          : 4
        : majorScope
          ? 4
          : 3,
      rationale: completedPolicy
        ? "The supplied text explicitly establishes a substantive AI rule, standard, restriction, or enforcement action."
        : "The supplied text explicitly establishes a proposed AI policy action without treating it as enacted.",
    });
  }

  if (COPYRIGHT_PATTERN.test(text))
    return assessment({
      category: "AI_COPYRIGHT",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_COPYRIGHT",
      aiImpactType: "RIGHTS_LICENSING",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: MAJOR_POLICY_SCOPE_PATTERN.test(text) ? 5 : 4,
      rationale:
        "The supplied text explicitly concerns AI copyright, training-data, or creator-rights rules or disputes.",
    });

  if (LICENSING_PATTERN.test(text))
    return assessment({
      category: "AI_LICENSING",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_LICENSING",
      aiImpactType: "RIGHTS_LICENSING",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: CREATIVE_PATTERN.test(text) ? 4 : 3,
      rationale:
        "The supplied text explicitly concerns an AI licensing, consent, royalty, or compensation development.",
    });

  if (OBSERVED_LABOUR_PATTERN.test(text) && !LABOUR_FORECAST_PATTERN.test(text))
    return assessment({
      category: "AI_LABOUR_DISPLACEMENT",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_LABOR_DISPLACEMENT",
      aiImpactType: "LABOR_DISPLACEMENT",
      polarity: "negative",
      confidence: "high",
      importance: /\b(thousands?|company-wide|industry-wide|major)\b/i.test(
        text,
      )
        ? 5
        : 4,
      rationale:
        "The supplied text explicitly links AI to an observed workforce reduction, replacement, or role elimination.",
    });

  if (LABOUR_FORECAST_PATTERN.test(text))
    return assessment({
      category: "AI_LABOUR_DISPLACEMENT",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "LABOR_DISPLACEMENT",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance:
        /\b(millions?|industry-wide|economy-wide|national|global)\b/i.test(text)
          ? 4
          : 3,
      rationale:
        "The supplied text supports an attributed AI labour forecast or exposure estimate, not observed displacement.",
    });

  if (SYNTHETIC_PUBLICATION_PATTERN.test(text))
    return assessment({
      category: "AI_ADOPTION",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_SYNTHETIC_CONTENT",
      aiImpactType: "TOOL_ADOPTION",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: 3,
      rationale:
        "The supplied text explicitly reports a fully AI-generated published cultural or analytical work.",
    });

  if (
    CREATIVE_PATTERN.test(text) &&
    TOOL_PATTERN.test(text) &&
    CREATOR_TOOL_ACTION_PATTERN.test(text)
  )
    return assessment({
      category: "AI_CREATOR_TOOL",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_CREATOR_TOOL",
      aiImpactType: "TOOL_ADOPTION",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance:
        MAJOR_AI_ORGANISATION_PATTERN.test(text) ||
        /\b(broadly available|millions? of users|global rollout|across (?:music|film|video|audio|creative))\b/i.test(
          text,
        )
          ? 4
          : 3,
      rationale:
        "The supplied text explicitly reports release or deployment of an AI tool for creative production.",
    });

  if (FRONTIER_MODEL_PATTERN.test(text) && MODEL_ACTION_PATTERN.test(text))
    return assessment({
      category: "FRONTIER_MODEL_ADVANCEMENT",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance:
        MAJOR_AI_ORGANISATION_PATTERN.test(text) || /\bfrontier\b/i.test(text)
          ? 4
          : 3,
      rationale:
        "The supplied text explicitly reports a meaningful model release or frontier-capability deployment.",
    });

  if (
    /\bexport controls?|export restrictions?\b/i.test(text) &&
    SEMICONDUCTOR_PATTERN.test(text)
  )
    return assessment({
      category: "AI_EXPORT_CONTROLS",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_POLICY_REGULATION",
      aiImpactType: "POLICY_REGULATION",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: 5,
      rationale:
        "The supplied text explicitly reports an AI semiconductor export-control action with cross-market supply implications.",
    });

  if (SEMICONDUCTOR_PATTERN.test(text) && MODEL_ACTION_PATTERN.test(text))
    return assessment({
      category: "AI_SEMICONDUCTORS",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance:
        (MAJOR_AI_ORGANISATION_PATTERN.test(text) &&
          /\b(performance|capacity|cost|efficiency|frontier|training|inference)\b/i.test(
            text,
          )) ||
        LARGE_ECONOMIC_SCALE_PATTERN.test(text)
          ? 4
          : 2,
      rationale:
        "The supplied text reports an AI-relevant semiconductor or accelerator release; materiality depends on supported capacity, performance, cost, or policy scale.",
    });

  if (
    INFRASTRUCTURE_PATTERN.test(text) &&
    (INVESTMENT_PATTERN.test(text) ||
      /\b(expands?|expansion|builds?|capacity|constraint|shortage)\b/i.test(
        text,
      ))
  )
    return assessment({
      category: /\b(power|electricity|energy|nuclear)\b/i.test(text)
        ? "AI_ENERGY"
        : "AI_INFRASTRUCTURE",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: LARGE_ECONOMIC_SCALE_PATTERN.test(text) ? 4 : 3,
      rationale:
        "The supplied text explicitly reports an AI infrastructure, compute-capacity, or energy development.",
    });

  if (
    INVESTMENT_PATTERN.test(text) &&
    MATERIAL_ECONOMIC_SCALE_PATTERN.test(text)
  )
    return assessment({
      category: "AI_CAPITAL_INVESTMENT",
      claimKind: "OBSERVED_ACTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "positive",
      confidence: "high",
      importance: LARGE_ECONOMIC_SCALE_PATTERN.test(text) ? 4 : 3,
      rationale:
        "The supplied text explicitly reports AI capital investment at a material stated scale.",
    });

  if (
    ECONOMIC_FORECAST_PATTERN.test(text) &&
    ATTRIBUTED_SPEAKER_PATTERN.test(text)
  )
    return assessment({
      category: "AI_ECONOMICS",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "AMBIGUOUS",
      polarity: "neutral/ambiguous",
      confidence: "high",
      importance: LARGE_ECONOMIC_SCALE_PATTERN.test(text) ? 4 : 3,
      rationale:
        "The supplied text supports an attributed AI economic forecast or expectation, not an observed economic outcome.",
    });

  if (SAFETY_GOVERNANCE_PATTERN.test(text))
    return assessment({
      category: "AI_SAFETY_GOVERNANCE",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "POLICY_REGULATION",
      polarity: "neutral/ambiguous",
      confidence: input.evidenceRole === "PRIMARY_DOCUMENT" ? "high" : "medium",
      importance: 3,
      rationale:
        "The supplied text concerns AI safety or governance, but does not establish a completed binding action.",
    });

  if (LABOUR_ADOPTION_PATTERN.test(text) && TOOL_PATTERN.test(text))
    return assessment({
      category: "AI_LABOUR_ADOPTION",
      claimKind: "ATTRIBUTED_ANALYSIS",
      eventType: null,
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "neutral/ambiguous",
      confidence: "medium",
      importance: 3,
      rationale:
        "The supplied text concerns material workplace adoption or task transformation without establishing displacement.",
    });

  if (COMPUTE_PATTERN.test(text))
    return assessment({
      category: "AI_COMPUTE",
      claimKind: "GENERAL_MENTION",
      eventType: "AI_ADOPTION",
      aiImpactType: "INDUSTRY_EFFICIENCY",
      polarity: "neutral/ambiguous",
      confidence: "low",
      importance: 2,
      rationale:
        "The supplied text concerns AI compute but does not establish a material capacity, cost, investment, or policy development.",
    });

  return assessment({
    category: "AI_ADOPTION",
    claimKind: "GENERAL_MENTION",
    eventType: "AI_ADOPTION",
    aiImpactType: "AMBIGUOUS",
    polarity: "neutral/ambiguous",
    confidence: MINOR_FEATURE_PATTERN.test(text) ? "low" : "low",
    importance: MINOR_FEATURE_PATTERN.test(text) ? 2 : 1,
    rationale:
      "The article concerns AI, but the supplied text does not establish a material structural development.",
  });
}

export function isMaterialAiAssessment(
  assessment: AiIntelligenceAssessment | null,
): boolean {
  return assessment?.material === true && assessment.confidence !== "low";
}
