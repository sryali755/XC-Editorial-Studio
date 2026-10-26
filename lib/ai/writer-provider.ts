import "server-only";
import { z } from "zod";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { buildAgentPrompt } from "./prompts";
import { modelCapabilities, validatedModelSettings } from "./capabilities";
import { outputTokenBudget } from "./generation-settings";
import {
  outputSchemas,
  discoveryGenerationSchema,
  rtbGenerationSchema,
  sparkGenerationSchema,
  sparkRevisionGenerationSchema,
  type AgentRequest,
  type AgentData,
} from "./schemas";

// No tools, web research, alternative endpoints or cross-provider fallback.
// https://dev.writer.com/api-reference/completion-api/chat-completion
const WRITER_CHAT_URL = "https://api.writer.com/v1/chat";
export const WRITER_REQUEST_TIMEOUT_MS = 120_000;

export async function generateWriter(
  request: AgentRequest,
  attempt = 0,
  requestId = "",
  retryInstruction = "",
): Promise<AgentData> {
  if (process.env.XC_OFFLINE_TEST === "1")
    throw new AgentError(
      "External AI requests are disabled for this offline test run.",
      503,
      "offline_test_external_ai_blocked",
      false,
    );
  const config = aiConfig();
  if (config.mode !== "live" || config.provider !== "writer" || config.error)
    throw new AgentError(
      config.error || "Writer is not the selected live provider.",
      503,
    );
  const settings = validatedModelSettings(
    "writer",
    config.model,
    "modelSettings" in request ? request.modelSettings : {},
  );
  const budget = outputTokenBudget(request.agentType);
  if (budget > modelCapabilities("writer", config.model)!.maxOutputTokens)
    throw new AgentError(
      "The output budget exceeds the registered model capability.",
      503,
    );
  const responseSchema =
    request.agentType === "sparks"
      ? request.sparkRevision?.targetId
        ? sparkRevisionGenerationSchema
        : sparkGenerationSchema
      : request.agentType === "discovery"
        ? discoveryGenerationSchema
        : request.agentType === "rtb"
          ? rtbGenerationSchema
          : outputSchemas[request.agentType];
  let schema: Record<string, unknown>;
  try {
    schema = z.toJSONSchema(responseSchema, { target: "draft-7", io: "input" });
  } catch {
    throw new AgentError(
      "This agent could not prepare a valid response format. The application needs a schema fix before retrying.",
      500,
      "response_schema_error",
      false,
    );
  }
  const prompt = buildAgentPrompt(
    request,
    attempt,
    requestId,
    retryInstruction,
  );
  try {
    // Exactly one HTTP attempt here. Existing workflow repairs remain bounded;
    // authentication, quota and rate-limit failures never trigger hidden retries.
    const response = await fetch(WRITER_CHAT_URL, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(WRITER_REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${process.env.WRITER_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.instructions },
          { role: "user", content: prompt.input },
        ],
        stream: false,
        max_tokens: budget,
        ...(settings.temperature !== undefined
          ? { temperature: settings.temperature }
          : {}),
        ...(settings.topP !== undefined ? { top_p: settings.topP } : {}),
        response_format: { type: "json_schema", json_schema: { schema } },
      }),
    });
    // Never surface the provider body: it can contain prompt text or credentials.
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        throw new AgentError(
          "Writer rejected access. Check the server API key and model permissions.",
          503,
          "writer_access_denied",
          false,
        );
      if (response.status === 402 || response.status === 429)
        throw new AgentError(
          "Writer reports a billing, quota or rate limit. Check your Writer organization usage and plan before retrying.",
          503,
          "writer_usage_limit",
          false,
        );
      throw new AgentError(
        "Writer could not complete the request. Check the model configuration or retry this agent.",
        502,
        "writer_request_failed",
        response.status >= 500,
      );
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (choice?.message?.refusal)
      throw new AgentError(
        "Writer could not complete this request. Revise the guidance and retry.",
        422,
        "model_refusal",
        true,
      );
    if (choice?.finish_reason === "length")
      throw new AgentError(
        "Writer reached the output-token limit before completing this response. The previous version is preserved.",
        502,
        "model_output_max_tokens",
        true,
      );
    if (choice?.finish_reason !== "stop")
      throw new AgentError(
        "Writer returned an incomplete response. The previous version is preserved.",
        502,
        "model_output_incomplete",
        true,
      );
    if (
      typeof choice.message?.content !== "string" ||
      !choice.message.content.trim()
    )
      throw new AgentError(
        "Writer returned no structured text. The previous version is preserved.",
        502,
        "model_output_empty",
        true,
      );
    let decoded: unknown;
    try {
      decoded = JSON.parse(choice.message.content);
    } catch {
      throw new AgentError(
        "Writer returned malformed structured output. The previous version is preserved.",
        502,
        "model_output_invalid_json",
        true,
      );
    }
    const result = responseSchema.safeParse(decoded);
    if (!result.success)
      throw new AgentError(
        "Writer returned output that does not match this agent's schema. The previous version is preserved.",
        502,
        "model_output_schema_invalid",
        true,
      );
    if (request.agentType === "sparks" && "sparks" in result.data)
      return {
        sparks: result.data.sparks.map((spark, index) => ({
          ...spark,
          id: `spark-${index + 1}`,
          text: spark.idea,
          campaignGrounding: spark.excerpt,
          hypothesisToValidate: spark.hypothesis,
          excerpt_verified: false,
        })),
      };
    return result.data as AgentData;
  } catch (error) {
    if (error instanceof AgentError) throw error;
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new AgentError(
        "The Writer request timed out. Retry this agent; the previous version is preserved.",
        504,
        "provider_timeout",
        true,
      );
    throw new AgentError(
      "The server could not get a valid response from Writer. Check the connection and retry this agent.",
      502,
      "writer_connection_error",
      true,
    );
  }
}
