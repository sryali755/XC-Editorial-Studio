import "server-only";
import { z } from "zod";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { buildAgentPrompt } from "./prompts";
import { modelCapabilities, validatedModelSettings } from "./capabilities";
import { outputTokenBudget } from "./generation-settings";
import {
  discoverySourceDocuments,
  resolveDiscoveryCitation,
} from "../discovery-sources";
import {
  outputSchemas,
  discoveryGenerationSchema,
  rtbGenerationSchema,
  sparkGenerationSchema,
  sparkRevisionGenerationSchema,
  type AgentRequest,
  type AgentData,
} from "./schemas";

// No tools, web research, alternative endpoints or cross-provider fallback.
// https://dev.writer.com/api-reference/completion-api/chat-completion
const WRITER_CHAT_URL = "https://api.writer.com/v1/chat";
export const WRITER_REQUEST_TIMEOUT_MS = 120_000;

function schemaIssueSummary(error: z.ZodError) {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "response";
    return `${path} (${issue.code})`;
  });
  return [...new Set(issues)].slice(0, 12).join(", ");
}

function readableKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value))
    return value.map(textValue).filter(Boolean).join("; ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => {
        const text = textValue(item);
        return text ? `${readableKey(key)}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" — ");
  return "";
}

function stringList(value: unknown, max = 30) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(textValue).filter(Boolean).slice(0, max);
}

function normalizeResearchQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string")
        return { source: "Proposed source", question: entry.trim() };
      if (!entry || typeof entry !== "object") return undefined;
      const record = entry as Record<string, unknown>;
      const source = textValue(
        record.source ?? record.proposedSource ?? record.sourceName,
      );
      const question = textValue(
        record.question ??
          record.whatToFindOut ??
          record.what_to_find_out ??
          record.researchQuestion ??
          record.query ??
          Object.fromEntries(
            Object.entries(record).filter(
              ([key]) =>
                !["source", "proposedSource", "sourceName"].includes(key),
            ),
          ),
      );
      return source && question ? { source, question } : undefined;
    })
    .filter((entry): entry is { source: string; question: string } => !!entry)
    .slice(0, 15);
}

function normalizeWriterOutput(request: AgentRequest, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const data = value as Record<string, unknown>;
  const agentType = request.agentType;
  if (agentType === "strategySuggestions") {
    const container = data.suggestions ?? data.briefLineSuggestions ??
      data.brief_line_suggestions ?? data.briefLines ?? data.directions ?? data.options;
    const options = Array.isArray(container)
      ? container
      : container && typeof container === "object"
        ? Object.values(container)
        : container;
    return {
      suggestions: Array.isArray(options) ? options.map((option: unknown) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) return option;
        const item = option as Record<string, unknown>;
        const links = item.findingLinks ?? item.finding_links;
        return {
          briefLine: item.briefLine ?? item.brief_line ?? item.line,
          rationale: textValue(item.rationale),
          evidenceIds: stringList(item.evidenceIds ?? item.evidence_ids ?? item.sourceExcerptIds),
          sparkIds: stringList(item.sparkIds ?? item.spark_ids),
          findingLinks: Array.isArray(links) ? links.map((link: unknown) => {
            if (!link || typeof link !== "object" || Array.isArray(link)) return link;
            const entry = link as Record<string, unknown>;
            return { findingId: entry.findingId ?? entry.finding_id, contribution: textValue(entry.contribution) };
          }) : [],
          validationGap: textValue(item.validationGap ?? item.validation_gap),
        };
      }) : options,
    };
  }
  if (agentType === "connections")
    return {
      relationships: stringList(data.relationships),
      tensions: stringList(data.tensions),
      questions: stringList(data.questions ?? data.questionsToExplore ?? data.followUpQuestions),
      note: typeof data.note === "string" ? data.note : textValue(data.note),
    };
  if (request.agentType === "discovery" && Array.isArray(data.findings)) {
    const sources = discoverySourceDocuments(request.context.foundation);
    const evidenceSchema = discoveryGenerationSchema.shape.findings.element
      .shape.evidence.element.omit({ accessScope: true });
    return {
      ...data,
      // The adapter has no retrieval tools. Access metadata belongs to the
      // application, not the model's free-form representation of it.
      retrievalNote:
        "Only supplied Input Pack documents were analyzed. No external connector was searched.",
      findings: data.findings.map((finding: unknown) => {
        if (!finding || typeof finding !== "object" || Array.isArray(finding))
          return finding;
        const record = finding as Record<string, unknown>;
        if (!Array.isArray(record.evidence)) return finding;
        return {
          ...record,
          evidence: record.evidence.map((evidence: unknown) => {
            if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
              return evidence;
            const { accessScope, ...citation } = evidence as Record<string, unknown>;
            // Keep explicit external/restricted access claims for downstream rejection.
            if (["supplied", "connected", "restricted"].includes(String(accessScope)))
              return evidence;
            const parsed = evidenceSchema.safeParse(citation);
            const resolved = parsed.success
              ? resolveDiscoveryCitation(sources, parsed.data)
              : undefined;
            // Scope comes from a uniquely matched supplied source, never a guessed alias.
            return resolved
              ? { ...citation, accessScope: resolved.source.accessScope }
              : evidence;
          }),
        };
      }),
    };
  }
  if (agentType === "rtb")
    return {
      originalRtb: data.originalRtb,
      originalRtbStatus: data.originalRtbStatus,
      originalRtbApprovalStatus: data.originalRtbApprovalStatus,
      xcAdaptation: data.xcAdaptation,
      proposedJTBD: data.proposedJTBD,
      adaptationStatus: data.adaptationStatus,
      reviewNotes: stringList(data.reviewNotes),
      evidenceGaps: stringList(data.evidenceGaps),
    };
  if (agentType === "research")
    return {
      campaignName: data.campaignName,
      objectives: data.objectives,
      audience: data.audience,
      productInformation: data.productInformation,
      suppliedEvidence: stringList(data.suppliedEvidence),
      verifiedEvidence: stringList(data.verifiedEvidence),
      illustrativeAssumptions: stringList(data.illustrativeAssumptions),
      audienceContext: stringList(data.audienceContext),
      historicalPerformance: stringList(data.historicalPerformance),
      creativePerformance: stringList(data.creativePerformance),
      marketContext: stringList(data.marketContext),
      researchToValidate: normalizeResearchQuestions(data.researchToValidate),
      evidenceGaps: stringList(data.evidenceGaps),
      sourceNotes: stringList(data.sourceNotes),
    };
  return value;
}

export async function generateWriter(
  request: AgentRequest,
  attempt = 0,
  requestId = "",
  retryInstruction = "",
): Promise<AgentData> {
  if (process.env.XC_OFFLINE_TEST === "1")
    throw new AgentError(
      "External AI requests are disabled for this offline test run.",
      503,
      "offline_test_external_ai_blocked",
      false,
    );
  const config = aiConfig();
  if (config.mode !== "live" || config.provider !== "writer" || config.error)
    throw new AgentError(
      config.error || "Writer is not the selected live provider.",
      503,
    );
  const settings = validatedModelSettings(
    "writer",
    config.model,
    "modelSettings" in request ? request.modelSettings : {},
  );
  const budget = outputTokenBudget(request.agentType);
  if (budget > modelCapabilities("writer", config.model)!.maxOutputTokens)
    throw new AgentError(
      "The output budget exceeds the registered model capability.",
      503,
    );
  const responseSchema =
    request.agentType === "sparks"
      ? request.sparkRevision?.targetId
        ? sparkRevisionGenerationSchema
        : sparkGenerationSchema
      : request.agentType === "discovery"
        ? discoveryGenerationSchema
        : request.agentType === "rtb"
          ? rtbGenerationSchema
          : outputSchemas[request.agentType];
  let schema: Record<string, unknown>;
  try {
    schema = z.toJSONSchema(responseSchema, { target: "draft-7", io: "input" });
  } catch {
    throw new AgentError(
      "This agent could not prepare a valid response format. The application needs a schema fix before retrying.",
      500,
      "response_schema_error",
      false,
    );
  }
  const prompt = buildAgentPrompt(
    request,
    attempt,
    requestId,
    retryInstruction,
  );
  try {
    // Exactly one HTTP attempt here. Existing workflow repairs remain bounded;
    // authentication, quota and rate-limit failures never trigger hidden retries.
    const response = await fetch(WRITER_CHAT_URL, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(WRITER_REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${process.env.WRITER_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: prompt.instructions +
              `\nOUTPUT CONTRACT: Return only one JSON object matching this exact schema. Use its property names and field types, with no wrapper or renamed keys.\n${JSON.stringify(schema)}` +
              (request.agentType === "discovery"
                ? '\nFor every evidence entry, accessScope must be exactly "supplied". This workflow only reads documents supplied in the input; no external source was accessed.'
                : ""),
          },
          { role: "user", content: prompt.input },
        ],
        stream: false,
        max_tokens: budget,
        ...(settings.temperature !== undefined
          ? { temperature: settings.temperature }
          : {}),
        ...(settings.topP !== undefined ? { top_p: settings.topP } : {}),
        response_format: { type: "json_schema", json_schema: { schema } },
      }),
    });
    // Never surface the provider body: it can contain prompt text or credentials.
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        throw new AgentError(
          "Writer rejected access. Check the server API key and model permissions.",
          503,
          "writer_access_denied",
          false,
        );
      if (response.status === 402 || response.status === 429)
        throw new AgentError(
          "Writer reports a billing, quota or rate limit. Check your Writer organization usage and plan before retrying.",
          503,
          "writer_usage_limit",
          false,
        );
      throw new AgentError(
        "Writer could not complete the request. Check the model configuration or retry this agent.",
        502,
        "writer_request_failed",
        response.status >= 500,
      );
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (choice?.message?.refusal)
      throw new AgentError(
        "Writer could not complete this request. Revise the guidance and retry.",
        422,
        "model_refusal",
        true,
      );
    if (choice?.finish_reason === "length")
      throw new AgentError(
        "Writer reached the output-token limit before completing this response. The previous version is preserved.",
        502,
        "model_output_max_tokens",
        true,
      );
    if (choice?.finish_reason !== "stop")
      throw new AgentError(
        "Writer returned an incomplete response. The previous version is preserved.",
        502,
        "model_output_incomplete",
        true,
      );
    if (
      typeof choice.message?.content !== "string" ||
      !choice.message.content.trim()
    )
      throw new AgentError(
        "Writer returned no structured text. The previous version is preserved.",
        502,
        "model_output_empty",
        true,
      );
    let decoded: unknown;
    try {
      decoded = JSON.parse(choice.message.content);
    } catch {
      throw new AgentError(
        "Writer returned malformed structured output. The previous version is preserved.",
        502,
        "model_output_invalid_json",
        true,
      );
    }
    const result = responseSchema.safeParse(
      normalizeWriterOutput(request, decoded),
    );
    if (!result.success)
      throw new AgentError(
        `Writer returned output that does not match this agent's schema. Invalid fields: ${schemaIssueSummary(result.error)}. The previous version is preserved.`,
        502,
        "model_output_schema_invalid",
        true,
      );
    if (request.agentType === "sparks" && "sparks" in result.data)
      return {
        sparks: result.data.sparks.map((spark, index) => ({
          ...spark,
          id: `spark-${index + 1}`,
          text: spark.idea,
          campaignGrounding: spark.excerpt,
          hypothesisToValidate: spark.hypothesis,
          excerpt_verified: false,
        })),
      };
    return result.data as AgentData;
  } catch (error) {
    if (error instanceof AgentError) throw error;
    const cause = error instanceof Error ? error.cause : undefined;
    console.warn("[writer-transport]", JSON.stringify({
      requestId, agent: request.agentType, attempt,
      errorType: error instanceof Error ? error.name : "unknown",
      causeCode: cause && typeof cause === "object" && "code" in cause
        ? String(cause.code).slice(0, 50) : undefined,
    }));
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new AgentError(
        "The Writer request timed out. Retry this agent; the previous version is preserved.",
        504,
        "provider_timeout",
        true,
      );
    throw new AgentError(
      "The server could not get a valid response from Writer. Check the connection and retry this agent.",
      502,
      "writer_connection_error",
      true,
    );
  }
}
