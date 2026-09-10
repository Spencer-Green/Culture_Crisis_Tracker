import { z } from "zod";

import { RESEARCH_OBSERVATION_QUALIFIERS } from "@/services/research/research-types";

export const RESEARCH_CANDIDATE_MAXIMUM = 8;

export const RESEARCH_CANDIDATE_TYPES = [
  "CANONICAL_DATA_SOURCE_CANDIDATE",
  "STRUCTURED_OBSERVATION_CANDIDATE",
  "LIVE_WEB_INDICATOR",
] as const;

export const RESEARCH_SOURCE_ROLES = [
  "PRIMARY",
  "SECONDARY_REPORTING",
  "SPECIALIST_ANALYSIS",
] as const;

export const RESEARCH_AUTHORITY_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

export const RESEARCH_FRESHNESS_LEVELS = [
  "NEWER_THAN_EXISTING",
  "COMPLEMENTARY",
  "OLDER_OR_DUPLICATIVE",
  "UNCLEAR",
] as const;

export const RESEARCH_INGESTION_FEASIBILITY_LEVELS = [
  "HIGH",
  "MODERATE",
  "LOW",
] as const;

export const RESEARCH_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

const ISO_DATE_OR_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const dateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      ISO_DATE_OR_DATETIME_PATTERN.test(value) &&
      Number.isFinite(Date.parse(value)),
    "Expected an ISO 8601 date or date-time.",
  );

const nullableDateStringSchema = dateStringSchema.nullable();

function validatePeriodOrder(
  start: string | null,
  end: string | null,
  path: PropertyKey[],
  context: z.RefinementCtx,
) {
  if (start && end && Date.parse(start) > Date.parse(end)) {
    context.addIssue({
      code: "custom",
      message: "Reporting period start must not be after reporting period end.",
      path,
    });
  }
}

export const ResearchObservationV1Schema = z
  .object({
    metric: z.string().trim().min(1).max(240),
    value: z.string().trim().min(1).max(240),
    unit: z.string().trim().min(1).max(120),
    qualifier: z.enum(RESEARCH_OBSERVATION_QUALIFIERS).optional(),
    periodStart: nullableDateStringSchema,
    periodEnd: nullableDateStringSchema,
  })
  .strict()
  .superRefine((observation, context) => {
    validatePeriodOrder(
      observation.periodStart,
      observation.periodEnd,
      ["periodEnd"],
      context,
    );
  });

export const ResearchCandidateV1Schema = z
  .object({
    candidateType: z.enum(RESEARCH_CANDIDATE_TYPES),
    source: z
      .object({
        url: z
          .string()
          .trim()
          .url()
          .refine(
            (value) =>
              value.startsWith("https://") || value.startsWith("http://"),
            "Source URL must use HTTP or HTTPS.",
          ),
        publisher: z.string().trim().min(1).max(240),
        title: z.string().trim().min(1).max(500),
        publishedAt: nullableDateStringSchema,
      })
      .strict(),
    scope: z
      .object({
        geography: z.string().trim().min(1).max(160),
        sector: z.string().trim().min(1).max(120),
        reportingPeriodStart: nullableDateStringSchema,
        reportingPeriodEnd: nullableDateStringSchema,
      })
      .strict(),
    evidence: z
      .object({
        claim: z.string().trim().min(1).max(1_500),
        observations: z.array(ResearchObservationV1Schema).max(12),
        sourceRole: z.enum(RESEARCH_SOURCE_ROLES),
        limitations: z.array(z.string().trim().min(1).max(600)).max(8),
      })
      .strict(),
    assessment: z
      .object({
        authority: z.enum(RESEARCH_AUTHORITY_LEVELS),
        freshness: z.enum(RESEARCH_FRESHNESS_LEVELS),
        ingestionFeasibility: z.enum(RESEARCH_INGESTION_FEASIBILITY_LEVELS),
        confidence: z.enum(RESEARCH_CONFIDENCE_LEVELS),
      })
      .strict(),
  })
  .strict()
  .superRefine((candidate, context) => {
    validatePeriodOrder(
      candidate.scope.reportingPeriodStart,
      candidate.scope.reportingPeriodEnd,
      ["scope", "reportingPeriodEnd"],
      context,
    );
  });

export const ResearchResultV1Schema = z
  .object({
    taskSummary: z.string().trim().min(1).max(1_500),
    candidates: z
      .array(ResearchCandidateV1Schema)
      .max(RESEARCH_CANDIDATE_MAXIMUM),
    researchLimitations: z.array(z.string().trim().min(1).max(600)).max(8),
  })
  .strict();

export type ResearchObservationV1 = z.infer<typeof ResearchObservationV1Schema>;
export type ResearchCandidateV1 = z.infer<typeof ResearchCandidateV1Schema>;
export type ResearchResultV1 = z.infer<typeof ResearchResultV1Schema>;
