import "dotenv/config";
import { env } from "@/lib/env";
import { getPrisma, disconnectPrisma } from "@/lib/prisma";
import {
  auditResearchRun,
  loadAuditPacket,
  PrismaAuditStore,
  runEvidenceAudit,
} from "@/services/research/research-audit-service";
import { createGlmResearchAuditor } from "@/services/research/glm-research-auditor";
import { AuditResultSchema } from "@/services/research/research-audit-core";
import {
  AUDIT_ACCEPTANCE_PACKET,
  AUDIT_PROTOCOL_ACCEPTANCE_PACKET,
  passesProtocolQualification,
  AUDIT_ACCEPTANCE_VERDICTS,
} from "@/services/research/research-audit-fixtures";
import { sanitizeResearchDiagnostic } from "@/services/research/deepseek-research-provider";

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 1 ||
    !(
      args[0] === "--qualification" ||
      args[0] === "--acceptance" ||
      args[0] === "--fixtures" ||
      /^--run=[0-9a-f-]{36}$/i.test(args[0]!)
    )
  )
    throw new Error(
      "Usage: research:audit --qualification OR --acceptance OR --fixtures OR --run=<research-run-id>; no force flags or retries",
    );
  if (!env.RESEARCH_AUDITOR_ENABLED || !env.GLM_API_KEY)
    throw new Error(
      "Enable RESEARCH_AUDITOR_ENABLED and configure GLM_API_KEY before auditor execution.",
    );
  const prisma = getPrisma();
  const qualification = args[0] === "--qualification";
  const acceptance = args[0] === "--acceptance";
  const historical = acceptance
    ? await loadAuditPacket(prisma, "7a502bbc-197e-4f7a-962f-70dabba0dced")
    : null;
  if (acceptance && !historical)
    throw new Error("Frozen historical acceptance run is unavailable");
  const testPacket = historical
    ? {
        ...historical,
        candidates: [
          ...historical.candidates,
          AUDIT_ACCEPTANCE_PACKET.candidates[0]!,
        ],
      }
    : qualification
      ? AUDIT_PROTOCOL_ACCEPTANCE_PACKET
      : AUDIT_ACCEPTANCE_PACKET;
  const result =
    args[0] === "--fixtures" || acceptance || qualification
      ? await runEvidenceAudit({
          packet: testPacket,
          operatorQualification: qualification || acceptance,
          fixtureName: acceptance
            ? "historical-acceptance-v3"
            : qualification
              ? "protocol-acceptance-v3"
              : "acceptance-v2",
          store: new PrismaAuditStore(prisma),
          provider: createGlmResearchAuditor(env.GLM_API_KEY),
          enabled: true,
          apiKeyConfigured: true,
          secrets: [env.GLM_API_KEY, env.DEEPSEEK_API_KEY ?? ""],
        })
      : await auditResearchRun(args[0]!.slice(6), prisma);
  console.log(JSON.stringify(result));
  if (!("id" in result) || !result.id) {
    process.exitCode = 1;
    return;
  }
  const row = await prisma.researchAuditRun.findUniqueOrThrow({
    where: { id: result.id },
  });
  console.log(
    JSON.stringify({
      id: row.id,
      status: row.status,
      model: row.modelId,
      result: row.result,
      usage: row.usage,
      latencyMs: row.latencyMs,
      failure: row.failureMessage,
    }),
  );
  if (!["SUCCEEDED", "CACHED"].includes(row.status)) {
    process.exitCode = 1;
    return;
  }
  if (qualification) {
    const passed = passesProtocolQualification(row.result);
    console.log(
      `Protocol acceptance: ${passed ? "PASS" : "FAIL"}; literal checks only, source truth remains unverified.`,
    );
    if (!passed) process.exitCode = 1;
  }
  if (acceptance) {
    const audited = AuditResultSchema.parse(row.result);
    const field = (index: number, name: string) =>
      audited.candidates
        .find((c) => c.index === index)
        ?.findings.find((f) => f.field === name)?.check;
    const passed =
      audited.verificationScope === "PROVIDED_TEXT_ONLY" &&
      audited.candidates.find((c) => c.index === 2)?.verdict ===
        "TEXT_MATCH_ONLY" &&
      field(0, "observations.0.metric") === "NOT_ESTABLISHED" &&
      field(0, "observations.0.value") === "MATCHED" &&
      field(0, "observations.1.value") === "MATCHED" &&
      field(1, "observations.1.qualifier") === "MATCHED" &&
      audited.candidates
        .slice(0, 2)
        .every((c) => c.verdict === "INSUFFICIENT_EVIDENCE");
    console.log(
      `Historical protocol acceptance: ${passed ? "PASS" : "FAIL"}; tests evidence alignment, never source truth.`,
    );
    if (!passed) process.exitCode = 1;
  }
  if (args[0] === "--fixtures") {
    const audited = AuditResultSchema.parse(row.result);
    const passed = AUDIT_ACCEPTANCE_VERDICTS.every(
      (verdict, index) =>
        audited.candidates.find((c) => c.index === index)?.verdict === verdict,
    );
    console.log(
      `Acceptance: ${passed ? "PASS" : "FAIL"}; synthetic fixture only; no candidate or review writes.`,
    );
    if (!passed) process.exitCode = 1;
  }
}
main()
  .catch((error) => {
    console.error(
      sanitizeResearchDiagnostic(
        error instanceof Error ? error.message : "Audit failed",
        [env.GLM_API_KEY ?? "", env.DEEPSEEK_API_KEY ?? ""],
      ),
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
