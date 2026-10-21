import "server-only";
import type { AIStatus } from "./schemas";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export function aiConfig() {
  const mode = process.env.AI_MODE?.trim() || "mock";
  const provider = process.env.AI_PROVIDER?.trim() || "openai";
  const error = !["mock", "live"].includes(mode)
    ? "Set AI_MODE to mock or live on the server."
    : mode === "live" && provider !== "openai"
      ? "The configured live AI provider is not supported yet."
      : mode === "live" && !process.env.OPENAI_API_KEY?.trim()
        ? "Live AI requires OPENAI_API_KEY on the server. Configure it or set AI_MODE=mock."
        : undefined;
  return {
    mode: mode === "live" ? ("live" as const) : ("mock" as const),
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    error,
  };
}
export function publicAIStatus(): AIStatus {
  const config = aiConfig();
  return {
    mode: config.mode,
    provider: config.mode === "live" ? "openai" : "mock",
    ...(config.mode === "live" ? { model: config.model } : {}),
    configured: !config.error,
    ...(config.error ? { error: config.error } : {}),
  };
}
