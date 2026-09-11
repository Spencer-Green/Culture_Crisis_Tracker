import "server-only";
import {
  AUDIT_PROTOCOL_ACCEPTANCE_PACKET,
  passesProtocolQualification,
} from "./research-audit-fixtures";
import { createHash } from "node:crypto";
import {
  checkProvidedEvidenceLocally,
  LOCAL_EVIDENCE_CHECK_VERSION,
} from "./research-evidence-checks";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { validateResearchStage1Artifact } from "@/services/research/research-artifact";
import { evidenceUrl } from "@/services/research/research-native-evidence";
import { sanitizeResearchDiagnostic } from "@/services/research/deepseek-research-provider";
import {
  createGlmResearchAuditor,
  AuditResponseValidationError,
  type AuditProvider,
  type AuditProviderResponse,
} from "@/services/research/glm-research-auditor";
import {
  auditBudgetDecision,
  auditInputHash,
  validateAuditPacket,
  RESEARCH_AUDIT_MODEL,
  RESEARCH_AUDIT_VERSION,
  type AuditPacket,
} from "@/services/research/research-audit-core";
import type { ResearchResponseDiagnosticsV1 } from "@/services/research/research-types";

type Reservation =
  | { status: "RESERVED" | "CACHED" | "EXISTING"; id: string }
  | { status: "SKIPPED"; reason: string };
export interface AuditStore {
  reserve(input: {
    packet: AuditPacket;
    runId?: string;
    fixtureName?: string;
    operatorQualification?: boolean;
    now: Date;
  }): Promise<Reservation>;
  complete(id: string, response: AuditProviderResponse): Promise<void>;
  fail(
    id: string,
    message: string,
    latencyMs?: number,
    diagnostic?: AuditResponseValidationError["diagnostic"],
  ): Promise<void>;
}
const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaAuditStore implements AuditStore {
  constructor(private readonly prisma: PrismaClient) {}
  async reserve(input: {
    packet: AuditPacket;
    runId?: string;
    fixtureName?: string;
    operatorQualification?: boolean;
    now: Date;
  }): Promise<Reservation> {
    const inputHash = auditInputHash(input.packet);
    return this.prisma.$transaction(async (tx) => {
      // Global audit-only transaction lock makes check+reserve atomic across workers/CLIs.
      // It is released before provider dispatch and never weakens the research source lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(173482, 9201)`;
      if (input.runId) {
        const existing = await tx.researchAuditRun.findUnique({
          where: {
            researchRunId_promptVersion: {
              researchRunId: input.runId,
              promptVersion: RESEARCH_AUDIT_VERSION,
            },
          },
        });
        if (existing) return { status: "EXISTING", id: existing.id };
      }
      const cached = await tx.researchAuditRun.findFirst({
        where: { inputHash, status: "SUCCEEDED" },
        orderBy: { startedAt: "desc" },
      });
      const base = {
        researchRunId: input.runId ?? null,
        fixtureName: input.fixtureName ?? null,
        promptVersion: RESEARCH_AUDIT_VERSION,
        modelId: RESEARCH_AUDIT_MODEL,
        inputHash,
        inputSnapshot: json(input.packet),
        startedAt: input.now,
      };
      if (cached) {
        if (!input.runId) return { status: "CACHED", id: cached.id };
        const alias = await tx.researchAuditRun.create({
          data: {
            ...base,
            status: "CACHED",
            cachedAuditId: cached.id,
            result: json(cached.result),
            completedAt: input.now,
            latencyMs: 0,
          },
        });
        return { status: "CACHED", id: alias.id };
      }
      // An unchanged failed or uncertain packet is not a reason to try again.
      const attempted = await tx.researchAuditRun.findFirst({
        where: { inputHash, status: { in: ["FAILED", "RUNNING"] } },
        orderBy: { startedAt: "desc" },
      });
      if (attempted) return { status: "EXISTING", id: attempted.id };
      const [daily, lifetime, active] = await Promise.all([
        tx.researchAuditRun.count({
          where: {
            status: { not: "CACHED" },
            startedAt: { gte: new Date(input.now.getTime() - 86_400_000) },
          },
        }),
        tx.researchAuditRun.count({ where: { status: { not: "CACHED" } } }),
        tx.researchAuditRun.count({
          where: {
            status: "RUNNING",
            startedAt: { gte: new Date(input.now.getTime() - 300_000) },
          },
        }),
      ]);
      const reason = auditBudgetDecision({
        daily,
        lifetime,
        active: active > 0,
        qualificationAttempts:
          input.operatorQualification &&
          !input.runId &&
          ["historical-acceptance-v3", "protocol-acceptance-v3"].includes(
            input.fixtureName ?? "",
          )
            ? await tx.researchAuditRun.count({
                where: {
                  promptVersion: RESEARCH_AUDIT_VERSION,
                  modelId: RESEARCH_AUDIT_MODEL,
                  fixtureName: {
                    in: ["historical-acceptance-v3", "protocol-acceptance-v3"],
                  },
                  status: { not: "CACHED" },
                },
              })
            : undefined,
      });
      if (reason) return { status: "SKIPPED", reason };
      const row = await tx.researchAuditRun.create({
        data: { ...base, status: "RUNNING" },
      });
      return { status: "RESERVED", id: row.id };
    });
  }
  async complete(id: string, response: AuditProviderResponse) {
    await this.prisma.researchAuditRun.update({
      where: { id, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        result: json(response.result),
        providerRequestId: response.responseId,
        usage: json(response.usage),
        completedAt: new Date(),
        latencyMs: response.latencyMs,
      },
    });
  }
  async fail(
    id: string,
    message: string,
    latencyMs?: number,
    diagnostic?: AuditResponseValidationError["diagnostic"],
  ) {
    await this.prisma.researchAuditRun.update({
      where: { id, status: "RUNNING" },
      data: {
        status: "FAILED",
        failureMessage: message,
        completedAt: new Date(),
        latencyMs,
        providerDiagnostic: diagnostic ? json(diagnostic) : undefined,
        usage: diagnostic ? json(diagnostic.usage) : undefined,
        providerRequestId: diagnostic?.responseId,
      },
    });
  }
}

export async function runEvidenceAudit(input: {
  packet: AuditPacket;
  store: AuditStore;
  provider: AuditProvider;
  enabled: boolean;
  apiKeyConfigured: boolean;
  runId?: string;
  fixtureName?: string;
  operatorQualification?: boolean;
  now?: Date;
  secrets?: string[];
}): Promise<{ status: string; id?: string; reason?: string }> {
  if (!input.enabled) return { status: "SKIPPED", reason: "DISABLED" };
  if (!input.apiKeyConfigured)
    return { status: "SKIPPED", reason: "MISSING_GLM_API_KEY" };
  const packet = JSON.parse(
    sanitizeResearchDiagnostic(
      JSON.stringify(input.packet),
      input.secrets ?? [],
      30_000,
    ),
  ) as AuditPacket;
  validateAuditPacket(packet);
  const reserved = await input.store.reserve({
    packet,
    runId: input.runId,
    fixtureName: input.fixtureName,
    operatorQualification: input.operatorQualification,
    now: input.now ?? new Date(),
  });
  if (reserved.status !== "RESERVED") return reserved;
  let response: AuditProviderResponse;
  const dispatchedAt = Date.now();
  try {
    response = await input.provider(packet, reserved.id);
  } catch (error) {
    const reason = sanitizeResearchDiagnostic(
      error instanceof Error ? error.message : "Audit provider failed",
      input.secrets ?? [],
    );
    const diagnostic =
      error instanceof AuditResponseValidationError
        ? (JSON.parse(
            sanitizeResearchDiagnostic(
              JSON.stringify(error.diagnostic),
              input.secrets ?? [],
              30_000,
            ),
          ) as AuditResponseValidationError["diagnostic"])
        : undefined;
    await input.store.fail(
      reserved.id,
      reason,
      Date.now() - dispatchedAt,
      diagnostic,
    );
    return { status: "FAILED", id: reserved.id, reason };
  }
  // If completion persistence is uncertain, leave RUNNING; never resend the provider call
  // or overwrite an already-completed audit with a failure record.
  await input.store.complete(reserved.id, response);
  return { status: "SUCCEEDED", id: reserved.id };
}

export async function loadAuditPacket(
  prisma: PrismaClient,
  runId: string,
): Promise<AuditPacket | null> {
  const run = await prisma.researchRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      candidateOccurrences: {
        orderBy: { candidateIndex: "asc" },
        include: { candidate: { select: { sector: true } } },
      },
    },
  });
  if (
    run.status !== "SUCCEEDED" ||
    !run.stage1Artifact ||
    !run.candidateOccurrences.length
  )
    return null;
  const artifact = validateResearchStage1Artifact(run.stage1Artifact);
  const diagnostics =
    run.responseDiagnostics as unknown as ResearchResponseDiagnosticsV1;
  const candidates = run.candidateOccurrences.map((occurrence) => {
    const source = artifact.sources[occurrence.candidateIndex];
    if (!source)
      throw new Error(
        "Audit source occurrence is missing from immutable run artifact",
      );
    const binding = diagnostics?.evidenceBindings?.find(
      (b) => evidenceUrl(b.url) === evidenceUrl(source.url),
    );
    return {
      key: occurrence.candidateId,
      sourceUrl: source.url,
      title: source.title,
      geography: source.geography,
      claim: source.claim,
      observations: source.observations,
      reportingPeriod: source.reportingPeriod,
      publicationDate: source.publishedAt,
      limitations: [source.limitations],
      evidence: {
        origin: "PROVIDER_EXTRACTED" as const,
        mediation: binding?.mediation ?? "MODEL_REPORTED",
        passage: binding?.quote ?? "",
        observationQuotes: binding?.observationQuotes ?? [],
      },
    };
  });
  // Task identity comes from the historical run, not a mutable current task definition.
  return {
    task: {
      id: run.researchTaskId,
      version: run.researchTaskVersion,
      sector: [
        ...new Set(run.candidateOccurrences.map((o) => o.candidate.sector)),
      ].join("; "),
      geography: [...new Set(candidates.map((c) => c.geography))].join("; "),
    },
    candidates,
  };
}

export async function auditResearchRun(
  runId: string,
  prisma: PrismaClient = getPrisma(),
) {
  if (!env.RESEARCH_AUDITOR_ENABLED)
    return { status: "SKIPPED", reason: "DISABLED" };
  const packet = await loadAuditPacket(prisma, runId);
  if (!packet) return { status: "SKIPPED", reason: "NO_CANDIDATES" };
  await persistLocalEvidenceCheck(prisma, runId, packet);
  if (!env.GLM_API_KEY)
    return { status: "SKIPPED", reason: "MISSING_GLM_API_KEY" };
  const qualification = await prisma.researchAuditRun.findFirst({
    where: {
      status: "SUCCEEDED",
      inputHash: auditInputHash(AUDIT_PROTOCOL_ACCEPTANCE_PACKET),
      promptVersion: RESEARCH_AUDIT_VERSION,
      modelId: RESEARCH_AUDIT_MODEL,
      fixtureName: "protocol-acceptance-v3",
    },
    orderBy: { startedAt: "desc" },
    select: { result: true },
  });
  if (!qualification || !passesProtocolQualification(qualification.result)) {
    // Fixed protocol check is a separate packet, not a retry of real research.
    // Automatic qualification receives no operator allowance and cannot loop on failure.
    const attempt = await runEvidenceAudit({
      packet: AUDIT_PROTOCOL_ACCEPTANCE_PACKET,
      fixtureName: "protocol-acceptance-v3",
      store: new PrismaAuditStore(prisma),
      provider: createGlmResearchAuditor(env.GLM_API_KEY),
      enabled: true,
      apiKeyConfigured: true,
      secrets: [env.GLM_API_KEY, env.DEEPSEEK_API_KEY ?? ""],
    });
    if (attempt.status === "SUCCEEDED" && attempt.id) {
      const record = await prisma.researchAuditRun.findUniqueOrThrow({
        where: { id: attempt.id },
        select: { result: true },
      });
      return {
        status: passesProtocolQualification(record.result)
          ? "PROTOCOL_QUALIFIED"
          : "FAILED",
        reason: "PROTOCOL_QUALIFICATION",
        id: attempt.id,
      };
    }
    if (attempt.status === "FAILED") return attempt;
    return {
      status: "SKIPPED",
      reason: attempt.reason ?? "PROTOCOL_NOT_QUALIFIED",
    };
  }
  return runEvidenceAudit({
    packet,
    runId,
    store: new PrismaAuditStore(prisma),
    provider: createGlmResearchAuditor(env.GLM_API_KEY),
    enabled: true,
    apiKeyConfigured: true,
    secrets: [env.GLM_API_KEY, env.DEEPSEEK_API_KEY ?? ""],
  });
}

export async function persistLocalEvidenceCheck(
  prisma: PrismaClient,
  runId: string,
  packet: AuditPacket,
) {
  const safePacket = JSON.parse(
    sanitizeResearchDiagnostic(
      JSON.stringify(packet),
      [env.GLM_API_KEY ?? "", env.DEEPSEEK_API_KEY ?? ""],
      30_000,
    ),
  ) as AuditPacket;
  validateAuditPacket(safePacket);
  const result = checkProvidedEvidenceLocally(safePacket);
  return prisma.researchEvidenceCheck.upsert({
    where: {
      researchRunId_contractVersion: {
        researchRunId: runId,
        contractVersion: LOCAL_EVIDENCE_CHECK_VERSION,
      },
    },
    create: {
      researchRunId: runId,
      contractVersion: LOCAL_EVIDENCE_CHECK_VERSION,
      inputHash: createHash("sha256")
        .update(
          JSON.stringify({
            version: LOCAL_EVIDENCE_CHECK_VERSION,
            packet: safePacket,
          }),
        )
        .digest("hex"),
      inputSnapshot: json(safePacket),
      result: json(result),
    },
    update: {},
  });
}

/** Audit failures never undo successful research persistence or cause a research retry. */
export async function auditResearchRunSafely(
  runId: string,
  prisma: PrismaClient,
  audit = auditResearchRun,
) {
  try {
    return await audit(runId, prisma);
  } catch {
    return { status: "FAILED", reason: "AUDIT_PERSISTENCE_OR_INPUT_FAILURE" };
  }
}

/** Catch up the latest recent completed discovery after an audit-budget skip or another worker's run.
 * Does not dispatch research, retry attempted audits, or scan historical backlog.
 */
export async function auditLatestResearchRunSafely(
  prisma: PrismaClient,
  options: {
    enabled?: boolean;
    now?: Date;
    audit?: typeof auditResearchRunSafely;
  } = {},
) {
  if (!(
    options.enabled ??
    (env.RESEARCH_AUDITOR_ENABLED && env.LLM_RESEARCHER_ENABLED)
  ))
    return { status: "SKIPPED", reason: "DISABLED" };
  try {
    const latest = await prisma.researchRun.findFirst({
      where: {
        status: "SUCCEEDED",
        completedAt: {
          gte: new Date((options.now ?? new Date()).getTime() - 48 * 3_600_000),
        },
      },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        audits: {
          where: { promptVersion: RESEARCH_AUDIT_VERSION },
          select: { id: true },
          take: 1,
        },
        evidenceChecks: {
          where: { contractVersion: LOCAL_EVIDENCE_CHECK_VERSION },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!latest || (latest.audits.length && latest.evidenceChecks.length))
      return { status: "SKIPPED", reason: "NO_PENDING_LATEST_RUN" };
    return (options.audit ?? auditResearchRunSafely)(latest.id, prisma);
  } catch {
    return { status: "FAILED", reason: "AUDIT_PERSISTENCE_OR_INPUT_FAILURE" };
  }
}
