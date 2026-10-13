import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { defaultPersonality, isPerspective } from "../creative-controls";
import { agentPromptVersion } from "./prompts";
import { validatedModelSettings } from "./capabilities";
import { outputTokenBudget } from "./generation-settings";
import { sparkSetIssue } from "./spark-quality";
import { applySparkRevision, sparkRevisionPlan } from "./spark-revision";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { generateMock } from "./mock-provider";
import { generateOpenAI } from "./openai-provider";
import {
  outputSchemas,
  type AgentData,
  type AgentRequest,
  type AgentResponse,
  type GenerationRecord,
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
  sparkRevisionPlan(request);
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
  const requestId = randomUUID();
  let generation: GenerationRecord | undefined;
  if (
    isPerspective(request.agentType) &&
    "campaignContext" in request.context
  ) {
    const settings =
      "modelSettings" in request ? (request.modelSettings ?? {}) : {};
    if (config.mode === "mock" && Object.keys(settings).length)
      throw new AgentError(
        "Mock mode does not use model sampling settings. Remove those settings or use live mode.",
        400,
      );
    const effective =
      config.mode === "live"
        ? validatedModelSettings("openai", config.model, settings)
        : {};
    generation = {
      agentId: request.agentType,
      inputPackVersion: `pack-${createHash("sha256").update(canonicalJSON(request.context)).digest("hex").slice(0, 16)}`,
      foundation: structuredClone(request.context),
      personality: structuredClone(
        "personality" in request
          ? (request.personality ?? defaultPersonality())
          : defaultPersonality(),
      ),
      steeringText: request.guidance?.trim() ?? "",
      ...("refinementMode" in request && request.refinementMode
        ? { refinementMode: request.refinementMode }
        : {}),
      modelSettings:
        config.mode === "live"
          ? {
              reasoningEffort: "medium",
              ...effective,
              maxOutputTokens: outputTokenBudget(request.agentType),
            }
          : {},
      promptTemplateVersion: agentPromptVersion(request.agentType),
      requestId,
    };
  }
  let generated = await (config.mode === "live"
    ? generateOpenAI(request, undefined, 0, requestId)
    : generateMock(request));
  if (request.agentType === "sparks") {
    const merge = () => {
      if ("sparks" in generated)
        generated = applySparkRevision(request, generated);
    };
    merge();
    const issue = () =>
      "sparks" in generated
        ? sparkSetIssue(generated, request.previousVersion)
        : "Invalid Sparks response.";
    if (issue() && config.mode === "live") {
      generated = await generateOpenAI(request, undefined, 1, requestId);
      merge();
    }
    if (issue())
      throw new AgentError(
        `${issue()} Your previous Sparks and selections are preserved; retry for new directions.`,
      );
  }
  // A new API call is necessary but insufficient: never add an exact duplicate to history.
  const oldLines =
    "priorCandidates" in request ? (request.priorCandidates ?? []) : [];
  const previous = [
    ...oldLines,
    ...(request.previousVersion ? [request.previousVersion.text] : []),
  ];
  const duplicate = (data: AgentData) =>
    generation &&
    "briefLines" in data &&
    previous.some(
      (line) => normalizeLine(line) === normalizeLine(data.briefLines[0].line),
    );
  if (duplicate(generated) && config.mode === "live")
    generated = await generateOpenAI(request, undefined, 1, requestId);
  if (duplicate(generated))
    throw new AgentError(
      "This agent repeated a previous candidate. Your versions are preserved; retry for a different angle.",
    );
  const result = outputSchemas[request.agentType].safeParse(
    preserveSource(request, generated),
  );
  if (!result.success)
    throw new AgentError(
      "This agent returned an invalid structured response. Please retry.",
    );
  return {
    provider: config.mode === "live" ? "openai" : "mock",
    ...(config.mode === "live"
      ? { model: config.model }
      : generation
        ? { model: "deterministic-mock" }
        : {}),
    data: result.data,
    generatedAt: new Date().toISOString(),
    ...(generation ? { generation } : {}),
    promptTemplateVersion: agentPromptVersion(request.agentType),
  };
}

function normalizeLine(line: string) {
  return line.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return (
      "{" +
      entries
        .map(([key, v]) => JSON.stringify(key) + ":" + canonicalJSON(v))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
