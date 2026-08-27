import type {
  MediaEventType,
  SignalDirection,
} from "@/data-sources/news/media-types";
import type { AiIntelligenceCategory } from "@/data-sources/news/ai-intelligence";

export type SignalClaimKind =
  | "OBSERVED_ACTION"
  | "PROPOSED_ACTION"
  | "ATTRIBUTED_ANALYSIS"
  | "GENERAL_MENTION"
  | "EMPIRICAL_FINDING"
  | "INTERPRETATION"
  | null;

export type SignalDirectionInput = {
  title: string;
  description?: string | null;
  eventType: MediaEventType | null;
  claimKind?: SignalClaimKind;
  aiCategory?: AiIntelligenceCategory | null;
};

const POSITIVE_EVENT_PRIORS = new Set<MediaEventType>([
  "OPENING",
  "HIRING",
  "FUNDING_INCREASE",
  "ATTENDANCE_GROWTH",
  "REVENUE_GROWTH",
  "EXPANSION",
]);

const NEGATIVE_EVENT_PRIORS = new Set<MediaEventType>([
  "CLOSURE",
  "AT_RISK",
  "BANKRUPTCY_INSOLVENCY",
  "LAYOFFS",
  "FUNDING_CUT",
  "CANCELLATION",
  "DEMAND_WEAKNESS",
  "REVENUE_DECLINE",
]);

const DIRECTIONALLY_MIXED_EVENT_PRIORS = new Set<MediaEventType>([
  "CONSOLIDATION_ACQUISITION",
  "EXECUTIVE_LEADERSHIP_CHANGE",
  "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
  "AI_COPYRIGHT",
  "AI_LICENSING",
  "AI_POLICY_REGULATION",
  "AI_SYNTHETIC_CONTENT",
  "AI_UNION_DISPUTE",
]);

const PROSPECTIVE_PATTERN =
  /\b(could|may|might|potentially|forecast|predicts?|prediction|proposal|proposed|plans? to|would|expected to|outlook|roadmap|slated to|scheduled to|later this (?:year|month)|addressable market|tam)\b/i;
const POSITIVE_EVIDENCE_PATTERN =
  /\b(increas(?:e|es|ed|ing)|growth|grew|rose|rising|accelerat(?:e|es|ed|ing)|record attendance|record revenue|revenue growth|attendance growth|adds? jobs|new jobs|hiring|expand(?:s|ed|ing) capacity|add(?:s|ed|ing) (?:compute )?capacity|capacity expansion|productivity gain|efficiency gain|improved efficiency|stronger demand|rights protection|strengthens? protections?|broader access)\b/i;
const NEGATIVE_EVIDENCE_PATTERN =
  /\b(declin(?:e|es|ed|ing)|fell|falling|loss(?:es)?|revenue loss|reduced revenue|reduced employment|job cuts?|layoffs?|laid off|displac(?:e|es|ed|ement)|closure|closed|insolven(?:t|cy)|bankrupt(?:cy)?|cancel(?:led|ed|lation)|rights erosion|weak(?:er|ness)|contraction|shrinks?|deteriorat(?:e|es|ed|ion))\b/i;
const OBSERVED_RESULT_PATTERN =
  /\b(measured|documented|demonstrated|tested|benchmark(?:s|ed)?|registered|achieved|delivered|produced|resulted in|reported results?|completed|commissioned|operational|brought online|went live)\b/i;
const CAPABILITY_POSITIVE_PATTERN =
  /\b(outperform(?:s|ed|ing)?|materially stronger|improved (?:reasoning|coding|inference|performance)|performance gains?|more (?:tokens?|throughput)|higher (?:throughput|performance|accuracy|efficiency)|lower (?:cost|latency|energy use)|reduc(?:e|es|ed|ing) (?:inference )?(?:costs?|latency|energy use)|efficiency gains?|cost reduction)\b/i;
const CAPABILITY_NEGATIVE_PATTERN =
  /\b(underperform(?:s|ed|ing)?|worse (?:reasoning|coding|inference|performance)|lower (?:throughput|performance|accuracy|efficiency)|higher (?:cost|latency|energy use)|performance deterioration)\b/i;
const COMPLETED_INFRASTRUCTURE_PATTERN =
  /\b(completed|commissioned|operational|opened|brought online|went live|installed|deployed)\b/i;
const CAPACITY_INCREASE_PATTERN =
  /\b(increas(?:e|es|ed|ing)|expand(?:s|ed|ing)|add(?:s|ed|ing)|more)\b[^.]{0,50}\b(compute|capacity|gpus?|accelerators?|megawatts?|mw)\b|\b\d+(?:\.\d+)?\s*(?:mw|gpus?|accelerators?)\b/i;
const CAPACITY_REDUCTION_PATTERN =
  /\b(shut(?:s|ting)? down|closed|decommission(?:s|ed|ing)?|reduc(?:e|es|ed|ing)|cut(?:s|ting)?|lost|disruption)\b[^.]{0,60}\b(compute|capacity|data cent(?:er|re)|gpus?|accelerators?|supply)\b/i;
const ACCESS_RESTRICTION_PATTERN =
  /\b(restrict(?:s|ed|ing|ions?)|limits?|blocks?|bans?|prohibits?)\b[^.]{0,60}\b(access|exports?|chips?|gpus?|accelerators?|compute)\b/i;
const ACTUAL_DEPLOYMENT_PATTERN =
  /\b(deploy(?:s|ed|ment)|implemented|in production|rolled out|operational)\b/i;
const MEASURED_BENEFIT_PATTERN =
  /\b(measured|documented|demonstrated|achieved|produced|resulted in|delivered)\b[^.]{0,90}\b(productivity|efficiency|processing time|costs?|capacity|throughput|output)\b|\b(reduc(?:e|es|ed|ing) (?:processing )?time|cut(?:s)? costs?|increas(?:e|es|ed|ing) (?:productivity|efficiency|throughput|output))\b/i;
const OBSERVED_OPERATIONAL_HARM_PATTERN =
  /\b(documented|demonstrated|produced|resulted in|caused|linked to)\b[^.]{0,90}\b(degradation|downtime|errors?|failures?|revenue loss|reduced employment|job cuts?|layoffs?|displac(?:e[sd]?|ement))\b/i;
const COMPLETED_LICENSING_PATTERN =
  /\b(signs?|signed|reaches?|reached|completes?|completed|agrees?|agreed)\b[^.]{0,70}\b(licens(?:ing|e) agreement|rights deal|licensing deal)\b|\blicenses? (?:its|their|the) [^.]{0,50}\b(?:catalog|content|recordings?|works?|data)\b/i;
const COMPENSATED_ACCESS_PATTERN =
  /\b(compensat(?:e|es|ed|ion)|paid|payment|royalt(?:y|ies)|remunerat(?:e|ed|ion)|lawful access|authori[sz]ed access|creator revenue)\b/i;
const RIGHTS_HARM_PATTERN =
  /\b(uncompensated|without (?:consent|permission|payment)|rights erosion|revenue loss|excludes? creators?|removes? rights?)\b/i;
const COMPLETED_INVESTMENT_OUTCOME_PATTERN =
  /\b(completed|commissioned|operational|opened|brought online|funded project)\b/i;

function evidenceDirection(text: string): SignalDirection {
  const positive = POSITIVE_EVIDENCE_PATTERN.test(text);
  const negative = NEGATIVE_EVIDENCE_PATTERN.test(text);
  if (positive && negative) return "AMBIGUOUS";
  if (positive) return "POSITIVE";
  if (negative) return "NEGATIVE";
  return "AMBIGUOUS";
}

function capabilityDirection(text: string): SignalDirection {
  if (!OBSERVED_RESULT_PATTERN.test(text)) return "AMBIGUOUS";
  const positive = CAPABILITY_POSITIVE_PATTERN.test(text);
  const negative = CAPABILITY_NEGATIVE_PATTERN.test(text);
  if (positive === negative) return "AMBIGUOUS";
  return positive ? "POSITIVE" : "NEGATIVE";
}

function infrastructureDirection(
  text: string,
  aiCategory: AiIntelligenceCategory | null | undefined,
): SignalDirection {
  if (
    aiCategory === "AI_EXPORT_CONTROLS" &&
    ACCESS_RESTRICTION_PATTERN.test(text)
  )
    return "NEGATIVE";
  if (CAPACITY_REDUCTION_PATTERN.test(text)) return "NEGATIVE";
  return COMPLETED_INFRASTRUCTURE_PATTERN.test(text) &&
    CAPACITY_INCREASE_PATTERN.test(text)
    ? "POSITIVE"
    : "AMBIGUOUS";
}

function adoptionDirection(text: string): SignalDirection {
  if (
    ACTUAL_DEPLOYMENT_PATTERN.test(text) &&
    OBSERVED_OPERATIONAL_HARM_PATTERN.test(text)
  )
    return "NEGATIVE";
  return ACTUAL_DEPLOYMENT_PATTERN.test(text) &&
    MEASURED_BENEFIT_PATTERN.test(text)
    ? "POSITIVE"
    : "AMBIGUOUS";
}

function licensingDirection(text: string): SignalDirection {
  if (RIGHTS_HARM_PATTERN.test(text)) return "NEGATIVE";
  return COMPLETED_LICENSING_PATTERN.test(text) &&
    COMPENSATED_ACCESS_PATTERN.test(text)
    ? "POSITIVE"
    : "AMBIGUOUS";
}

export function deriveSignalDirection(
  input: SignalDirectionInput,
): SignalDirection {
  const text = `${input.title}. ${input.description ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const prospective =
    input.claimKind === "PROPOSED_ACTION" ||
    input.claimKind === "ATTRIBUTED_ANALYSIS" ||
    input.claimKind === "INTERPRETATION" ||
    input.claimKind === "GENERAL_MENTION" ||
    PROSPECTIVE_PATTERN.test(text);

  if (prospective) return "AMBIGUOUS";
  if (input.eventType === "AI_LABOR_DISPLACEMENT") return "NEGATIVE";
  if (NEGATIVE_EVENT_PRIORS.has(input.eventType as MediaEventType))
    return "NEGATIVE";
  if (POSITIVE_EVENT_PRIORS.has(input.eventType as MediaEventType)) {
    return NEGATIVE_EVIDENCE_PATTERN.test(text) ? "AMBIGUOUS" : "POSITIVE";
  }
  if (
    input.eventType === "MAJOR_PRODUCT_CAPABILITY_RELEASE" ||
    input.aiCategory === "FRONTIER_MODEL_ADVANCEMENT" ||
    input.aiCategory === "AI_SEMICONDUCTORS"
  ) {
    return capabilityDirection(text);
  }
  if (
    input.eventType === "COMPUTE_INFRASTRUCTURE_EXPANSION" ||
    input.aiCategory === "AI_COMPUTE" ||
    input.aiCategory === "AI_INFRASTRUCTURE" ||
    input.aiCategory === "AI_ENERGY" ||
    input.aiCategory === "AI_EXPORT_CONTROLS"
  ) {
    return infrastructureDirection(text, input.aiCategory);
  }
  if (
    input.eventType === "AI_ADOPTION" ||
    input.eventType === "AI_CREATOR_TOOL" ||
    input.aiCategory === "AI_LABOUR_ADOPTION"
  ) {
    return adoptionDirection(text);
  }
  if (
    input.eventType === "AI_LICENSING" ||
    input.aiCategory === "AI_LICENSING"
  ) {
    return licensingDirection(text);
  }
  if (DIRECTIONALLY_MIXED_EVENT_PRIORS.has(input.eventType as MediaEventType))
    return "AMBIGUOUS";

  if (input.eventType === "INVESTMENT") {
    if (!COMPLETED_INVESTMENT_OUTCOME_PATTERN.test(text)) return "AMBIGUOUS";
    const direction = evidenceDirection(text);
    return direction === "NEGATIVE" ? "AMBIGUOUS" : direction;
  }
  if (input.eventType === null || input.claimKind === "EMPIRICAL_FINDING") {
    return evidenceDirection(text);
  }
  return "AMBIGUOUS";
}

export function combineSignalDirections(
  values: readonly SignalDirection[],
): SignalDirection {
  const distinct = new Set(values);
  if (distinct.has("POSITIVE") && distinct.has("NEGATIVE")) return "AMBIGUOUS";
  if (distinct.has("POSITIVE")) return "POSITIVE";
  if (distinct.has("NEGATIVE")) return "NEGATIVE";
  return "AMBIGUOUS";
}
