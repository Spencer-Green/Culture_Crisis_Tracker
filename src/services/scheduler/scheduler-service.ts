import "server-only";

import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createCommandExecutor } from "@/services/scheduler/command-executor";
import { createResearchSchedulerExecutor } from "@/services/research/research-scheduler";
import { auditLatestResearchRunSafely } from "@/services/research/research-audit-service";
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
    automaticSourceIds?: readonly string[];
    now?: () => Date;
    logger?: SchedulerLogger;
    executor?: ScheduledSourceExecutor;
    concurrency?: number;
    forceResearchTaskCadence?: boolean;
    forceResearchRollingLimit?: boolean;
  } = {},
) {
  if (
    options.forceResearchTaskCadence &&
    options.sourceId !== "research-agent"
  ) {
    throw new Error(
      "Research task cadence can only be forced for --source=research-agent.",
    );
  }
  if (
    options.forceResearchRollingLimit &&
    (options.sourceId !== "research-agent" || !options.forceResearchTaskCadence)
  ) {
    throw new Error(
      "Research rolling limit can only be forced with targeted research-agent cadence override.",
    );
  }
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? defaultLogger;
  const capturedAt = now();
  let evaluations = await loadScheduleEvaluations(capturedAt);
  const store = new PrismaSchedulerStore(getPrisma());
  await initializeStates(evaluations, store, capturedAt);
  evaluations = await loadScheduleEvaluations(capturedAt);
  const selected = selectScheduleEvaluations(
    evaluations,
    options.sourceId,
    options.automaticSourceIds,
  );
  const executor =
    options.executor ??
    (() => {
      const commandExecutor = createCommandExecutor(store);
      const researchExecutor = createResearchSchedulerExecutor({
        forceTaskCadence: options.forceResearchTaskCadence ?? false,
        forceRollingLimit: options.forceResearchRollingLimit ?? false,
        onCadenceOverride: (message) =>
          logger.info(`scheduler source=research-agent ${message}`),
        onRollingLimitOverride: (message) =>
          logger.info(`scheduler source=research-agent ${message}`),
      });
      return ((input) =>
        input.definition.sourceId === "research-agent"
          ? researchExecutor(input)
          : commandExecutor(input)) satisfies ScheduledSourceExecutor;
    })();
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
    automaticSourceIds?: readonly string[];
  } = {},
) {
  const logger = options.logger ?? defaultLogger;
  if (!env.SCHEDULER_ENABLED) {
    logger.info("scheduler disabled by SCHEDULER_ENABLED=false");
    return;
  }
  logger.info(
    `scheduler worker started concurrency=${env.SCHEDULER_CONCURRENCY} pollMinutes=${env.SCHEDULER_POLL_MINUTES} scope=${options.automaticSourceIds?.join(",") ?? "all"} timezone=UTC`,
  );
  while (!options.signal?.aborted) {
    try {
      await runSchedulerOnce({
        logger,
        automaticSourceIds: options.automaticSourceIds,
      });
      if (
        !options.signal?.aborted &&
        (!options.automaticSourceIds ||
          options.automaticSourceIds.includes("research-agent"))
      ) {
        const audit = await auditLatestResearchRunSafely(getPrisma());
        if (audit.status !== "SKIPPED" && audit.status !== "EXISTING")
          logger.info(`research-audit latest status=${audit.status}`);
      }
    } catch {
      logger.error(
        "scheduler cycle failed before completion; waiting for the next poll",
      );
    }
    try {
      await sleep(env.SCHEDULER_POLL_MINUTES * 60_000, undefined, {
        signal: options.signal,
      });
    } catch (error) {
      if (!options.signal?.aborted) throw error;
    }
  }
  logger.info("scheduler worker stopped");
}
