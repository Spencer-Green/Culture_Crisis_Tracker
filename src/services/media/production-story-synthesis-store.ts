import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  synthesisAcquisitionDecision,
  type ProductionStorySynthesisIdentity,
  type ProductionSynthesisFailure,
  type ProductionSynthesisStore,
  type ValidatedStorySynthesisArtifact,
} from "@/services/media/production-story-synthesis-core";
import {
  parsePersistedStorySynthesisPayload,
  type StorySynthesisExecution,
} from "@/services/media/story-synthesis-core";

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class PrismaProductionStorySynthesisStore implements ProductionSynthesisStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sourceId: string,
  ) {}

  countAttemptsSince(since: Date): Promise<number> {
    return this.prisma.lunaStorySynthesisAttempt.count({
      where: {
        attemptedAt: { gte: since },
        synthesis: { sourceId: this.sourceId },
      },
    });
  }

  async acquire(input: {
    identity: ProductionStorySynthesisIdentity;
    evidenceMetadata: Record<string, unknown>;
    leaseId: string;
    attemptedAt: Date;
    leaseExpiresAt: Date;
  }) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.lunaStorySynthesis.findUnique({
          where: { identityKey: input.identity.identityKey },
          select: {
            id: true,
            status: true,
            leaseExpiresAt: true,
            nextAttemptAt: true,
          },
        });
        const decision = synthesisAcquisitionDecision(
          existing
            ? {
                status: existing.status as
                  "PROCESSING" | "VALIDATED" | "FAILED",
                leaseExpiresAt: existing.leaseExpiresAt,
                nextAttemptAt: existing.nextAttemptAt,
              }
            : null,
          input.attemptedAt,
        );
        if (decision !== "ACQUIRE") return decision;
        let synthesisId: string;
        if (!existing) {
          const created = await transaction.lunaStorySynthesis.create({
            data: {
              sourceId: this.sourceId,
              ...input.identity,
              status: "PROCESSING",
              evidenceMetadata: inputJson(input.evidenceMetadata),
              leaseId: input.leaseId,
              leaseExpiresAt: input.leaseExpiresAt,
              attemptedAt: input.attemptedAt,
            },
            select: { id: true },
          });
          synthesisId = created.id;
        } else {
          const acquired = await transaction.lunaStorySynthesis.updateMany({
            where: {
              id: existing.id,
              status: existing.status,
              leaseExpiresAt: existing.leaseExpiresAt,
              nextAttemptAt: existing.nextAttemptAt,
            },
            data: {
              status: "PROCESSING",
              evidenceMetadata: inputJson(input.evidenceMetadata),
              synthesisPayload: Prisma.DbNull,
              responseModel: null,
              inputTokens: null,
              cachedInputTokens: null,
              outputTokens: null,
              totalTokens: null,
              estimatedCostUsd: null,
              latencyMs: null,
              generatedAt: null,
              failureKind: null,
              failureMessage: null,
              nextAttemptAt: null,
              leaseId: input.leaseId,
              leaseExpiresAt: input.leaseExpiresAt,
              attemptedAt: input.attemptedAt,
            },
          });
          if (acquired.count !== 1) return "LOCKED";
          synthesisId = existing.id;
        }
        await transaction.lunaStorySynthesisAttempt.create({
          data: {
            synthesisId,
            leaseId: input.leaseId,
            status: "RUNNING",
            attemptedAt: input.attemptedAt,
          },
        });
        return "ACQUIRE" as const;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "LOCKED" as const;
      }
      throw error;
    }
  }

  async markValidated(input: {
    identityKey: string;
    leaseId: string;
    execution: StorySynthesisExecution;
    generatedAt: Date;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.lunaStorySynthesis.updateMany({
        where: {
          identityKey: input.identityKey,
          status: "PROCESSING",
          leaseId: input.leaseId,
        },
        data: {
          status: "VALIDATED",
          responseModel: input.execution.model,
          synthesisPayload: inputJson(input.execution.synthesis),
          inputTokens: input.execution.usage.inputTokens,
          cachedInputTokens: input.execution.usage.cachedInputTokens,
          outputTokens: input.execution.usage.outputTokens,
          totalTokens: input.execution.usage.totalTokens,
          estimatedCostUsd: input.execution.estimatedCost.totalUsd,
          latencyMs: input.execution.latencyMs,
          generatedAt: input.generatedAt,
          nextAttemptAt: null,
          leaseId: null,
          leaseExpiresAt: null,
          failureKind: null,
          failureMessage: null,
        },
      });
      await transaction.lunaStorySynthesisAttempt.updateMany({
        where: { leaseId: input.leaseId, status: "RUNNING" },
        data: {
          status: updated.count === 1 ? "VALIDATED" : "FAILED",
          responseModel: input.execution.model,
          inputTokens: input.execution.usage.inputTokens,
          cachedInputTokens: input.execution.usage.cachedInputTokens,
          outputTokens: input.execution.usage.outputTokens,
          totalTokens: input.execution.usage.totalTokens,
          estimatedCostUsd: input.execution.estimatedCost.totalUsd,
          latencyMs: input.execution.latencyMs,
          failureKind: updated.count === 1 ? null : "LEASE_LOST",
          failureMessage:
            updated.count === 1
              ? null
              : "Validated output was not persisted because the synthesis lease was no longer current.",
          completedAt: input.generatedAt,
        },
      });
      return updated.count === 1;
    });
  }

  async markFailed(input: {
    identityKey: string;
    leaseId: string;
    failure: ProductionSynthesisFailure;
    failedAt: Date;
    nextAttemptAt: Date;
  }) {
    const diagnostics = input.failure.diagnostics;
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.lunaStorySynthesis.updateMany({
        where: {
          identityKey: input.identityKey,
          status: "PROCESSING",
          leaseId: input.leaseId,
        },
        data: {
          status: "FAILED",
          responseModel: diagnostics?.model ?? null,
          inputTokens: diagnostics?.usage.inputTokens ?? null,
          cachedInputTokens: diagnostics?.usage.cachedInputTokens ?? null,
          outputTokens: diagnostics?.usage.outputTokens ?? null,
          totalTokens: diagnostics?.usage.totalTokens ?? null,
          estimatedCostUsd: diagnostics?.estimatedCost.totalUsd ?? null,
          latencyMs: diagnostics?.latencyMs ?? null,
          attemptedAt: input.failedAt,
          generatedAt: null,
          nextAttemptAt: input.nextAttemptAt,
          leaseId: null,
          leaseExpiresAt: null,
          failureKind: input.failure.kind,
          failureMessage: input.failure.message.slice(0, 500),
        },
      });
      await transaction.lunaStorySynthesisAttempt.updateMany({
        where: { leaseId: input.leaseId, status: "RUNNING" },
        data: {
          status: "FAILED",
          responseModel: diagnostics?.model ?? null,
          inputTokens: diagnostics?.usage.inputTokens ?? null,
          cachedInputTokens: diagnostics?.usage.cachedInputTokens ?? null,
          outputTokens: diagnostics?.usage.outputTokens ?? null,
          totalTokens: diagnostics?.usage.totalTokens ?? null,
          estimatedCostUsd: diagnostics?.estimatedCost.totalUsd ?? null,
          latencyMs: diagnostics?.latencyMs ?? null,
          failureKind: input.failure.kind,
          failureMessage: input.failure.message.slice(0, 500),
          completedAt: input.failedAt,
        },
      });
      return updated.count === 1;
    });
  }

  async latestValidated(input: {
    storyKeys: readonly string[];
    articleIds: readonly string[];
  }): Promise<ValidatedStorySynthesisArtifact[]> {
    if (input.storyKeys.length === 0 && input.articleIds.length === 0)
      return [];
    const rows = await this.prisma.lunaStorySynthesis.findMany({
      where: {
        OR: [
          { storyKey: { in: [...input.storyKeys] } },
          { representativeArticleId: { in: [...input.articleIds] } },
        ],
        status: "VALIDATED",
        synthesisPayload: { not: Prisma.DbNull },
        generatedAt: { not: null },
        responseModel: { not: null },
      },
      orderBy: { generatedAt: "desc" },
    });
    const result: ValidatedStorySynthesisArtifact[] = [];
    for (const row of rows) {
      if (
        row.generatedAt === null ||
        row.responseModel === null ||
        row.synthesisPayload === null
      ) {
        continue;
      }
      try {
        const metadata = row.evidenceMetadata;
        if (
          metadata === null ||
          Array.isArray(metadata) ||
          typeof metadata !== "object" ||
          !("articleIds" in metadata) ||
          !Array.isArray(metadata.articleIds) ||
          !metadata.articleIds.every((value) => typeof value === "string")
        ) {
          continue;
        }
        result.push({
          identityKey: row.identityKey,
          storyKey: row.storyKey,
          clusterId: row.clusterId,
          representativeArticleId: row.representativeArticleId,
          evidenceArticleIds: metadata.articleIds,
          evidenceFingerprint: row.evidenceFingerprint,
          evidenceVersion: row.evidenceVersion,
          promptVersion: row.promptVersion,
          outputSchemaVersion: row.outputSchemaVersion,
          requestedModel: row.requestedModel,
          responseModel: row.responseModel,
          synthesis: parsePersistedStorySynthesisPayload(row.synthesisPayload),
          generatedAt: row.generatedAt.toISOString(),
          latencyMs: row.latencyMs,
        });
      } catch {
        // Invalid persisted payloads fail closed and are never returned.
      }
    }
    return result;
  }
}
