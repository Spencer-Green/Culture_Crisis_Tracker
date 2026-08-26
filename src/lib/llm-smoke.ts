import { OPENAI_LUNA_MODEL } from "@/lib/openai-usage";

export const LLM_SMOKE_MODEL = OPENAI_LUNA_MODEL;
export const LLM_SMOKE_MESSAGE =
  "Culture Crisis Tracker LLM synthesis connection successful";

export interface LlmSmokeApiResponse {
  model: string;
  outputText: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number | null;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface LlmSmokeResult {
  model: string;
  response: {
    status: "ok";
    message: typeof LLM_SMOKE_MESSAGE;
  };
  latencyMs: number;
  usage: LlmSmokeApiResponse["usage"];
}

export interface LlmSmokeDiagnostic {
  category:
    | "authentication failure"
    | "permission/model-access failure"
    | "quota/rate-limit/billing failure"
    | "model unavailable/not found"
    | "malformed structured response"
    | "network/API failure";
  status?: number;
  code?: string;
  message: string;
}

export class LlmSmokeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSmokeValidationError";
  }
}

export function buildLlmSmokeRequest() {
  return {
    model: LLM_SMOKE_MODEL,
    input: "Return the required connection status object.",
    max_output_tokens: 64,
    reasoning: { effort: "none" as const },
    store: false,
    text: {
      verbosity: "low" as const,
      format: {
        type: "json_schema" as const,
        name: "culture_crisis_tracker_llm_smoke",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["ok"] },
            message: { type: "string", enum: [LLM_SMOKE_MESSAGE] },
          },
          required: ["status", "message"],
        },
      },
    },
  };
}

export function parseLlmSmokeOutput(
  outputText: string,
): LlmSmokeResult["response"] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new LlmSmokeValidationError("Response was not valid JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 2 ||
    !("status" in parsed) ||
    !("message" in parsed) ||
    parsed.status !== "ok" ||
    parsed.message !== LLM_SMOKE_MESSAGE
  ) {
    throw new LlmSmokeValidationError(
      "Response did not match the required smoke-test schema.",
    );
  }

  return {
    status: "ok",
    message: LLM_SMOKE_MESSAGE,
  };
}

export async function runLlmSmoke(
  createResponse: () => Promise<LlmSmokeApiResponse>,
  now: () => number = () => performance.now(),
): Promise<LlmSmokeResult> {
  const startedAt = now();
  const apiResponse = await createResponse();
  const latencyMs = Math.max(0, Math.round(now() - startedAt));

  return {
    model: apiResponse.model,
    response: parseLlmSmokeOutput(apiResponse.outputText),
    latencyMs,
    usage: apiResponse.usage,
  };
}

function readErrorField(error: unknown, field: string): unknown {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }
  return (error as Record<string, unknown>)[field];
}

export function sanitizeLlmDiagnosticMessage(
  message: string,
  apiKey?: string,
): string {
  let sanitized = message.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
  if (apiKey) {
    sanitized = sanitized.replaceAll(apiKey, "[REDACTED]");
  }
  return sanitized;
}

export function diagnoseLlmSmokeError(
  error: unknown,
  apiKey?: string,
): LlmSmokeDiagnostic {
  if (error instanceof LlmSmokeValidationError) {
    return {
      category: "malformed structured response",
      message: error.message,
    };
  }

  const rawStatus = readErrorField(error, "status");
  const status = typeof rawStatus === "number" ? rawStatus : undefined;
  const rawCode = readErrorField(error, "code");
  const code = typeof rawCode === "string" ? rawCode : undefined;
  const rawMessage = readErrorField(error, "message");
  const message = sanitizeLlmDiagnosticMessage(
    typeof rawMessage === "string" ? rawMessage : "OpenAI request failed.",
    apiKey,
  );
  const normalizedCode = code?.toLowerCase();

  if (status === 401) {
    return { category: "authentication failure", status, code, message };
  }
  if (status === 404 || normalizedCode === "model_not_found") {
    return { category: "model unavailable/not found", status, code, message };
  }
  if (status === 403) {
    return {
      category: "permission/model-access failure",
      status,
      code,
      message,
    };
  }
  if (status === 429) {
    return {
      category: "quota/rate-limit/billing failure",
      status,
      code,
      message,
    };
  }

  return { category: "network/API failure", status, code, message };
}
