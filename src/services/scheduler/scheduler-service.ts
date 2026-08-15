import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createCommandExecutor } from "@/services/scheduler/command-executor";
import {
  calculateNextScheduledAt,
  executeScheduledSource,
  runWithConcurrency,
  selectScheduleEvaluations,
  type ScheduledSourceExecutor,
} from "@/services/scheduler/scheduler-core";
import { PrismaSchedulerStore } from "@/services/scheduler/scheduler-prisma-store";
import { loadScheduleEvaluations } from "@/services/scheduler/scheduler-registry";
import type {
  ScheduleEvaluation,
  ScheduledRunResult,
} from "@/services/scheduler/types";

export type SchedulerLogger = {
  info(message: string): void;
  error(message: string): void;
};

const defaultLogger: SchedulerLogger = {
  info: console.log,
  error: console.error,
};

async function initializeStates(
  evaluations: readonly ScheduleEvaluation[],
  store: PrismaSchedulerStore,
  now: Date,
) {
  for (const evaluation of evaluations) {
    if (!evaluation.source) continue;
    await store.ensureState({
      definition: evaluation.definition,
      source: evaluation.source,
      nextScheduledAt:
        evaluation.nextScheduledAt ??
        calculateNextScheduledAt({
          definition: evaluation.definition,
          source: evaluation.source,
          state: evaluation.state,
          now,
        }),
    });
  }
}

function logResult(result: ScheduledRunResult, logger: SchedulerLogger) {
  const message = [
    `scheduler source=${result.sourceId}`,
    `status=${result.status}`,
    `start=${result.startedAt.toISOString()}`,
    `end=${result.completedAt.toISOString()}`,
    `durationMs=${result.durationMs}`,
    `created=${result.recordsCreated}`,
    `updated=${result.recordsUpdated}`,
  ].join(" ");
  if (result.status === "failed")
    logger.error(`${message} error=${result.errorMessage}`);
  else logger.info(message);
}

async function runEvaluation(input: {
  evaluation: ScheduleEvaluation;
  store: PrismaSchedulerStore;
  executor: ScheduledSourceExecutor;
  now: () => Date;
  logger: SchedulerLogger;
}) {
  if (!input.evaluation.source)
    throw new Error(
      `Source ${input.evaluation.definition.sourceId} is missing.`,
    );
  input.logger.info(
    `scheduler source=${input.evaluation.definition.sourceId} status=starting start=${input
      .now()
      .toISOString()}`,
  );
  const result = await executeScheduledSource({
    definition: input.evaluation.definition,
    source: input.evaluation.source,
    store: input.store,
    executor: input.executor,
    runId: randomUUID(),
    now: input.now,
  });
  logResult(result, input.logger);
  return result;
}

export async function runSchedulerOnce(
  options: {
    sourceId?: string;
    now?: () => Date;
    logger?: SchedulerLogger;
    executor?: ScheduledSourceExecutor;
    concurrency?: number;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? defaultLogger;
  const capturedAt = now();
  let evaluations = await loadScheduleEvaluations(capturedAt);
  const store = new PrismaSchedulerStore(getPrisma());
  await initializeStates(evaluations, store, capturedAt);
  evaluations = await loadScheduleEvaluations(capturedAt);
  const selected = selectScheduleEvaluations(evaluations, options.sourceId);
  const executor = options.executor ?? createCommandExecutor(store);
  const ticketmaster = selected.filter(
    (evaluation) => evaluation.definition.sourceId === "ticketmaster",
  );
  const remaining = selected.filter(
    (evaluation) => evaluation.definition.sourceId !== "ticketmaster",
  );
  const results: ScheduledRunResult[] = [];
  for (const evaluation of ticketmaster) {
    results.push(
      await runEvaluation({ evaluation, store, executor, now, logger }),
    );
  }
  let mediaChain = Promise.resolve<void>(undefined);
  const parallel = await runWithConcurrency(
    remaining,
    options.concurrency ?? env.SCHEDULER_CONCURRENCY,
    async (evaluation) => {
      const execute = () =>
        runEvaluation({ evaluation, store, executor, now, logger });
      if (
        evaluation.definition.sourceId !== "rss" &&
        evaluation.definition.sourceId !== "thenewsapi"
      )
        return execute();
      let mediaResult: ScheduledRunResult | undefined;
      mediaChain = mediaChain
        .catch(() => undefined)
        .then(async () => {
          mediaResult = await execute();
        });
      await mediaChain;
      return mediaResult!;
    },
  );
  results.push(...parallel);
  return { evaluatedAt: capturedAt, selected: selected.length, results };
}

export async function runSchedulerWorker(
  options: {
    logger?: SchedulerLogger;
    signal?: AbortSignal;
  } = {},
) {
  const logger = options.logger ?? defaultLogger;
  if (!env.SCHEDULER_ENABLED) {
    logger.info("scheduler disabled by SCHEDULER_ENABLED=false");
    return;
  }
  logger.info(
    `scheduler worker started concurrency=${env.SCHEDULER_CONCURRENCY} pollMinutes=${env.SCHEDULER_POLL_MINUTES} timezone=UTC`,
  );
  while (!options.signal?.aborted) {
    try {
      await runSchedulerOnce({ logger });
    } catch {
      logger.error(
        "scheduler cycle failed before completion; waiting for the next poll",
      );
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, env.SCHEDULER_POLL_MINUTES * 60_000);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  logger.info("scheduler worker stopped");
}
