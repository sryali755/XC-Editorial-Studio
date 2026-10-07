import "server-only";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { generateMock } from "./mock-provider";
import { generateOpenAI } from "./openai-provider";
import {
  outputSchemas,
  type AgentData,
  type AgentRequest,
  type AgentResponse,
} from "./schemas";
import { parseIMCBrief } from "../imc-parser";
import { fieldText, reconcileUpstream } from "../upstream";

// Source decisions are enforced in application code, not entrusted to model adherence.
export function preserveSource(
  request: AgentRequest,
  data: AgentData,
): AgentData {
  if ("parsedIMC" in request.context) {
    const parsed = parseIMCBrief(request.context.parsedIMC.sourceText);
    if ("originalRtb" in data) {
      const field = parsed.fields.reason_to_believe;
      return {
        ...data,
        originalRtb: field.sourceValue || null,
        originalRtbStatus:
          field.status === "Supplied"
            ? "supplied"
            : field.status === "Intentionally excluded"
              ? "intentionally_excluded"
              : "not_supplied",
        xcAdaptation: field.status === "Supplied" ? data.xcAdaptation : null,
        adaptationStatus: "not_approved",
        evidenceGaps:
          field.status !== "Supplied"
            ? [
                ...data.evidenceGaps,
                `Upstream RTB: ${field.status}. No replacement RTB has been generated. Clarify with the GTM owner.`,
              ]
            : data.evidenceGaps,
      };
    }
    if ("suppliedEvidence" in data)
      return {
        ...data,
        suppliedEvidence: [
          fieldText(
            reconcileUpstream(parsed, request.context.upstream).fields.research,
          ),
        ],
      };
  }
  if (request.agentType === "finalBrief" && "approvedStrategy" in data) {
    const f = request.context.foundation,
      e = request.context.executionDirection;
    return {
      ...data,
      campaign: f.campaignContext.campaignName,
      objective: f.campaignContext.objective,
      reasonToBelieve: f.currentRtb.original,
      audience: f.campaignContext.audience,
      approvedStrategy: request.context.approvedStrategy.briefLine,
      requiredAssets: [`${e.assetCount} assets — ${e.requiredAssets}`],
      channels: [e.channels],
      constraints: [
        ...new Set(
          [
            e.constraints,
            f.campaignContext.constraints,
            ...data.constraints,
          ].filter(Boolean),
        ),
      ],
      disclaimers: [
        ...new Set([
          fieldText(f.requirements.fields.disclaimers),
          ...data.disclaimers,
        ]),
      ],
      approvalNotes: [
        ...data.approvalNotes,
        `Strategy explicitly approved by ${request.context.approvedStrategy.approvedBy} at ${request.context.approvedStrategy.approvedAt}. Source: ${request.context.approvedStrategy.source}.`,
        "Upstream claims, messaging and partner approvals retain their recorded statuses. XC proposals remain unapproved.",
      ],
    };
  }
  return data;
}
export async function generateAgentResponse(
  request: AgentRequest,
): Promise<AgentResponse> {
  const config = aiConfig();
  if (config.error) throw new AgentError(config.error, 503);
  // Re-parse at the trust boundary, never trusting missing/changed parsed values from a client.
  if (
    request.agentType === "rtb" ||
    request.agentType === "research" ||
    request.agentType === "sparks"
  ) {
    const parsedIMC = parseIMCBrief(request.context.parsedIMC.sourceText);
    request = {
      ...request,
      context: {
        parsedIMC,
        upstream: reconcileUpstream(parsedIMC, request.context.upstream),
      },
    };
  }
  const generated = await (config.mode === "live"
    ? generateOpenAI(request)
    : generateMock(request));
  const result = outputSchemas[request.agentType].safeParse(
    preserveSource(request, generated),
  );
  if (!result.success)
    throw new AgentError(
      "This agent returned an invalid structured response. Please retry.",
    );
  return {
    provider: config.mode === "live" ? "openai" : "mock",
    ...(config.mode === "live" ? { model: config.model } : {}),
    data: result.data,
    generatedAt: new Date().toISOString(),
  };
}
