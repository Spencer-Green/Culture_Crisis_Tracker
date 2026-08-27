import type {
  MediaEventType,
  SignalDirection,
} from "@/data-sources/news/media-types";

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
  /\b(increas(?:e|es|ed|ing)|growth|grew|rose|rising|accelerat(?:e|es|ed|ing)|higher|record attendance|record revenue|revenue growth|attendance growth|adds? jobs|new jobs|hiring|expand(?:s|ed|ing) capacity|add(?:s|ed|ing) (?:compute )?capacity|capacity expansion|productivity gain|efficiency gain|improved efficiency|stronger demand|rights protection|strengthens? protections?|broader access|made available|rolls? out|deployed successfully)\b/i;
const NEGATIVE_EVIDENCE_PATTERN =
  /\b(declin(?:e|es|ed|ing)|fell|falling|lower|loss(?:es)?|revenue loss|reduced revenue|reduced employment|job cuts?|layoffs?|laid off|displac(?:e|es|ed|ement)|closure|closed|insolven(?:t|cy)|bankrupt(?:cy)?|cancel(?:led|ed|lation)|rights erosion|weak(?:er|ness)|contraction|shrinks?|deteriorat(?:e|es|ed|ion))\b/i;
const CAPACITY_OR_CAPABILITY_PATTERN =
  /\b(expands? capacity|capacity expansion|adds? capacity|opens? (?:a )?data cent(?:er|re)|launch(?:es|ed)?|release[sd]?|rolls? out|makes? available|deployed|deployment|new capability|performance gain|cost reduction)\b/i;

function evidenceDirection(text: string): SignalDirection {
  const positive = POSITIVE_EVIDENCE_PATTERN.test(text);
  const negative = NEGATIVE_EVIDENCE_PATTERN.test(text);
  if (positive && negative) return "AMBIGUOUS";
  if (positive) return "POSITIVE";
  if (negative) return "NEGATIVE";
  return "AMBIGUOUS";
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
  if (DIRECTIONALLY_MIXED_EVENT_PRIORS.has(input.eventType as MediaEventType))
    return "AMBIGUOUS";

  if (input.eventType === "INVESTMENT") {
    const direction = evidenceDirection(text);
    return direction === "NEGATIVE" ? "AMBIGUOUS" : direction;
  }
  if (
    input.eventType === "COMPUTE_INFRASTRUCTURE_EXPANSION" ||
    input.eventType === "MAJOR_PRODUCT_CAPABILITY_RELEASE"
  ) {
    const direction = evidenceDirection(text);
    if (direction === "NEGATIVE") return "AMBIGUOUS";
    return direction === "AMBIGUOUS" &&
      CAPACITY_OR_CAPABILITY_PATTERN.test(text)
      ? "POSITIVE"
      : direction;
  }
  if (
    input.eventType === "AI_ADOPTION" ||
    input.eventType === "AI_CREATOR_TOOL"
  ) {
    return evidenceDirection(text);
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
