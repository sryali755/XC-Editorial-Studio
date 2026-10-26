// One constrained classifier for source headings. It classifies labels, never
// invents field values or infers product claims from surrounding narrative.
export const campaignFieldKeys = [
  "campaignName",
  "background",
  "campaignObjectives",
  "businessObjectives",
  "communicationObjectives",
  "audiences",
  "jtbd",
  "rtbs",
  "insights",
  "barriers",
  "research",
  "creativeConsiderations",
  "keyMessages",
  "cta",
  "deliverables",
  "constraints",
  "kpis",
  "timelines",
  "product",
  "channels",
] as const;
export type CampaignFieldKey = (typeof campaignFieldKeys)[number];
const aliases: Record<CampaignFieldKey, string[]> = {
  campaignName: ["Campaign", "Campaign name", "Campaign title", "Project name"],
  background: [
    "Background",
    "Context",
    "Campaign background",
    "Project description",
    "Situation",
    "Why this work",
  ],
  campaignObjectives: [
    "Objective",
    "Objectives",
    "Campaign objective",
    "Desired outcome",
  ],
  businessObjectives: [
    "Business objective",
    "Business objectives",
    "Business goal",
    "Commercial objective",
    "Commercial goal",
    "What the business needs",
  ],
  communicationObjectives: [
    "Communication objective",
    "Communications objective",
    "Marketing objective",
    "Communication goal",
    "What communication must achieve",
  ],
  audiences: [
    "Audience",
    "Audiences",
    "Target audience",
    "Target audiences",
    "Target",
    "Priority audience",
    "Primary audience",
    "Audience segments",
    "Who we are talking to",
    "Who are we talking to",
  ],
  jtbd: [
    "JTBD",
    "Job to be done",
    "Jobs to be done",
    "Customer job",
    "Audience job",
  ],
  rtbs: [
    "RTB",
    "RTBs",
    "Reason to believe",
    "Reasons to believe",
    "Proof",
    "Proof/RTB",
    "Proof / RTBs",
    "Supporting proof",
    "Product proof",
    "Reasons to Believe (RTBs)",
  ],
  insights: [
    "Insight",
    "Consumer insight",
    "Audience insight",
    "Insight/opportunity",
    "Strategic insight",
    "Consumer tension",
  ],
  barriers: [
    "Barrier",
    "Barriers",
    "Consumer barriers",
    "Audience barriers",
    "Obstacles",
    "What is getting in the way",
  ],
  research: [
    "Research",
    "Data points",
    "Data and research",
    "Supporting research",
    "Evidence",
    "Supporting evidence",
    "Audience research",
    "Research findings",
  ],
  creativeConsiderations: [
    "Creative considerations",
    "Thought starters",
    "Thought-starters",
    "Sparks",
    "Creative opportunities",
  ],
  keyMessages: [
    "Key message",
    "Key messages",
    "Consumer takeaway",
    "Message",
    "Messaging",
  ],
  cta: [
    "CTA",
    "Call to action",
    "Marketing destinations/CTA",
    "Desired action",
  ],
  deliverables: [
    "Deliverables",
    "Expected deliverables",
    "Required assets",
    "Outputs",
    "Assets to create",
  ],
  constraints: [
    "Constraints",
    "Mandatories",
    "Creative mandatories",
    "Creative requirements",
    "Requirements",
    "Restrictions",
  ],
  kpis: [
    "KPI",
    "KPIs",
    "Success indicators",
    "Success measures",
    "Success metrics",
    "How we measure success",
  ],
  timelines: ["Timeline", "Timelines", "Timing", "Dates", "Milestones"],
  product: ["Product", "Offer", "Product information", "Offer / product"],
  channels: [
    "Channel",
    "Channels",
    "Comms approach",
    "Media channels",
    "Placements",
  ],
};
const normalize = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const lookup = new Map(
  Object.entries(aliases).flatMap(([key, values]) =>
    values.map((value) => [normalize(value), key as CampaignFieldKey] as const),
  ),
);
export function classifyCampaignHeading(label: string): {
  key?: CampaignFieldKey;
  method: "alias" | "semantic" | "unmapped";
  candidates: CampaignFieldKey[];
} {
  const clean = normalize(label.replace(/^(?:section\s+)?\d+[.)-]?\s+/i, ""));
  const exact = lookup.get(clean);
  if (exact) return { key: exact, method: "alias", candidates: [exact] };
  // Wrapped source prose is not an inferred heading merely because it mentions
  // proof or an audience. Only short, nominal labels enter semantic matching.
  if (
    clean.split(" ").length > 9 ||
    /[.!?;,]/.test(label) ||
    /\b(?:is|are|was|were|can|may|will|must|should|has|have|includes?|provides?)\b/.test(
      clean,
    )
  )
    return { method: "unmapped", candidates: [] };
  if (/\b(?:approval|approved|substantiation|disclaimer)\b/.test(clean))
    return { method: "unmapped", candidates: [] };
  // Local semantic classification is constrained to explicit heading concepts.
  // A multi-purpose/ambiguous heading is reviewable, not assigned arbitrarily.
  const rules: [CampaignFieldKey, RegExp][] = [
    [
      "businessObjectives",
      /\b(?:business|commercial|sales)\b.*\b(?:goal|objective|outcome|ambition)s?\b/,
    ],
    [
      "communicationObjectives",
      /\b(?:communication|communications|marketing)\b.*\b(?:goal|objective|outcome)s?\b/,
    ],
    [
      "audiences",
      /\b(?:target|intended|priority|primary)\b.*\b(?:audience|customer|people|segment)s?\b/,
    ],
    ["rtbs", /\b(?:proof|rtbs?|reasons? to believe)\b/],
    [
      "barriers",
      /\b(?:consumer|customer|audience)\b.*\b(?:barrier|obstacle|friction)s?\b/,
    ],
    [
      "insights",
      /\b(?:consumer|customer|audience)\b.*\b(?:insight|tension|opportunity)s?\b/,
    ],
    [
      "research",
      /\b(?:research|evidence|data)\b.*\b(?:findings|points|support|results)\b/,
    ],
    [
      "deliverables",
      /\b(?:required|expected)\b.*\b(?:assets|deliverables|outputs)\b/,
    ],
    ["kpis", /\b(?:kpis|metrics|measurement)\b/],
  ];
  const candidates = [
    ...new Set(
      rules.filter(([, rule]) => rule.test(clean)).map(([key]) => key),
    ),
  ];
  return candidates.length === 1
    ? { key: candidates[0], method: "semantic", candidates }
    : { method: "unmapped", candidates };
}

export const legacyCampaignFields: Partial<Record<CampaignFieldKey, string>> = {
  campaignName: "campaign",
  campaignObjectives: "objective",
  businessObjectives: "objective",
  communicationObjectives: "objective",
  audiences: "audience",
  rtbs: "reason_to_believe",
  insights: "research",
  research: "research",
  constraints: "constraints",
  kpis: "kpis",
  product: "product",
  channels: "channels",
};

export interface CampaignSection {
  label: string;
  value: string;
  excerpt: string;
  line: number;
  classification: ReturnType<typeof classifyCampaignHeading>;
}
export function campaignSections(source: string): CampaignSection[] {
  const lines = source.split(/\r?\n/);
  const headings = lines.flatMap((line, index) => {
    if (
      /^\s*(?:[•*+-]\s+|Source:|Extraction:|Import notes|## Source (?:page|slide))/i.test(
        line,
      )
    )
      return [];
    const clean = line
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/\*\*/g, "")
      .trim();
    const table = clean.match(/^\|?\s*([^|]+?)\s*\|\s*(.*?)\s*\|?$/);
    if (table) {
      const classification = classifyCampaignHeading(table[1]);
      if (!classification.key && !classification.candidates.length) return [];
    }
    const inline = table ?? clean.match(/^([^:\n]{2,100}):\s*(.*)$/);
    const label = inline?.[1] ?? clean;
    const classification = classifyCampaignHeading(label);
    if (
      !classification.key &&
      /^(?:Customer|Prospect(?:\s*&\s*TOT)?(?: only)?|Primary|Secondary)$/i.test(
        label,
      )
    )
      return [];
    const looksHeading =
      !!inline || /^\s*#{1,6}\s+/.test(line) || !!classification.key;
    return looksHeading
      ? [{ index, label, inline: inline?.[2] ?? "", classification }]
      : [];
  });
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? lines.length;
    return {
      label: heading.label,
      value: [heading.inline, ...lines.slice(heading.index + 1, end)]
        .join("\n")
        .trim(),
      excerpt: lines.slice(heading.index, end).join("\n").trim(),
      line: heading.index + 1,
      classification: heading.classification,
    };
  });
}
