import "dotenv/config";
import { env } from "@/lib/env";
import { getPrisma, disconnectPrisma } from "@/lib/prisma";
import {
  auditInputHash,
  RESEARCH_AUDIT_MODEL,
  RESEARCH_AUDIT_VERSION,
  RESEARCH_AUDIT_DAILY_LIMIT,
} from "@/services/research/research-audit-core";
import {
  AUDIT_PROTOCOL_ACCEPTANCE_PACKET,
  passesProtocolQualification,
} from "@/services/research/research-audit-fixtures";

async function main() {
  const prisma = getPrisma();
  const now = new Date();
  const [recent, qualification, checks] = await Promise.all([
    prisma.researchAuditRun.findMany({
      where: {
        status: { not: "CACHED" },
        startedAt: { gt: new Date(now.getTime() - 86_400_000) },
      },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    }),
    prisma.researchAuditRun.findFirst({
      where: { inputHash: auditInputHash(AUDIT_PROTOCOL_ACCEPTANCE_PACKET) },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, result: true, failureMessage: true },
    }),
    prisma.researchEvidenceCheck.count(),
  ]);
  const nextSlot =
    recent.length >= RESEARCH_AUDIT_DAILY_LIMIT
      ? new Date(
          recent[
            recent.length - RESEARCH_AUDIT_DAILY_LIMIT
          ]!.startedAt.getTime() + 86_400_000,
        )
      : now;
  console.log(
    JSON.stringify(
      {
        researchEnabled: env.LLM_RESEARCHER_ENABLED,
        checkerEnabled: env.RESEARCH_AUDITOR_ENABLED,
        model: RESEARCH_AUDIT_MODEL,
        contract: RESEARCH_AUDIT_VERSION,
        localCheckRecords: checks,
        qualificationStatus: qualification?.status ?? "NOT_ATTEMPTED",
        protocolQualified:
          qualification?.status === "SUCCEEDED" &&
          passesProtocolQualification(qualification.result),
        qualificationFailure: qualification?.failureMessage ?? null,
        rollingAttempts: recent.length,
        normalDailyLimit: RESEARCH_AUDIT_DAILY_LIMIT,
        earliestBudgetSlot: nextSlot.toISOString(),
        earliestBudgetSlotMelbourne: nextSlot.toLocaleString("en-AU", {
          timeZone: "Australia/Melbourne",
        }),
        verificationScope:
          "PROVIDED_TEXT_ONLY; never automatic source verification",
      },
      null,
      2,
    ),
  );
}
main()
  .catch(() => {
    console.error("Unable to inspect verifier status.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
