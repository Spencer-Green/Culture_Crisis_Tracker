import {
  EVIDENCE_SELECTION_INSTRUCTIONS,
  EvidenceSelectionSchema,
  evidenceSelectionInput,
} from "./research-evidence-checks";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import {
  parseAuditResult,
  validateAuditPacket,
  RESEARCH_AUDIT_MODEL,
  RESEARCH_AUDIT_MAX_OUTPUT_TOKENS,
  RESEARCH_AUDIT_TIMEOUT_MS,
  type AuditPacket,
  type AuditResult,
} from "@/services/research/research-audit-core";
import { z } from "zod";

export type AuditProviderResponse = {
  result: AuditResult;
  responseId: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number | null;
  };
  latencyMs: number;
};
export type AuditProvider = (
  packet: AuditPacket,
  requestId: string,
) => Promise<AuditProviderResponse>;
export class AuditResponseValidationError extends Error {
  constructor(
    message: string,
    readonly diagnostic: {
      responseId: string;
      usage: AuditProviderResponse["usage"];
      finalContent: string;
    },
  ) {
    super(message);
  }
}
type Request = ChatCompletionCreateParamsNonStreaming & {
  thinking: { type: "disabled" };
  request_id: string;
};

export function auditRequest(packet: AuditPacket, requestId: string): Request {
  validateAuditPacket(packet);
  return {
    model: RESEARCH_AUDIT_MODEL,
    messages: [
      {
        role: "system",
        content: `${EVIDENCE_SELECTION_INSTRUCTIONS}\nJSON schema: ${JSON.stringify(z.toJSONSchema(EvidenceSelectionSchema))}`,
      },
      { role: "user", content: JSON.stringify(evidenceSelectionInput(packet)) },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: RESEARCH_AUDIT_MAX_OUTPUT_TOKENS,
    request_id: requestId,
    stream: false,
    // Omit tools and tool_choice: the provider only documents auto, not none.
  };
}

export async function executeGlmAudit(
  packet: AuditPacket,
  requestId: string,
  send: (request: Request) => Promise<unknown>,
): Promise<AuditProviderResponse> {
  const started = Date.now();
  const raw = await send(auditRequest(packet, requestId));
  const response = z
    .object({
      id: z.string().min(1),
      model: z.string().optional(),
      choices: z
        .array(
          z.object({
            finish_reason: z.literal("stop"),
            message: z.object({
              content: z.string().min(1),
              tool_calls: z.array(z.unknown()).optional(),
              reasoning_content: z.string().nullish(),
            }),
          }),
        )
        .length(1),
      usage: z.object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
        total_tokens: z.number().int().nonnegative(),
        completion_tokens_details: z
          .object({
            reasoning_tokens: z.number().int().nonnegative().optional(),
          })
          .optional(),
      }),
    })
    .parse(raw);
  const choice = response.choices[0]!;
  if (
    choice.message.tool_calls?.length ||
    choice.message.reasoning_content?.trim() ||
    (response.usage.completion_tokens_details?.reasoning_tokens ?? 0) > 0
  )
    throw new Error("Auditor unexpectedly used tools or reasoning");
  if (response.model && response.model !== RESEARCH_AUDIT_MODEL)
    throw new Error("Unexpected auditor model; no model fallback is allowed");
  if (
    response.usage.total_tokens <
    response.usage.prompt_tokens + response.usage.completion_tokens
  )
    throw new Error("Invalid auditor usage accounting");
  const usage = {
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
    reasoningTokens:
      response.usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
  let result: AuditResult;
  try {
    result = parseAuditResult(choice.message.content, packet);
  } catch (error) {
    throw new AuditResponseValidationError(
      error instanceof Error ? error.message : "Invalid evidence selection",
      {
        responseId: response.id,
        usage,
        finalContent: choice.message.content.slice(0, 16_000),
      },
    );
  }
  return {
    result,
    responseId: response.id,
    model: response.model ?? RESEARCH_AUDIT_MODEL,
    usage: {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      reasoningTokens:
        response.usage.completion_tokens_details?.reasoning_tokens ?? null,
    },
    latencyMs: Date.now() - started,
  };
}

export function createGlmResearchAuditor(apiKey: string): AuditProvider {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.z.ai/api/paas/v4",
    maxRetries: 0,
    timeout: RESEARCH_AUDIT_TIMEOUT_MS,
  });
  return (packet, requestId) =>
    executeGlmAudit(packet, requestId, (request) =>
      client.chat.completions.create(request, {
        timeout: RESEARCH_AUDIT_TIMEOUT_MS,
      }),
    );
}
