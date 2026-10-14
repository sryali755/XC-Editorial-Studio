import { z } from "zod";
import {
  AGENT_REQUEST_TIMEOUT_MS,
  AgentRequestError,
  runAgent,
} from "./client";
import {
  outputSchemas,
  type AgentRequest,
  type AgentDataMap,
  type AgentResponse,
} from "./schemas";

type DiscoveryAgent = "discovery" | "connections";
const envelope = z.object({
  provider: z.enum(["mock", "openai"]),
  model: z.string().optional(),
  generatedAt: z.iso.datetime(),
  data: z.unknown(),
});
const failure = z.object({
  error: z.string(),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
});

// Same model endpoint and structured output contract as the creative client,
// with cancellation scoped to Discovery. The restored creative client is untouched.
export async function runDiscoveryAgent<T extends DiscoveryAgent>(
  request: AgentRequest & { agentType: T },
  signal?: AbortSignal,
): Promise<AgentResponse<AgentDataMap[T]>> {
  if (!signal) return runAgent<T>(request);
  let response: Response;
  try {
    response = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(AGENT_REQUEST_TIMEOUT_MS),
      ]),
    });
  } catch {
    if (signal.aborted)
      throw new DOMException("Discovery request cancelled.", "AbortError");
    throw new AgentRequestError(
      "Discovery could not reach the server or exceeded the generation window. Your previous findings and drafts are preserved.",
      503,
      "discovery_transport_error",
      true,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AgentRequestError(
      "Discovery received an incomplete server response. Retry this lens.",
      502,
      "invalid_server_response",
      true,
    );
  }
  if (!response.ok) {
    const parsed = failure.safeParse(payload);
    throw new AgentRequestError(
      parsed.success
        ? parsed.data.error
        : "Discovery could not complete this request. Retry this lens.",
      response.status,
      parsed.success ? parsed.data.code : "discovery_error",
      parsed.success && parsed.data.retryable,
    );
  }
  const parsed = envelope.safeParse(payload);
  if (!parsed.success)
    throw new Error(
      "Discovery received invalid response metadata. Retry this lens.",
    );
  const output = outputSchemas[request.agentType].safeParse(parsed.data.data);
  if (!output.success)
    throw new Error(
      "Discovery received invalid structured output. Your previous findings are preserved; retry this lens.",
    );
  return { ...parsed.data, data: output.data as AgentDataMap[T] };
}
