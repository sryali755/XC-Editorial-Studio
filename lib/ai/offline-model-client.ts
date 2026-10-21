import type OpenAI from "openai";
import { AgentError } from "./errors";

// A deterministic, in-memory stand-in for the Responses client. It has no
// credentials, HTTP transport, fetch implementation, or SDK constructor.
const offlineClients = new WeakSet<object>();

export function createOfflineModelClient(outputs: readonly (string | Error)[]) {
  if (process.env.XC_OFFLINE_TEST !== "1")
    throw new Error("Offline model clients require XC_OFFLINE_TEST=1.");
  if (!outputs.length) throw new Error("Supply at least one offline response.");
  let calls = 0;
  const requests: { instructions?: string; input?: unknown }[] = [];
  const sdk = Object.freeze({
    responses: Object.freeze({
      create: async (request: { instructions?: string; input?: unknown }) => {
        // Capture only the model-facing prompt, never credentials or transport
        // configuration. Offline tests can now assert actual request memory.
        requests.push({
          instructions: request.instructions,
          input: request.input,
        });
        // A test must provide every expected model turn explicitly. Replaying
        // the last response hides repair-loop and retry defects.
        if (calls >= outputs.length)
          throw new AgentError(
            `Offline model fixture exhausted after ${outputs.length} response${outputs.length === 1 ? "" : "s"}. Supply an explicit next response; no live fallback was attempted.`,
            500,
            "offline_fixture_exhausted",
            false,
          );
        const output = outputs[calls++];
        if (output instanceof Error) throw output;
        return {
          id: `offline-response-${calls}`,
          object: "response",
          status: "completed",
          output_text: output,
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: output, annotations: [] }],
            },
          ],
        };
      },
    }),
  }) as unknown as OpenAI;
  offlineClients.add(sdk);
  return Object.freeze({
    sdk,
    calls: () => calls,
    requests: () => [...requests],
  });
}

export function isOfflineModelClient(client: OpenAI) {
  return offlineClients.has(client);
}
