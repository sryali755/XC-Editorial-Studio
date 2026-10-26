import "server-only";
import type { AIStatus } from "./schemas";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const DEFAULT_WRITER_MODEL = "palmyra-x5";
export function aiConfig() {
  const mode = process.env.AI_MODE?.trim() || "mock";
  const selectedProvider = process.env.AI_PROVIDER?.trim() || "writer";
  const provider: "openai" | "writer" =
    selectedProvider === "openai" ? "openai" : "writer";
  const credential =
    provider === "writer" ? "WRITER_API_KEY" : "OPENAI_API_KEY";
  const error = !["mock", "live"].includes(mode)
    ? "Set AI_MODE to mock or live on the server."
    : mode === "live" && !["openai", "writer"].includes(selectedProvider)
      ? "The configured live AI provider is not supported yet."
      : mode === "live" && !process.env[credential]?.trim()
        ? `Live AI requires ${credential} on the server. Configure it or set AI_MODE=mock.`
        : undefined;
  return {
    mode: mode === "live" ? ("live" as const) : ("mock" as const),
    provider,
    model:
      provider === "writer"
        ? process.env.WRITER_MODEL?.trim() || DEFAULT_WRITER_MODEL
        : process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    error,
  };
}
export function publicAIStatus(): AIStatus {
  const config = aiConfig();
  return {
    mode: config.mode,
    provider: config.mode === "live" ? config.provider : "mock",
    ...(config.mode === "live" ? { model: config.model } : {}),
    configured: !config.error,
    ...(config.error ? { error: config.error } : {}),
  };
}
