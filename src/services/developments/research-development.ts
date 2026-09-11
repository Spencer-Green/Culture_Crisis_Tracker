import { createHash } from "node:crypto";
import type { ResearchInspection } from "@/services/research/research-staging-read";

/** Read-only contract for the later monitoring UI. It grants no ingestion authority. */
export type ResearchDevelopment = {
  contractVersion: "development-v1";
  id: string;
  kind: "RESEARCH_FINDING";
  sector: string;
  geography: string;
  summary: string;
  observations: unknown;
  source: {
    id: string;
    url: string;
    publisher: string;
    title: string;
    traceConfidence: string;
    mediation: string;
  };
  publication: { exactDate: string | null; raw: string };
  reportingPeriod: { start: string | null; end: string | null; raw: string };
  firstDiscoveredAt: string;
  lastObservedAt: string;
  occurrenceCount: number;
  verification: "UNVERIFIED" | "QUARANTINED";
  reviewState: string;
  contentHash: string;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}

export function toResearchDevelopment(
  candidate: ResearchInspection["candidates"][number],
): ResearchDevelopment {
  const source = candidate.sourceDocument;
  const content = {
    sector: candidate.sector,
    geography: candidate.geography,
    summary: candidate.claim,
    observations: candidate.observations,
    source: {
      id: source.id,
      url: source.canonicalUrl,
      publisher: source.publisher,
      title: source.title,
      traceConfidence: candidate.traceConfidence,
      mediation: source.evidenceMediation,
    },
    publication: {
      exactDate: source.publishedAt?.toISOString() ?? null,
      raw: source.publishedAtRaw,
    },
    reportingPeriod: {
      start: candidate.reportingPeriodStart?.toISOString() ?? null,
      end: candidate.reportingPeriodEnd?.toISOString() ?? null,
      raw: source.reportingPeriodRaw,
    },
  };
  return {
    contractVersion: "development-v1",
    id: `research:${candidate.id}`,
    kind: "RESEARCH_FINDING",
    ...content,
    firstDiscoveredAt: candidate.firstSeenAt.toISOString(),
    lastObservedAt: candidate.lastSeenAt.toISOString(),
    occurrenceCount: candidate.occurrenceCount,
    // Historical VALIDATED means the extraction contract passed, never verified truth.
    verification:
      candidate.validationState === "QUARANTINED"
        ? "QUARANTINED"
        : "UNVERIFIED",
    reviewState: candidate.currentReviewState,
    contentHash: createHash("sha256")
      .update(JSON.stringify(stable(content)))
      .digest("hex"),
  };
}

/** Rediscovery alone must not appear as a new development or a changed measurement. */
export function compareResearchDevelopment(
  previous: ResearchDevelopment | null,
  current: ResearchDevelopment,
): "NEW" | "CONTENT_CHANGED" | "REVIEW_CHANGED" | "REDISCOVERED" {
  if (!previous) return "NEW";
  if (previous.id !== current.id)
    throw new Error("Cannot compare different development identities");
  if (previous.contentHash !== current.contentHash) return "CONTENT_CHANGED";
  if (
    previous.verification !== current.verification ||
    previous.reviewState !== current.reviewState
  )
    return "REVIEW_CHANGED";
  return "REDISCOVERED";
}
