import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  hasSuccessfulNativeSearch,
  tracedSourceUrls,
  record,
  successfulCall,
} from "@/services/research/research-native-evidence";
import {
  materializeExtraction,
  RESEARCH_EXTRACTION_INSTRUCTIONS,
  RESEARCH_EXTRACTION_JSON_SCHEMA,
  RESEARCH_EXTRACTION_VERSION,
} from "@/services/research/research-extraction";

import type {
  NativeSearchTraceV1,
  ResearchProvider,
  ResearchProviderRequest,
  ResearchProviderResult,
  ResearchProviderUsage,
  ResearchResponseDiagnosticsV1,
  SanitizedResearchValue,
} from "@/services/research/research-types";

export const DEEPSEEK_RESEARCH_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_RESEARCH_MODEL = "deepseek-v4-pro";
export const DEEPSEEK_RESEARCH_PROVIDER = "deepseek";
export const DEEPSEEK_RESEARCH_TIMEOUT_MS = 180_000;
export const DEEPSEEK_STAGE1_MAX_OUTPUT_TOKENS = 8_000;
export const DEEPSEEK_STAGE1_REASONING_EFFORT = "low" as const;
export const DEEPSEEK_EXTRACTION_MAX_OUTPUT_TOKENS = 4_000;
export const DEEPSEEK_RESEARCH_PIPELINE_VERSION = "deepseek-native-replay-v1";

const MAX_SANITIZED_DEPTH = 6;
const MAX_SANITIZED_ARRAY_ITEMS = 24;
const MAX_SANITIZED_OBJECT_KEYS = 40;
const MAX_SANITIZED_STRING_LENGTH = 1_200;
const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|api[_-]?key|cookie|credential|environment|headers?|reasoning|chain[_ -]?of[_ -]?thought|encrypted_content|secret)/i;
const SECRET_VALUE_PATTERN = /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,})/i;

type DeepSeekResearchRequest = Omit<
  ResponseCreateParamsNonStreaming,
  "model" | "tool_choice"
> & {
  model: string;
  tool_choice?:
    ResponseCreateParamsNonStreaming["tool_choice"] | { type: "web_search" };
};

export type DeepSeekResearchFailureDiagnostics = {
  providerRequestId: string | null;
  model: string | null;
  status: string | null;
  nativeSearchTrace: NativeSearchTraceV1;
  responseDiagnostics: ResearchResponseDiagnosticsV1;
  usage: ResearchProviderUsage | null;
  latencyMs: number;
};

export type DeepSeekResearchFailureKind =
  | "EXECUTION_FAILURE"
  | "NO_FINAL_TEXT"
  | "NO_WEB_SEARCH"
  | "EXTRACTION_FAILURE";

export class DeepSeekResearchResponseError extends Error {
  readonly diagnostics: DeepSeekResearchFailureDiagnostics;
  readonly failureKind: DeepSeekResearchFailureKind;

  constructor(
    message: string,
    diagnostics: DeepSeekResearchFailureDiagnostics,
    failureKind: DeepSeekResearchFailureKind,
  ) {
    super(message);
    this.name = "DeepSeekResearchResponseError";
    this.diagnostics = diagnostics;
    this.failureKind = failureKind;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncate(
  value: string,
  maximumLength = MAX_SANITIZED_STRING_LENGTH,
): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, maximumLength)}…[TRUNCATED]`;
}

function shouldRedactString(
  value: string,
  secrets: readonly string[],
): boolean {
  return (
    SECRET_VALUE_PATTERN.test(value) ||
    secrets.some((secret) => secret.length > 0 && value.includes(secret))
  );
}

export function sanitizeResearchTraceValue(
  value: unknown,
  options?: { secrets?: readonly string[]; depth?: number },
): SanitizedResearchValue {
  const secrets = options?.secrets ?? [];
  const depth = options?.depth ?? 0;
  if (depth > MAX_SANITIZED_DEPTH) return "[DEPTH_LIMIT]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") {
    return shouldRedactString(value, secrets)
      ? REDACTED_VALUE
      : truncate(value);
  }
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_SANITIZED_ARRAY_ITEMS)
      .map((item) =>
        sanitizeResearchTraceValue(item, { secrets, depth: depth + 1 }),
      );
    if (value.length > MAX_SANITIZED_ARRAY_ITEMS) {
      sanitized.push(
        `[${value.length - MAX_SANITIZED_ARRAY_ITEMS} ITEMS OMITTED]`,
      );
    }
    return sanitized;
  }
  if (!isRecord(value)) return truncate(String(value));

  const sanitized: Record<string, SanitizedResearchValue> = {};
  const entries = Object.entries(value).slice(0, MAX_SANITIZED_OBJECT_KEYS);
  for (const [key, nestedValue] of entries) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED_VALUE
      : sanitizeResearchTraceValue(nestedValue, {
          secrets,
          depth: depth + 1,
        });
  }
  if (Object.keys(value).length > MAX_SANITIZED_OBJECT_KEYS) {
    sanitized._omittedKeys =
      Object.keys(value).length - MAX_SANITIZED_OBJECT_KEYS;
  }
  return sanitized;
}

export function sanitizeResearchDiagnostic(
  message: string,
  secrets: readonly string[] = [],
  maximumLength = MAX_SANITIZED_STRING_LENGTH,
): string {
  let sanitized = message.replace(
    /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,})/gi,
    REDACTED_VALUE,
  );
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, REDACTED_VALUE);
  }
  return truncate(sanitized, maximumLength);
}

export function extractNativeSearchTrace(
  response: unknown,
  secrets: readonly string[] = [],
): NativeSearchTraceV1 {
  const responseRecord = isRecord(response) ? response : {};
  const output = Array.isArray(responseRecord.output)
    ? responseRecord.output
    : [];
  const calls: NativeSearchTraceV1["calls"] = [];
  const annotations: NativeSearchTraceV1["annotations"] = [];

  output.forEach((item, outputSequence) => {
    if (!isRecord(item)) return;
    if (item.type === "web_search_call") {
      calls.push({
        sequence: outputSequence,
        item: sanitizeResearchTraceValue(item, { secrets }),
      });
    }
    if (item.type !== "message" || !Array.isArray(item.content)) return;
    item.content.forEach((content, contentSequence) => {
      if (!isRecord(content) || content.type !== "output_text") return;
      const contentAnnotations = Array.isArray(content.annotations)
        ? content.annotations
        : [];
      contentAnnotations.forEach((annotation, annotationSequence) => {
        annotations.push({
          outputSequence,
          contentSequence,
          annotationSequence,
          annotation: sanitizeResearchTraceValue(annotation, { secrets }),
        });
      });
    });
  });

  return { calls, annotations };
}

export function extractResearchResponseDiagnostics(
  response: unknown,
  secrets: readonly string[] = [],
): ResearchResponseDiagnosticsV1 {
  const responseRecord = isRecord(response) ? response : {};
  const output = Array.isArray(responseRecord.output)
    ? responseRecord.output
    : [];
  const outputItemTypes: string[] = [];
  const messageItems: ResearchResponseDiagnosticsV1["messageItems"] = [];

  output.forEach((item, sequence) => {
    if (!isRecord(item)) {
      outputItemTypes.push(typeof item);
      return;
    }
    const itemType = readString(item, "type") ?? "unknown";
    outputItemTypes.push(itemType);
    if (itemType !== "message") return;
    const content = Array.isArray(item.content) ? item.content : [];
    const contentTypes: string[] = [];
    let outputTextPresent = false;
    let annotationCount = 0;
    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        contentTypes.push(typeof contentItem);
        continue;
      }
      const contentType = readString(contentItem, "type") ?? "unknown";
      contentTypes.push(contentType);
      if (
        contentType === "output_text" &&
        typeof contentItem.text === "string" &&
        contentItem.text.length > 0
      ) {
        outputTextPresent = true;
      }
      if (Array.isArray(contentItem.annotations)) {
        annotationCount += contentItem.annotations.length;
      }
    }
    messageItems.push({
      sequence,
      id: readString(item, "id"),
      status: readString(item, "status"),
      contentTypes,
      outputTextPresent,
      annotationCount,
    });
  });

  return {
    responseId: readString(responseRecord, "id"),
    responseStatus: readString(responseRecord, "status"),
    outputItemCount: output.length,
    outputItemTypes,
    messageItems,
    incompleteDetails: sanitizeResearchTraceValue(
      responseRecord.incomplete_details ?? null,
      { secrets },
    ),
    error: sanitizeResearchTraceValue(responseRecord.error ?? null, {
      secrets,
    }),
  };
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (
      !isRecord(item) ||
      item.type !== "message" ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (const content of item.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("").trim();
}

function mapUsage(response: Record<string, unknown>): ResearchProviderUsage {
  if (!isRecord(response.usage)) {
    throw new Error("DeepSeek response did not include token usage.");
  }
  const usage = response.usage;
  const inputTokens = readNumber(usage, "input_tokens");
  const outputTokens = readNumber(usage, "output_tokens");
  const totalTokens = readNumber(usage, "total_tokens");
  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    throw new Error("DeepSeek response contained invalid token usage.");
  }
  const inputDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : {};
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : {};
  return {
    inputTokens,
    cachedInputTokens: readNumber(inputDetails, "cached_tokens") ?? 0,
    outputTokens,
    reasoningTokens: readNumber(outputDetails, "reasoning_tokens") ?? 0,
    totalTokens,
  };
}

function mapUsageIfPresent(
  response: Record<string, unknown>,
): ResearchProviderUsage | null {
  try {
    return mapUsage(response);
  } catch {
    return null;
  }
}

function buildFailureDiagnostics(
  response: Record<string, unknown>,
  latencyMs: number,
  secrets: readonly string[],
): DeepSeekResearchFailureDiagnostics {
  return {
    providerRequestId: readString(response, "id"),
    model: readString(response, "model"),
    status: readString(response, "status"),
    nativeSearchTrace: extractNativeSearchTrace(response, secrets),
    responseDiagnostics: extractResearchResponseDiagnostics(response, secrets),
    usage: mapUsageIfPresent(response),
    latencyMs,
  };
}

function mapDeepSeekResponse(
  response: unknown,
  latencyMs: number,
  secrets: readonly string[] = [],
  options: { requireNativeWebSearch: boolean; requireFinalText?: boolean },
): ResearchProviderResult {
  if (!isRecord(response)) {
    throw new Error("DeepSeek returned an invalid Responses API payload.");
  }
  const diagnostics = buildFailureDiagnostics(response, latencyMs, secrets);
  const status = readString(response, "status");
  if (status !== "completed") {
    const reason = isRecord(response.incomplete_details)
      ? readString(response.incomplete_details, "reason")
      : null;
    throw new DeepSeekResearchResponseError(
      `DeepSeek research response did not complete${reason ? `: ${reason}` : "."}`,
      diagnostics,
      "EXECUTION_FAILURE",
    );
  }
  const outputText = extractOutputText(response);
  if (
    diagnostics.responseDiagnostics.messageItems.some(
      (item) => item.status !== null && item.status !== "completed",
    )
  ) {
    throw new DeepSeekResearchResponseError(
      "DeepSeek returned an unfinished message in a completed response.",
      diagnostics,
      "EXECUTION_FAILURE",
    );
  }
  if (options.requireFinalText !== false && !outputText) {
    throw new DeepSeekResearchResponseError(
      "DeepSeek returned no usable final text output.",
      diagnostics,
      "NO_FINAL_TEXT",
    );
  }
  const nativeSearchTrace = diagnostics.nativeSearchTrace;
  if (
    options.requireNativeWebSearch &&
    !hasSuccessfulNativeSearch(nativeSearchTrace)
  ) {
    throw new DeepSeekResearchResponseError(
      "DeepSeek response contained no successful native search action; live research was not established.",
      diagnostics,
      "NO_WEB_SEARCH",
    );
  }
  if (!diagnostics.usage)
    throw new DeepSeekResearchResponseError(
      "DeepSeek returned invalid or missing token usage.",
      diagnostics,
      "EXECUTION_FAILURE",
    );
  return {
    provider: DEEPSEEK_RESEARCH_PROVIDER,
    model: readString(response, "model") ?? DEEPSEEK_RESEARCH_MODEL,
    providerRequestId: readString(response, "id"),
    status: "completed",
    outputText,
    nativeSearchTrace,
    responseDiagnostics: diagnostics.responseDiagnostics,
    usage: diagnostics.usage,
    latencyMs,
  };
}

export function mapDeepSeekNativeResearchResponse(
  response: unknown,
  latencyMs: number,
  secrets: readonly string[] = [],
): ResearchProviderResult {
  return mapDeepSeekResponse(response, latencyMs, secrets, {
    requireNativeWebSearch: true,
  });
}

export function buildDeepSeekNativeResearchRequest(
  request: ResearchProviderRequest,
): DeepSeekResearchRequest {
  return {
    model: DEEPSEEK_RESEARCH_MODEL,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: DEEPSEEK_STAGE1_MAX_OUTPUT_TOKENS,
    reasoning: { effort: DEEPSEEK_STAGE1_REASONING_EFFORT },
    tools: [{ type: "web_search" }],
    tool_choice: { type: "web_search" },
  };
}

type SendResearchRequest = (
  request: DeepSeekResearchRequest,
  timeoutMs: number,
) => Promise<unknown>;

/** Local phase boundary, not a fabricated provider completion event. */
export class ResearchAcquisitionBoundary {
  constructor(
    readonly response: Record<string, unknown>,
    readonly reason: "EVIDENCE_READY" | "ACTION_BUDGET",
  ) {}
}

export function acquisitionBoundaryReason(
  trace: NativeSearchTraceV1,
): "EVIDENCE_READY" | "ACTION_BUDGET" | null {
  const items = trace.calls.map((call) => call.item).filter(record);
  const opens = items.filter(
    (item) =>
      record(item.action) &&
      ["open_page", "find_in_page"].includes(String(item.action.type)),
  );
  if (hasSuccessfulNativeSearch(trace) && opens.some(successfulCall))
    return "EVIDENCE_READY";
  const searches = items.filter(
    (item) => record(item.action) && item.action.type === "search",
  );
  if (
    opens.length >= 3 ||
    (searches.length >= 2 && tracedSourceUrls(trace).size > 0) ||
    items.length >= 6
  )
    return "ACTION_BUDGET";
  return null;
}

function addUsage(
  first: ResearchProviderUsage,
  second: ResearchProviderUsage,
): ResearchProviderUsage {
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    cachedInputTokens: first.cachedInputTokens + second.cachedInputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    reasoningTokens: first.reasoningTokens + second.reasoningTokens,
    totalTokens: first.totalTokens + second.totalTokens,
  };
}

/** Fixed two-phase execution. No repair, retry, model fallback or tool-text parsing. */
export async function executeDeepSeekResearch(
  request: ResearchProviderRequest,
  send: SendResearchRequest,
  secrets: readonly string[] = [],
): Promise<ResearchProviderResult> {
  const start = Date.now();
  const received = await send(
    buildDeepSeekNativeResearchRequest(request),
    120_000,
  );
  const boundary =
    received instanceof ResearchAcquisitionBoundary ? received : null;
  const raw = boundary ? boundary.response : received;
  const boundaryDiagnostics = boundary
    ? buildFailureDiagnostics(boundary.response, Date.now() - start, secrets)
    : null;
  if (
    boundaryDiagnostics &&
    !hasSuccessfulNativeSearch(boundaryDiagnostics.nativeSearchTrace)
  )
    throw new DeepSeekResearchResponseError(
      "Acquisition budget ended without successful native search",
      boundaryDiagnostics,
      "NO_WEB_SEARCH",
    );
  const zeroUsage: ResearchProviderUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  // Aggregate usage below contains only reported tokens. Phase usage remains null
  // and durable combined usage is null whenever the provider omits accounting.
  const acquisition: ResearchProviderResult = boundaryDiagnostics
    ? {
        provider: DEEPSEEK_RESEARCH_PROVIDER,
        model: boundaryDiagnostics.model ?? DEEPSEEK_RESEARCH_MODEL,
        providerRequestId: boundaryDiagnostics.providerRequestId,
        status: "completed",
        outputText: "",
        nativeSearchTrace: boundaryDiagnostics.nativeSearchTrace,
        responseDiagnostics: boundaryDiagnostics.responseDiagnostics,
        usage: boundaryDiagnostics.usage ?? zeroUsage,
        latencyMs: boundaryDiagnostics.latencyMs,
      }
    : mapDeepSeekResponse(raw, Date.now() - start, secrets, {
        requireNativeWebSearch: true,
        requireFinalText: false,
      });
  const usageComplete =
    !boundaryDiagnostics || boundaryDiagnostics.usage !== null;
  const phases: NonNullable<ResearchResponseDiagnosticsV1["phases"]> = [
    {
      phase: "acquisition",
      responseId: acquisition.providerRequestId,
      model: acquisition.model,
      status: boundary
        ? `CLIENT_STOPPED_${boundary.reason}`
        : acquisition.status,
      usage: usageComplete ? acquisition.usage : null,
      latencyMs: acquisition.latencyMs,
    },
  ];
  const extractionStart = Date.now();
  let extraction: ResearchProviderResult | null = null;
  let extractionRaw: unknown = null;
  try {
    // Replay only original provider tool items. Never replay assistant claims or
    // construct tool calls from XML/DSML emitted as ordinary text.
    const output = isRecord(raw) && Array.isArray(raw.output) ? raw.output : [];
    const calls = output.filter(
      (item) => isRecord(item) && item.type === "web_search_call",
    );
    if (JSON.stringify(calls).length > 100_000)
      throw new Error("Native replay exceeds bounded context limit");
    const remaining = DEEPSEEK_RESEARCH_TIMEOUT_MS - (Date.now() - start);
    if (remaining <= 0)
      throw new Error("Research deadline exceeded before extraction");
    extractionRaw = await send(
      {
        model: DEEPSEEK_RESEARCH_MODEL,
        instructions: `${RESEARCH_EXTRACTION_INSTRUCTIONS}\nReturn exactly one JSON object and nothing else. JSON schema: ${JSON.stringify(RESEARCH_EXTRACTION_JSON_SCHEMA)}`,
        input: [
          { role: "user", content: request.input },
          ...calls,
          {
            role: "user",
            content: `Extract from the restored native results. Observed URL allowlist: ${JSON.stringify([...tracedSourceUrls(acquisition.nativeSearchTrace)])}. Native call manifest (use these exact IDs, never search_N_result_M identifiers): ${JSON.stringify(calls.map((call) => ({ id: call.id, status: call.status, action: call.action })))}. Include only allowed URLs, even when other results are visible. Extraction version: ${RESEARCH_EXTRACTION_VERSION}.`,
          },
        ] as ResponseCreateParamsNonStreaming["input"],
        tools: [],
        tool_choice: "none",
        reasoning: { effort: "none" },
        max_output_tokens: DEEPSEEK_EXTRACTION_MAX_OUTPUT_TOKENS,
        text: { format: { type: "json_object" } },
      },
      Math.min(60_000, remaining),
    );
    extraction = mapDeepSeekResponse(
      extractionRaw,
      Date.now() - extractionStart,
      secrets,
      { requireNativeWebSearch: false },
    );
    if (extraction.nativeSearchTrace.calls.length)
      throw new Error("Extraction unexpectedly performed web research");
    if (extraction.usage.reasoningTokens !== 0)
      throw new Error("Extraction unexpectedly used reasoning tokens");
    const materialized = materializeExtraction(
      extraction.outputText,
      acquisition.nativeSearchTrace,
    );
    phases.push({
      phase: "extraction",
      responseId: extraction.providerRequestId,
      model: extraction.model,
      status: extraction.status,
      usage: extraction.usage,
      latencyMs: extraction.latencyMs,
    });
    return {
      ...acquisition,
      outputText: materialized.artifact,
      latencyMs: Date.now() - start,
      usage: addUsage(acquisition.usage, extraction.usage),
      responseDiagnostics: {
        ...acquisition.responseDiagnostics,
        pipelineVersion: DEEPSEEK_RESEARCH_PIPELINE_VERSION,
        phases,
        evidenceBindings: materialized.bindings,
        usageComplete,
        acquisitionStopReason: boundary?.reason,
      },
    };
  } catch (error) {
    const failure =
      error instanceof DeepSeekResearchResponseError
        ? error.diagnostics
        : buildFailureDiagnostics(
            isRecord(extractionRaw) ? extractionRaw : {},
            Date.now() - extractionStart,
            secrets,
          );
    phases.push({
      phase: "extraction",
      responseId: failure.providerRequestId,
      model: failure.model ?? DEEPSEEK_RESEARCH_MODEL,
      status: failure.status ?? "failed",
      usage: failure.usage,
      latencyMs: failure.latencyMs,
    });
    throw new DeepSeekResearchResponseError(
      sanitizeResearchDiagnostic(
        `Extraction failed: ${error instanceof Error ? error.message : "unknown error"}`,
        secrets,
      ),
      {
        ...failure,
        nativeSearchTrace: acquisition.nativeSearchTrace,
        latencyMs: Date.now() - start,
        usage: failure.usage
          ? addUsage(acquisition.usage, failure.usage)
          : acquisition.usage,
        responseDiagnostics: {
          ...failure.responseDiagnostics,
          pipelineVersion: DEEPSEEK_RESEARCH_PIPELINE_VERSION,
          extractionOutputText: extraction
            ? sanitizeResearchDiagnostic(
                extraction.outputText.slice(0, 16000),
                secrets,
                16000,
              )
            : undefined,
          phases,
          usageComplete: usageComplete && failure.usage !== null,
          acquisitionStopReason: boundary?.reason,
        },
      },
      "EXTRACTION_FAILURE",
    );
  }
}

export function createDeepSeekResearchProvider(
  apiKey: string,
): ResearchProvider {
  const client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_RESEARCH_BASE_URL,
    maxRetries: 0,
    timeout: DEEPSEEK_RESEARCH_TIMEOUT_MS,
  });

  return {
    async researchWithNativeWeb(request) {
      return executeDeepSeekResearch(
        request,
        async (body, timeout) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);
          const startedAt = Date.now();
          const output: unknown[] = [];
          let lastResponse: Record<string, unknown> = {};
          try {
            const stream = await client.responses.create(
              {
                ...body,
                stream: true,
              } as unknown as import("openai/resources/responses/responses").ResponseCreateParamsStreaming,
              { timeout, signal: controller.signal },
            );
            for await (const event of stream) {
              if ("response" in event && isRecord(event.response))
                lastResponse = event.response;
              if (
                event.type === "response.output_item.done" &&
                event.item.type !== "reasoning"
              ) {
                output.push(event.item);
                if (
                  body.tool_choice &&
                  typeof body.tool_choice === "object" &&
                  body.tool_choice.type === "web_search"
                ) {
                  const reason = acquisitionBoundaryReason(
                    extractNativeSearchTrace({ output }),
                  );
                  if (reason) {
                    controller.abort();
                    return new ResearchAcquisitionBoundary(
                      { ...lastResponse, output },
                      reason,
                    );
                  }
                }
              }
              if (
                [
                  "response.completed",
                  "response.incomplete",
                  "response.failed",
                ].includes(event.type)
              )
                return lastResponse;
            }
            throw new Error(
              "DeepSeek stream ended without a terminal response",
            );
          } catch (error) {
            throw new DeepSeekResearchResponseError(
              sanitizeResearchDiagnostic(
                `DeepSeek stream failed: ${error instanceof Error ? error.message : "unknown error"}`,
                [apiKey],
              ),
              buildFailureDiagnostics(
                { ...lastResponse, status: "incomplete", output },
                Date.now() - startedAt,
                [apiKey],
              ),
              "EXECUTION_FAILURE",
            );
          } finally {
            clearTimeout(timer);
          }
        },
        [apiKey],
      );
    },
  };
}
