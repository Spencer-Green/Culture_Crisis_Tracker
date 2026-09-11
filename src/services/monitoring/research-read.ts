import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { toResearchDevelopment } from "@/services/developments/research-development";
import type { MonitorFilters } from "./core";
import { presentCheck } from "./check-presentation";

export const RESEARCH_PAGE_SIZE = 20;
const geographyNames: Record<string, string[]> = {
  AU: ["Australia", "AU"],
  US: ["United States", "US", "USA"],
  GB: ["United Kingdom", "UK", "GB"],
  CA: ["Canada", "CA"],
  NZ: ["New Zealand", "NZ"],
  EU: ["European Union", "EU"],
};
export async function readResearch(filters: MonitorFilters, now = new Date()) {
  try {
    const where: Prisma.ResearchCandidateWhereInput = {
      ...(filters.sector
        ? { sector: { equals: filters.sector, mode: "insensitive" } }
        : {}),
      ...(filters.country
        ? {
            OR: [
              {
                geography: {
                  in: geographyNames[filters.country],
                  mode: "insensitive",
                },
              },
              {
                geography: {
                  endsWith: `, ${geographyNames[filters.country][0]}`,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
      validationState: filters.quarantine
        ? "QUARANTINED"
        : { not: "QUARANTINED" },
      ...(filters.recent
        ? {
            firstSeenAt: {
              gte: new Date(now.getTime() - filters.days * 86400000),
              lte: now,
            },
          }
        : {}),
    };
    const db = getPrisma();
    const [rows, total] = await Promise.all([
      db.researchCandidate.findMany({
        where,
        orderBy: [{ firstSeenAt: "desc" }, { id: "asc" }],
        take: RESEARCH_PAGE_SIZE,
        skip: (filters.page - 1) * RESEARCH_PAGE_SIZE,
        include: {
          sourceDocument: true,
          reviewEvents: {
            where: { supersededByReviewEvent: { is: null } },
            orderBy: { reviewedAt: "desc" },
            take: 1,
          },
          _count: { select: { runOccurrences: true, reviewEvents: true } },
          runOccurrences: {
            orderBy: { observedAt: "desc" },
            take: 1,
            include: {
              run: {
                include: {
                  evidenceChecks: { orderBy: { createdAt: "desc" }, take: 1 },
                  audits: { orderBy: { startedAt: "desc" }, take: 1 },
                },
              },
            },
          },
        },
      }),
      db.researchCandidate.count({ where }),
    ]);
    return {
      available: true,
      total,
      items: rows.map((row) => {
        const occurrence = row.runOccurrences[0];
        const local = occurrence?.run.evidenceChecks[0];
        const audit = occurrence?.run.audits[0];
        return {
          ...toResearchDevelopment({
            ...row,
            currentReviewState:
              row.reviewEvents[0]?.decision ?? "REVIEW_REQUIRED",
            currentReviewReason: row.reviewEvents[0]?.reason ?? null,
          }),
          checkSummary: {
            observedAt: occurrence?.observedAt.toISOString() ?? null,
            local: local
              ? (presentCheck(local.inputSnapshot, local.result, row.id)
                  ?.label ?? "No candidate-bound check available")
              : "Pending or unavailable",
            glm: audit
              ? `${audit.status.toLowerCase()} · ${presentCheck(audit.inputSnapshot, audit.result, row.id)?.label ?? "No candidate-bound result"}`
              : "Pending or unavailable",
          },
        };
      }),
    };
  } catch {
    return { available: false, total: 0, items: [] };
  }
}

/** Explicitly occurrence-linked evidence. Never attach another run's latest audit. */
export async function readResearchDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { available: true, candidate: null };
  try {
    const candidate = await getPrisma().researchCandidate.findUnique({
      where: { id },
      include: {
        sourceDocument: true,
        reviewEvents: { orderBy: [{ reviewedAt: "desc" }, { id: "asc" }] },
        runOccurrences: {
          orderBy: { observedAt: "desc" },
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
        },
      },
    });
    return { available: true, candidate };
  } catch {
    return { available: false, candidate: null };
  }
}
