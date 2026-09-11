import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  researchCandidate: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
import { readResearch, readResearchDetail } from "./research-read";
import { monitorFilters } from "./core";

beforeEach(() => {
  vi.resetAllMocks();
  db.researchCandidate.findMany.mockResolvedValue([]);
  db.researchCandidate.count.mockResolvedValue(0);
});
describe("read-only research queries", () => {
  it("excludes quarantine and orders on first discovery, with a bounded page", async () => {
    await readResearch(
      monitorFilters({ view: "new", page: "2" }),
      new Date("2026-09-11T00:00:00Z"),
    );
    expect(db.researchCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ firstSeenAt: "desc" }, { id: "asc" }],
        take: 20,
        skip: 20,
        where: expect.objectContaining({
          validationState: { not: "QUARANTINED" },
          firstSeenAt: {
            gte: new Date("2026-09-04T00:00:00Z"),
            lte: new Date("2026-09-11T00:00:00Z"),
          },
        }),
      }),
    );
  });
  it("keeps quarantine as a separate explicit query", async () => {
    await readResearch(monitorFilters({ state: "quarantined" }));
    expect(db.researchCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { validationState: "QUARANTINED" } }),
    );
  });
  it("includes explicitly country-qualified regions without fuzzy national inference", async () => {
    await readResearch(monitorFilters({ country: "AU" }));
    expect(db.researchCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { geography: { in: ["Australia", "AU"], mode: "insensitive" } },
            { geography: { endsWith: ", Australia", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });
  it("keeps local support available when GLM failed, without calling it verified", async () => {
    const packet = {
      candidates: [
        {
          key: "candidate",
          sourceUrl: "https://example.test",
          claim: "Venues declined",
          publicationDate: "UNKNOWN",
          reportingPeriod: "UNKNOWN",
          evidence: {
            origin: "PROVIDER_EXTRACTED",
            mediation: "SEARCH_MEDIATED",
            passage: "Venues declined",
          },
        },
      ],
    };
    const local = {
      verificationScope: "PROVIDED_TEXT_ONLY",
      alignmentMethod: "LOCAL_LITERAL_SCAN",
      candidates: [
        {
          index: 0,
          verdict: "TEXT_MATCH_ONLY",
          reason: "Literal match only",
          findings: [
            {
              field: "claim",
              check: "MATCHED",
              evidenceQuote: "Venues declined",
              explanation: "Literal support",
            },
          ],
        },
      ],
    };
    db.researchCandidate.findMany.mockResolvedValue([
      {
        id: "candidate",
        sector: "Music",
        geography: "Australia",
        claim: "Venues declined",
        observations: [],
        firstSeenAt: new Date("2026-09-10"),
        lastSeenAt: new Date("2026-09-11"),
        occurrenceCount: 2,
        validationState: "UNVERIFIED",
        reviewEvents: [],
        traceConfidence: "TRACE_ATTEMPTED",
        sourceDocument: {
          id: "source",
          canonicalUrl: "https://example.test",
          publisher: "Publisher",
          title: "Report",
          publishedAtRaw: "UNKNOWN",
          reportingPeriodRaw: "UNKNOWN",
          evidenceMediation: "SEARCH_MEDIATED",
        },
        runOccurrences: [
          {
            observedAt: new Date("2026-09-11"),
            run: {
              evidenceChecks: [{ inputSnapshot: packet, result: local }],
              audits: [
                { status: "FAILED", inputSnapshot: packet, result: null },
              ],
            },
          },
        ],
      },
    ]);
    db.researchCandidate.count.mockResolvedValue(1);
    const result = await readResearch(monitorFilters({}));
    expect(result.available).toBe(true);
    expect(result.items[0].verification).toBe("UNVERIFIED");
    expect(result.items[0].checkSummary.local).toContain(
      "not independently verified",
    );
    expect(result.items[0].checkSummary.glm).toContain("failed");
    expect(result.items[0].checkSummary.glm).toContain(
      "pending or unavailable",
    );
  });
  it("distinguishes failure from an empty successful feed", async () => {
    expect((await readResearch(monitorFilters({}))).available).toBe(true);
    db.researchCandidate.findMany.mockRejectedValue(new Error("unavailable"));
    expect((await readResearch(monitorFilters({}))).available).toBe(false);
  });
  it("loads audit evidence through the candidate occurrence relation", async () => {
    db.researchCandidate.findUnique.mockResolvedValue(null);
    await readResearchDetail("00000000-0000-0000-0000-000000000001");
    expect(db.researchCandidate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          runOccurrences: expect.objectContaining({
            take: 20,
            include: {
              run: {
                include: {
                  audits: { orderBy: { startedAt: "desc" } },
                  evidenceChecks: { orderBy: { createdAt: "desc" } },
                  sourceOccurrences: true,
                },
              },
            },
          }),
        }),
      }),
    );
    db.researchCandidate.findUnique.mockClear();
    await readResearchDetail("invalid");
    expect(db.researchCandidate.findUnique).not.toHaveBeenCalled();
  });
});
