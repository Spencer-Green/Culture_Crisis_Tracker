import "dotenv/config";

import { createInterface } from "node:readline/promises";

import { disconnectPrisma } from "@/lib/prisma";
import {
  diagnoseLlmSmokeError,
  sanitizeLlmDiagnosticMessage,
} from "@/lib/llm-smoke";
import {
  buildStorySynthesisEvidence,
  StorySynthesisEvidenceError,
  StorySynthesisResponseValidationError,
  StorySynthesisValidationError,
  synthesizeMediaStoryCluster,
} from "@/services/media/story-synthesis-core";
import {
  createOpenAIStorySynthesisClient,
  getCurrentStorySynthesisCandidates,
  requestOpenAIStorySynthesis,
  resolveStorySynthesisCluster,
} from "@/services/media/story-synthesis";

type CliOptions = {
  identifier: string | null;
  yes: boolean;
  list: boolean;
  dryRun: boolean;
  hours: number;
  evaluationOnly: boolean;
};

function parseOptions(arguments_: string[]): CliOptions {
  let identifier: string | null = null;
  let hours = 168;
  for (const argument of arguments_) {
    if (
      argument === "--yes" ||
      argument === "--list" ||
      argument === "--dry-run" ||
      argument === "--evaluation-only"
    )
      continue;
    if (argument.startsWith("--hours=")) {
      const parsed = Number(argument.slice("--hours=".length));
      if (!Number.isInteger(parsed) || parsed < 24 || parsed > 720) {
        throw new Error("--hours must be an integer between 24 and 720.");
      }
      hours = parsed;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (identifier !== null) {
      throw new Error("Provide only one cluster or article identifier.");
    }
    identifier = argument;
  }
  return {
    identifier,
    yes: arguments_.includes("--yes"),
    list: arguments_.includes("--list"),
    dryRun: arguments_.includes("--dry-run"),
    hours,
    evaluationOnly: arguments_.includes("--evaluation-only"),
  };
}

function printCandidates(
  candidates: Awaited<ReturnType<typeof getCurrentStorySynthesisCandidates>>,
) {
  console.log(`Eligible current story clusters: ${candidates.length}`);
  for (const cluster of candidates.slice(0, 50)) {
    console.log("");
    console.log(`cluster: ${cluster.clusterId}`);
    console.log(`article: ${cluster.representativeArticleId}`);
    console.log(
      `labels: ${cluster.sector ?? "ambiguous"} · ${cluster.eventType ?? "unclassified"} · ${cluster.signalDirection} · importance ${cluster.importance} · ${cluster.confidence}`,
    );
    console.log(`sources: ${cluster.sourceCount}`);
    console.log(`headline: ${cluster.canonicalHeadline}`);
  }
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
      "Send this bounded evidence packet to GPT-5.6 Luna once? [y/N] ",
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.list || options.identifier === null) {
    const candidates = await getCurrentStorySynthesisCandidates({
      hours: options.hours,
    });
    printCandidates(candidates);
    if (options.identifier === null) {
      console.log("");
      console.log(
        "Usage: npm run llm:synthesize-story -- <cluster-or-article-id> [--dry-run] [--yes]",
      );
    }
    return;
  }

  const cluster = await resolveStorySynthesisCluster(options.identifier, {
    hours: options.hours,
    evaluationOnly: options.evaluationOnly,
  });
  if (!cluster) {
    throw new StorySynthesisEvidenceError(
      "No currently eligible story cluster matched that identifier.",
    );
  }
  const evidence = buildStorySynthesisEvidence(cluster, {
    evaluationOnly: options.evaluationOnly,
  });
  console.log("STORY SYNTHESIS EVIDENCE");
  console.log(`cluster: ${evidence.clusterId}`);
  console.log(`headline: ${evidence.representativeHeadline}`);
  console.log(
    `labels: ${evidence.effectiveClassification.sector ?? "ambiguous"} · ${evidence.effectiveClassification.eventType ?? "unclassified"} · ${evidence.effectiveClassification.signalDirection} · importance ${evidence.effectiveClassification.importance} · ${evidence.effectiveClassification.confidence}`,
  );
  console.log(
    `articles: ${evidence.bounds.includedArticles}/${cluster.articles.length} eligible evidence rows`,
  );
  console.log(`publishers: ${evidence.publishers.join(", ") || "unknown"}`);
  console.log(
    `evidence size: ${evidence.bounds.serializedCharacters}/${evidence.bounds.maximumCharacters} characters`,
  );
  console.log(
    `human labels: ${cluster.humanReviewState}${cluster.ambiguousHumanCorrections ? " (ambiguous; conservative routing)" : ""}`,
  );
  console.log(
    `evaluation context: ${evidence.evaluationContext.evaluationOnly ? "EVALUATION_ONLY" : "PRODUCTION_ELIGIBLE"}`,
  );
  if (options.dryRun) {
    console.log("dry run: no API call made");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("STORY SYNTHESIS: FAIL");
    console.error("category: missing OPENAI_API_KEY");
    process.exitCode = 1;
    return;
  }
  if (!options.yes && !(await confirmSpend())) {
    console.log("Story synthesis cancelled before the API call.");
    return;
  }

  const client = createOpenAIStorySynthesisClient(apiKey);
  const result = await synthesizeMediaStoryCluster(
    cluster,
    (request) => requestOpenAIStorySynthesis(client, request),
    undefined,
    { evaluationOnly: options.evaluationOnly },
  );
  console.log("");
  console.log("STORY SYNTHESIS: PASS");
  console.log(JSON.stringify(result.synthesis, null, 2));
  console.log("");
  console.log(`model: ${result.model}`);
  console.log(`latency: ${result.latencyMs} ms`);
  console.log(`input tokens: ${result.usage.inputTokens}`);
  console.log(`cached input tokens: ${result.usage.cachedInputTokens}`);
  console.log(`output tokens: ${result.usage.outputTokens}`);
  console.log(`total tokens: ${result.usage.totalTokens}`);
  console.log(
    `ESTIMATED COST: $${result.estimatedCost.totalUsd.toFixed(6)} ${result.estimatedCost.currency}`,
  );
}

main()
  .catch((error) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (error instanceof StorySynthesisResponseValidationError) {
      console.error("STORY SYNTHESIS: FAIL");
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
      console.error("STORY SYNTHESIS: FAIL");
      console.error(sanitizeLlmDiagnosticMessage(error.message, apiKey));
      process.exitCode = 1;
      return;
    }
    const diagnostic = diagnoseLlmSmokeError(error, apiKey);
    console.error("STORY SYNTHESIS: FAIL");
    console.error(`category: ${diagnostic.category}`);
    if (diagnostic.status !== undefined)
      console.error(`status: ${diagnostic.status}`);
    if (diagnostic.code) console.error(`code: ${diagnostic.code}`);
    console.error(`message: ${diagnostic.message}`);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
