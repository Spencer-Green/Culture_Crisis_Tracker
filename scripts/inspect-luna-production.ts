import "dotenv/config";

import { env } from "@/lib/env";
import { disconnectPrisma, getPrisma } from "@/lib/prisma";
import { getPersistedStorySyntheses } from "@/services/media/production-story-synthesis-read";
import { getCurrentStorySynthesisCandidates } from "@/services/media/story-synthesis";

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const clusters = await getCurrentStorySynthesisCandidates({
    now,
    hours: env.LUNA_SYNTHESIS_LOOKBACK_HOURS,
  });
  const [syntheses, source, attempts] = await Promise.all([
    getPersistedStorySyntheses(clusters),
    getPrisma().dataSource.findUnique({
      where: { slug: "luna-story-synthesis" },
      select: {
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
        schedulerState: {
          select: {
            nextScheduledAt: true,
            lastRunStatus: true,
            consecutiveFailures: true,
          },
        },
      },
    }),
    getPrisma().lunaStorySynthesisAttempt.findMany({
      where: { attemptedAt: { gte: since } },
      select: {
        status: true,
        failureKind: true,
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
      },
    }),
  ]);
  const freshness = [...syntheses.values()].reduce(
    (counts, item) => {
      counts[item.freshness] += 1;
      return counts;
    },
    { CURRENT: 0, STALE: 0, MISSING: 0 },
  );
  const usage = attempts.reduce(
    (total, attempt) => ({
      inputTokens: total.inputTokens + (attempt.inputTokens ?? 0),
      cachedInputTokens:
        total.cachedInputTokens + (attempt.cachedInputTokens ?? 0),
      outputTokens: total.outputTokens + (attempt.outputTokens ?? 0),
      totalTokens: total.totalTokens + (attempt.totalTokens ?? 0),
      estimatedCostUsd:
        total.estimatedCostUsd + Number(attempt.estimatedCostUsd ?? 0),
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
  );
  console.log("LUNA PRODUCTION STATUS");
  console.log(`enabled: ${env.LUNA_SYNTHESIS_ENABLED}`);
  console.log(`eligible clusters: ${clusters.length}`);
  console.log(`current: ${freshness.CURRENT}`);
  console.log(`stale: ${freshness.STALE}`);
  console.log(`missing: ${freshness.MISSING}`);
  console.log(
    `last attempt: ${source?.lastAttemptedSyncAt?.toISOString() ?? "never"}`,
  );
  console.log(
    `last success: ${source?.lastSuccessfulSyncAt?.toISOString() ?? "never"}`,
  );
  console.log(
    `next scheduled: ${source?.schedulerState?.nextScheduledAt?.toISOString() ?? "not scheduled"}`,
  );
  console.log(
    `scheduler status: ${source?.schedulerState?.lastRunStatus ?? "never"}`,
  );
  console.log(
    `scheduler consecutive failures: ${source?.schedulerState?.consecutiveFailures ?? 0}`,
  );
  console.log(`calls rolling 24h: ${attempts.length}`);
  console.log(
    `validated: ${attempts.filter((attempt) => attempt.status === "VALIDATED").length}`,
  );
  console.log(
    `validation failures: ${attempts.filter((attempt) => attempt.failureKind === "VALIDATION").length}`,
  );
  console.log(
    `provider failures: ${attempts.filter((attempt) => attempt.failureKind === "API").length}`,
  );
  console.log(`input tokens: ${usage.inputTokens}`);
  console.log(`cached input tokens: ${usage.cachedInputTokens}`);
  console.log(`output tokens: ${usage.outputTokens}`);
  console.log(`total tokens: ${usage.totalTokens}`);
  console.log(`ESTIMATED COST: $${usage.estimatedCostUsd.toFixed(6)} USD`);
}

main()
  .catch(() => {
    console.error("Luna production status could not be loaded.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
