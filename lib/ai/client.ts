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
const errorEnvelope = z.object({
  error: z.string(),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
});
export class AgentRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "agent_error",
    public retryable = false,
  ) {
    super(message);
  }
}
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
    throw new AgentRequestError(
      "This agent could not reach the server or timed out. Please retry.",
      503,
      "server_unreachable",
      true,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AgentRequestError(
      "The server returned an incomplete response. Please retry.",
      502,
      "invalid_server_response",
      true,
    );
  }
  if (!response.ok) {
    const failure = errorEnvelope.safeParse(payload);
    throw new AgentRequestError(
      failure.success
        ? failure.data.error
        : "This agent could not complete the request. Please retry.",
      response.status,
      failure.success ? (failure.data.code ?? "agent_error") : "agent_error",
      failure.success ? (failure.data.retryable ?? false) : false,
    );
  }
  const meta = envelope.safeParse(payload);
  if (!meta.success)
    throw new Error("Invalid response from this agent. Please retry.");
  const result = outputSchemas[request.agentType].safeParse(meta.data.data);
  if (!result.success)
    throw new Error("Invalid structured output from this agent. Please retry.");
  return { ...meta.data, data: result.data as AgentDataMap[T] };
}
