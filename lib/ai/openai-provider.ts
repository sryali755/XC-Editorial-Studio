import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { DEFAULT_OPENAI_MODEL } from "./config";
import { AgentError } from "./errors";
import { buildAgentPrompt } from "./prompts";
import { modelCapabilities, validatedModelSettings } from "./capabilities";
import {
  outputTokenBudget,
  perspectiveReasoningEffort,
} from "./generation-settings";
import {
  outputSchemas,
  discoveryGenerationSchema,
  rtbGenerationSchema,
  sparkGenerationSchema,
  sparkRevisionGenerationSchema,
  type AgentRequest,
  type AgentData,
} from "./schemas";
import { isPerspective } from "../creative-controls";

let client: OpenAI | undefined;
export function resetOpenAIClientForTests() {
  client = undefined;
}
export const MAX_PROVIDER_RETRIES = 1;
export const OPENAI_REQUEST_TIMEOUT_MS = 120_000;
export const MAX_AUTOMATIC_RETRY_DELAY_MS = 20_000;
const quotaCodes = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

export interface OpenAIFailure {
  status: number;
  code: string;
  category:
    | "rate_limit"
    | "quota"
    | "authentication"
    | "permission"
    | "timeout"
    | "connection"
    | "provider"
    | "request";
  retryable: boolean;
  message: string;
  retryAfterMs?: number;
}

function retryAfterMs(error: InstanceType<typeof OpenAI.APIError>) {
  const raw = error.headers?.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export function classifyOpenAIError(error: unknown): OpenAIFailure {
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return {
      status: 504,
      code: "provider_timeout",
      category: "timeout",
      retryable: true,
      message:
        "The OpenAI request timed out after one retry. Retry this agent.",
    };
  if (error instanceof OpenAI.APIConnectionError)
    return {
      status: 503,
      code: "provider_connection_error",
      category: "connection",
      retryable: true,
      message:
        "The server could not connect to OpenAI after one retry. Check the network and retry this agent.",
    };
  if (!(error instanceof OpenAI.APIError))
    return {
      status: 502,
      code: "provider_error",
      category: "provider",
      retryable: false,
      message: "OpenAI generation failed before a valid response was returned.",
    };

  const status = error.status ?? 502;
  const providerCode = String(error.code ?? error.type ?? "provider_error");
  const retryAfter = retryAfterMs(error);
  if (status === 401)
    return {
      status,
      code: providerCode,
      category: "authentication",
      retryable: false,
      message:
        "OpenAI authentication failed. Check the server-side API key; this request was not retried.",
    };
  if (status === 403)
    return {
      status,
      code: providerCode,
      category: "permission",
      retryable: false,
      message:
        "The OpenAI project or key does not have access to this request. Check server-side project permissions.",
    };
  if (
    status === 429 &&
    (quotaCodes.has(providerCode) || error.type === "insufficient_quota")
  )
    return {
      status,
      code: providerCode,
      category: "quota",
      retryable: false,
      message:
        providerCode === "credit_balance_exhausted"
          ? "OpenAI credits are exhausted. Add credits or update billing before retrying. No automatic retry was attempted."
          : "OpenAI quota or a spend limit has been reached. Update the project or organization limit before retrying.",
    };
  if (status === 429)
    return {
      status,
      code: providerCode,
      category: "rate_limit",
      retryable: true,
      message:
        "OpenAI temporarily rate-limited this request. One bounded backoff retry was attempted; retry this agent later if the limit persists.",
      ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    };
  if (status === 408 || status === 409 || status >= 500)
    return {
      status,
      code: providerCode,
      category: status === 408 ? "timeout" : "provider",
      retryable: true,
      message:
        status === 503
          ? "OpenAI is temporarily unavailable or overloaded. One bounded backoff retry was attempted; retry this agent later."
          : "OpenAI returned a temporary provider error. One bounded backoff retry was attempted; retry this agent later.",
      ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    };
  return {
    status,
    code: providerCode,
    category: status >= 400 && status < 500 ? "request" : "provider",
    retryable: false,
    message:
      "OpenAI rejected this generation request. Review the server configuration and request shape before retrying.",
  };
}

function agentError(failure: OpenAIFailure) {
  return new AgentError(
    failure.message,
    failure.status,
    failure.code,
    failure.retryable,
  );
}

async function withProviderRetry<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      const failure = classifyOpenAIError(error);
      const delay =
        failure.retryAfterMs ?? 500 * 2 ** attempt + Math.random() * 250;
      if (
        !failure.retryable ||
        attempt >= MAX_PROVIDER_RETRIES ||
        delay > MAX_AUTOMATIC_RETRY_DELAY_MS
      )
        throw agentError(failure);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function getClient() {
  // Lazy initialization keeps mock mode/builds functional without credentials.
  return (client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Perspective responses can legitimately take more than a minute. Keep the
    // SDK window inside the route budget so its one bounded retry can finish.
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    // Retry only after inspecting status + provider code; not every 429 is transient.
    maxRetries: 0,
  }));
}
export async function generateOpenAI(
  request: AgentRequest,
  sdk?: OpenAI,
  attempt = 0,
  requestId = "",
  retryInstruction = "",
): Promise<AgentData> {
  // Offline test runs may inject an SDK stub, but must never create a real client.
  if (process.env.XC_OFFLINE_TEST === "1" && !sdk)
    throw new AgentError(
      "External AI requests are disabled for this offline test run.",
      503,
      "offline_test_external_ai_blocked",
      false,
    );
  try {
    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const requestedSettings =
      "modelSettings" in request ? request.modelSettings : {};
    const settings = validatedModelSettings(
      "openai",
      model,
      isPerspective(request.agentType) ||
        request.agentType === "discovery" ||
        request.agentType === "connections" ||
        request.agentType === "strategySuggestions"
        ? {
            reasoningEffort: perspectiveReasoningEffort(request.versionNumber),
            ...requestedSettings,
          }
        : requestedSettings,
    );
    const prompt = buildAgentPrompt(
      request,
      attempt,
      requestId,
      retryInstruction,
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
    const budget = outputTokenBudget(request.agentType);
    if (budget > modelCapabilities("openai", model)!.maxOutputTokens)
      throw new AgentError(
        "The output budget exceeds the registered model capability.",
        503,
      );
    const responseFormat = (() => {
      try {
        return zodTextFormat(responseSchema, `xc_${request.agentType}`);
      } catch {
        throw new AgentError(
          "This agent could not prepare a valid response format. The application needs a schema fix before retrying.",
          500,
          "response_schema_error",
          false,
        );
      }
    })();
    const response = await withProviderRetry(() =>
      (sdk ?? getClient()).responses.create({
        model,
        store: false,
        ...prompt,
        ...(settings.temperature !== undefined
          ? { temperature: settings.temperature }
          : {}),
        ...(settings.topP !== undefined ? { top_p: settings.topP } : {}),
        ...(settings.reasoningEffort
          ? { reasoning: { effort: settings.reasoningEffort } }
          : {}),
        text: {
          ...(settings.verbosity ? { verbosity: settings.verbosity } : {}),
          format: responseFormat,
        },
        max_output_tokens: budget,
      }),
    );
    if (response.status !== "completed") {
      const reason = response.incomplete_details?.reason;
      if (reason === "max_output_tokens")
        throw new AgentError(
          `OpenAI used the full ${budget.toLocaleString()}-token generation budget, including reasoning tokens, before it could finish the structured response.`,
          502,
          "model_output_max_tokens",
          true,
        );
      if (reason === "content_filter")
        throw new AgentError(
          "OpenAI stopped this response because of its content filter. Revise the brief or steering and retry this agent.",
          422,
          "model_output_content_filter",
          true,
        );
      throw new AgentError(
        `OpenAI ended this response with status ${response.status}${reason ? ` (${reason})` : ""}. Retry this agent; the previous version is preserved.`,
        502,
        "model_output_incomplete",
        true,
      );
    }
    if (!response.output_text)
      throw new AgentError(
        "OpenAI completed the request without a structured text response. Retry this agent; the previous version is preserved.",
        502,
        "model_output_empty",
        true,
      );
    if (
      response.output.some(
        (o) =>
          o.type === "message" && o.content.some((c) => c.type === "refusal"),
      )
    )
      throw new AgentError(
        "This agent could not complete this request. Please revise the guidance and retry.",
        422,
        "model_refusal",
        true,
      );
    let decoded: unknown;
    try {
      decoded = JSON.parse(response.output_text);
    } catch {
      throw new AgentError(
        "OpenAI returned malformed structured output. Retry this agent; the previous version is preserved.",
        502,
        "model_output_invalid_json",
        true,
      );
    }
    const result = responseSchema.safeParse(decoded);
    if (!result.success)
      throw new AgentError(
        "OpenAI returned structured output that does not match this agent's schema. Retry this agent; the previous version is preserved.",
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
    throw new AgentError(
      "This agent could not generate a response. Check the model configuration or retry shortly.",
    );
  }
}
