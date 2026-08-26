import "dotenv/config";

import OpenAI from "openai";

import {
  buildLlmSmokeRequest,
  diagnoseLlmSmokeError,
  LLM_SMOKE_MODEL,
  LlmSmokeValidationError,
  runLlmSmoke,
} from "@/lib/llm-smoke";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("LLM SMOKE TEST: FAIL");
    console.error("category: missing OPENAI_API_KEY");
    process.exitCode = 1;
    return;
  }

  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 30_000,
  });

  try {
    const result = await runLlmSmoke(async () => {
      const response = await client.responses.create(buildLlmSmokeRequest());
      if (!response.usage) {
        throw new LlmSmokeValidationError(
          "Response did not include token usage.",
        );
      }
      return {
        model: response.model,
        outputText: response.output_text,
        usage: {
          inputTokens: response.usage.input_tokens,
          cachedInputTokens:
            response.usage.input_tokens_details?.cached_tokens ?? null,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    });

    console.log("LLM SMOKE TEST: PASS");
    console.log(`model: ${result.model || LLM_SMOKE_MODEL}`);
    console.log(`response: ${JSON.stringify(result.response)}`);
    console.log(`latency: ${result.latencyMs} ms`);
    console.log(`input tokens: ${result.usage.inputTokens}`);
    if (result.usage.cachedInputTokens !== null) {
      console.log(`cached input tokens: ${result.usage.cachedInputTokens}`);
    }
    console.log(`output tokens: ${result.usage.outputTokens}`);
    console.log(`total tokens: ${result.usage.totalTokens}`);
  } catch (error) {
    const diagnostic = diagnoseLlmSmokeError(error, apiKey);
    console.error("LLM SMOKE TEST: FAIL");
    console.error(`category: ${diagnostic.category}`);
    if (diagnostic.status !== undefined) {
      console.error(`status: ${diagnostic.status}`);
    }
    if (diagnostic.code) {
      console.error(`code: ${diagnostic.code}`);
    }
    console.error(`message: ${diagnostic.message}`);
    process.exitCode = 1;
  }
}

void main();
