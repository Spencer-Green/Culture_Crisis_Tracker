import {
  sanitizeResearchDiagnostic,
  type DeepSeekResearchFailureDiagnostics,
} from "@/services/research/deepseek-research-provider";
import {
  ResearchExecutionError,
  ResearchValidationError,
} from "@/services/research/research-runner";
import type {
  ResearchProviderResult,
  ResearchRunResult,
  ResearchStage1RunResult,
} from "@/services/research/research-types";

const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const MAX_ARTIFACT_PRINT_LENGTH = 12_000;

function safeText(value: string, secrets: readonly string[]): string {
  const sanitized = sanitizeResearchDiagnostic(
    value,
    secrets,
    MAX_ARTIFACT_PRINT_LENGTH,
  )
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(CONTROL_CHARACTER_PATTERN, "");
  return sanitized.length <= MAX_ARTIFACT_PRINT_LENGTH
    ? sanitized
    : `${sanitized.slice(0, MAX_ARTIFACT_PRINT_LENGTH)}…[TRUNCATED]`;
}

function heading(value: string): string[] {
  return [value, "-".repeat(value.length)];
}

function actionTypesFromCalls(
  calls: ResearchProviderResult["nativeSearchTrace"]["calls"],
): string[] {
  const values = new Set<string>();
  for (const call of calls) {
    if (
      typeof call.item === "object" &&
      call.item !== null &&
      !Array.isArray(call.item) &&
      typeof call.item.action === "object" &&
      call.item.action !== null &&
      !Array.isArray(call.item.action) &&
      typeof call.item.action.type === "string"
    ) {
      values.add(call.item.action.type);
    }
  }
  return [...values];
}

function providerResultLines(
  label: string,
  provider: ResearchProviderResult,
): string[] {
  const diagnostics = provider.responseDiagnostics;
  return [
    `${label} provider: ${provider.provider}`,
    `${label} model: ${provider.model}`,
    `${label} response ID: ${provider.providerRequestId ?? "not exposed"}`,
    `${label} status: ${diagnostics.responseStatus ?? "not exposed"}`,
    `${label} latency: ${provider.latencyMs} ms`,
    `${label} output items: ${diagnostics.outputItemCount}`,
    `${label} output item types: ${diagnostics.outputItemTypes.join(" -> ") || "none"}`,
    `${label} message items: ${diagnostics.messageItems.length}`,
    ...diagnostics.messageItems.map(
      (message) =>
        `${label} message #${message.sequence}: id=${message.id ?? "not exposed"} status=${message.status ?? "not exposed"} content=${message.contentTypes.join(",") || "none"} output_text=${message.outputTextPresent ? "present" : "absent"} annotations=${message.annotationCount}`,
    ),
    `${label} incomplete details: ${JSON.stringify(diagnostics.incompleteDetails)}`,
    `${label} provider error: ${JSON.stringify(diagnostics.error)}`,
    `${label} web_search calls: ${provider.nativeSearchTrace.calls.length}`,
    `${label} action types: ${actionTypesFromCalls(provider.nativeSearchTrace.calls).join(", ") || "none"}`,
    `${label} annotations/citations: ${provider.nativeSearchTrace.annotations.length}`,
    `${label} input tokens: ${provider.usage.inputTokens}`,
    `${label} cached input tokens: ${provider.usage.cachedInputTokens}`,
    `${label} output tokens: ${provider.usage.outputTokens}`,
    `${label} reasoning tokens: ${provider.usage.reasoningTokens}`,
    `${label} total tokens: ${provider.usage.totalTokens}`,
  ];
}

function failureDiagnosticsLines(
  label: string,
  diagnostics: DeepSeekResearchFailureDiagnostics,
): string[] {
  const response = diagnostics.responseDiagnostics;
  return [
    `${label} response ID: ${diagnostics.providerRequestId ?? "not exposed"}`,
    `${label} model: ${diagnostics.model ?? "not exposed"}`,
    `${label} status: ${diagnostics.status ?? "not exposed"}`,
    `${label} latency: ${diagnostics.latencyMs} ms`,
    `${label} output items: ${response.outputItemCount}`,
    `${label} output item types: ${response.outputItemTypes.join(" -> ") || "none"}`,
    `${label} message items: ${response.messageItems.length}`,
    ...response.messageItems.map(
      (message) =>
        `${label} message #${message.sequence}: id=${message.id ?? "not exposed"} status=${message.status ?? "not exposed"} content=${message.contentTypes.join(",") || "none"} output_text=${message.outputTextPresent ? "present" : "absent"} annotations=${message.annotationCount}`,
    ),
    `${label} incomplete details: ${JSON.stringify(response.incompleteDetails)}`,
    `${label} provider error: ${JSON.stringify(response.error)}`,
    `${label} web_search calls: ${diagnostics.nativeSearchTrace.calls.length}`,
    `${label} action types: ${actionTypesFromCalls(diagnostics.nativeSearchTrace.calls).join(", ") || "none"}`,
    `${label} annotations/citations: ${diagnostics.nativeSearchTrace.annotations.length}`,
    ...(diagnostics.usage
      ? [
          `${label} input tokens: ${diagnostics.usage.inputTokens}`,
          `${label} cached input tokens: ${diagnostics.usage.cachedInputTokens}`,
          `${label} output tokens: ${diagnostics.usage.outputTokens}`,
          `${label} reasoning tokens: ${diagnostics.usage.reasoningTokens}`,
          `${label} total tokens: ${diagnostics.usage.totalTokens}`,
        ]
      : []),
  ];
}

function traceLines(
  label: string,
  provider: ResearchProviderResult,
  secrets: readonly string[],
): string[] {
  return provider.nativeSearchTrace.calls.map(
    (call) =>
      `${label} #${call.sequence}: ${safeText(JSON.stringify(call.item), secrets)}`,
  );
}

function annotationLines(
  label: string,
  provider: ResearchProviderResult,
  secrets: readonly string[],
): string[] {
  return provider.nativeSearchTrace.annotations.map(
    (annotation) =>
      `${label} #${annotation.outputSequence}.${annotation.contentSequence}.${annotation.annotationSequence}: ${safeText(JSON.stringify(annotation.annotation), secrets)}`,
  );
}

function stage1Lines(
  stage1: ResearchStage1RunResult,
  secrets: readonly string[],
): string[] {
  return [
    ...providerResultLines("Stage 1", stage1.provider),
    ...traceLines("Stage 1 trace", stage1.provider, secrets),
    ...annotationLines("Stage 1 annotation", stage1.provider, secrets),
    "Stage 1 artifact:",
    safeText(stage1.artifact, secrets),
  ];
}

export function formatResearchFailure(
  error: unknown,
  secrets: readonly string[] = [],
): string {
  const lines = ["RESEARCH RUN: FAIL"];
  if (error instanceof ResearchValidationError) {
    lines.push(`Failure code: ${error.code}`);
    lines.push(safeText(error.message, secrets));
    lines.push(
      ...error.reasons.map((reason) => `- ${safeText(reason, secrets)}`),
    );
    if (error.stage1) lines.push(...stage1Lines(error.stage1, secrets));
    if (error.providerResult) {
      const label = error.stage1 ? "Stage 2" : "Stage 1";
      lines.push(...providerResultLines(label, error.providerResult));
      lines.push(
        ...traceLines(`${label} trace`, error.providerResult, secrets),
      );
      lines.push(
        ...annotationLines(
          `${label} annotation`,
          error.providerResult,
          secrets,
        ),
      );
    }
    return lines.join("\n");
  }
  if (error instanceof ResearchExecutionError) {
    if (error.code) lines.push(`Failure code: ${error.code}`);
    lines.push(safeText(error.message, secrets));
    if (error.stage1) lines.push(...stage1Lines(error.stage1, secrets));
    if (error.providerDiagnostics) {
      lines.push(
        ...failureDiagnosticsLines(
          error.stage1 ? "Stage 2" : "Stage 1",
          error.providerDiagnostics,
        ),
      );
      lines.push(
        ...error.providerDiagnostics.nativeSearchTrace.calls.map(
          (call) =>
            `Failure trace #${call.sequence}: ${safeText(JSON.stringify(call.item), secrets)}`,
        ),
      );
      lines.push(
        ...error.providerDiagnostics.nativeSearchTrace.annotations.map(
          (annotation) =>
            `Failure annotation #${annotation.outputSequence}.${annotation.contentSequence}.${annotation.annotationSequence}: ${safeText(JSON.stringify(annotation.annotation), secrets)}`,
        ),
      );
    }
    return lines.join("\n");
  }
  const message = error instanceof Error ? error.message : String(error);
  lines.push(safeText(message, secrets));
  return lines.join("\n");
}

export function formatResearchRun(
  run: ResearchRunResult,
  secrets: readonly string[] = [],
  persistence?: {
    runId: string;
    sourceDocumentIds: string[];
    candidateIds: string[];
  },
): string {
  const lines = [
    ...heading("RESEARCH RUN"),
    `Task: ${run.task.id}`,
    `Task version: ${run.task.version}`,
    `Started: ${run.startedAt.toISOString()}`,
    `Completed: ${run.completedAt.toISOString()}`,
    "",
    ...heading("STAGE 1 — LIVE RESEARCH"),
    ...providerResultLines("Stage 1", run.stage1.provider),
    "",
    ...heading("NATIVE WEB TRACE"),
    ...traceLines("Trace", run.stage1.provider, secrets),
    ...annotationLines("Annotation", run.stage1.provider, secrets),
    `Annotations/citations: ${run.stage1.provider.nativeSearchTrace.annotations.length}`,
    "",
    ...heading("STAGE 1 ARTIFACT"),
    safeText(run.stage1.artifact, secrets),
    "",
    ...heading("STAGE 2 — STRUCTURING"),
    ...providerResultLines("Stage 2", run.stage2.provider),
    "",
    ...heading("CANDIDATES"),
    run.result.taskSummary,
  ];
  if (run.result.candidates.length === 0) {
    lines.push("No valid research candidates were returned.");
  }
  run.result.candidates.forEach((candidate, index) => {
    lines.push(`${index + 1}. ${candidate.source.title}`);
    lines.push(`Publisher: ${candidate.source.publisher}`);
    lines.push(`Source URL: ${candidate.source.url}`);
    lines.push(`Claim: ${candidate.evidence.claim}`);
    lines.push(
      `Limitations: ${candidate.evidence.limitations.join(" | ") || "none stated"}`,
    );
  });
  lines.push(
    "",
    ...heading("CROSS-STAGE VALIDATION"),
    `Matched candidates: ${run.crossStageValidation.matchedCandidates}`,
    `Validation reasons: ${run.crossStageValidation.reasons.join(" | ") || "none"}`,
    "",
    ...heading("USAGE"),
    `Stage 1 total tokens: ${run.stage1.provider.usage.totalTokens}`,
    `Stage 1 latency: ${run.stage1.provider.latencyMs} ms`,
    `Stage 2 total tokens: ${run.stage2.provider.usage.totalTokens}`,
    `Stage 2 latency: ${run.stage2.provider.latencyMs} ms`,
    `Combined total tokens: ${run.usage.totalTokens}`,
    `Combined latency: ${run.usage.totalLatencyMs} ms`,
    "",
    ...heading("STATUS"),
    persistence ? "PERSISTED SHADOW STAGING" : "EPHEMERAL",
    persistence ? `STAGING RUN: ${persistence.runId}` : "NOT PERSISTED",
    ...(persistence
      ? [
          `STAGING SOURCES: ${persistence.sourceDocumentIds.join(", ") || "none"}`,
          `STAGING CANDIDATES: ${persistence.candidateIds.join(", ") || "none"}`,
        ]
      : []),
    "NOT CANONICAL",
    "NOT INGESTED",
  );
  return lines.join("\n");
}
