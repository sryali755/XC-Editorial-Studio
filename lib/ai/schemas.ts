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
  mode: "mock" | "live";
  provider: "mock" | "openai";
  configured: boolean;
  error?: string;
}
