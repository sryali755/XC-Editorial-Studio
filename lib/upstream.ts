import { imcSchema, parseIMCBrief } from "./imc-parser";
import type {
  PreparationState,
  ParsedIMCBrief,
  StrategyInputPack,
  UpstreamContext,
  SourceField,
  UpstreamKey,
} from "./types";

export const upstreamFields: {
  key: UpstreamKey;
  label: string;
  group: string;
  aliases: string[];
}[] = [
  {
    key: "campaignName",
    label: "Campaign name",
    group: "Campaign context",
    aliases: ["Campaign", "Campaign name"],
  },
  {
    key: "objective",
    label: "Objective",
    group: "Campaign context",
    aliases: ["Objective"],
  },
  {
    key: "audience",
    label: "Audience",
    group: "Campaign context",
    aliases: ["Audience"],
  },
  {
    key: "product",
    label: "Offer / product",
    group: "Campaign context",
    aliases: ["Product", "Offer"],
  },
  {
    key: "channel",
    label: "Channel",
    group: "Campaign context",
    aliases: ["Channels", "Channel"],
  },
  {
    key: "constraints",
    label: "Constraints",
    group: "Campaign context",
    aliases: ["Constraints"],
  },
  {
    key: "originalRTB",
    label: "Original upstream RTB",
    group: "Upstream RTB",
    aliases: ["Reason to believe", "RTB"],
  },
  {
    key: "research",
    label: "Original upstream research",
    group: "Upstream research",
    aliases: ["Research", "Evidence"],
  },
  {
    key: "brandMessaging",
    label: "Brand messaging",
    group: "Brand messaging & hierarchy",
    aliases: ["Approved brand messaging", "Brand messaging"],
  },
  {
    key: "messagingApproval",
    label: "Brand messaging approval status",
    group: "Brand messaging & hierarchy",
    aliases: ["Brand messaging approval", "Messaging approval"],
  },
  {
    key: "messageHierarchy",
    label: "Message hierarchy",
    group: "Brand messaging & hierarchy",
    aliases: ["Message hierarchy"],
  },
  {
    key: "brandGuidelines",
    label: "Brand guidelines / Harmony",
    group: "Brand messaging & hierarchy",
    aliases: ["Brand guidelines", "Harmony"],
  },
  {
    key: "briefType",
    label: "Brief type",
    group: "Planning context",
    aliases: ["Brief type"],
  },
  {
    key: "campaignTier",
    label: "Campaign tier",
    group: "Planning context",
    aliases: ["Campaign tier", "Tier"],
  },
  {
    key: "kpis",
    label: "Success measures / KPIs",
    group: "Planning context",
    aliases: ["KPIs", "Success measures"],
  },
  {
    key: "learningAgenda",
    label: "Learning agenda",
    group: "Planning context",
    aliases: ["Learning agenda"],
  },
  {
    key: "journeyDestinations",
    label: "Journey destinations",
    group: "Planning context",
    aliases: ["Journey destinations"],
  },
  {
    key: "milestones",
    label: "GTM milestones",
    group: "Planning context",
    aliases: ["Milestones", "GTM milestones"],
  },
  {
    key: "eligibility",
    label: "Eligibility",
    group: "Execution restrictions",
    aliases: ["Eligibility"],
  },
  {
    key: "exclusions",
    label: "Audience exclusions",
    group: "Execution restrictions",
    aliases: ["Audience exclusions", "Exclusions"],
  },
  {
    key: "substantiation",
    label: "Substantiation / claim evidence",
    group: "Execution restrictions",
    aliases: ["Substantiation", "Claim evidence"],
  },
  {
    key: "disclaimers",
    label: "Required disclaimers",
    group: "Execution restrictions",
    aliases: ["Disclaimers", "Required disclaimers"],
  },
  {
    key: "partnerApproval",
    label: "Partner approval status",
    group: "Execution restrictions",
    aliases: ["Partner approval", "Partner approvals"],
  },
  {
    key: "sourceVersion",
    label: "Upstream document version",
    group: "Source & approval record",
    aliases: ["Document version", "Source version"],
  },
  {
    key: "upstreamApproval",
    label: "Upstream approval status",
    group: "Source & approval record",
    aliases: ["Upstream approval", "Approval status"],
  },
  {
    key: "sourceReferences",
    label: "Supporting source references",
    group: "Source & approval record",
    aliases: ["Resources", "Source references"],
  },
];
export const fieldStatuses = [
  "Supplied",
  "Not supplied",
  "Intentionally excluded",
  "Needs clarification",
] as const;
export function extractUpstream(
  source: string | ParsedIMCBrief,
): UpstreamContext {
  const parsed = typeof source === "string" ? parseIMCBrief(source) : source;
  const entries = imcSchema.map((def) => [
    def.upstreamKey,
    { ...parsed.fields[def.key] },
  ]);
  return {
    fields: {
      ...Object.fromEntries(entries),
      ...Object.fromEntries(
        Object.entries(parsed.supplemental)
          .filter(([key]) => key !== "brand")
          .map(([key, value]) => [key, { ...value }]),
      ),
    } as UpstreamContext["fields"],
  };
}
export function getParsedIMC(state: PreparationState): ParsedIMCBrief {
  return state.parsedIMC?.schemaVersion === 1 &&
    state.parsedIMC.parserVersion === 2 &&
    state.parsedIMC.sourceText === state.sourceSnapshot
    ? state.parsedIMC
    : parseIMCBrief(state.sourceSnapshot);
}
// Migrate old sessions from source text without letting incomplete legacy extraction
// mask a field that the canonical parser has now found.
export function getUpstream(state: PreparationState): UpstreamContext {
  const extracted = reconcileUpstream(getParsedIMC(state), state.upstream);
  if (!state.upstream) {
    for (const key of Object.keys(
      state.context,
    ) as (keyof PreparationState["context"])[]) {
      const value = state.context[key];
      if (value && extracted.fields[key].status === "Not supplied")
        extracted.fields[key] = {
          ...extracted.fields[key],
          value,
          status: "Supplied",
        };
    }
  }
  return extracted;
}
export function reconcileUpstream(
  parsed: ParsedIMCBrief,
  reviewed?: UpstreamContext,
): UpstreamContext {
  const extracted = extractUpstream(parsed);
  if (reviewed) {
    for (const definition of upstreamFields) {
      const key = definition.key;
      const review = reviewed.fields[key];
      const original = extracted.fields[key];
      if (!review) continue;
      // An older parser's extraction is not a human edit. Repair it from source.
      if (
        review.sourceValue !== original.sourceValue &&
        review.value === review.sourceValue &&
        review.status === original.status
      )
        continue;
      if (
        review.status === "Not supplied" &&
        original.status !== "Not supplied"
      )
        continue;
      extracted.fields[key] = { ...review, sourceValue: original.sourceValue };
    }
  }
  return extracted;
}
export function fieldText(field: SourceField): string {
  if (field.status === "Supplied") return field.value || "Not supplied";
  return `${field.status}${field.note ? ` — ${field.note}` : ""}${field.status === "Needs clarification" && field.value ? `\nUnconfirmed supplied detail: ${field.value}` : ""}`;
}
export function upstreamSections(upstream?: UpstreamContext) {
  if (!upstream) return [];
  return [...new Set(upstreamFields.map((f) => f.group))]
    .filter((g) => g !== "Campaign context" && g !== "Upstream RTB")
    .map((group) => ({
      title: group,
      content: upstreamFields
        .filter((f) => f.group === group)
        .map(
          (f) =>
            `${f.label}: ${fieldText(upstream.fields[f.key])}${upstream.fields[f.key].status === "Supplied" && upstream.fields[f.key].note ? `\nReview note: ${upstream.fields[f.key].note}` : ""}`,
        )
        .join("\n\n"),
    }));
}
export function sourceContext(
  upstream: UpstreamContext,
): PreparationState["context"] {
  return Object.fromEntries(
    upstreamFields
      .filter((f) => f.group === "Campaign context")
      .map((f) => [
        f.key,
        upstream.fields[f.key].status === "Not supplied"
          ? ""
          : fieldText(upstream.fields[f.key]),
      ]),
  ) as PreparationState["context"];
}
export function carryUpstream(pack: StrategyInputPack) {
  // Structured fields, including exclusion flags, are part of the payload sent to each adapter.
  return upstreamSections(pack.upstream);
}
