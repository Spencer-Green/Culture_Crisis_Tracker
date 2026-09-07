import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

import { RESEARCH_RESULT_V1_JSON_SCHEMA } from "@/services/research/research-schema";
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
export const DEEPSEEK_RESEARCH_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_RESEARCH_PROVIDER = "deepseek";
export const DEEPSEEK_RESEARCH_TIMEOUT_MS = 180_000;

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
  "model"
> & {
  model: string;
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
  "EXECUTION_FAILURE" | "NO_FINAL_TEXT" | "NO_WEB_SEARCH";

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
  options: { requireNativeWebSearch: boolean },
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
  if (!outputText) {
    throw new DeepSeekResearchResponseError(
      "DeepSeek returned no usable final text output.",
      diagnostics,
      "NO_FINAL_TEXT",
    );
  }
  const nativeSearchTrace = diagnostics.nativeSearchTrace;
  if (options.requireNativeWebSearch && nativeSearchTrace.calls.length === 0) {
    throw new DeepSeekResearchResponseError(
      "DeepSeek response contained no native web_search_call; live research was not established.",
      diagnostics,
      "NO_WEB_SEARCH",
    );
  }
  return {
    provider: DEEPSEEK_RESEARCH_PROVIDER,
    model: readString(response, "model") ?? DEEPSEEK_RESEARCH_MODEL,
    providerRequestId: readString(response, "id"),
    status: "completed",
    outputText,
    nativeSearchTrace,
    responseDiagnostics: diagnostics.responseDiagnostics,
    usage: mapUsage(response),
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

export function mapDeepSeekStructuringResponse(
  response: unknown,
  latencyMs: number,
  secrets: readonly string[] = [],
): ResearchProviderResult {
  return mapDeepSeekResponse(response, latencyMs, secrets, {
    requireNativeWebSearch: false,
  });
}

export function buildDeepSeekNativeResearchRequest(
  request: ResearchProviderRequest,
): DeepSeekResearchRequest {
  return {
    model: DEEPSEEK_RESEARCH_MODEL,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: 12_000,
    reasoning: { effort: "high" },
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
  };
}

export function buildDeepSeekStructuringRequest(
  request: ResearchProviderRequest,
): DeepSeekResearchRequest {
  return {
    model: DEEPSEEK_RESEARCH_MODEL,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: 12_000,
    reasoning: { effort: "high" },
    text: {
      format: {
        type: "json_schema",
        name: "culture_tracker_research_result_v1",
        schema: RESEARCH_RESULT_V1_JSON_SCHEMA,
      },
    },
  };
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
      const startedAt = Date.now();
      const apiRequest = buildDeepSeekNativeResearchRequest(request);
      const response = await client.responses.create(
        apiRequest as unknown as ResponseCreateParamsNonStreaming,
      );
      return mapDeepSeekNativeResearchResponse(
        response,
        Date.now() - startedAt,
        [apiKey],
      );
    },
    async structureResearch(request) {
      const startedAt = Date.now();
      const apiRequest = buildDeepSeekStructuringRequest(request);
      const response = await client.responses.create(
        apiRequest as unknown as ResponseCreateParamsNonStreaming,
      );
      return mapDeepSeekStructuringResponse(response, Date.now() - startedAt, [
        apiKey,
      ]);
    },
  };
}
