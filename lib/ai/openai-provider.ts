import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { buildAgentPrompt } from "./prompts";
import { modelCapabilities, validatedModelSettings } from "./capabilities";
import { outputTokenBudget } from "./generation-settings";
import { outputSchemas, type AgentRequest, type AgentData } from "./schemas";

let client: OpenAI | undefined;
function getClient() {
  // Lazy initialization keeps mock mode/builds functional without credentials.
  return (client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 45000,
    maxRetries: 1,
  }));
}
export async function generateOpenAI(
  request: AgentRequest,
  sdk?: OpenAI,
  attempt = 0,
  requestId = "",
): Promise<AgentData> {
  try {
    const model = aiConfig().model;
    const settings = validatedModelSettings(
      "openai",
      model,
      "modelSettings" in request ? request.modelSettings : {},
    );
    const prompt = buildAgentPrompt(request, attempt, requestId);
    const budget = outputTokenBudget(request.agentType);
    if (budget > modelCapabilities("openai", model)!.maxOutputTokens)
      throw new AgentError(
        "The output budget exceeds the registered model capability.",
        503,
      );
    const response = await (sdk ?? getClient()).responses.create({
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
        format: zodTextFormat(
          outputSchemas[request.agentType],
          `xc_${request.agentType}`,
        ),
      },
      max_output_tokens: budget,
    });
    if (response.status !== "completed" || !response.output_text)
      throw new AgentError(
        "This agent could not return a complete response. Please retry with a shorter brief or guidance.",
      );
    if (
      response.output.some(
        (o) =>
          o.type === "message" && o.content.some((c) => c.type === "refusal"),
      )
    )
      throw new AgentError(
        "This agent could not complete this request. Please revise the guidance and retry.",
      );
    const result = outputSchemas[request.agentType].safeParse(
      JSON.parse(response.output_text),
    );
    if (!result.success)
      throw new AgentError(
        "This agent returned an invalid structured response. Please retry.",
      );
    return result.data;
  } catch (error) {
    if (error instanceof AgentError) throw error;
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429)
        throw new AgentError(
          "The AI service is rate-limited or out of quota. Check API usage and retry later.",
          429,
        );
      if (error.status === 401 || error.status === 403)
        throw new AgentError(
          "The server's OpenAI credentials do not have access. Check the server configuration.",
          503,
        );
    }
    throw new AgentError(
      "This agent could not generate a response. Check the model configuration or retry shortly.",
    );
  }
}
