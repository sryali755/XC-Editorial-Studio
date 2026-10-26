import { z } from "zod";
import {
  campaignFieldKeys,
  campaignSections,
  type CampaignFieldKey,
} from "./campaign-field-classifier";
import {
  buildSourceRegistry,
  originalSourceExcerpt,
  sourceRegistrySchema,
  type SuppliedSourceInput,
} from "./source-registry";
import type { UpstreamContext } from "./types";

const referenceSchema = z
  .object({
    documentId: z.string(),
    passageId: z.string(),
    locator: z.string(),
    excerpt: z.string(),
  })
  .strict();
const valueSchema = z
  .object({
    value: z.string(),
    origin: z.enum(["source", "human_edit", "ai_suggestion"]),
    approval: z.enum(["unknown", "not_approved"]),
    references: z.array(referenceSchema),
  })
  .strict();
const fieldSchema = z
  .object({
    state: z.enum([
      "supplied",
      "not_supplied",
      "needs_review",
      "intentionally_excluded",
    ]),
    values: z.array(valueSchema),
    notes: z.array(z.string()),
  })
  .strict();
export const canonicalCampaignSchema = z
  .object({
    version: z.literal(1),
    sourceRegistry: sourceRegistrySchema,
    fields: z.record(z.enum(campaignFieldKeys), fieldSchema),
    humanEdits: z.array(
      z.object({ field: z.string(), value: valueSchema }).strict(),
    ),
    suggestions: z.array(
      z.object({ field: z.string(), value: valueSchema }).strict(),
    ),
    unknowns: z.array(
      z
        .object({
          label: z.string(),
          state: z.literal("needs_review"),
          reason: z.string(),
          excerpt: z.string(),
          candidates: z.array(z.enum(campaignFieldKeys)),
        })
        .strict(),
    ),
    usable: z.boolean(),
  })
  .strict();
export type CanonicalCampaign = z.infer<typeof canonicalCampaignSchema>;
interface CanonicalInput {
  sourceBrief?: string;
  requirements: UpstreamContext;
  campaignContext?: { campaignName: string };
  suppliedEvidence?: SuppliedSourceInput[];
  proposedJTBD?: string;
  currentRtb?: { proposal: string };
  selectedSparks?: { text: string }[];
  selectedResearch?: { text: string }[];
}

// Derived view only. Never stored over user drafts, never grants source approval.
export function canonicalCampaign(input: CanonicalInput): CanonicalCampaign {
  const source = input.sourceBrief ?? "";
  const registry = buildSourceRegistry(source, input.suppliedEvidence);
  const fields = Object.fromEntries(
    campaignFieldKeys.map((key) => [
      key,
      { state: "not_supplied", values: [], notes: [] },
    ]),
  ) as unknown as CanonicalCampaign["fields"];
  const unknowns: CanonicalCampaign["unknowns"] = [];
  const sourceDocuments = new Set(
    registry.documents
      .filter((document) => document.kind === "imc")
      .map((document) => document.id),
  );
  const refs = (value: string, section: string) =>
    registry.passages
      .filter((passage) => sourceDocuments.has(passage.documentId))
      .flatMap((passage) => {
        const match = originalSourceExcerpt(passage.text, value);
        if (match)
          return [
            {
              documentId: passage.documentId,
              passageId: passage.id,
              locator: passage.locator,
              excerpt: match.excerpt,
            },
          ];
        const sectionMatch = originalSourceExcerpt(section, passage.text);
        return sectionMatch
          ? [
              {
                documentId: passage.documentId,
                passageId: passage.id,
                locator: passage.locator,
                excerpt: passage.text,
              },
            ]
          : [];
      });
  const add = (key: CampaignFieldKey, value: string, section: string) => {
    if (!value.trim()) return;
    const field = fields[key];
    if (/^intentionally excluded\b/i.test(value))
      field.state = "intentionally_excluded";
    else if (
      /^(?:not (?:supplied|provided)|unknown|tbc|tbd|n\/a)[.!]?$/i.test(
        value.trim(),
      )
    ) {
      field.notes.push(`Source explicitly states: ${value}`);
      return;
    } else field.state = "supplied";
    const references = refs(value, section);
    field.values.push({
      value,
      origin: "source",
      approval: "unknown",
      references,
    });
    if (!references.length) {
      field.state = "needs_review";
      field.notes.push(
        "Review this field against the original source; its passage could not be located unambiguously.",
      );
    }
  };
  for (const section of campaignSections(source)) {
    if (section.classification.key)
      add(section.classification.key, section.value, section.excerpt);
    else if (!/^(?:Source|Extraction|Import notes)/i.test(section.label))
      unknowns.push({
        label: section.label,
        state: "needs_review",
        excerpt: section.excerpt,
        reason: section.classification.candidates.length
          ? "This heading fits multiple fields; review before assigning."
          : "Unfamiliar heading retained for review, not silently assigned.",
        candidates: section.classification.candidates,
      });
  }
  // Structured/legacy formats (JSON, CSV and campaign PDF cover headings) can
  // provide authoritative values even when there is no plain heading section.
  const fallback: Partial<
    Record<CampaignFieldKey, keyof UpstreamContext["fields"]>
  > = {
    campaignName: "campaignName",
    campaignObjectives: "objective",
    audiences: "audience",
    rtbs: "originalRTB",
    product: "product",
    channels: "channel",
    constraints: "constraints",
    kpis: "kpis",
    research: "research",
  };
  for (const [key, legacy] of Object.entries(fallback) as [
    CampaignFieldKey,
    keyof UpstreamContext["fields"],
  ][]) {
    if (
      fields[key].values.length ||
      (key === "campaignObjectives" &&
        (fields.businessObjectives.values.length ||
          fields.communicationObjectives.values.length))
    )
      continue;
    const original = input.requirements.fields[legacy];
    if (original.sourceValue.trim() && original.status !== "Not supplied")
      add(key, original.sourceValue, source);
  }
  if (
    new Set(fields.campaignName.values.map((item) => item.value.trim())).size >
    1
  ) {
    fields.campaignName.state = "needs_review";
    fields.campaignName.notes.push(
      "Conflicting campaign names require selection or review.",
    );
  }
  const humanEdits: CanonicalCampaign["humanEdits"] = Object.entries(
    input.requirements.fields,
  )
    .filter(
      ([, field]) =>
        field.value !== field.sourceValue &&
        (field.status === "Needs clarification" ||
          (field.status === "Supplied" && field.value.trim())),
    )
    .map(([field, value]) => ({
      field,
      value: {
        value: value.value,
        origin: "human_edit",
        approval: "not_approved",
        references: [],
      },
    }));
  const displayName = input.campaignContext?.campaignName;
  if (
    displayName &&
    displayName !== input.requirements.fields.campaignName.sourceValue
  )
    humanEdits.push({
      field: "campaignName",
      value: {
        value: displayName,
        origin: "human_edit",
        approval: "not_approved",
        references: [],
      },
    });
  const suggestions: CanonicalCampaign["suggestions"] = [
    ["jtbd", input.proposedJTBD],
    ["rtbAdaptation", input.currentRtb?.proposal],
    ...(input.selectedSparks ?? []).map((item) => ["spark", item.text]),
  ].flatMap(([field, value]) =>
    value?.trim()
      ? [
          {
            field: field!,
            value: {
              value,
              origin: "ai_suggestion" as const,
              approval: "not_approved" as const,
              references: [],
            },
          },
        ]
      : [],
  );
  const usable = campaignFieldKeys.some(
    (key) =>
      key !== "campaignName" &&
      fields[key].state === "supplied" &&
      fields[key].values.length,
  );
  if (!usable && source.trim() && !unknowns.length)
    unknowns.push({
      label: "Unclassified document",
      state: "needs_review",
      reason:
        "No usable labelled campaign content was identified. Original text is retained; add or review campaign context.",
      excerpt: source,
      candidates: [],
    });
  return {
    version: 1,
    sourceRegistry: registry,
    fields,
    humanEdits,
    suggestions,
    unknowns,
    usable,
  };
}
