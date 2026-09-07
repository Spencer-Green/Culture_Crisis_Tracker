import "dotenv/config";

import { createInterface } from "node:readline/promises";

import { disconnectPrisma } from "@/lib/prisma";
import { parseServerEnv } from "@/lib/env-schema";
import { generateProductionStorySyntheses } from "@/services/media/production-story-synthesis";

type Options = {
  scheduled: boolean;
  yes: boolean;
  hours: number;
  limit: number;
  dailyLimit: number;
};

function integerOption(
  arguments_: readonly string[],
  name: string,
  fallback: number,
) {
  const value = arguments_.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (!value) return fallback;
  const parsed = Number(value.slice(name.length + 3));
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(
  arguments_: readonly string[],
  env: ReturnType<typeof parseServerEnv>,
): Options {
  for (const argument of arguments_) {
    if (argument === "--scheduled" || argument === "--yes") continue;
    if (/^--(hours|limit|daily-limit)=/.test(argument)) continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  const options = {
    scheduled: arguments_.includes("--scheduled"),
    yes: arguments_.includes("--yes"),
    hours: integerOption(
      arguments_,
      "hours",
      env.LUNA_SYNTHESIS_LOOKBACK_HOURS,
    ),
    limit: integerOption(arguments_, "limit", env.LUNA_SYNTHESIS_MAX_PER_CYCLE),
    dailyLimit: integerOption(
      arguments_,
      "daily-limit",
      env.LUNA_SYNTHESIS_DAILY_CALL_LIMIT,
    ),
  };
  if (options.limit > 6) throw new Error("--limit must not exceed 6.");
  if (options.hours > 168) throw new Error("--hours must not exceed 168.");
  return options;
}

async function confirmSpend(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Interactive confirmation is unavailable; rerun with --yes to authorize bounded API calls.",
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return /^(y|yes)$/i.test(
      (
        await prompt.question(
          "Generate and persist the bounded production Luna shortlist? [y/N] ",
        )
      ).trim(),
    );
  } finally {
    prompt.close();
  }
}

async function main() {
  const environment = parseServerEnv(process.env);
  const options = parseOptions(process.argv.slice(2), environment);
  if (options.scheduled && !environment.LUNA_SYNTHESIS_ENABLED) {
    throw new Error("Scheduled Luna synthesis is disabled.");
  }
  if (!environment.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for Luna synthesis.");
  }
  if (!options.scheduled && !options.yes && !(await confirmSpend())) {
    console.log("Production Luna synthesis cancelled before any API call.");
    return;
  }
  const result = await generateProductionStorySyntheses({
    apiKey: environment.OPENAI_API_KEY,
    hours: options.hours,
    maximumCalls: options.limit,
    dailyCallLimit: options.dailyLimit,
  });
  console.log("LUNA PRODUCTION SYNTHESIS: COMPLETE");
  console.log(`eligible clusters: ${result.eligibleClusters}`);
  console.log(`scanned clusters: ${result.scannedClusters}`);
  console.log(`calls attempted: ${result.callsAttempted}`);
  console.log(`validated: ${result.validated}`);
  console.log(`failed: ${result.failed}`);
  console.log(`reused: ${result.reused}`);
  console.log(`locked: ${result.locked}`);
  console.log(`cooldown: ${result.cooldown}`);
  console.log(`input tokens: ${result.inputTokens}`);
  console.log(`cached input tokens: ${result.cachedInputTokens}`);
  console.log(`output tokens: ${result.outputTokens}`);
  console.log(`total tokens: ${result.totalTokens}`);
  console.log(`ESTIMATED COST: $${result.estimatedCostUsd.toFixed(6)} USD`);
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Production Luna synthesis failed.",
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
