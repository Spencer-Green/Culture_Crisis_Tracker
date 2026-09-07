import "server-only";

import { randomUUID } from "node:crypto";

import { getPrisma } from "@/lib/prisma";
import { sanitizeLlmDiagnosticMessage } from "@/lib/llm-smoke";
import {
  classifyProductionSynthesisFailure,
  LUNA_STORY_SYNTHESIS_SOURCE_ID,
  runProductionStorySynthesisCycleCore,
  type ProductionStorySynthesisCycleResult,
} from "@/services/media/production-story-synthesis-core";
import { PrismaProductionStorySynthesisStore } from "@/services/media/production-story-synthesis-store";
import {
  createOpenAIStorySynthesisClient,
  getCurrentStorySynthesisCandidates,
  requestOpenAIStorySynthesis,
} from "@/services/media/story-synthesis";
import { synthesizeStorySynthesisEvidence } from "@/services/media/story-synthesis-core";

export class ProductionStorySynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionStorySynthesisError";
  }
}

async function startRun(sourceId: string, startedAt: Date) {
  return getPrisma().$transaction(async (transaction) => {
    const run = await transaction.ingestionRun.create({
      data: {
        sourceId,
        status: "running",
        startedAt,
        metadata: { operation: "luna-story-synthesis" },
      },
      select: { id: true },
    });
    await transaction.dataSource.update({
      where: { id: sourceId },
      data: { lastAttemptedSyncAt: startedAt },
    });
    return run.id;
  });
}

async function completeRun(input: {
  runId: string;
  sourceId: string;
  completedAt: Date;
  result: ProductionStorySynthesisCycleResult;
}) {
  await getPrisma().$transaction([
    getPrisma().ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "succeeded",
        completedAt: input.completedAt,
        recordsRead: input.result.eligibleClusters,
        recordsCreated: input.result.validated,
        recordsUpdated: input.result.reused,
        metadata: input.result,
      },
    }),
    getPrisma().dataSource.update({
      where: { id: input.sourceId },
      data: {
        lastAttemptedSyncAt: input.completedAt,
        lastSuccessfulSyncAt: input.completedAt,
      },
    }),
  ]);
}

async function failRun(input: {
  runId: string;
  sourceId: string;
  completedAt: Date;
  message: string;
  result?: ProductionStorySynthesisCycleResult;
}) {
  await getPrisma().$transaction([
    getPrisma().ingestionRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        completedAt: input.completedAt,
        recordsRead: input.result?.eligibleClusters ?? 0,
        recordsCreated: input.result?.validated ?? 0,
        recordsUpdated: input.result?.reused ?? 0,
        errorMessage: input.message.slice(0, 500),
        metadata: input.result ?? { operation: "luna-story-synthesis" },
      },
    }),
    getPrisma().dataSource.update({
      where: { id: input.sourceId },
      data: { lastAttemptedSyncAt: input.completedAt },
    }),
  ]);
}

export async function generateProductionStorySyntheses(input: {
  apiKey: string;
  hours: number;
  maximumCalls: number;
  dailyCallLimit: number;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const source = await getPrisma().dataSource.findUnique({
    where: { slug: LUNA_STORY_SYNTHESIS_SOURCE_ID },
    select: { id: true },
  });
  if (!source) {
    throw new ProductionStorySynthesisError(
      "Luna synthesis source is missing; run the database seed.",
    );
  }
  const startedAt = now();
  const runId = await startRun(source.id, startedAt);
  let result: ProductionStorySynthesisCycleResult | undefined;
  try {
    const clusters = await getCurrentStorySynthesisCandidates({
      now: startedAt,
      hours: input.hours,
    });
    const store = new PrismaProductionStorySynthesisStore(
      getPrisma(),
      source.id,
    );
    const client = createOpenAIStorySynthesisClient(input.apiKey);
    result = await runProductionStorySynthesisCycleCore({
      clusters,
      maximumCalls: input.maximumCalls,
      dailyCallLimit: input.dailyCallLimit,
      store,
      createLeaseId: randomUUID,
      synthesize: (evidence) =>
        synthesizeStorySynthesisEvidence(evidence, (request) =>
          requestOpenAIStorySynthesis(client, request),
        ),
      classifyFailure: (error) =>
        classifyProductionSynthesisFailure(error, input.apiKey),
      now,
    });
    if (result.stoppedAfterFatalFailure) {
      throw new ProductionStorySynthesisError(
        "Luna synthesis stopped after a fatal API failure.",
      );
    }
    if (
      result.callsAttempted > 0 &&
      result.validated === 0 &&
      result.failed > 0
    ) {
      throw new ProductionStorySynthesisError(
        "No attempted Luna synthesis passed validation.",
      );
    }
    await completeRun({
      runId,
      sourceId: source.id,
      completedAt: now(),
      result,
    });
    return result;
  } catch (error) {
    const message = sanitizeLlmDiagnosticMessage(
      error instanceof Error
        ? error.message
        : "Production Luna synthesis failed.",
      input.apiKey,
    );
    await failRun({
      runId,
      sourceId: source.id,
      completedAt: now(),
      message,
      result,
    });
    throw new ProductionStorySynthesisError(message);
  }
}
