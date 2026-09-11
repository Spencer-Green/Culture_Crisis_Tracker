import { createHash } from "node:crypto";
import { z } from "zod";

export const RESEARCH_AUDIT_VERSION = "glm-evidence-audit-v3";
export const RESEARCH_AUDIT_MODEL = "glm-4.7";
export const RESEARCH_AUDIT_MAX_INPUT_BYTES = 20_000;
export const RESEARCH_AUDIT_MAX_OUTPUT_TOKENS = 1_800;
export const RESEARCH_AUDIT_TIMEOUT_MS = 45_000;
export const RESEARCH_AUDIT_DAILY_LIMIT = 4;
export const RESEARCH_AUDIT_LIFETIME_LIMIT = 100;
// Operator qualification only: at most two fixed acceptance packets per model/contract.
// Normal unattended dispatch still observes the four-attempt rolling limit.
export const RESEARCH_AUDIT_QUALIFICATION_LIMIT = 2;
export const RESEARCH_AUDIT_OPERATOR_DAILY_LIMIT = 8;
export const AUDIT_VERDICTS = [
  "SUPPORTED_BY_PROVIDED_EVIDENCE",
  "TEXT_MATCH_ONLY",
  "CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type AuditPacket = {
  task: { id: string; version: string; sector: string; geography: string };
  candidates: Array<{
    key: string;
    sourceUrl: string;
    title: string;
    geography: string;
    claim: string;
    observations: unknown[];
    reportingPeriod: string;
    publicationDate: string;
    limitations: string[];
    evidence: {
      origin: "PROVIDER_EXTRACTED" | "SYNTHETIC_TEST_TEXT";
      mediation: string;
      passage: string;
      observationQuotes: string[];
    };
  }>;
};

const finding = z
  .object({
    passageId: z.string().max(40).nullable().optional(),
    passageIndex: z.number().int().nonnegative().nullable().optional(),
    check: z.enum(["MATCHED", "NOT_ESTABLISHED"]).optional(),
    field: z.string().min(1).max(100),
    evidenceQuote: z.string().max(500),
    explanation: z.string().min(1).max(500),
  })
  .strict();
export const AuditResultSchema = z
  .object({
    alignmentMethod: z
      .enum(["GLM_PASSAGE_SELECTION", "LOCAL_LITERAL_SCAN"])
      .optional(),
    verificationScope: z.literal("PROVIDED_TEXT_ONLY").optional(),
    candidates: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(2),
            verdict: z.enum(AUDIT_VERDICTS),
            reason: z.string().min(1).max(700),
            findings: z.array(finding).min(1).max(40),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
export type AuditResult = z.infer<typeof AuditResultSchema>;

export function auditInputHash(packet: AuditPacket): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: RESEARCH_AUDIT_VERSION,
        model: RESEARCH_AUDIT_MODEL,
        packet,
      }),
    )
    .digest("hex");
}

export function validateAuditPacket(packet: AuditPacket): void {
  if (!packet.candidates.length || packet.candidates.length > 3)
    throw new Error("Audit requires one to three candidates");
  if (
    Buffer.byteLength(JSON.stringify(packet), "utf8") >
    RESEARCH_AUDIT_MAX_INPUT_BYTES
  )
    throw new Error("Audit packet exceeds bounded input size");
  if (
    new Set(packet.candidates.map((c) => c.key)).size !==
    packet.candidates.length
  )
    throw new Error("Duplicate audit candidate keys");
}

export { adjudicateEvidenceSelections as parseAuditResult } from "./research-evidence-checks";

export function auditBudgetDecision(input: {
  daily: number;
  lifetime: number;
  active: boolean;
  qualificationAttempts?: number;
}): string | null {
  if (input.active) return "AUDIT_IN_PROGRESS";
  if (input.lifetime >= RESEARCH_AUDIT_LIFETIME_LIMIT)
    return "AUDIT_EXPERIMENT_LIMIT";
  if (
    input.qualificationAttempts !== undefined &&
    input.qualificationAttempts >= RESEARCH_AUDIT_QUALIFICATION_LIMIT
  )
    return "AUDIT_QUALIFICATION_LIMIT";
  if (
    input.daily >= RESEARCH_AUDIT_DAILY_LIMIT &&
    !(
      input.qualificationAttempts !== undefined &&
      input.qualificationAttempts < RESEARCH_AUDIT_QUALIFICATION_LIMIT &&
      input.daily < RESEARCH_AUDIT_OPERATOR_DAILY_LIMIT
    )
  )
    return "AUDIT_DAILY_LIMIT";
  return null;
}
