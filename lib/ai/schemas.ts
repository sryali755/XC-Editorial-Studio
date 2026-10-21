import { z } from "zod";
import { upstreamFields } from "../upstream";
import type { UpstreamKey } from "../types";
import {
  personalitySchema,
  perspectiveIds,
  isPerspective,
  type PerspectiveId,
} from "../creative-controls";
import { modelSettingsSchema } from "./generation-settings";

const text = z.string().max(60000);
const item = z.string().min(1).max(12000);
const list = z.array(item).max(30);
const line = z.object({ id: item, line: item, rationale: text }).strict();
export const sparkTerritoryTypes = [
  "human_truth",
  "social_cultural",
  "category_convention",
  "product_truth",
  "moment",
  "wildcard",
] as const;
export const sparkModelSchema = z
  .object({
    territory_type: z.enum(sparkTerritoryTypes),
    title: item,
    territory: item,
    idea: item,
    excerpt: item,
    rationale: text,
    hypothesis: item,
  })
  .strict();
export const sparkGenerationSchema = z
  .object({ sparks: z.array(sparkModelSchema).length(6) })
  .strict();
export const sparkRevisionGenerationSchema = z
  .object({ sparks: z.array(sparkModelSchema).length(1) })
  .strict();
const perspective = z
  .object({
    options: z
      .array(
        z
          .object({
            brief_line: z.string().min(1).max(500),
            tension: item,
            evidence: z.array(item).min(1).max(4),
            territory: text,
            why_on_strategy: text,
            assumptions: list,
          })
          .strict(),
      )
      .length(3),
    steering_note: text,
    change_note: text,
  })
  .strict();
export const discoveryLensIds = [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
] as const;
export const discoveryActions = [
  "initial",
  "explore_deeper",
  "find_contrary",
  "separate_audience",
  "check_recency",
  "compare_input",
  "ask_another_lens",
  "another_answer",
  "refresh",
] as const;
// Optional so previously saved investigations and existing preparation calls
// retain their original request shape. Conversation turns are request context,
// never independent source evidence.
const discoveryConversationSchema = z
  .object({
    scope: z
      .object({
        kind: z.enum(["agent", "finding"]),
        threadId: z.string().min(1).max(300),
        inputPackVersion: item,
        question: item,
        investigationType: z.enum(["problem", "hypothesis"]),
        findingRef: z.string().min(1).max(300).optional(),
      })
      .strict(),
    currentMessageId: z.string().min(1).max(300),
    selectionPolicy: z.literal("all-user-and-recent-agent"),
    messages: z
      .array(
        z
          .object({
            id: z.string().min(1).max(300),
            role: z.enum(["user", "assistant"]),
            text: z.string().min(1).max(12000),
            createdAt: z.string().max(100),
            action: z.enum(discoveryActions).optional(),
            findingRef: z.string().min(1).max(300).optional(),
            researchRunId: z.string().min(1).max(300).optional(),
            status: z
              .enum([
                "pending",
                "complete",
                "failed",
                "cancelled",
                "interrupted",
              ])
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    omittedMessageIds: z.array(z.string().min(1).max(300)).max(1000),
    budgetCharacters: z.number().int().min(512).max(100000),
    usedCharacters: z.number().int().min(1).max(100000),
  })
  .strict();
const discoveryEvidence = z
  .object({
    source: item,
    locator: text.optional(),
    excerpt: item,
    date: text,
    audience: text,
    context: text,
    accessScope: z.enum(["supplied", "connected", "restricted"]),
  })
  .strict();
const discoveryFinding = z
  .object({
    title: item,
    whatWeFound: text,
    evidence: z.array(discoveryEvidence).max(4),
    whyItMayMatter: text,
    whatComplicatesIt: text,
    questionToExplore: item,
    evidenceState: z.enum(["evidence_supported", "research_gap"]),
  })
  .strict();
const discoveryFindingWithProvenance = discoveryFinding.extend({
  provider: z.enum(["mock", "openai"]).optional(),
  id: item,
  researchRunId: text.optional(),
  createdAt: text.optional(),
  updatedAt: text.optional(),
  version: z.number().int().nonnegative().optional(),
  lensId: z.enum(discoveryLensIds),
  inputPackVersion: item,
  runVersion: z.number().int().nonnegative(),
});
const spark = z
  .object({
    id: item,
    title: item,
    text: item,
    rationale: text,
    campaignGrounding: item,
    hypothesisToValidate: item,
    // Canonical v1 fields. Optional only so pre-v1 saved sessions remain usable.
    territory_type: z.enum(sparkTerritoryTypes).optional(),
    territory: item.optional(),
    idea: item.optional(),
    excerpt: item.optional(),
    hypothesis: item.optional(),
    excerpt_verified: z.boolean().optional(),
  })
  .strict();
export const outputSchemas = {
  rtb: z
    .object({
      originalRtb: text.nullable(),
      originalRtbStatus: z.enum([
        "supplied",
        "not_supplied",
        "intentionally_excluded",
      ]),
      originalRtbApprovalStatus: z.enum([
        "approved",
        "not_approved",
        "pending",
        "unknown",
      ]),
      xcAdaptation: text.nullable(),
      adaptationStatus: z.literal("not_approved"),
      reviewNotes: list,
      evidenceGaps: list,
    })
    .strict(),
  research: z
    .object({
      campaignName: text,
      objectives: text,
      audience: text,
      productInformation: text,
      suppliedEvidence: list,
      verifiedEvidence: list,
      illustrativeAssumptions: list,
      audienceContext: list,
      historicalPerformance: list,
      creativePerformance: list,
      marketContext: list,
      researchToValidate: z
        .array(z.object({ source: item, question: item }).strict())
        .max(15),
      evidenceGaps: list,
      sourceNotes: list,
    })
    .strict(),
  sparks: z
    .object({
      sparks: z.array(spark).length(6),
    })
    .strict(),
  humor: perspective,
  culture: perspective,
  audience: perspective,
  market: perspective,
  brand: perspective,
  discovery: z
    .object({
      findings: z.array(discoveryFinding).min(1).max(4),
      retrievalNote: text,
    })
    .strict(),
  connections: z
    .object({
      relationships: list,
      tensions: list,
      questions: list,
      note: text,
    })
    .strict(),
  strategySuggestions: z
    .object({
      suggestions: z
        .array(
          z
            .object({
              briefLine: z.string().min(12).max(500),
              rationale: item,
              evidenceIds: z.array(item).min(1).max(3),
              sparkIds: z.array(item).max(2),
              findingLinks: z
                .array(
                  z
                    .object({
                      findingId: item,
                      contribution: z.string().min(10).max(1000),
                    })
                    .strict(),
                )
                .max(2),
              validationGap: item,
            })
            .strict(),
        )
        .length(3),
    })
    .strict(),
  synthesis: z.object({ synthesizedLines: z.array(line).length(1) }).strict(),
  finalBrief: z
    .object({
      campaign: text,
      objective: text,
      reasonToBelieve: text,
      audience: text,
      approvedStrategy: item,
      messagingDirection: list,
      supportingEvidence: list,
      creativeDirection: text,
      requiredAssets: list,
      channels: list,
      requirements: list,
      constraints: list,
      disclaimers: list,
      approvalNotes: list,
    })
    .strict(),
};
export type AgentType = keyof typeof outputSchemas;
// Keep historical/parser schemas compatible with saved findings without a
// locator. The model-facing strict schema must require every field; use an
// empty locator when no reference was supplied.
export const discoveryGenerationSchema = outputSchemas.discovery.extend({
  findings: z
    .array(
      discoveryFinding.extend({
        evidence: z.array(discoveryEvidence.extend({ locator: text })).max(4),
      }),
    )
    .min(1)
    .max(4),
});

export type AgentDataMap = {
  [K in AgentType]: z.infer<(typeof outputSchemas)[K]>;
};
export type AgentData = AgentDataMap[AgentType];

const sourceField = z.object({
  value: text,
  sourceValue: text,
  status: z.enum([
    "Supplied",
    "Not supplied",
    "Intentionally excluded",
    "Needs clarification",
  ]),
  note: text,
});
const fieldShape = Object.fromEntries(
  upstreamFields.map(({ key }) => [key, sourceField]),
) as Record<UpstreamKey, typeof sourceField>;
export const upstreamSchema = z.object({ fields: z.object(fieldShape) });
const campaignContext = z
  .object({
    campaignName: text,
    objective: text,
    audience: text,
    product: text,
    channel: text,
    constraints: text,
    jobToBeDone: text.optional(),
  })
  .strict();
export const foundationSchema = z
  .object({
    campaignIdentity: z
      .object({
        origin: z.enum(["source", "human_confirmed"]),
        sourceReference: text,
        confirmedAt: z.iso.datetime().optional(),
        id: item.optional(),
        displayName: text.optional(),
        sourceName: text.optional(),
        sourceDocumentTitle: text.optional(),
        sourceDocumentFileName: text.optional(),
        sourceCandidate: z
          .object({
            name: item,
            kind: z.enum(["explicit", "cover_title"]),
            excerpt: item,
            locator: item,
          })
          .strict()
          .optional(),
        humanConfirmedName: text.optional(),
        confirmationStatus: z
          .enum(["source_confirmed", "human_confirmed", "unresolved"])
          .optional(),
      })
      .strict()
      .optional(),
    parentPlatform: z
      .object({
        name: text,
        sourceValue: text,
        excerpt: text,
        line: z.number().int().positive(),
      })
      .strict()
      .optional(),
    jtbdContext: z
      .object({
        original: z.array(
          z
            .object({
              label: text,
              text,
              excerpt: text,
              line: z.number().int().positive(),
              approvalStatus: z.literal("unknown"),
            })
            .strict(),
        ),
        proposed: z.array(
          z
            .object({
              label: text,
              text,
              excerpt: text,
              line: z.number().int().positive(),
              approvalStatus: z.literal("not_approved"),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
    suppliedEvidence: z
      .array(
        z
          .object({
            id: item,
            source: item,
            locator: text,
            text: item,
            date: text,
            audience: text,
            accessScope: z.literal("supplied"),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    evidenceSparks: z.array(discoveryFindingWithProvenance).max(30).optional(),
    campaignContext,
    sourceBrief: text.optional(),
    currentRtb: z
      .object({
        original: text,
        proposal: text,
        status: sourceField.shape.status,
        approvalStatus: z.enum([
          "approved",
          "not_approved",
          "pending",
          "unknown",
        ]),
        reviewNote: text,
      })
      .strict(),
    currentResearch: text.min(1),
    selectedSparks: z
      .array(
        z
          .object({
            id: item,
            text: item,
            versionId: item,
            version: z.number().int().nonnegative(),
            title: text.optional(),
            rationale: text.optional(),
            campaignGrounding: text.optional(),
            hypothesisToValidate: text.optional(),
            territory_type: z.enum(sparkTerritoryTypes).optional(),
            territory: text.optional(),
            idea: text.optional(),
            excerpt: text.optional(),
            hypothesis: text.optional(),
            excerpt_verified: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    researchEmphasis: text,
    requirements: upstreamSchema,
  })
  .strict();
export type Foundation = z.infer<typeof foundationSchema>;
// Discovery versions were historically keyed from parser metadata as well as
// displayed field values. Preserve only these source-derived optional keys at
// the Discovery boundary; creative request schemas remain unchanged.
const discoverySourceField = sourceField.extend({
  present: z.boolean().optional(),
  occurrences: z.array(text).max(200).optional(),
});
const discoveryFieldShape = Object.fromEntries(
  upstreamFields.map(({ key }) => [key, discoverySourceField]),
) as Record<UpstreamKey, typeof discoverySourceField>;
const discoveryUpstreamSchema = z.object({
  fields: z.object(discoveryFieldShape),
});
const discoveryFoundationSchema = foundationSchema.extend({
  requirements: discoveryUpstreamSchema,
  currentResearch: text,
  selectedPreparationVersions: z
    .object({
      reasonToBelieve: text.optional(),
      research: text.optional(),
      sparks: text.optional(),
    })
    .strict()
    .optional(),
  preparationGuidance: z
    .object({
      reasonToBelieve: text.optional(),
      research: text.optional(),
      sparks: text.optional(),
    })
    .strict()
    .optional(),
  sourceAvailability: z
    .array(
      z
        .object({
          source: item,
          status: z.enum([
            "supplied_analyzed",
            "supplied_not_analyzed",
            "connected_searched",
            "available_not_searched",
            "not_connected",
            "search_failed",
            "insufficient_evidence",
          ]),
          detail: text,
        })
        .strict(),
    )
    .max(30)
    .optional(),
  selectedResearchSources: z.array(text).max(20).optional(),
  selectedResearch: z
    .array(
      z
        .object({
          id: item,
          versionId: item,
          version: z.number().int().nonnegative(),
          category: text,
          text,
          source: text,
          status: z.enum(["ai_synthesis", "supplied"]),
        })
        .strict(),
    )
    .max(100)
    .optional(),
  selectedSparks: z
    .array(foundationSchema.shape.selectedSparks.element)
    .max(30),
});
const preparation = z
  .object({
    parsedIMC: z.object({
      schemaVersion: z.literal(1),
      sourceText: text.min(1),
    }),
    upstream: upstreamSchema,
    selectedContent: z
      .object({
        reasonToBelieve: z
          .object({ versionId: item, version: z.number().int(), text })
          .strict()
          .optional(),
        research: z
          .object({ versionId: item, version: z.number().int(), text })
          .strict()
          .optional(),
        selectedSparks: z
          .array(
            z
              .object({
                id: item,
                versionId: item,
                version: z.number().int(),
                title: text.optional(),
                text: item,
                rationale: text.optional(),
                campaignGrounding: text.optional(),
                hypothesisToValidate: text.optional(),
                territory_type: z.enum(sparkTerritoryTypes).optional(),
                territory: text.optional(),
                idea: text.optional(),
                excerpt: text.optional(),
                hypothesis: text.optional(),
                excerpt_verified: z.boolean().optional(),
              })
              .strict(),
          )
          .max(6),
      })
      .strict()
      .optional(),
  })
  .strict();
const selectedLine = z
  .object({
    id: item,
    agentId: item,
    personaName: item,
    version: z.number().int().nonnegative(),
    text: item,
  })
  .strict();
const execution = z
  .object({
    requiredAssets: item,
    assetCount: z.number().int().min(1).max(1000),
    channels: item,
    placements: text,
    desktop: text,
    mobile: text,
    messaging: item,
    copy: item,
    creativeDirection: text.optional(),
    formats: text,
    timing: text,
    constraints: text,
  })
  .strict();
const base = {
  versionNumber: z.number().int().min(0).max(10000).optional(),
  guidance: z.string().max(8000).optional(),
  previousVersion: z
    .object({
      number: z.number().int().min(0).max(10000),
      text,
      data: z.unknown().optional(),
    })
    .strict()
    .optional(),
};
export const requestSchema = z.discriminatedUnion("agentType", [
  z
    .object({
      ...base,
      agentType: z.enum(["rtb", "research", "sparks"]),
      context: preparation,
      sparkRevision: z
        .object({
          targetId: item.optional(),
          keptIds: z.array(item).max(6).default([]),
          intent: z.enum(["explore", "improve"]).default("explore"),
        })
        .strict()
        .optional(),
      sparkHistory: z
        .array(
          z
            .object({
              number: z.number().int().min(1).max(10000),
              sparks: z.array(
                z
                  .object({
                    id: item,
                    title: text.optional(),
                    text: item,
                    territory_type: z.enum(sparkTerritoryTypes).optional(),
                    territory: text.optional(),
                    idea: text.optional(),
                  })
                  .strict(),
              ),
            })
            .strict(),
        )
        .max(50)
        .optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.literal("discovery"),
      context: z
        .object({
          foundation: discoveryFoundationSchema,
          preparationRole: z
            .enum(["data_synthesis", "evidence_sparks"])
            .optional(),
          lens: z.enum(discoveryLensIds),
          investigationType: z.enum(["problem", "hypothesis"]),
          question: item,
          action: z.enum(discoveryActions),
          selectedFinding: discoveryFindingWithProvenance.optional(),
          conversation: discoveryConversationSchema.optional(),
          previousFindings: z.array(discoveryFindingWithProvenance).max(30),
          peerFindings: z
            .array(discoveryFindingWithProvenance)
            .max(20)
            .optional(),
          routedFromLens: z.enum(discoveryLensIds).optional(),
        })
        .strict()
        .superRefine((context, issue) => {
          const memory = context.conversation;
          if (!memory) return;
          const invalid = (message: string) =>
            issue.addIssue({ code: "custom", message });
          if (
            memory.scope.question !== context.question ||
            memory.scope.investigationType !== context.investigationType
          )
            invalid(
              "Conversation scope does not match the current investigation.",
            );
          const selectedRef = context.selectedFinding
            ? `${context.selectedFinding.id}@${context.selectedFinding.runVersion}`
            : undefined;
          if (
            (memory.scope.kind === "finding" &&
              memory.scope.findingRef !== selectedRef) ||
            (memory.scope.kind === "agent" && memory.scope.findingRef)
          )
            invalid(
              "Conversation scope does not match the selected finding version.",
            );
          const current = memory.messages.at(-1);
          if (
            !current ||
            current.id !== memory.currentMessageId ||
            current.role !== "user"
          )
            invalid(
              "The current conversation turn must be the last user message.",
            );
          if (
            new Set(memory.messages.map((item) => item.id)).size !==
            memory.messages.length
          )
            invalid("Conversation message IDs must be unique.");
          if (JSON.stringify(memory).length > memory.budgetCharacters)
            invalid("The conversation exceeds its request-context budget.");
        }),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.literal("connections"),
      context: z
        .object({
          foundation: discoveryFoundationSchema,
          findings: z.array(discoveryFindingWithProvenance).min(2).max(12),
          // Aligned by index with selected findings when Kevin explicitly
          // compares earlier-context versions. These are historical source
          // snapshots, not newly retrieved or current-campaign evidence.
          sourceFoundations: z
            .array(discoveryFoundationSchema)
            .max(12)
            .optional(),
        })
        .strict()
        .superRefine((context, issue) => {
          if (
            context.sourceFoundations &&
            context.sourceFoundations.length !== context.findings.length
          )
            issue.addIssue({
              code: "custom",
              message:
                "Each selected finding requires its matching historical source snapshot.",
            });
        }),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.literal("strategySuggestions"),
      context: z
        .object({
          sourceBrief: text.min(1),
          campaignName: text,
          objective: text,
          audience: text,
          originalRtb: text,
          rtbApprovalStatus: z.enum([
            "approved",
            "not_approved",
            "pending",
            "unknown",
          ]),
          sourceExcerpts: z
            .array(z.object({ id: item, label: item, excerpt: item }).strict())
            .min(1)
            .max(40),
          sparkInputs: z
            .array(
              z
                .object({ id: item, title: item, idea: item, excerpt: text })
                .strict(),
            )
            .max(6),
          selectedResearch: z
            .array(z.object({ id: item, text: item, source: item }).strict())
            .max(20),
          savedFindings: z
            .array(
              z
                .object({
                  id: item,
                  title: item,
                  whatWeFound: item,
                  whyItMayMatter: item,
                  whatComplicatesIt: item,
                  questionToExplore: item,
                  evidenceState: z.enum(["evidence_supported", "research_gap"]),
                })
                .strict(),
            )
            .max(12),
          currentDraft: z
            .object({ briefLine: text, problem: text, insight: text })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.enum(perspectiveIds),
      context: foundationSchema,
      personality: personalitySchema.optional(),
      modelSettings: modelSettingsSchema.optional(),
      priorCandidates: z.array(text).max(50).optional(),
      previousVersions: z
        .array(
          z
            .object({
              number: z.number().int().min(0).max(10000),
              line: text,
              sliderValue: z.number().int().min(1).max(10),
              steering: z.string().max(8000),
            })
            .strict(),
        )
        .max(50)
        .optional(),
      refinementMode: z.enum(["explore", "improve"]).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.literal("synthesis"),
      context: z
        .object({
          foundation: foundationSchema,
          lines: z.array(selectedLine).min(2).max(20),
          weights: z.record(z.string(), z.number().min(0).max(100)),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.literal("finalBrief"),
      context: z
        .object({
          foundation: foundationSchema,
          approvedStrategy: z
            .object({
              briefLine: item,
              approvedBy: z.literal("Kevin"),
              approvedAt: z.iso.datetime(),
              source: item,
              approvalState: z.literal("Approved"),
            })
            .strict(),
          executionDirection: execution,
        })
        .strict(),
    })
    .strict(),
]);
export type AgentRequest = z.infer<typeof requestSchema>;
export type PerspectiveRequest = Extract<
  AgentRequest,
  { agentType: PerspectiveId }
>;
export function isPerspectiveRequest(
  request: AgentRequest,
): request is PerspectiveRequest {
  return isPerspective(request.agentType);
}

export const generationRecordSchema = z
  .object({
    agentId: z.enum(perspectiveIds),
    inputPackVersion: z.string(),
    foundation: foundationSchema,
    personality: personalitySchema,
    steeringText: z.string(),
    refinementMode: z.enum(["explore", "improve"]).optional(),
    modelSettings: modelSettingsSchema.extend({
      maxOutputTokens: z.number().int().positive().optional(),
    }),
    promptTemplateVersion: z.string(),
    promptVersion: z.string(),
    requestId: z.string(),
  })
  .strict();
export type GenerationRecord = z.infer<typeof generationRecordSchema>;

export interface AgentResponse<T = AgentData> {
  promptTemplateVersion?: string;
  promptVersion?: string;
  provider: "mock" | "openai";
  model?: string;
  data: T;
  generatedAt: string;
  generation?: GenerationRecord;
}
export interface AIStatus {
  model?: string;
  mode: "mock" | "live";
  provider: "mock" | "openai";
  configured: boolean;
  error?: string;
}
