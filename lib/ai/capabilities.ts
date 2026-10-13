import "server-only";
import { AgentError } from "./errors";
import { modelSettingsSchema, type ModelSettings } from "./generation-settings";

export interface ModelCapabilities {
  structuredOutput: boolean;
  temperature: boolean;
  topP: boolean;
  reasoningEfforts: NonNullable<ModelSettings["reasoningEffort"]>[];
  verbosity: boolean;
  maxOutputTokens: number;
}
// Exact, verified model registrations; no guessed provider/model identifiers.
// GPT-5.5: https://developers.openai.com/api/docs/models/gpt-5.5
// Sampling is disabled in this workflow; creative controls tune the prompts.
// New providers register their own capabilities and translate the portable settings.
export function modelCapabilities(
  provider: string,
  model: string,
): ModelCapabilities | undefined {
  if (provider === "openai" && model === "gpt-5.5")
    return {
      structuredOutput: true,
      temperature: false,
      topP: false,
      reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
      verbosity: true,
      maxOutputTokens: 128000,
    };
}
export function validatedModelSettings(
  provider: string,
  model: string,
  settings: ModelSettings = {},
) {
  const parsed = modelSettingsSchema.safeParse(settings);
  if (!parsed.success)
    throw new AgentError("Invalid model generation settings.", 400);
  const caps = modelCapabilities(provider, model);
  if (!caps?.structuredOutput)
    throw new AgentError(
      "This model has no verified structured-output capability registration. Register its capabilities before using it.",
      503,
    );
  for (const key of ["temperature", "topP", "verbosity"] as const) {
    if (parsed.data[key] !== undefined && !caps[key])
      throw new AgentError(
        `${key} is not enabled for this model. Creative Controls work through prompt instructions; remove this model setting.`,
        400,
      );
  }
  if (
    parsed.data.reasoningEffort !== undefined &&
    !caps.reasoningEfforts.includes(parsed.data.reasoningEffort)
  )
    throw new AgentError(
      "This reasoning effort is not supported by the configured model.",
      400,
    );
  return parsed.data;
}
