import { generateAgentResponse } from "@/lib/ai/provider";
import { publicAIStatus } from "@/lib/ai/config";
import { AgentError } from "@/lib/ai/errors";
import { requestSchema } from "@/lib/ai/schemas";
import { runValidatedAgentRequest } from "@/lib/ai/discovery-submission";

export const runtime = "nodejs";
// Allows one bounded provider retry while remaining statically analyzable by Next.js.
export const maxDuration = 300;
export async function GET() {
  return Response.json(publicAIStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !==
        (request.headers.get("host") ?? new URL(request.url).host)
    )
      throw new AgentError(
        "Cross-site generation requests are not allowed.",
        403,
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new AgentError("Send a JSON request body.", 415);
    if (!request.body) throw new AgentError("A request body is required.", 400);
    const body = await request.text();
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new AgentError("The request body must be valid JSON.", 400);
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success)
      throw new AgentError(
        "Invalid agent request. Check the campaign context, selected sparks and approval before retrying.",
        400,
      );
    return Response.json(
      await runValidatedAgentRequest(parsed.data, generateAgentResponse),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AgentError
            ? error.message
            : "This agent could not complete the request. Please retry.",
        ...(error instanceof AgentError
          ? { code: error.code, retryable: error.retryable }
          : { code: "internal_error", retryable: false }),
      },
      {
        status: error instanceof AgentError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
