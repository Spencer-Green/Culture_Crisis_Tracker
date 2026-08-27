import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { createInterface, type Interface } from "node:readline/promises";
import { join } from "node:path";

import { disconnectPrisma } from "@/lib/prisma";
import {
  diagnoseLlmSmokeError,
  sanitizeLlmDiagnosticMessage,
} from "@/lib/llm-smoke";
import { OPENAI_LUNA_MODEL } from "@/lib/openai-usage";
import {
  estimateStoryEvaluationUpperBound,
  runStorySynthesisEvaluation,
  selectRepresentativeStorySample,
  serializeStoryEvaluationArtifact,
  type HumanStoryEvaluation,
  type StoryEvaluationArtifact,
  type StoryEvaluationSuccess,
} from "@/services/media/story-synthesis-evaluation-core";
import { loadStorySynthesisEvaluationContext } from "@/services/media/story-synthesis-evaluation";
import {
  createOpenAIStorySynthesisClient,
  requestOpenAIStorySynthesis,
} from "@/services/media/story-synthesis";
import {
  STORY_SYNTHESIS_EVIDENCE_VERSION,
  StorySynthesisValidationError,
} from "@/services/media/story-synthesis-core";

type EvaluationCliOptions = {
  dryRun: boolean;
  yes: boolean;
  limit: number;
  hours: number;
};

function parseIntegerOption(
  argument: string,
  prefix: string,
  minimum: number,
  maximum: number,
) {
  const value = Number(argument.slice(prefix.length));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${prefix.slice(0, -1)} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

export function parseEvaluationCliOptions(
  arguments_: string[],
): EvaluationCliOptions {
  let limit = 20;
  let hours = 720;
  for (const argument of arguments_) {
    if (argument === "--dry-run" || argument === "--yes") continue;
    if (argument.startsWith("--limit=")) {
      limit = parseIntegerOption(argument, "--limit=", 1, 20);
      continue;
    }
    if (argument.startsWith("--hours=")) {
      hours = parseIntegerOption(argument, "--hours=", 24, 720);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return {
    dryRun: arguments_.includes("--dry-run"),
    yes: arguments_.includes("--yes"),
    limit,
    hours,
  };
}

function printReviewAudit(
  audit: Awaited<
    ReturnType<typeof loadStorySynthesisEvaluationContext>
  >["reviewAudit"],
) {
  console.log("HUMAN REVIEW CORPUS");
  console.log(
    `articles: ${audit.reviewedArticles}/${audit.totalArticles} reviewed · ${audit.correctArticles} CORRECT · ${audit.wrongArticles} WRONG`,
  );
  console.log(
    `corrections: sector ${audit.correctionCoverage.sector} · event ${audit.correctionCoverage.eventType} · signal ${audit.correctionCoverage.signalDirection} · legacy AI ${audit.correctionCoverage.aiTag} · importance ${audit.correctionCoverage.importance}`,
  );
  console.log(
    `eligible clusters: ${audit.eligibleClusters} · reviewed ${audit.reviewedEligibleClusters} · confirmed ${audit.confirmedEligibleClusters} · corrected ${audit.correctedEligibleClusters} · ambiguous ${audit.ambiguousEligibleClusters}`,
  );
}

function printSample(
  sample: ReturnType<typeof selectRepresentativeStorySample>,
) {
  console.log("");
  console.log(`PROPOSED SAMPLE: ${sample.length}`);
  sample.forEach((cluster, index) => {
    const reviewFlags = [
      cluster.articles.some(
        (article) => article.classificationFeedback?.reviewState === "CORRECT",
      )
        ? "CORRECT"
        : null,
      cluster.humanReviewState === "corrected" ? "CORRECTED" : null,
      cluster.sourceCount > 1 ? "MULTI_SOURCE" : "SINGLE_SOURCE",
      cluster.articles.some(
        (article) =>
          article.sectorSlug === "ai-policy" ||
          article.eventType?.startsWith("AI_") === true,
      )
        ? "AI"
        : null,
    ].filter(Boolean);
    console.log("");
    console.log(`${index + 1}. ${cluster.canonicalHeadline}`);
    console.log(`   cluster: ${cluster.clusterId}`);
    console.log(
      `   labels: ${cluster.sector ?? "ambiguous"} · ${cluster.eventType ?? "unclassified"} · ${cluster.signalDirection} · importance ${cluster.importance} · ${cluster.confidence}`,
    );
    console.log(
      `   evidence: ${cluster.articleIds.length} article(s) · ${cluster.sourceCount} publisher(s) · ${reviewFlags.join(", ")}`,
    );
  });
}

async function confirmEvaluation(
  prompt: Interface,
  count: number,
): Promise<boolean> {
  const answer = await prompt.question(
    `Run ${count} sequential GPT-5.6 Luna calls with no retries? [y/N] `,
  );
  return /^(y|yes)$/i.test(answer.trim());
}

async function optionalHumanEvaluation(
  prompt: Interface,
  result: StoryEvaluationSuccess,
): Promise<HumanStoryEvaluation> {
  console.log("");
  console.log(`HUMAN REVIEW · ${result.cluster.clusterId}`);
  const qualityAnswer = await prompt.question(
    "Synthesis quality 1–5, or S to skip: ",
  );
  const materialityAnswer = await prompt.question(
    "Materiality A=too low, B=about right, C=too high, or S: ",
  );
  const groundingAnswer = await prompt.question(
    "Grounding A=unsupported, B=minor overreach, C=fully grounded, or S: ",
  );
  const noteAnswer = await prompt.question("Short note (optional): ");
  const quality = /^[1-5]$/.test(qualityAnswer.trim())
    ? (Number(qualityAnswer.trim()) as 1 | 2 | 3 | 4 | 5)
    : null;
  const materiality = {
    A: "TOO_LOW",
    B: "ABOUT_RIGHT",
    C: "TOO_HIGH",
  } as const;
  const grounding = {
    A: "UNSUPPORTED_INCORRECT",
    B: "MINOR_OVERREACH",
    C: "FULLY_GROUNDED",
  } as const;
  return {
    synthesisQuality: quality,
    materialityJudgment:
      materiality[
        materialityAnswer.trim().toUpperCase() as keyof typeof materiality
      ] ?? null,
    groundingJudgment:
      grounding[
        groundingAnswer.trim().toUpperCase() as keyof typeof grounding
      ] ?? null,
    note: noteAnswer.trim() || null,
  };
}

function printSuccess(result: StoryEvaluationSuccess, index: number) {
  console.log("");
  console.log(`RESULT ${index + 1} · SUCCESS`);
  console.log(`STORY: ${result.cluster.headline}`);
  console.log(
    `labels: ${result.cluster.sector ?? "ambiguous"} · ${result.cluster.eventType ?? "unclassified"} · machine importance ${result.cluster.machineImportance} · effective importance ${result.cluster.effectiveImportance} · ${result.cluster.confidence}`,
  );
  console.log(
    `review: ${result.cluster.humanReviewState} · evidence ${result.cluster.articleCount} article(s) / ${result.cluster.sourceCount} publisher(s)`,
  );
  console.log(`event summary: ${result.execution.synthesis.eventSummary}`);
  console.log(`why it matters: ${result.execution.synthesis.whyItMatters}`);
  console.log(
    `evidence: ${result.execution.synthesis.evidenceStrength} · materiality: ${result.execution.synthesis.materialityLevel}`,
  );
  console.log(
    `materiality rationale: ${result.execution.synthesis.materialityRationale}`,
  );
  console.log(
    `mechanisms: ${result.execution.synthesis.mechanisms.join(", ")}`,
  );
  console.log(
    `uncertainties: ${result.execution.synthesis.uncertainties.join(" | ") || "none stated"}`,
  );
  console.log(
    `comparison: expected ${result.comparison.expectedMateriality} · Luna ${result.comparison.llmMateriality} · ${result.comparison.direction} · magnitude ${result.comparison.magnitudeBand}`,
  );
  console.log(`flags: ${result.flags.join(", ")}`);
  console.log(
    `usage: ${result.execution.usage.inputTokens} input · ${result.execution.usage.cachedInputTokens} cached · ${result.execution.usage.outputTokens} output · ${result.execution.usage.totalTokens} total`,
  );
  console.log(
    `latency: ${result.execution.latencyMs} ms · ESTIMATED COST $${result.execution.estimatedCost.totalUsd.toFixed(6)} USD`,
  );
}

async function main() {
  const options = parseEvaluationCliOptions(process.argv.slice(2));
  const context = await loadStorySynthesisEvaluationContext({
    hours: options.hours,
  });
  const sample = selectRepresentativeStorySample(
    context.candidates,
    options.limit,
  );
  printReviewAudit(context.reviewAudit);
  printSample(sample);
  const upperBound = estimateStoryEvaluationUpperBound(sample);
  console.log("");
  console.log(
    `UPPER-BOUND ESTIMATE: ${upperBound.estimatedUsage.totalTokens.toLocaleString("en-AU")} tokens · $${upperBound.estimatedCost.totalUsd.toFixed(4)} USD`,
  );
  if (options.dryRun) {
    console.log("DRY RUN: no API calls and no evaluation artifact written.");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const prompt = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  try {
    const confirmed =
      options.yes ||
      (prompt !== null && (await confirmEvaluation(prompt, sample.length)));
    if (!confirmed) {
      throw new Error(
        "Explicit confirmation is required; use --yes for non-interactive execution.",
      );
    }
    const client = createOpenAIStorySynthesisClient(apiKey);
    let successIndex = 0;
    const run = await runStorySynthesisEvaluation({
      sample,
      limit: options.limit,
      dryRun: false,
      confirmed,
      createResponse: (request) => requestOpenAIStorySynthesis(client, request),
      collectHumanEvaluation: async (result) => {
        printSuccess(result, successIndex++);
        return prompt ? optionalHumanEvaluation(prompt, result) : null;
      },
      errorMessage: (error) => {
        if (error instanceof StorySynthesisValidationError) {
          return `malformed structured response · ${error.message}`;
        }
        const diagnostic = diagnoseLlmSmokeError(error, apiKey);
        return [
          diagnostic.category,
          diagnostic.status ? `status ${diagnostic.status}` : null,
          diagnostic.code ?? null,
          diagnostic.message,
        ]
          .filter(Boolean)
          .join(" · ");
      },
    });
    for (const record of run.records) {
      if (record.status === "FAILURE") {
        console.log("");
        console.log(`RESULT · FAILURE · ${record.cluster.headline}`);
        console.log(record.error);
        if (record.usage && record.latencyMs !== null && record.estimatedCost) {
          console.log(
            `usage: ${record.usage.inputTokens} input · ${record.usage.cachedInputTokens} cached · ${record.usage.outputTokens} output · ${record.usage.totalTokens} total`,
          );
          console.log(
            `latency: ${record.latencyMs} ms · ESTIMATED COST $${record.estimatedCost.totalUsd.toFixed(6)} USD`,
          );
        }
      }
    }
    const generatedAt = new Date();
    const artifact: StoryEvaluationArtifact = {
      artifactVersion: "story-synthesis-evaluation-v1",
      generatedAt: generatedAt.toISOString(),
      model: OPENAI_LUNA_MODEL,
      evidenceVersion: STORY_SYNTHESIS_EVIDENCE_VERSION,
      reviewAudit: context.reviewAudit,
      run,
    };
    const directory = join(
      process.cwd(),
      "data",
      "evaluations",
      "story-synthesis",
    );
    await mkdir(directory, { recursive: true });
    const path = join(
      directory,
      `${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    await writeFile(
      path,
      serializeStoryEvaluationArtifact(artifact, [apiKey]),
      "utf8",
    );
    console.log("");
    console.log("EVALUATION SUMMARY");
    console.log(
      `calls ${run.summary.calls} · successes ${run.summary.successes} · failures ${run.summary.failures}`,
    );
    console.log(
      `tokens ${run.summary.usage.inputTokens} input · ${run.summary.usage.cachedInputTokens} cached · ${run.summary.usage.outputTokens} output · ${run.summary.usage.totalTokens} total`,
    );
    console.log(
      `ESTIMATED TOTAL COST $${run.summary.estimatedCost.totalUsd.toFixed(6)} USD · average $${run.summary.averageCostPerMeteredCallUsd.toFixed(6)}/metered story`,
    );
    console.log(
      `usage captured for ${run.summary.meteredCalls}/${run.summary.calls} call(s)`,
    );
    console.log(
      `latency median ${run.summary.medianLatencyMs ?? "n/a"} ms · p95 ${run.summary.p95LatencyMs ?? "n/a"} ms`,
    );
    console.log(`local artifact: ${path}`);
  } finally {
    prompt?.close();
  }
}

main()
  .catch((error) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    console.error("STORY EVALUATION: FAIL");
    console.error(
      sanitizeLlmDiagnosticMessage(
        error instanceof Error ? error.message : "Story evaluation failed.",
        apiKey,
      ),
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
