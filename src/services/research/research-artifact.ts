import { RESEARCH_SOURCE_ROLES } from "@/services/research/research-schema";
import {
  RESEARCH_OBSERVATION_QUALIFIERS,
  type ResearchArtifactFieldDiagnostic,
  type ResearchFailureCode,
  type ResearchObservationQualifier,
  type ResearchPublicationDatePrecision,
  type ResearchStage1ObservationV1,
  type ResearchStage1SourceV1,
} from "@/services/research/research-types";

export const RESEARCH_STAGE1_SOURCE_MAXIMUM = 2;
export const RESEARCH_STAGE1_OBSERVATION_MAXIMUM = 6;
export const RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS = 12_000;
export const RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS = 160;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type ResearchPublicationDateEvidence = {
  label: string;
  precision: ResearchPublicationDatePrecision;
  exactDate: string | null;
};

function boundedDiagnosticValue(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,})/gi, "[REDACTED]");
  return sanitized.length <= RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS
    ? sanitized
    : `${sanitized.slice(0, RESEARCH_ARTIFACT_DIAGNOSTIC_VALUE_MAX_CHARACTERS)}…[TRUNCATED]`;
}

function isRealCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isSupportedYear(value: string): boolean {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1000 && year <= 9999;
}

export function parseResearchPublicationDate(
  value: string,
): ResearchPublicationDateEvidence | null {
  const label = value.trim();
  if (label.toUpperCase() === "UNKNOWN") {
    return { label: "UNKNOWN", precision: "UNKNOWN", exactDate: null };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return isRealCalendarDate(label)
      ? { label, precision: "EXACT_DATE", exactDate: label }
      : null;
  }
  const numericMonth = label.match(/^(\d{4})-(\d{2})$/);
  if (numericMonth) {
    if (!isSupportedYear(numericMonth[1]!)) return null;
    const month = Number(numericMonth[2]);
    return month >= 1 && month <= 12
      ? { label, precision: "MONTH", exactDate: null }
      : null;
  }
  const namedMonth = label.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  );
  if (namedMonth) {
    if (!isSupportedYear(namedMonth[2]!)) return null;
    const month = MONTHS.find(
      (candidate) => candidate.toLowerCase() === namedMonth[1]!.toLowerCase(),
    )!;
    return {
      label: `${month} ${namedMonth[2]}`,
      precision: "MONTH",
      exactDate: null,
    };
  }
  if (/^\d{4}$/.test(label) && isSupportedYear(label)) {
    return { label, precision: "YEAR", exactDate: null };
  }
  return null;
}

export class ResearchStage1ArtifactError extends Error {
  readonly reasons: string[];
  readonly diagnostics: ResearchArtifactFieldDiagnostic[];
  readonly code: Extract<
    ResearchFailureCode,
    "STAGE1_ARTIFACT_INVALID" | "ARTIFACT_PARSE_FAILURE"
  >;

  constructor(
    reasons: string[],
    code: Extract<
      ResearchFailureCode,
      "STAGE1_ARTIFACT_INVALID" | "ARTIFACT_PARSE_FAILURE"
    > = "STAGE1_ARTIFACT_INVALID",
    diagnostics: ResearchArtifactFieldDiagnostic[] = [],
  ) {
    super(
      `Stage 1 research artifact failed local validation: ${reasons.join(" ")}`,
    );
    this.name = "ResearchStage1ArtifactError";
    this.reasons = reasons;
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

function readLabel(lines: string[], label: string): string | null {
  const prefix = `${label}:`;
  const line = lines.find((candidate) =>
    candidate.toUpperCase().startsWith(prefix),
  );
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value || null;
}

function readLabels(lines: string[], label: string): string[] {
  const prefix = `${label}:`;
  return lines
    .filter((candidate) => candidate.toUpperCase().startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

function parseObservation(
  value: string,
  sourceIndex: number,
  observationIndex: number,
): { observation: ResearchStage1ObservationV1 | null; reasons: string[] } {
  const match = value.match(
    /^METRIC=(.*?)\s*\|\s*VALUE=(.*?)\s*\|\s*UNIT=(.*?)\s*\|\s*QUALIFIER=(.*?)$/i,
  );
  if (!match) {
    return {
      observation: null,
      reasons: [
        `SOURCE ${sourceIndex + 1} OBSERVATION ${observationIndex + 1} does not match the bounded METRIC/VALUE/UNIT/QUALIFIER grammar.`,
      ],
    };
  }
  const metric = match[1]!.trim();
  const rawValue = match[2]!.trim();
  const unit = match[3]!.trim();
  const rawQualifier = match[4]!.trim();
  const qualifier = rawQualifier.toUpperCase() as ResearchObservationQualifier;
  const reasons: string[] = [];
  if (!metric) reasons.push("METRIC is empty.");
  if (!rawValue || !/\d/.test(rawValue)) {
    reasons.push("VALUE must contain explicit numeric evidence.");
  }
  if (!unit) reasons.push("UNIT is empty.");
  if (!RESEARCH_OBSERVATION_QUALIFIERS.includes(qualifier)) {
    reasons.push(`QUALIFIER ${rawQualifier || "is empty"} is unsupported.`);
  }
  if (metric.length > 240 || rawValue.length > 240 || unit.length > 120) {
    reasons.push("OBSERVATION exceeds a field length bound.");
  }
  return {
    observation:
      reasons.length === 0
        ? { metric, value: rawValue, unit, qualifier }
        : null,
    reasons: reasons.map(
      (reason) =>
        `SOURCE ${sourceIndex + 1} OBSERVATION ${observationIndex + 1}: ${reason}`,
    ),
  };
}

function parseSourceBlock(rawBlock: string, index: number) {
  const lines = rawBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const requiredLabels = [
    "URL",
    "PUBLISHER",
    "TITLE",
    "PUBLICATION_DATE",
    "REPORTING_PERIOD",
    "GEOGRAPHY",
    "SOURCE_ROLE",
    "CLAIM",
    "LIMITATIONS",
  ] as const;
  const values = Object.fromEntries(
    requiredLabels.map((label) => [label, readLabel(lines, label)]),
  ) as Record<(typeof requiredLabels)[number], string | null>;
  const reasons = requiredLabels
    .filter((label) => !values[label])
    .map((label) => `SOURCE ${index + 1} is missing ${label}.`);
  const diagnostics: ResearchArtifactFieldDiagnostic[] = requiredLabels
    .filter((label) => !values[label])
    .map((label) => ({
      sourceIndex: index + 1,
      field: label,
      rejectedValue: null,
      failureReason: `${label} is required.`,
    }));

  if (values.URL) {
    try {
      const url = new URL(values.URL);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        reasons.push(`SOURCE ${index + 1} URL must use HTTP or HTTPS.`);
        diagnostics.push({
          sourceIndex: index + 1,
          field: "URL",
          rejectedValue: boundedDiagnosticValue(values.URL),
          failureReason: "URL must use HTTP or HTTPS.",
        });
      }
    } catch {
      reasons.push(`SOURCE ${index + 1} URL is invalid.`);
      diagnostics.push({
        sourceIndex: index + 1,
        field: "URL",
        rejectedValue: boundedDiagnosticValue(values.URL),
        failureReason: "URL is invalid.",
      });
    }
  }
  const publicationDate = values.PUBLICATION_DATE
    ? parseResearchPublicationDate(values.PUBLICATION_DATE)
    : null;
  if (values.PUBLICATION_DATE && !publicationDate) {
    reasons.push(
      `SOURCE ${index + 1} PUBLICATION_DATE must be YYYY-MM-DD, YYYY-MM, Month YYYY, YYYY, or UNKNOWN.`,
    );
    diagnostics.push({
      sourceIndex: index + 1,
      field: "PUBLICATION_DATE",
      rejectedValue: boundedDiagnosticValue(values.PUBLICATION_DATE),
      failureReason:
        "Expected YYYY-MM-DD, YYYY-MM, Month YYYY, YYYY, or UNKNOWN.",
    });
  }
  if (
    values.SOURCE_ROLE &&
    !RESEARCH_SOURCE_ROLES.includes(
      values.SOURCE_ROLE as (typeof RESEARCH_SOURCE_ROLES)[number],
    )
  ) {
    reasons.push(`SOURCE ${index + 1} SOURCE_ROLE is unsupported.`);
    diagnostics.push({
      sourceIndex: index + 1,
      field: "SOURCE_ROLE",
      rejectedValue: boundedDiagnosticValue(values.SOURCE_ROLE),
      failureReason: "SOURCE_ROLE is unsupported.",
    });
  }

  const observationValues = readLabels(lines, "OBSERVATION");
  if (observationValues.length === 0) {
    reasons.push(`SOURCE ${index + 1} is missing OBSERVATION.`);
  }
  if (observationValues.length > RESEARCH_STAGE1_OBSERVATION_MAXIMUM) {
    reasons.push(
      `SOURCE ${index + 1} contains ${observationValues.length} observations; maximum is ${RESEARCH_STAGE1_OBSERVATION_MAXIMUM}.`,
    );
  }
  const hasNone = observationValues.some(
    (observation) => observation.toUpperCase() === "NONE",
  );
  if (hasNone && observationValues.length > 1) {
    reasons.push(
      `SOURCE ${index + 1} cannot combine OBSERVATION: NONE with structured observations.`,
    );
  }
  const observations: ResearchStage1ObservationV1[] = [];
  if (!hasNone) {
    observationValues.forEach((observationValue, observationIndex) => {
      const parsed = parseObservation(
        observationValue,
        index,
        observationIndex,
      );
      reasons.push(...parsed.reasons);
      if (parsed.observation) observations.push(parsed.observation);
    });
  }

  if (reasons.length > 0) return { reasons, diagnostics, source: null };
  return {
    reasons,
    diagnostics,
    source: {
      url: values.URL!,
      publisher: values.PUBLISHER!,
      title: values.TITLE!,
      publishedAt: publicationDate!.label,
      reportingPeriod: values.REPORTING_PERIOD!,
      geography: values.GEOGRAPHY!,
      sourceRole: values.SOURCE_ROLE!,
      claim: values.CLAIM!,
      observation: observationValues.join("; "),
      observations,
      limitations: values.LIMITATIONS!,
      rawBlock: rawBlock.trim(),
      traceStatus: "MODEL_REPORTED_ONLY",
    } satisfies ResearchStage1SourceV1,
  };
}

function splitLimitations(value: string): string[] {
  const parts: string[] = [];
  let remaining = value.trim();
  while (remaining.length > 600) {
    const boundary = Math.max(
      remaining.lastIndexOf(". ", 599),
      remaining.lastIndexOf("; ", 599),
    );
    const splitAt = boundary >= 100 ? boundary + 1 : 600;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function validateResearchStage1Artifact(artifact: string): {
  artifact: string;
  summary: string;
  researchLimitations: string[];
  sources: ResearchStage1SourceV1[];
} {
  const normalized = artifact.replaceAll("\r\n", "\n").trim();
  const reasons: string[] = [];
  const diagnostics: ResearchArtifactFieldDiagnostic[] = [];
  if (!normalized) reasons.push("Stage 1 returned an empty artifact.");
  if (normalized.length > RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS) {
    reasons.push(
      `Stage 1 artifact exceeds ${RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS} characters.`,
    );
  }

  const summaryMatch = normalized.match(/^RESEARCH_SUMMARY\s*$/im);
  const limitationsMatch = normalized.match(/^RESEARCH_LIMITATIONS\s*$/im);
  if (!summaryMatch)
    reasons.push("Stage 1 artifact is missing RESEARCH_SUMMARY.");
  if (!limitationsMatch) {
    reasons.push("Stage 1 artifact is missing RESEARCH_LIMITATIONS.");
  }

  const sourceMarker = /^SOURCE\s*$/gim;
  const matches = [...normalized.matchAll(sourceMarker)];
  if (matches.length > RESEARCH_STAGE1_SOURCE_MAXIMUM) {
    reasons.push(
      `Stage 1 artifact contains ${matches.length} source blocks; maximum is ${RESEARCH_STAGE1_SOURCE_MAXIMUM}.`,
    );
  }

  const summaryStart = summaryMatch
    ? (summaryMatch.index ?? 0) + summaryMatch[0].length
    : 0;
  const summaryEnd =
    matches[0]?.index ?? limitationsMatch?.index ?? normalized.length;
  const summary = normalized.slice(summaryStart, summaryEnd).trim();
  if (!summary) reasons.push("RESEARCH_SUMMARY is empty.");
  if (summary.length > 1_500) {
    reasons.push("RESEARCH_SUMMARY exceeds 1,500 characters.");
  }

  const researchLimitations = limitationsMatch
    ? splitLimitations(
        normalized
          .slice((limitationsMatch.index ?? 0) + limitationsMatch[0].length)
          .trim(),
      )
    : [];
  if (researchLimitations.length === 0) {
    reasons.push("RESEARCH_LIMITATIONS is empty.");
  }
  if (researchLimitations.length > 8) {
    reasons.push("RESEARCH_LIMITATIONS exceeds 8 bounded entries.");
  }

  const sources: ResearchStage1SourceV1[] = [];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const nextStart =
      matches[index + 1]?.index ?? limitationsMatch?.index ?? normalized.length;
    const rawBlock = normalized.slice(start, nextStart);
    const parsed = parseSourceBlock(rawBlock, index);
    reasons.push(...parsed.reasons);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.source) sources.push(parsed.source);
  });

  if (reasons.length > 0) {
    const code = reasons.some((reason) => reason.startsWith("SOURCE "))
      ? "ARTIFACT_PARSE_FAILURE"
      : "STAGE1_ARTIFACT_INVALID";
    throw new ResearchStage1ArtifactError(reasons, code, diagnostics);
  }
  return { artifact: normalized, summary, researchLimitations, sources };
}
