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
export function perspectiveReasoningEffort(versionNumber = 0) {
  void versionNumber;
  return "low" as const;
}
export function outputTokenBudget(agentType: string) {
  // Three developed Round Table options need room for both reasoning and JSON.
  if (["humor", "culture", "audience", "market", "brand"].includes(agentType))
    return 5000;
  // Six developed Sparks plus their rationales need the most headroom.
  return agentType === "finalBrief" || agentType === "sparks"
    ? 6000
    : agentType === "research"
      ? 4500
      : 2500;
}
