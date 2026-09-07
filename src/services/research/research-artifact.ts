import type { ResearchStage1SourceV1 } from "@/services/research/research-types";

export const RESEARCH_STAGE1_SOURCE_MAXIMUM = 2;
export const RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS = 12_000;

export class ResearchStage1ArtifactError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(
      `Stage 1 research artifact failed local validation: ${reasons.join(" ")}`,
    );
    this.name = "ResearchStage1ArtifactError";
    this.reasons = reasons;
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

function parseSourceBlock(rawBlock: string, index: number) {
  const lines = rawBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const requiredLabels = ["URL", "PUBLISHER", "TITLE", "CLAIM"] as const;
  const values = Object.fromEntries(
    requiredLabels.map((label) => [label, readLabel(lines, label)]),
  ) as Record<(typeof requiredLabels)[number], string | null>;
  const reasons = requiredLabels
    .filter((label) => !values[label])
    .map((label) => `SOURCE ${index + 1} is missing ${label}.`);
  if (values.URL) {
    try {
      const url = new URL(values.URL);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        reasons.push(`SOURCE ${index + 1} URL must use HTTP or HTTPS.`);
      }
    } catch {
      reasons.push(`SOURCE ${index + 1} URL is invalid.`);
    }
  }
  if (reasons.length > 0) return { reasons, source: null };

  return {
    reasons,
    source: {
      url: values.URL!,
      publisher: values.PUBLISHER!,
      title: values.TITLE!,
      publishedAt: readLabel(lines, "PUBLISHED_AT") ?? "UNKNOWN",
      reportingPeriod: readLabel(lines, "REPORTING_PERIOD") ?? "UNKNOWN",
      sourceRole: readLabel(lines, "SOURCE_ROLE") ?? "UNKNOWN",
      claim: values.CLAIM!,
      observation: readLabel(lines, "OBSERVATION") ?? "NONE",
      limitations: readLabel(lines, "LIMITATIONS") ?? "UNKNOWN",
      rawBlock: rawBlock.trim(),
      traceStatus: "MODEL_REPORTED_ONLY",
    } satisfies ResearchStage1SourceV1,
  };
}

export function validateResearchStage1Artifact(artifact: string): {
  artifact: string;
  sources: ResearchStage1SourceV1[];
} {
  const normalized = artifact.replaceAll("\r\n", "\n").trim();
  const reasons: string[] = [];
  if (!normalized) reasons.push("Stage 1 returned an empty artifact.");
  if (normalized.length > RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS) {
    reasons.push(
      `Stage 1 artifact exceeds ${RESEARCH_STAGE1_ARTIFACT_MAX_CHARACTERS} characters.`,
    );
  }
  if (!/^RESEARCH_SUMMARY\s*$/im.test(normalized)) {
    reasons.push("Stage 1 artifact is missing RESEARCH_SUMMARY.");
  }
  if (!/^RESEARCH_LIMITATIONS\s*$/im.test(normalized)) {
    reasons.push("Stage 1 artifact is missing RESEARCH_LIMITATIONS.");
  }

  const sourceMarker = /^SOURCE\s*$/gim;
  const limitationMarker = /^RESEARCH_LIMITATIONS\s*$/im;
  const matches = [...normalized.matchAll(sourceMarker)];
  if (matches.length > RESEARCH_STAGE1_SOURCE_MAXIMUM) {
    reasons.push(
      `Stage 1 artifact contains ${matches.length} source blocks; maximum is ${RESEARCH_STAGE1_SOURCE_MAXIMUM}.`,
    );
  }

  const sources: ResearchStage1SourceV1[] = [];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const nextStart = matches[index + 1]?.index ?? normalized.length;
    const candidateBlock = normalized.slice(start, nextStart);
    const limitationsIndex = candidateBlock.search(limitationMarker);
    const rawBlock =
      limitationsIndex >= 0
        ? candidateBlock.slice(0, limitationsIndex)
        : candidateBlock;
    const parsed = parseSourceBlock(rawBlock, index);
    reasons.push(...parsed.reasons);
    if (parsed.source) sources.push(parsed.source);
  });

  if (reasons.length > 0) throw new ResearchStage1ArtifactError(reasons);
  return { artifact: normalized, sources };
}
