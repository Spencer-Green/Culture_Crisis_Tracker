import { describe, it, expect } from "vitest";
import {
  accessLabel,
  dateLabel,
  isNewResearch,
  monitorFilters,
  publicationLabel,
  reviewLabel,
  safeSourceUrl,
} from "./core";
import type { ResearchDevelopment } from "@/services/developments/research-development";
import { presentCheck } from "./check-presentation";

describe("monitoring evidence semantics", () => {
  it("does not turn rediscovery, provenance changes or quarantine into new information", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    const old = {
      firstDiscoveredAt: "2026-01-01T00:00:00Z",
      lastObservedAt: now.toISOString(),
      verification: "UNVERIFIED",
      contentHash: "changed-provenance",
    } as ResearchDevelopment;
    expect(isNewResearch(old, now, 7)).toBe(false);
    expect(
      isNewResearch({ ...old, firstDiscoveredAt: now.toISOString() }, now, 7),
    ).toBe(true);
    expect(
      isNewResearch(
        {
          ...old,
          firstDiscoveredAt: now.toISOString(),
          verification: "QUARANTINED",
        },
        now,
        7,
      ),
    ).toBe(false);
    expect(
      isNewResearch({ ...old, firstDiscoveredAt: "2027-01-01" }, now, 7),
    ).toBe(false);
  });
  it("preserves coarse publication evidence and does not invent exact dates", () => {
    expect(publicationLabel({ exactDate: null, raw: "September 2026" })).toBe(
      "September 2026 (reported precision)",
    );
    expect(publicationLabel({ exactDate: null, raw: "UNKNOWN" })).toBe(
      "Unknown",
    );
    expect(dateLabel("2026-01-01T00:00:00Z")).toBe("2026-01-01");
    expect(dateLabel("invalid")).toBe("Not recorded");
  });
  it("does not turn failed opens or model reports into direct inspection", () => {
    expect(accessLabel("TRACE_ATTEMPTED", "DIRECTLY_INSPECTED")).toContain(
      "inspection not established",
    );
    expect(accessLabel("MODEL_REPORTED_ONLY", "DIRECTLY_INSPECTED")).toContain(
      "inspection not established",
    );
    expect(accessLabel("TRACE_OPENED", "DIRECTLY_INSPECTED")).toContain(
      "provider reports",
    );
    expect(accessLabel("TRACE_OPENED", "DIRECTLY_OPENED")).toContain("provider reports");
    expect(accessLabel("TRACE_ATTEMPTED", "DIRECTLY_OPENED")).toContain("inspection not established");
    expect(reviewLabel("APPROVED_FOR_INGESTION_INVESTIGATION")).toBe(
      "Approved for ingestion investigation",
    );
  });
  it("normalizes untrusted filters and source protocols", () => {
    expect(
      monitorFilters({
        days: "300",
        sector: "anything",
        page: "-1",
        country: "xxx",
      }),
    ).toMatchObject({
      days: 7,
      sector: undefined,
      page: 1,
      country: undefined,
    });
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("https://example.test/report")).toBe(
      "https://example.test/report",
    );
  });
});

describe("occurrence-scoped check presentation", () => {
  const input = {
    candidates: [
      {
        key: "candidate-a",
        sourceUrl: "https://example.test/a",
        claim: "original claim",
        publicationDate: "2026",
        reportingPeriod: "2025",
        evidence: {
          origin: "PROVIDER_EXTRACTED",
          mediation: "SEARCH_MEDIATED",
          passage: "original passage",
        },
      },
    ],
  };
  const result = {
    verificationScope: "PROVIDED_TEXT_ONLY",
    alignmentMethod: "GLM_PASSAGE_SELECTION",
    candidates: [
      {
        index: 0,
        verdict: "TEXT_MATCH_ONLY",
        reason: "literal support",
        findings: [
          {
            field: "value",
            check: "MATCHED",
            evidenceQuote: "original passage",
            explanation: "literal match only",
          },
        ],
      },
    ],
  };
  it("binds checks by immutable candidate key, not latest run or current candidate order", () => {
    expect(presentCheck(input, result, "candidate-b")).toBeNull();
    const view = presentCheck(input, result, "candidate-a")!;
    expect(view.label).toContain("not independently verified");
    expect(view.candidate.claim).toBe("original claim");
    expect(view.candidate.evidence.passage).toBe("original passage");
  });
  it("keeps missing, legacy and synthetic evidence out of affirmative check states", () => {
    expect(presentCheck(input, null, "candidate-a")?.label).toBe(
      "Checks pending or unavailable",
    );
    expect(
      presentCheck(
        input,
        { ...result, verificationScope: undefined },
        "candidate-a",
      )?.label,
    ).toContain("Historical advisory");
    expect(
      presentCheck(
        {
          candidates: [
            {
              ...input.candidates[0],
              evidence: {
                ...input.candidates[0].evidence,
                origin: "SYNTHETIC_TEST_TEXT",
              },
            },
          ],
        },
        result,
        "candidate-a",
      ),
    ).toBeNull();
    expect(
      presentCheck(
        { candidates: [input.candidates[0], input.candidates[0]] },
        result,
        "candidate-a",
      ),
    ).toBeNull();
  });
  it("does not attach another candidate's result index", () => {
    expect(
      presentCheck(
        input,
        { ...result, candidates: [{ ...result.candidates[0], index: 1 }] },
        "candidate-a",
      )?.label,
    ).toBe("Checks pending or unavailable");
  });
});
