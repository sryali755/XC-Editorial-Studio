import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  currentPersonality,
  defaultPersonality,
  isPerspective,
} from "../creative-controls";
import { agentPromptVersion } from "./prompts";
import { validatedModelSettings } from "./capabilities";
import {
  outputTokenBudget,
  perspectiveReasoningEffort,
} from "./generation-settings";
import {
  invalidSparkExcerptIndexes,
  markSparkExcerptVerification,
  sparkRevisionIssue,
  sparkStructuralIssue,
} from "./spark-quality";
import { applySparkRevision, sparkRevisionPlan } from "./spark-revision";
import { aiConfig } from "./config";
import { AgentError } from "./errors";
import { generateMock } from "./mock-provider";
import { generateOpenAI } from "./openai-provider";
import {
  perspectiveQualityReview,
  perspectiveRetryInstruction,
  type PerspectiveQualityCheck,
} from "./perspective-quality";
import {
  outputSchemas,
  type AgentData,
  type AgentRequest,
  type AgentResponse,
  type GenerationRecord,
} from "./schemas";
import { parseIMCBrief } from "../imc-parser";
import { fieldText, reconcileUpstream, resolveRtb } from "../upstream";
import type { SourceField } from "../types";
import { ROUND_TABLE_PROMPT_VERSIONS } from "../roundtable-prompts";

const disconnectedResearchSource =
  /\b(?:Tableau|iSpot|ACE|Datorama|Brand Hub|Product\s*\/\s*Audience Research)\b/i;

function exactSourceField(field: SourceField) {
  return field.status === "Supplied" ? field.sourceValue : fieldText(field);
}

function isExplicitlyVerified(value: string) {
  return (
    /\b(?:verified|validated|confirmed|substantiated)\b/i.test(value) &&
    !/\b(?:not verified|unverified|pending|illustrative|hypothesis|assumption)\b/i.test(
      value,
    )
  );
}

function sourceEntry(label: string, field: SourceField) {
  return `${label} (${field.status}; not independently verified): ${exactSourceField(field)}`;
}

function sourceGroundedOnly(
  values: string[],
  sourceFragments: string[],
  fallback: string,
) {
  const suppliedOnly = values.filter(
    (value) =>
      !disconnectedResearchSource.test(value) &&
      sourceFragments.some((source) => value.includes(source)),
  );
  return suppliedOnly.length ? suppliedOnly : [fallback];
}

// Source decisions are enforced in application code, not entrusted to model adherence.
export function preserveSource(
  request: AgentRequest,
  data: AgentData,
): AgentData {
  if ("parsedIMC" in request.context) {
    const parsed = parseIMCBrief(request.context.parsedIMC.sourceText);
    const upstream = reconcileUpstream(parsed, request.context.upstream);
    if ("originalRtb" in data) {
      const { field, approvalStatus, approvalNote } = resolveRtb(upstream);
      return {
        ...data,
        originalRtb: field.sourceValue || null,
        originalRtbStatus:
          field.status === "Supplied"
            ? "supplied"
            : field.status === "Intentionally excluded"
              ? "intentionally_excluded"
              : "not_supplied",
        originalRtbApprovalStatus: approvalStatus,
        xcAdaptation: field.status === "Supplied" ? data.xcAdaptation : null,
        adaptationStatus: "not_approved",
        reviewNotes: [
          ...data.reviewNotes,
          ...(approvalNote ? [approvalNote] : []),
        ],
        evidenceGaps:
          field.status !== "Supplied"
            ? [
                ...data.evidenceGaps,
                `Upstream RTB: ${field.status}. No replacement RTB has been generated. Clarify with the GTM owner.`,
              ]
            : data.evidenceGaps,
      };
    }
    if ("suppliedEvidence" in data) {
      const fields = upstream.fields;
      const evidenceFields = [fields.research, fields.substantiation];
      const illustrative = evidenceFields
        .filter(
          (field) =>
            field.status === "Supplied" &&
            /\b(?:illustrative|hypothesis|assumption|proposed|to be validated)\b/i.test(
              field.sourceValue,
            ),
        )
        .map((field) => field.sourceValue);
      const verified = evidenceFields
        .filter(
          (field) =>
            field.status === "Supplied" &&
            isExplicitlyVerified(field.sourceValue),
        )
        .map((field) => field.sourceValue);
      const evidenceFragments = evidenceFields.flatMap((field) =>
        field.sourceValue
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter((value) => value.length >= 4),
      );
      const campaign = exactSourceField(fields.campaignName);
      return {
        ...data,
        campaignName: campaign,
        objectives: exactSourceField(fields.objective),
        audience: exactSourceField(fields.audience),
        productInformation: exactSourceField(fields.product),
        suppliedEvidence: [
          sourceEntry("Research", fields.research),
          sourceEntry("Supporting evidence", fields.substantiation),
        ],
        verifiedEvidence: verified,
        illustrativeAssumptions: [
          ...illustrative,
          ...data.illustrativeAssumptions.map(
            (value) => `AI-proposed assumption to validate: ${value}`,
          ),
        ],
        audienceContext: [sourceEntry("Audience", fields.audience)],
        historicalPerformance: sourceGroundedOnly(
          data.historicalPerformance,
          evidenceFragments,
          `No connected historical performance results were retrieved for ${campaign}.`,
        ),
        creativePerformance: sourceGroundedOnly(
          data.creativePerformance,
          evidenceFragments,
          `No connected creative testing results were retrieved for ${campaign}.`,
        ),
        marketContext: sourceGroundedOnly(
          data.marketContext,
          evidenceFragments,
          `No connected market or category results were retrieved for ${campaign}.`,
        ),
        sourceNotes: [
          `Supporting source references: ${exactSourceField(fields.sourceReferences)}`,
          "Campaign fields and supplied evidence above are preserved from the IMC brief. No enterprise research connector was queried.",
          ...((request.versionNumber ?? 1) > 1
            ? [`REFINEMENT V${request.versionNumber}`]
            : []),
          ...(request.guidance?.trim()
            ? [
                `Strategist steering (direction, not evidence): ${request.guidance.trim()}`,
              ]
            : []),
        ],
      };
    }
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
        `Upstream RTB approval status: ${f.currentRtb.approvalStatus.replace("_", " ")}.`,
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
        ...request.context,
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
        ? validatedModelSettings("openai", config.model, {
            reasoningEffort: perspectiveReasoningEffort(request.versionNumber),
            ...settings,
          })
        : {};
    generation = {
      agentId: request.agentType,
      inputPackVersion: `pack-${createHash("sha256").update(canonicalJSON(request.context)).digest("hex").slice(0, 16)}`,
      foundation: structuredClone(request.context),
      personality: structuredClone(
        "personality" in request
          ? currentPersonality(request.personality)
          : defaultPersonality(),
      ),
      steeringText: request.guidance?.trim() ?? "",
      ...("refinementMode" in request && request.refinementMode
        ? { refinementMode: request.refinementMode }
        : {}),
      modelSettings:
        config.mode === "live"
          ? {
              ...effective,
              maxOutputTokens: outputTokenBudget(request.agentType),
            }
          : {},
      promptTemplateVersion: agentPromptVersion(request.agentType),
      promptVersion: ROUND_TABLE_PROMPT_VERSIONS[request.agentType],
      requestId,
    };
  }
  let generationAttempt = 0;
  let generated: AgentData;
  try {
    generated = await (config.mode === "live"
      ? generateOpenAI(request, undefined, 0, requestId)
      : generateMock(request));
  } catch (error) {
    if (
      config.mode !== "live" ||
      (!isPerspective(request.agentType) && request.agentType !== "sparks") ||
      !(error instanceof AgentError) ||
      !["model_output_invalid_json", "model_output_schema_invalid"].includes(
        error.code,
      )
    )
      throw error;
    generationAttempt = 1;
    generated = await generateOpenAI(request, undefined, 1, requestId);
  }
  if (request.agentType === "sparks") {
    const merge = () => {
      if ("sparks" in generated)
        generated = applySparkRevision(request, generated);
    };
    merge();
    const issue = () =>
      "sparks" in generated
        ? sparkStructuralIssue(generated, request.previousVersion) ||
          sparkRevisionIssue(generated, request)
        : "Invalid Sparks response.";
    if (issue() && config.mode === "live" && generationAttempt === 0) {
      generationAttempt = 1;
      generated = await generateOpenAI(
        request,
        undefined,
        1,
        requestId,
        `Correct this validation failure: ${issue()} Return the requested item count and do not repeat another Spark or a previous idea.`,
      );
      merge();
    }
    const finalIssue = issue();
    if (finalIssue) throw sparksValidationError(finalIssue);
    if ("sparks" in generated) {
      const sourceBrief = request.context.parsedIMC.sourceText;
      const targetId = request.sparkRevision?.targetId;
      generated = markSparkExcerptVerification(
        generated,
        sourceBrief,
        targetId,
      );
      const invalidIndexes = invalidSparkExcerptIndexes(
        generated,
        sourceBrief,
        targetId,
      );
      if (config.mode === "live")
        for (const index of invalidIndexes) {
          const invalidSpark = generated.sparks[index];
          const repairRequest: AgentRequest = {
            ...request,
            previousVersion: {
              number: request.versionNumber ?? request.previousVersion?.number ?? 1,
              text: generated.sparks
                .map((spark, sparkIndex) =>
                  `${sparkIndex + 1}. ${spark.idea || spark.text}`,
                )
                .join("\n\n"),
              data: generated,
            },
            sparkRevision: {
              targetId: invalidSpark.id,
              keptIds: generated.sparks
                .filter((spark) => spark.id !== invalidSpark.id)
                .map((spark) => spark.id),
              intent: "improve",
            },
          };
          const repaired = await generateOpenAI(
            repairRequest,
            undefined,
            1,
            requestId,
            'Repair only the excerpt. Copy fewer than 30 words exactly from the IMC BRIEF, preserving the words and punctuation; do not add a field label or paraphrase.',
          );
          if (!("sparks" in repaired))
            throw sparksValidationError(
              "The excerpt repair did not return a Spark.",
            );
          generated = applySparkRevision(repairRequest, repaired);
          generated = markSparkExcerptVerification(
            generated,
            sourceBrief,
            invalidSpark.id,
          );
          console.info(
            `[sparks-quality] request=${requestId} spark=${invalidSpark.id} check=excerpt_verbatim retried=true passed=${generated.sparks[index].excerpt_verified === true}`,
          );
        }
      const repairedIssue = sparkStructuralIssue(
        generated,
        request.previousVersion,
      ) || sparkRevisionIssue(generated, request);
      if (repairedIssue) throw sparksValidationError(repairedIssue);
    }
  }
  const oldLines =
    "priorCandidates" in request ? (request.priorCandidates ?? []) : [];
  const previous = [
    ...oldLines,
    ...(request.previousVersion ? [request.previousVersion.text] : []),
  ];
  if (
    isPerspective(request.agentType) &&
    "campaignContext" in request.context &&
    "options" in generated
  ) {
    const initialReview = perspectiveQualityReview(
      generated,
      request.context,
      previous,
    );
    let review = initialReview;
    const needsRetry =
      Boolean(review.blockingIssue) || review.retryChecks.length > 0;
    if (needsRetry && config.mode === "live" && generationAttempt === 0) {
      generationAttempt = 1;
      generated = await generateOpenAI(
        request,
        undefined,
        1,
        requestId,
        perspectiveRetryInstruction(review),
      );
      review =
        "options" in generated
          ? perspectiveQualityReview(generated, request.context, previous)
          : {
              blockingIssue:
                "The response did not contain Round Table options.",
              retryChecks: [],
            };
      const loggedChecks = new Set([
        ...initialReview.retryChecks,
        ...review.retryChecks,
      ]);
      for (const check of loggedChecks)
        logPerspectiveQualityCheck({
          requestId,
          agent: request.agentType,
          check,
          retried: true,
          passed: !review.retryChecks.includes(check),
        });
    } else {
      for (const check of review.retryChecks)
        logPerspectiveQualityCheck({
          requestId,
          agent: request.agentType,
          check,
          retried: false,
          passed: false,
        });
    }
    if (review.blockingIssue)
      throw new AgentError(
        `${review.blockingIssue} The previous version is preserved; retry this perspective.`,
        422,
        "perspective_output_validation_failed",
        true,
      );
  }
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
    ...(isPerspective(request.agentType)
      ? { promptVersion: ROUND_TABLE_PROMPT_VERSIONS[request.agentType] }
      : request.agentType === "sparks"
        ? { promptVersion: agentPromptVersion("sparks") }
        : {}),
  };
}

function logPerspectiveQualityCheck({
  requestId,
  agent,
  check,
  retried,
  passed,
}: {
  requestId: string;
  agent: string;
  check: PerspectiveQualityCheck;
  retried: boolean;
  passed: boolean;
}) {
  console.info(
    `[roundtable-quality] request=${requestId} agent=${agent} check=${check} retried=${retried} passed=${passed}`,
  );
}

export function sparksValidationError(issue: string) {
  return new AgentError(
    `${issue} Your previous Sparks and selections are preserved; retry for new directions.`,
    422,
    issue.includes("exact excerpt")
      ? "sparks_source_validation_failed"
      : "sparks_output_validation_failed",
    true,
  );
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
