import { z } from "zod";
import {
  outputSchemas,
  generationRecordSchema,
  type AgentRequest,
  type AgentResponse,
  type AgentDataMap,
  type AgentType,
} from "./schemas";
const envelope = z.object({
  provider: z.enum(["mock", "openai"]),
  model: z.string().optional(),
  generatedAt: z.iso.datetime(),
  data: z.unknown(),
  generation: generationRecordSchema.optional(),
  promptTemplateVersion: z.string().optional(),
});
export async function runAgent<T extends AgentType>(
  request: AgentRequest & { agentType: T },
): Promise<AgentResponse<AgentDataMap[T]>> {
  let response: Response;
  try {
    response = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(115000),
    });
  } catch {
    throw new Error(
      "This agent could not reach the server or timed out. Please retry.",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "The server returned an incomplete response. Please retry.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "This agent could not complete the request. Please retry.",
    );
  const meta = envelope.safeParse(payload);
  if (!meta.success)
    throw new Error("Invalid response from this agent. Please retry.");
  const result = outputSchemas[request.agentType].safeParse(meta.data.data);
  if (!result.success)
    throw new Error("Invalid structured output from this agent. Please retry.");
  return { ...meta.data, data: result.data as AgentDataMap[T] };
}
