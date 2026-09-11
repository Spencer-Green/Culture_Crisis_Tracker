import { describe, expect, it } from "vitest";
import type { ResearchInspection } from "@/services/research/research-staging-read";
import {
  compareResearchDevelopment,
  toResearchDevelopment,
} from "./research-development";

function candidate() {
  return {
    id: "candidate",
    sector: "Music",
    geography: "Victoria",
    claim: "A venue count",
    observations: [{ metric: "venues", value: 2441 }],
    validationState: "VALIDATED",
    currentReviewState: "APPROVED_FOR_INGESTION_INVESTIGATION",
    traceConfidence: "TRACE_ATTEMPTED",
    reportingPeriodStart: null,
    reportingPeriodEnd: null,
    firstSeenAt: new Date("2026-09-01"),
    lastSeenAt: new Date("2026-09-10"),
    occurrenceCount: 2,
    sourceDocument: {
      id: "source",
      canonicalUrl: "https://example.test/report",
      publisher: "Publisher",
      title: "Report",
      evidenceMediation: "SEARCH_MEDIATED",
      publishedAt: null,
      publishedAtRaw: "2026",
      reportingPeriodRaw: "2025",
    },
  } as unknown as ResearchInspection["candidates"][number];
}

describe("research development projection", () => {
  it("never turns historical contract validation or review approval into verified truth", () => {
    const row = candidate();
    expect(toResearchDevelopment(row).verification).toBe("UNVERIFIED");
    row.validationState = "QUARANTINED";
    expect(toResearchDevelopment(row).verification).toBe("QUARANTINED");
  });
  it("preserves coarse publication precision and distinguishes discovery from publication", () => {
    const result = toResearchDevelopment(candidate());
    expect(result.publication).toEqual({ exactDate: null, raw: "2026" });
    expect(result.firstDiscoveredAt).toBe("2026-09-01T00:00:00.000Z");
  });
  it("does not report rediscovery as new or changed content", () => {
    const row = candidate();
    const previous = toResearchDevelopment(row);
    row.lastSeenAt = new Date("2026-09-11");
    row.occurrenceCount++;
    expect(
      compareResearchDevelopment(previous, toResearchDevelopment(row)),
    ).toBe("REDISCOVERED");
    row.claim = "A materially different count";
    expect(
      compareResearchDevelopment(previous, toResearchDevelopment(row)),
    ).toBe("CONTENT_CHANGED");
    expect(compareResearchDevelopment(null, previous)).toBe("NEW");
  });
  it("reports quarantine separately from evidence changes", () => {
    const row = candidate();
    const previous = toResearchDevelopment(row);
    row.validationState = "QUARANTINED";
    expect(
      compareResearchDevelopment(previous, toResearchDevelopment(row)),
    ).toBe("REVIEW_CHANGED");
  });
});
