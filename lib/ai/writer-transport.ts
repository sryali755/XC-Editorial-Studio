import "server-only";
import { AgentError } from "./errors";

export const WRITER_REQUEST_TIMEOUT_MS = 120_000;
export const WRITER_WORKFLOW_TIMEOUT_MS = 270_000;
export const WRITER_MAX_CONCURRENT_REQUESTS = 2;
export const WRITER_TRANSPORT_RETRY_DELAY_MS = 500;

export interface WriterTransportContext {
  deadline: number;
  retriesRemaining: number;
}

export function createWriterTransportContext(): WriterTransportContext {
  return { deadline: Date.now() + WRITER_WORKFLOW_TIMEOUT_MS, retriesRemaining: 1 };
}

function timeoutError() {
  return new AgentError(
    "Writer could not finish within the generation window. Your previous work is preserved; retry this agent.",
    504, "provider_timeout", true,
  );
}

// One process-wide FIFO gate covers generation, correction, and body consumption.
// The workflow deadline also bounds queue time, so callers never wait forever.
let active = 0;
const waiting: (() => void)[] = [];

function acquire(deadline: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (deadline <= Date.now()) { reject(timeoutError()); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grant = () => {
      if (timer) clearTimeout(timer);
      active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active--;
        waiting.shift()?.();
      });
    };
    if (active < WRITER_MAX_CONCURRENT_REQUESTS) grant();
    else {
      waiting.push(grant);
      timer = setTimeout(() => {
        const index = waiting.indexOf(grant);
        if (index >= 0) waiting.splice(index, 1);
        reject(timeoutError());
      }, deadline - Date.now());
    }
  });
}

function causeCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return causeCode(error.cause);
}

function connectionError(error: unknown) {
  const code = causeCode(error);
  return (
    ["EPIPE", "ECONNRESET", "ECONNREFUSED", "ENETDOWN", "ENETUNREACH",
      "EHOSTUNREACH", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_SOCKET",
      "UND_ERR_CONNECT_TIMEOUT"].includes(code ?? "") ||
    (error instanceof TypeError && /fetch failed|terminated/i.test(error.message))
  );
}

function httpError(status: number) {
  if (status === 401 || status === 403)
    return new AgentError(
      "Writer rejected access. Check the server API key and model permissions.",
      503, "writer_access_denied", false,
    );
  if (status === 402 || status === 429)
    return new AgentError(
      "Writer reports a billing, quota or rate limit. Check your Writer organization usage and plan before retrying.",
      503, "writer_usage_limit", false,
    );
  return new AgentError(
    "Writer could not complete the request. Check the model configuration or retry this agent.",
    502, "writer_request_failed", status >= 500,
  );
}

interface RequestMetadata {
  requestId: string;
  agent: string;
  generationAttempt: number;
}

// A single connection-recovery allowance is shared across the whole workflow.
// It is independent of model-output repair, but never grows with repair calls.
export async function requestWriter(
  url: string,
  init: RequestInit,
  context: WriterTransportContext,
  metadata: RequestMetadata,
): Promise<unknown> {
  for (let transportAttempt = 0; ; transportAttempt++) {
    const start = Date.now();
    const release = await acquire(context.deadline);
    const queueMs = Date.now() - start;
    let retry = false;
    try {
      const remaining = context.deadline - Date.now();
      if (remaining <= 0) throw timeoutError();
      const headers = new Headers(init.headers);
      // Avoid reusing a socket that the provider/proxy has already closed.
      headers.set("Connection", "close");
      const response = await fetch(url, {
        ...init, headers,
        signal: AbortSignal.timeout(Math.min(WRITER_REQUEST_TIMEOUT_MS, remaining)),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw httpError(response.status);
      }
      const payload: unknown = await response.json();
      console.info("[writer-request]", JSON.stringify({
        ...metadata, transportAttempt, status: response.status,
        elapsedMs: Date.now() - start, queueMs, inFlight: active,
      }));
      return payload;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      const timedOut = error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name);
      retry = !timedOut && (connectionError(error) || error instanceof SyntaxError) &&
        context.retriesRemaining > 0 &&
        context.deadline - Date.now() > WRITER_TRANSPORT_RETRY_DELAY_MS;
      console.warn("[writer-transport]", JSON.stringify({
        ...metadata, transportAttempt, elapsedMs: Date.now() - start,
        errorType: error instanceof Error ? error.name : "unknown",
        causeCode: causeCode(error), retrying: retry,
      }));
      if (timedOut) throw timeoutError();
      if (!retry)
        throw new AgentError(
          "The server could not get a valid response from Writer. Your previous work is preserved; retry this agent.",
          502, "writer_connection_error", true,
        );
      context.retriesRemaining--;
    } finally {
      release();
    }
    // Backoff occurs outside the concurrency gate.
    if (retry)
      await new Promise(resolve => setTimeout(resolve, WRITER_TRANSPORT_RETRY_DELAY_MS));
  }
}
