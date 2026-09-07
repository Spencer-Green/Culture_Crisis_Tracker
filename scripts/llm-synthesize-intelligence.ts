import "dotenv/config";

import { createInterface } from "node:readline/promises";

import { disconnectPrisma } from "@/lib/prisma";
import {
  diagnoseLlmSmokeError,
  sanitizeLlmDiagnosticMessage,
} from "@/lib/llm-smoke";
import {
  buildIntelligenceSynthesisEvidence,
  selectIntelligenceSynthesisClusters,
  synthesizeIntelligenceClusters,
} from "@/services/media/intelligence-synthesis-core";
import {
  getCurrentIntelligenceSynthesisCandidates,
  requestOpenAIIntelligenceSynthesis,
} from "@/services/media/intelligence-synthesis";
import {
  createOpenAIStorySynthesisClient,
  resolveStorySynthesisCluster,
} from "@/services/media/story-synthesis";
import {
  StorySynthesisEvidenceError,
  StorySynthesisResponseValidationError,
  StorySynthesisValidationError,
} from "@/services/media/story-synthesis-core";

type Options = {
  hours: number;
  limit: number;
  dryRun: boolean;
  yes: boolean;
  identifiers: string[];
  evaluationOnly: boolean;
};

function parseOptions(arguments_: string[]): Options {
  let hours = 336;
  let limit = 6;
  for (const argument of arguments_) {
    if (
      argument === "--dry-run" ||
      argument === "--yes" ||
      argument === "--evaluation-only"
    )
      continue;
    if (argument.startsWith("--hours=")) {
      hours = Number(argument.slice("--hours=".length));
      continue;
    }
    if (argument.startsWith("--limit=")) {
      limit = Number(argument.slice("--limit=".length));
      continue;
    }
    if (argument.startsWith("--ids=")) continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  if (!Number.isInteger(hours) || hours < 72 || hours > 720) {
    throw new Error("--hours must be an integer between 72 and 720.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 6) {
    throw new Error("--limit must be an integer between 1 and 6.");
  }
  return {
    hours,
    limit,
    dryRun: arguments_.includes("--dry-run"),
    yes: arguments_.includes("--yes"),
    identifiers:
      arguments_
        .find((argument) => argument.startsWith("--ids="))
        ?.slice("--ids=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    evaluationOnly: arguments_.includes("--evaluation-only"),
  };
}

async function confirmSpend(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Interactive confirmation is unavailable; rerun with --yes to authorize one API call.",
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(
      "Send this bounded multi-story evidence packet to GPT-5.6 Luna once? [y/N] ",
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const candidates = await getCurrentIntelligenceSynthesisCandidates({
    hours: options.hours,
  });
  if (options.identifiers.length > 6) {
    throw new Error(
      "--ids accepts at most six cluster or article identifiers.",
    );
  }
  const resolved = await Promise.all(
    options.identifiers.map((identifier) =>
      resolveStorySynthesisCluster(identifier, {
        hours: options.hours,
        evaluationOnly: options.evaluationOnly,
      }),
    ),
  );
  if (resolved.some((cluster) => cluster === null)) {
    throw new StorySynthesisEvidenceError(
      "One or more explicit cluster identifiers could not be resolved.",
    );
  }
  const selected =
    resolved.length > 0
      ? resolved.filter((cluster) => cluster !== null)
      : selectIntelligenceSynthesisClusters(candidates, options.limit);
  if (selected.length === 0) {
    throw new StorySynthesisEvidenceError(
      "No eligible recent clusters were available for intelligence synthesis.",
    );
  }
  const evidence = buildIntelligenceSynthesisEvidence({
    clusters: selected,
    generatedAt: new Date(),
    evaluationOnly: options.evaluationOnly,
  });
  console.log("LUNA INTELLIGENCE SYNTHESIS EVIDENCE");
  console.log(`candidate clusters: ${candidates.length}`);
  console.log(`selected clusters: ${selected.length}`);
  console.log(
    `evidence size: ${evidence.bounds.serializedCharacters}/${evidence.bounds.maximumCharacters} characters`,
  );
  console.log(`relationship hints: ${evidence.relationshipHints.length}`);
  console.log(
    `historical comparator: ${evidence.temporalContext.historicalComparatorAvailable ? "available" : "insufficient"}`,
  );
  console.log(
    `evaluation context: ${evidence.evaluationOnly ? "EVALUATION_ONLY" : "PRODUCTION_ELIGIBLE"}`,
  );
  for (const cluster of evidence.clusters) {
    console.log("");
    console.log(`cluster: ${cluster.clusterId}`);
    console.log(`headline: ${cluster.headline}`);
    console.log(
      `labels: ${cluster.classification.sector ?? "ambiguous"} · ${cluster.classification.eventType ?? "null event"} · ${cluster.classification.signalDirection} · importance ${cluster.classification.importance} · ${cluster.classification.confidence}`,
    );
    console.log(`claim: ${cluster.claimDiscipline.dominantClaimKind}`);
    console.log(
      `evidence: ${cluster.articles.length} rows · ${cluster.publisherCount} publishers (independence not established)`,
    );
  }
  if (options.dryRun) {
    console.log("\nDRY RUN: no API call made.");
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  if (!options.yes && !(await confirmSpend())) {
    console.log("Intelligence synthesis cancelled before the API call.");
    return;
  }
  const client = createOpenAIStorySynthesisClient(apiKey);
  const execution = await synthesizeIntelligenceClusters(
    selected,
    (request) => requestOpenAIIntelligenceSynthesis(client, request),
    {
      generatedAt: new Date(),
      evaluationOnly: options.evaluationOnly,
    },
  );
  console.log("\nLUNA INTELLIGENCE SYNTHESIS: PASS");
  console.log(JSON.stringify(execution.synthesis, null, 2));
  console.log(`\nmodel: ${execution.model}`);
  console.log(`latency: ${execution.latencyMs} ms`);
  console.log(`input tokens: ${execution.usage.inputTokens}`);
  console.log(`cached input tokens: ${execution.usage.cachedInputTokens}`);
  console.log(`output tokens: ${execution.usage.outputTokens}`);
  console.log(`total tokens: ${execution.usage.totalTokens}`);
  console.log(
    `ESTIMATED COST: $${execution.estimatedCost.totalUsd.toFixed(6)} ${execution.estimatedCost.currency}`,
  );
}

main()
  .catch((error) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (error instanceof StorySynthesisResponseValidationError) {
      console.error("LUNA INTELLIGENCE SYNTHESIS: FAIL");
      console.error(sanitizeLlmDiagnosticMessage(error.message, apiKey));
      console.error(`model: ${error.model}`);
      console.error(`latency: ${error.latencyMs} ms`);
      console.error(`input tokens: ${error.usage.inputTokens}`);
      console.error(`cached input tokens: ${error.usage.cachedInputTokens}`);
      console.error(`output tokens: ${error.usage.outputTokens}`);
      console.error(`total tokens: ${error.usage.totalTokens}`);
      console.error(
        `ESTIMATED COST: $${error.estimatedCost.totalUsd.toFixed(6)} ${error.estimatedCost.currency}`,
      );
      process.exitCode = 1;
      return;
    }
    if (
      error instanceof StorySynthesisEvidenceError ||
      error instanceof StorySynthesisValidationError
    ) {
      console.error("LUNA INTELLIGENCE SYNTHESIS: FAIL");
      console.error(sanitizeLlmDiagnosticMessage(error.message, apiKey));
      process.exitCode = 1;
      return;
    }
    const diagnostic = diagnoseLlmSmokeError(error, apiKey);
    console.error("LUNA INTELLIGENCE SYNTHESIS: FAIL");
    console.error(`category: ${diagnostic.category}`);
    if (diagnostic.status !== undefined)
      console.error(`status: ${diagnostic.status}`);
    if (diagnostic.code) console.error(`code: ${diagnostic.code}`);
    console.error(`message: ${diagnostic.message}`);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
