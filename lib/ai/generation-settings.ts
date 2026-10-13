import { z } from "zod";

// Portable request shape. Each provider validates it against its own capabilities.
export const modelSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    reasoningEffort: z
      .enum(["none", "low", "medium", "high", "xhigh"])
      .optional(),
    verbosity: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export function outputTokenBudget(agentType: string) {
  // Six developed Sparks plus their rationales need more headroom than one brief line.
  return agentType === "finalBrief" || agentType === "sparks"
    ? 6000
    : agentType === "research"
      ? 4500
      : 2500;
}
