import type { ResearchResultV1 } from "@/services/research/research-schema";
import { RESEARCH_STAGE1_SOURCE_MAXIMUM } from "@/services/research/research-artifact";
import type {
  NativeSearchTraceV1,
  ResearchSourceTraceStatus,
  ResearchStage1SourceV1,
  ResearchTaskV1,
  SanitizedResearchValue,
} from "@/services/research/research-types";

type AustralianScope = {
  id: string;
  patterns: RegExp[];
  parent?: string;
};

const AUSTRALIAN_SCOPES: AustralianScope[] = [
  { id: "VICTORIA", patterns: [/\bvictoria\b/i, /\bvictorian\b/i] },
  {
    id: "NEW_SOUTH_WALES",
    patterns: [/\bnew south wales\b/i, /\bnsw\b/i],
  },
  { id: "QUEENSLAND", patterns: [/\bqueensland\b/i] },
  { id: "SOUTH_AUSTRALIA", patterns: [/\bsouth australia\b/i] },
  { id: "WESTERN_AUSTRALIA", patterns: [/\bwestern australia\b/i] },
  { id: "TASMANIA", patterns: [/\btasmania\b/i, /\btasmanian\b/i] },
  {
    id: "NORTHERN_TERRITORY",
    patterns: [/\bnorthern territory\b/i],
  },
  {
    id: "AUSTRALIAN_CAPITAL_TERRITORY",
    patterns: [/\baustralian capital territory\b/i, /\bact\b/i],
  },
  { id: "MELBOURNE", patterns: [/\bmelbourne\b/i], parent: "VICTORIA" },
  {
    id: "SYDNEY",
    patterns: [/\bsydney\b/i],
    parent: "NEW_SOUTH_WALES",
  },
  {
    id: "BRISBANE",
    patterns: [/\bbrisbane\b/i],
    parent: "QUEENSLAND",
  },
  {
    id: "ADELAIDE",
    patterns: [/\badelaide\b/i],
    parent: "SOUTH_AUSTRALIA",
  },
  {
    id: "PERTH",
    patterns: [/\bperth\b/i],
    parent: "WESTERN_AUSTRALIA",
  },
  { id: "HOBART", patterns: [/\bhobart\b/i], parent: "TASMANIA" },
  {
    id: "DARWIN",
    patterns: [/\bdarwin\b/i],
    parent: "NORTHERN_TERRITORY",
  },
  {
    id: "CANBERRA",
    patterns: [/\bcanberra\b/i],
    parent: "AUSTRALIAN_CAPITAL_TERRITORY",
  },
  {
    id: "GRAMPIANS",
    patterns: [/\bgrampians\b/i],
    parent: "VICTORIA",
  },
];

type MetricFamily =
  | "VENUE_COUNT"
  | "WEEKLY_LIVE_VENUES"
  | "REGIONAL_VENUE_SHARE"
  | "LIVE_PERFORMANCE_INCOME"
  | "VENUE_TYPE_PERFORMANCE_SHARE";

const METRIC_FAMILY_PATTERNS: Array<{
  family: MetricFamily;
  patterns: RegExp[];
}> = [
  {
    family: "WEEKLY_LIVE_VENUES",
    patterns: [
      /weekly (?:live music )?venues/,
      /venues hosting (?:at least )?(?:one|1).{0,20}(?:gig|performance).{0,20}(?:week|weekly)/,
      /weekly gig venues/,
    ],
  },
  {
    family: "REGIONAL_VENUE_SHARE",
    patterns: [
      /regional (?:live music )?venue share/,
      /(?:share|percentage|percent).{0,30}venues.{0,30}regional/,
      /venues.{0,30}(?:regional|regional victoria)/,
      /\d+(?:\.\d+)? ?%.{0,20}regional/,
    ],
  },
  {
    family: "LIVE_PERFORMANCE_INCOME",
    patterns: [
      /artist live performance income/,
      /income from live performance/,
      /live performance.{0,20}income/,
      /artist income.{0,20}live music/,
    ],
  },
  {
    family: "VENUE_TYPE_PERFORMANCE_SHARE",
    patterns: [
      /(?:share|percentage|percent).{0,40}(?:performance|gig).{0,50}(?:pub|hotel|club)/,
      /(?:pub|hotel|club).{0,50}(?:performance|gig)/,
      /performances in (?:pubs|hotels|clubs)/,
    ],
  },
  {
    family: "VENUE_COUNT",
    patterns: [
      /live music venue count/,
      /number of live music venues/,
      /live music venues counted/,
      /venues hosting live music/,
      /live music venues/,
    ],
  },
];

type QuantityQualifier = {
  number: string;
  scale: "THOUSAND" | "MILLION" | "BILLION" | null;
  currency: "AUD" | null;
  percent: boolean;
};

function isRecord(
  value: SanitizedResearchValue,
): value is Record<string, SanitizedResearchValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textsAreCompatible(first: string, second: string): boolean {
  const left = normalizeText(first);
  const right = normalizeText(second);
  return left === right || left.includes(right) || right.includes(left);
}

export function canonicalizeResearchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function extractAustralianScopes(value: string): Set<string> {
  const scopes = new Set<string>();
  for (const scope of AUSTRALIAN_SCOPES) {
    if (scope.patterns.some((pattern) => pattern.test(value))) {
      scopes.add(scope.id);
      if (scope.parent) scopes.add(scope.parent);
    }
  }
  const withoutStateNames = value.replace(
    /\b(?:south australia|western australia|australian capital territory)\b/gi,
    "",
  );
  if (/\baustralia\b|\baustralian\b/i.test(withoutStateNames)) {
    scopes.add("AUSTRALIA");
  }
  return scopes;
}

function geographyIsSupported(
  task: ResearchTaskV1,
  source: ResearchStage1SourceV1,
  candidateGeography: string,
): boolean {
  if (task.geography.toLowerCase() !== "australia") {
    return candidateGeography.toLowerCase() === task.geography.toLowerCase();
  }
  const candidateScopes = extractAustralianScopes(candidateGeography);
  if (candidateScopes.size === 0) return false;
  const sourceScopes = extractAustralianScopes(
    `${source.publisher} ${source.title} ${source.claim} ${source.reportingPeriod}`,
  );
  const specificCandidateScopes = [...candidateScopes].filter(
    (scope) => scope !== "AUSTRALIA",
  );
  if (specificCandidateScopes.length > 0) {
    return specificCandidateScopes.every((scope) => sourceScopes.has(scope));
  }
  return sourceScopes.has("AUSTRALIA");
}

function metricFamilies(value: string): Set<MetricFamily> {
  const normalized = normalizeText(value);
  return new Set(
    METRIC_FAMILY_PATTERNS.filter(({ patterns }) =>
      patterns.some((pattern) => pattern.test(normalized)),
    ).map(({ family }) => family),
  );
}

function metricIsSupported(metric: string, source: ResearchStage1SourceV1) {
  const candidateFamilies = metricFamilies(metric);
  const sourceFamilies = metricFamilies(
    `${source.claim} ${source.observation}`,
  );
  if (candidateFamilies.size > 0) {
    return [...candidateFamilies].some((family) => sourceFamilies.has(family));
  }
  return textsAreCompatible(metric, source.observation);
}

function scaleFromContext(value: string): QuantityQualifier["scale"] {
  if (/\b(?:billion|bn)\b/i.test(value)) return "BILLION";
  if (/\b(?:million|mn)\b/i.test(value) || /\d\s*m\b/i.test(value)) {
    return "MILLION";
  }
  if (/\bthousand\b/i.test(value) || /\d\s*k\b/i.test(value)) {
    return "THOUSAND";
  }
  return null;
}

function quantityQualifiers(value: string): QuantityQualifier[] {
  const matches = [...value.matchAll(/\d[\d,]*(?:\.\d+)?/g)];
  return matches.map((match) => {
    const start = Math.max(0, (match.index ?? 0) - 24);
    const end = Math.min(
      value.length,
      (match.index ?? 0) + match[0].length + 32,
    );
    const context = value.slice(start, end);
    return {
      number: match[0].replaceAll(",", ""),
      scale: scaleFromContext(context),
      currency: /A\$|\bAUD\b|Australian dollars?/i.test(context) ? "AUD" : null,
      percent: /%|\bpercent(?:age)?\b/i.test(context),
    };
  });
}

function quantityIsSupported(
  quantity: QuantityQualifier,
  supportedText: string,
): boolean {
  return quantityQualifiers(supportedText).some(
    (supported) =>
      supported.number === quantity.number &&
      supported.scale === quantity.scale &&
      (!quantity.currency || supported.currency === quantity.currency) &&
      (!quantity.percent || supported.percent),
  );
}

function unitFamily(
  unit: string,
  metric: string,
): "AUD" | "PERCENT" | "VENUES" | "PERFORMANCES" | null {
  if (/A\$|\bAUD\b|Australian dollars?/i.test(unit)) return "AUD";
  if (/^%$|\bpercent(?:age)?\b/i.test(unit)) return "PERCENT";
  if (/\bvenues?\b/i.test(unit)) return "VENUES";
  if (/\b(?:performances?|gigs?|events?)\b/i.test(unit)) return "PERFORMANCES";
  if (/\bcount\b/i.test(unit)) {
    const families = metricFamilies(metric);
    if (families.has("VENUE_COUNT") || families.has("WEEKLY_LIVE_VENUES")) {
      return "VENUES";
    }
    if (families.has("VENUE_TYPE_PERFORMANCE_SHARE")) return "PERFORMANCES";
  }
  return null;
}

function unitIsSupported(
  unit: string,
  metric: string,
  source: ResearchStage1SourceV1,
): boolean {
  const family = unitFamily(unit, metric);
  const supportedText = `${source.claim} ${source.observation}`;
  if (family === "AUD") {
    return /A\$|\bAUD\b|Australian dollars?/i.test(supportedText);
  }
  if (family === "PERCENT") {
    return /%|\bpercent(?:age)?\b/i.test(supportedText);
  }
  if (family === "VENUES") return /\bvenues?\b/i.test(supportedText);
  if (family === "PERFORMANCES") {
    return /\b(?:performances?|gigs?|events?)\b/i.test(supportedText);
  }
  return textsAreCompatible(unit, source.observation);
}

function claimClosureReasons(
  claim: string,
  source: ResearchStage1SourceV1,
  prefix: string,
): string[] {
  const reasons: string[] = [];
  const normalizedClaim = normalizeText(claim);
  const normalizedSourceClaim = normalizeText(source.claim);
  const profitabilityAssertion =
    /(?:profitability|financial viability).{0,25}(?:improved|increased|rose|declined|fell|worsened)|(?:was|were|is|are|became|remained) (?:financially )?profitable/;
  if (
    profitabilityAssertion.test(normalizedClaim) &&
    !profitabilityAssertion.test(normalizedSourceClaim)
  ) {
    reasons.push(
      `UNSUPPORTED_CLAIM_STRENGTH: ${prefix}.evidence.claim adds unsupported venue-profitability evidence.`,
    );
  }
  const causalPattern =
    /\b(?:caused|causes|led to|resulted in|driven by|due to)\b/;
  if (
    causalPattern.test(normalizedClaim) &&
    !causalPattern.test(normalizedSourceClaim)
  ) {
    reasons.push(
      `UNSUPPORTED_CLAIM_STRENGTH: ${prefix}.evidence.claim adds unsupported causality.`,
    );
  }
  const certaintyPattern = /\b(?:proves|confirmed|confirms|demonstrates)\b/;
  if (
    certaintyPattern.test(normalizedClaim) &&
    !certaintyPattern.test(normalizedSourceClaim)
  ) {
    reasons.push(
      `UNSUPPORTED_CLAIM_STRENGTH: ${prefix}.evidence.claim increases certainty beyond Stage 1.`,
    );
  }
  const sourceScopes = extractAustralianScopes(
    `${source.publisher} ${source.title} ${source.claim} ${source.reportingPeriod}`,
  );
  const nationalClaim =
    /\b(?:across australia|nationwide|nationally|australian venues|venues in australia)\b/;
  if (nationalClaim.test(normalizedClaim) && !sourceScopes.has("AUSTRALIA")) {
    reasons.push(
      `UNSUPPORTED_CLAIM_STRENGTH: ${prefix}.evidence.claim extrapolates subnational evidence nationally.`,
    );
  }
  return reasons;
}

function sourceForCandidate(
  candidateUrl: string,
  sources: ResearchStage1SourceV1[],
) {
  const canonicalCandidateUrl = canonicalizeResearchUrl(candidateUrl);
  return sources.find(
    (source) => canonicalizeResearchUrl(source.url) === canonicalCandidateUrl,
  );
}

export function classifyResearchSourceTrace(
  sourceUrl: string,
  trace: NativeSearchTraceV1,
): ResearchSourceTraceStatus {
  const canonicalSourceUrl = canonicalizeResearchUrl(sourceUrl);
  let attempted = false;
  for (const call of trace.calls) {
    if (!isRecord(call.item) || !isRecord(call.item.action)) continue;
    const actionType = call.item.action.type;
    const actionUrl = call.item.action.url;
    if (
      (actionType !== "open_page" && actionType !== "find_in_page") ||
      typeof actionUrl !== "string" ||
      canonicalizeResearchUrl(actionUrl) !== canonicalSourceUrl
    ) {
      continue;
    }
    attempted = true;
    if (call.item.status === "completed") return "TRACE_OPENED";
  }
  return attempted ? "TRACE_ATTEMPTED" : "MODEL_REPORTED_ONLY";
}

export function validateCrossStageProvenance(
  task: ResearchTaskV1,
  stage1Sources: ResearchStage1SourceV1[],
  result: ResearchResultV1,
): string[] {
  const reasons: string[] = [];
  if (result.candidates.length > RESEARCH_STAGE1_SOURCE_MAXIMUM) {
    reasons.push(
      `SOURCE_LINKAGE_MISMATCH: Stage 2 returned ${result.candidates.length} candidates; maximum is ${RESEARCH_STAGE1_SOURCE_MAXIMUM}.`,
    );
  }

  result.candidates.forEach((candidate, index) => {
    const prefix = `candidates.${index}`;
    const source = sourceForCandidate(candidate.source.url, stage1Sources);
    if (!source) {
      reasons.push(
        `HARD_URL_MISMATCH: ${prefix}.source.url was not present in Stage 1.`,
      );
      return;
    }
    if (!textsAreCompatible(candidate.source.publisher, source.publisher)) {
      reasons.push(
        `SOURCE_IDENTITY_MISMATCH: ${prefix}.source.publisher contradicts Stage 1.`,
      );
    }
    if (!textsAreCompatible(candidate.source.title, source.title)) {
      reasons.push(
        `SOURCE_IDENTITY_MISMATCH: ${prefix}.source.title contradicts Stage 1.`,
      );
    }
    if (
      candidate.evidence.sourceRole !== source.sourceRole &&
      source.sourceRole !== "UNKNOWN"
    ) {
      reasons.push(
        `SOURCE_IDENTITY_MISMATCH: ${prefix}.evidence.sourceRole contradicts Stage 1.`,
      );
    }
    if (!geographyIsSupported(task, source, candidate.scope.geography)) {
      reasons.push(
        `GEOGRAPHY_SCOPE_MISMATCH: ${prefix}.scope.geography is not supported by Stage 1.`,
      );
    }
    if (candidate.scope.sector.toLowerCase() !== task.sector.toLowerCase()) {
      reasons.push(
        `SOURCE_IDENTITY_MISMATCH: ${prefix}.scope.sector must be ${task.sector}.`,
      );
    }

    const supportedText = source.rawBlock;
    const dates = [
      candidate.source.publishedAt,
      candidate.scope.reportingPeriodStart,
      candidate.scope.reportingPeriodEnd,
      ...candidate.evidence.observations.flatMap((observation) => [
        observation.periodStart,
        observation.periodEnd,
      ]),
    ].filter((value): value is string => Boolean(value));
    for (const date of dates) {
      if (!supportedText.includes(date)) {
        reasons.push(
          `HARD_DATE_MISMATCH: ${prefix} adds unsupported date ${date}.`,
        );
      }
    }

    const factualTexts = [
      candidate.evidence.claim,
      ...candidate.evidence.observations.map(
        (observation) => `${observation.value} ${observation.unit}`,
      ),
    ];
    for (const factualText of factualTexts) {
      for (const quantity of quantityQualifiers(factualText)) {
        if (!quantityIsSupported(quantity, supportedText)) {
          reasons.push(
            `HARD_VALUE_MISMATCH: ${prefix} adds unsupported numeric value ${quantity.number}.`,
          );
        }
      }
    }

    candidate.evidence.observations.forEach((observation, observationIndex) => {
      const observationPrefix = `${prefix}.evidence.observations.${observationIndex}`;
      if (!metricIsSupported(observation.metric, source)) {
        reasons.push(
          `UNSUPPORTED_OBSERVATION: ${observationPrefix}.metric is not supported by Stage 1.`,
        );
      }
      if (!unitIsSupported(observation.unit, observation.metric, source)) {
        reasons.push(
          `UNSUPPORTED_OBSERVATION: ${observationPrefix}.unit is not supported by Stage 1.`,
        );
      }
    });
    if (
      source.traceStatus !== "TRACE_OPENED" &&
      /(?:snippet|could not open|retrieval failed|fetch timed out|timeout)/i.test(
        source.limitations,
      ) &&
      !candidate.evidence.limitations.some((limitation) =>
        /(?:snippet|could not open|retrieval failed|fetch timed out|timeout)/i.test(
          limitation,
        ),
      )
    ) {
      reasons.push(
        `EVIDENCE_MEDIATION_MISMATCH: ${prefix}.evidence.limitations omit Stage-1 retrieval mediation.`,
      );
    }
    reasons.push(
      ...claimClosureReasons(candidate.evidence.claim, source, prefix),
    );
  });
  return [...new Set(reasons)];
}
