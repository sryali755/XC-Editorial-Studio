import { z } from "zod";
import { upstreamFields } from "../upstream";
import type { UpstreamKey } from "../types";

const text = z.string().max(60000);
const item = z.string().min(1).max(12000);
const list = z.array(item).max(30);
const line = z.object({ id: item, line: item, rationale: text }).strict();
const perspective = z
  .object({ briefLines: z.array(line).length(1), perspectiveSummary: text })
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
      xcAdaptation: text.nullable(),
      adaptationStatus: z.literal("not_approved"),
      reviewNotes: list,
      evidenceGaps: list,
    })
    .strict(),
  research: z
    .object({
      suppliedEvidence: list,
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
      sparks: z
        .array(
          z
            .object({ id: item, title: text, text: item, rationale: text })
            .strict(),
        )
        .length(6),
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
  })
  .strict();
export const foundationSchema = z
  .object({
    campaignContext,
    currentRtb: z
      .object({
        original: text,
        proposal: text,
        status: sourceField.shape.status,
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
    })
    .strict(),
  z
    .object({
      ...base,
      agentType: z.enum(["humor", "culture", "audience", "market", "brand"]),
      context: foundationSchema,
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

export interface AgentResponse<T = AgentData> {
  provider: "mock" | "openai";
  model?: string;
  data: T;
  generatedAt: string;
}
export interface AIStatus {
  mode: "mock" | "live";
  provider: "mock" | "openai";
  configured: boolean;
  error?: string;
}
