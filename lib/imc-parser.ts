import type {
  IMCFieldKey,
  ParsedIMCBrief,
  ParsedIMCField,
  UpstreamKey,
} from "./types";
import {
  classifyCampaignHeading,
  legacyCampaignFields,
} from "./campaign-field-classifier";

export const IMC_PARSER_VERSION = 7;

// One canonical extraction schema, independent of agent prompts and UI field names.
export const imcSchema: {
  key: IMCFieldKey;
  upstreamKey: UpstreamKey;
  aliases: string[];
}[] = [
  {
    key: "campaign",
    upstreamKey: "campaignName",
    aliases: ["Campaign name", "Campaign title"],
  },
  {
    key: "objective",
    upstreamKey: "objective",
    aliases: [
      "Objectives",
      "Campaign objective",
      "Business objective",
      "Business objectives",
      "Marketing objective",
      "Communications objective",
      "Communication objective",
    ],
  },
  {
    key: "audience",
    upstreamKey: "audience",
    aliases: ["Priority audience", "Target audience", "Primary audience"],
  },
  {
    key: "product",
    upstreamKey: "product",
    aliases: ["Offer", "Offer / product", "Offer and product details"],
  },
  { key: "channels", upstreamKey: "channel", aliases: ["Channel"] },
  {
    key: "constraints",
    upstreamKey: "constraints",
    aliases: [
      "Creative requirements",
      "Requested deliverables",
      "Creative considerations",
    ],
  },
  {
    key: "reason_to_believe",
    upstreamKey: "originalRTB",
    aliases: [
      "RTB",
      "RTBs",
      "Reasons to believe",
      "Reason to Believe (RTB)",
      "Reasons to Believe (RTB)",
      "Reasons to Believe (RTBs)",
      "Reasons to Believe – by tactic length",
      "Original upstream RTB",
    ],
  },
  {
    key: "research",
    upstreamKey: "research",
    aliases: [
      "Evidence",
      "Data & research",
      "Supporting data & research",
      "Supporting research",
      "Illustrative consumer observations",
      "Historical campaign performance",
      "Competitive intelligence",
      "Validated consumer research",
      "Audience insight",
      "Consumer tension",
    ],
  },
  {
    key: "brief_type",
    upstreamKey: "briefType",
    aliases: ["Campaign type"],
  },
  { key: "campaign_tier", upstreamKey: "campaignTier", aliases: ["Tier"] },
  {
    key: "kpis",
    upstreamKey: "kpis",
    aliases: [
      "Success measures",
      "Success measures / KPIs",
      "Success metrics",
      "Primary KPIs",
      "Secondary KPIs",
    ],
  },
  {
    key: "brand_messaging",
    upstreamKey: "brandMessaging",
    aliases: [
      "Approved brand messaging",
      "Expected creative direction",
      "Core creative thought",
    ],
  },
  {
    key: "messaging_approval",
    upstreamKey: "messagingApproval",
    aliases: [
      "Brand messaging approval",
      "Brand messaging approval status",
      "Messaging approval status",
    ],
  },
  { key: "message_hierarchy", upstreamKey: "messageHierarchy", aliases: [] },
  {
    key: "brand_guidelines",
    upstreamKey: "brandGuidelines",
    aliases: ["Harmony", "Brand guidelines / Harmony"],
  },
  {
    key: "eligibility",
    upstreamKey: "eligibility",
    aliases: ["Eligibility details"],
  },
  {
    key: "exclusions",
    upstreamKey: "exclusions",
    aliases: ["Audience exclusions"],
  },
  {
    key: "substantiation",
    upstreamKey: "substantiation",
    aliases: [
      "Claim evidence",
      "Substantiation / claim evidence",
      "Product claim substantiation",
    ],
  },
  {
    key: "disclaimers",
    upstreamKey: "disclaimers",
    aliases: ["Required disclaimers"],
  },
];
const supplementalSchema: { key: UpstreamKey | "brand"; aliases: string[] }[] =
  [
    { key: "brand", aliases: ["Brand name"] },
    {
      key: "gtmApprovedRTB",
      aliases: [
        "GTM-approved RTB",
        "GTM approved RTB",
        "GTM-approved reason to believe",
        "GTM approved reason to believe",
      ],
    },
    {
      key: "rtbApproval",
      aliases: [
        "RTB approval",
        "RTB approval status",
        "Reason to believe approval",
        "Reason to believe approval status",
        "GTM RTB approval status",
      ],
    },
    { key: "learningAgenda", aliases: ["Learning agenda"] },
    { key: "journeyDestinations", aliases: ["Journey destinations"] },
    { key: "milestones", aliases: ["Milestones", "GTM milestones"] },
    {
      key: "partnerApproval",
      aliases: [
        "Partner approval",
        "Partner approvals",
        "Partner approval status",
      ],
    },
    {
      key: "sourceVersion",
      aliases: [
        "Document version",
        "Source version",
        "Upstream document version",
      ],
    },
    {
      key: "upstreamApproval",
      aliases: [
        "Upstream approval",
        "Approval status",
        "Upstream approval status",
        "Status",
      ],
    },
    {
      key: "sourceReferences",
      aliases: [
        "Resources",
        "Source references",
        "Supporting source references",
      ],
    },
  ];
function normalize(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
const labels = new Map<string, string>();
for (const def of imcSchema)
  for (const label of [def.key, def.upstreamKey, ...def.aliases])
    labels.set(normalize(label), def.key);
for (const def of supplementalSchema)
  for (const label of [def.key, ...def.aliases])
    labels.set(normalize(label), def.key);

function stripMarkdownLabel(value: string) {
  return value
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-*+]\s+|\d{1,3}[.)]\s*)/, "")
    .replace(/^(?:section\s+)?\d{1,3}\s*[-–—.:)]\s*/i, "")
    .replace(/^[\s*_`~]+|[\s*_`~#]+$/g, "")
    .trim();
}

function labelCandidates(value: string) {
  const label = stripMarkdownLabel(value);
  return [
    label,
    label.replace(/\s*\([^)]*\)\s*$/, ""),
    label.split(/\s+(?:[—–-]|\/|\|)\s+/, 1)[0],
  ].filter((candidate, index, candidates) => {
    const normalized = normalize(candidate);
    return (
      normalized &&
      candidates.findIndex((item) => normalize(item) === normalized) === index
    );
  });
}

function resolveLabel(value: string) {
  for (const candidate of labelCandidates(value)) {
    const key = labels.get(normalize(candidate));
    if (key) return key;
  }
  const classified = classifyCampaignHeading(stripMarkdownLabel(value));
  if (classified.key)
    return (
      legacyCampaignFields[classified.key] ?? `canonical:${classified.key}`
    );
  // Reviewable multi-purpose labels delimit the preceding field without
  // assigning their ambiguous contents to that field or either candidate.
  if (classified.candidates.length > 1) return "canonical:needs_review";
}

function classify(occurrences: string[]): ParsedIMCField {
  // Presence is determined only after the entire document has been parsed.
  const original = occurrences.join("\n\n");
  const nonempty = occurrences.filter((v) => v.trim());
  const excluded =
    /^(?:intentionally\s+excluded|explicitly\s+excluded|excluded\s+by\s+design)(?:[.\s:—–-]|$)/i;
  const declaredMissing = /^not\s+supplied[.]?$/i;
  const allExcluded =
    nonempty.length > 0 && nonempty.every((v) => excluded.test(v.trim()));
  const missing =
    !nonempty.length || nonempty.every((v) => declaredMissing.test(v.trim()));
  return Object.freeze({
    value: original,
    sourceValue: original,
    status: allExcluded
      ? "Intentionally excluded"
      : missing
        ? "Not supplied"
        : "Supplied",
    note: allExcluded
      ? original.replace(excluded, "").replace(/^[.\s:—–-]+/, "")
      : occurrences.length > 1
        ? "Multiple occurrences preserved in document order."
        : "",
    present: occurrences.length > 0,
    occurrences: Object.freeze([...occurrences]),
  });
}

// Decode a field/value CSV or a header-row CSV, including quoted multiline values.
function csvFields(text: string): [string, string][] | null {
  const content = text.replace(/^Source: [^\n]*\n/, "");
  const first = content.split(/\r?\n/, 1)[0];
  if (!first.includes(",")) return null;
  const firstLabel = first.split(",", 1)[0].trim().replace(/^"|"$/g, "");
  if (!resolveLabel(firstLabel) && !/^(field|key)$/i.test(firstLabel))
    return null;
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(value);
      value = "";
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && content[i + 1] === "\n") i++;
      }
    } else value += char;
  }
  if (quoted)
    throw new Error(
      "The CSV brief has an unclosed quoted value. Check the file before preparing.",
    );
  if (value || row.length) rows.push([...row, value]);
  const header = rows[0];
  if (header.length > 1 && header.every((cell) => resolveLabel(cell)))
    return rows
      .slice(1)
      .flatMap((record) =>
        header.map(
          (label, i) =>
            [resolveLabel(label)!, record[i] ?? ""] as [string, string],
        ),
      );
  return rows.flatMap(([label, ...cells]) => {
    const key = resolveLabel(label);
    return key ? [[key, cells.join(",")] as [string, string]] : [];
  });
}

/** Deterministic extraction of labeled text, Markdown headings/tables, or a JSON object.
 * Values retain their original wording and internal line breaks; labels and their delimiters
 * are removed. Unlabeled prose is never guessed into a field.
 */
export function parseIMCBrief(sourceText: string): ParsedIMCBrief {
  const found = new Map<string, string[]>();
  const append = (key: string, text: string) =>
    found.set(key, [...(found.get(key) ?? []), text]);
  // A composite PDF can have supporting pages titled like a campaign. Only a
  // page that also carries a business objective and target audience identifies
  // a distinct campaign brief; tactic guidance alone does not.
  const campaignBriefHeadings = new Set(
    sourceText
      .split(
        /(?=^(?:## Source page \d+|PDF PAGE \d+|--- Source page \d+ ---))/m,
      )
      .filter(
        (page) =>
          /(?:^|\n)Business\s+Objective\b/im.test(page) &&
          /(?:^|\n)Target\s+Audience\b/im.test(page),
      )
      .flatMap((page) =>
        page
          .split(/\r?\n/)
          .filter((line) =>
            /^.+?\s*[-–—]\s*Campaign Extensions(?: Refresh)?(?: Brief)?\s*$/i.test(
              line.trim(),
            ),
          )
          .map((line) => line.trim().replace(/\s*([-–—])\s*/, " $1 ")),
      ),
  );
  const trimmed = sourceText.trim();
  const csv = csvFields(trimmed);
  if (csv) {
    for (const [key, value] of csv) append(key, value);
  } else if (trimmed.startsWith("{")) {
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error(
        "The IMC brief looks like JSON but is invalid. Fix its syntax or paste labeled text.",
      );
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj))
      throw new Error("Use a JSON object containing the IMC fields.");
    for (const [label, value] of Object.entries(obj)) {
      const key = labels.get(normalize(label));
      if (!key) continue;
      if (value === null) {
        append(key, "");
        continue;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        append(key, String(value));
      else if (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string")
      )
        append(key, value.join("\n"));
      else
        throw new Error(
          `The IMC field "${label}" must contain text or a list of text values.`,
        );
    }
  } else {
    let active: string | undefined;
    let lines: string[] = [];
    let deferredCommunicationObjective = false;
    let readingAudienceBeforeObjective = false;
    const flush = () => {
      if (active) {
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        append(active, lines.join("\n"));
      }
      active = undefined;
      lines = [];
    };
    for (const line of sourceText.split(/\r?\n/)) {
      // Markdown tables: field | value, including an optional outer pipe.
      const table = line.trim().match(/^\|?\s*([^|]+?)\s*\|\s*(.*?)\s*\|?$/);
      const tableKey = table ? resolveLabel(table[1]) : undefined;
      if (table && tableKey) {
        flush();
        append(tableKey, table[2]);
        continue;
      }
      const heading = /^\s*#{1,6}\s+/.test(line);
      const decorated = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)/.test(line);
      const clean = line
        .replace(/^\s*>\s*/, "")
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
        .replace(/^\s*(?:\*\*|__)/, "");
      // Text extracted from a campaign-extension PDF can omit the "Campaign:"
      // label while repeating this heading on each page. Preserve distinct
      // campaign names; never merge a second campaign into the first one.
      const extensionHeading = !clean.includes(":")
        ? clean.match(
            /^(.+?)\s*[-–—]\s*Campaign Extensions(?: Refresh)?(?: Brief)?\s*$/i,
          )
        : null;
      if (extensionHeading) {
        if (active === "campaign" && lines.every((value) => !value.trim())) {
          lines.push(clean.trim());
          flush();
          continue;
        }
        flush();
        const campaign = clean.trim().replace(/\s*([-–—])\s*/, " $1 ");
        if (
          campaignBriefHeadings.has(campaign) &&
          !(found.get("campaign") ?? []).includes(campaign)
        )
          append("campaign", campaign);
        continue;
      }
      let separator = clean.indexOf(":");
      let label = separator >= 0 ? clean.slice(0, separator) : clean;
      let key = resolveLabel(label);
      // Some PDF tables extract a left-hand field label and the right-hand
      // value onto one line without a colon. Limit this to known table labels.
      const pdfInline = !key
        ? clean.match(
            /^(Target Audience|Business Objective|Communication Objective|Channels|Reasons To Believe|Reason To Believe)\s+(.+)$/i,
          )
        : null;
      if (pdfInline) {
        label = pdfInline[1];
        key = resolveLabel(label);
      }
      if (!key) {
        const dash = clean.match(/\s+[—–-]\s+/);
        if (dash?.index !== undefined) {
          const candidate = clean.slice(0, dash.index);
          const candidateKey = resolveLabel(candidate);
          if (candidateKey) {
            key = candidateKey;
            label = candidate;
            separator = dash.index + dash[0].length - 1;
          }
        }
      }
      if (
        key &&
        (separator >= 0 ||
          heading ||
          decorated ||
          pdfInline ||
          resolveLabel(clean) === key)
      ) {
        if (
          key === "reason_to_believe" &&
          /by tactic length/i.test(label) &&
          (found.get(key) ?? []).some(
            (value) =>
              value.trim() && !/^refer to next page/i.test(value.trim()),
          )
        ) {
          flush();
          continue;
        }
        if (
          key === "reason_to_believe" &&
          active === "objective" &&
          !lines.some((value) => value.trim())
        )
          deferredCommunicationObjective = true;
        if (active === key && lines.every((value) => !value.trim())) {
          lines = [];
          if (separator >= 0) {
            const value = clean
              .slice(separator + 1)
              .replace(/^[ \t]+/, "")
              .replace(/^(?:\*\*|__)\s*/, "")
              .replace(/\s+#+\s*$/, "");
            if (value.length) lines.push(value);
            if (/^not\s+supplied[.]?$/i.test(value.trim())) flush();
          }
          continue;
        }
        flush();
        active = key;
        readingAudienceBeforeObjective =
          key === "audience" && deferredCommunicationObjective;
        if (separator >= 0 || pdfInline) {
          let value = pdfInline ? pdfInline[2] : clean.slice(separator + 1);
          value = value
            .replace(/^[ \t]+/, "")
            .replace(/^(?:\*\*|__)\s*/, "")
            .replace(/\s+#+\s*$/, "");
          if (value.length) lines.push(value);
          if (/^not\s+supplied[.]?$/i.test(value.trim())) flush();
          // These table cells are complete on the same extracted line. The
          // next line may belong to a different, visually adjacent field.
          if (pdfInline && /^(?:Target Audience|Channels)$/i.test(label))
            flush();
          if (
            pdfInline &&
            key === "audience" &&
            deferredCommunicationObjective
          ) {
            active = "objective";
            deferredCommunicationObjective = false;
            readingAudienceBeforeObjective = false;
          }
        }
        continue;
      }
      // Unknown section headings delimit recognized sections; do not absorb the next section.
      const unknownSection =
        heading ||
        /^(?:Parent (?:brand )?platform|Brand platform|[^:\n]{0,60}\b(?:JTBD|Job to be done)\b[^:\n]*)(?:\s*:|\s*$)/i.test(
          clean,
        ) ||
        /^\s*--- Source page \d+ ---\s*$/.test(line) ||
        /^\s*PDF PAGE \d+\s*$/.test(line) ||
        /^\s*=+\s*$/.test(line) ||
        /^(?:Background|Key Message|Deliverables|Timing|Media Placement & Budget|Production Budget|Creative Considerations)\s*$/i.test(
          clean,
        ) ||
        /^(?:Media Placement & Budget|Production Budget)\s+.+$/i.test(clean) ||
        (!/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) &&
          /^(?:Creative ask|Source|Source pages|Extraction|Background|Key message|Deliverables|Media Placement & Budget|Production Budget|Timing|FAQs|Next steps):/i.test(
            clean,
          ));
      if (unknownSection) {
        flush();
        if (
          /^(?:Background|Key Message|Deliverables|Creative Considerations)/i.test(
            clean,
          )
        ) {
          deferredCommunicationObjective = false;
          readingAudienceBeforeObjective = false;
        }
        continue;
      }
      if (active) {
        lines.push(line);
        if (
          active === "audience" &&
          readingAudienceBeforeObjective &&
          /[.!?]\s*$/.test(line.trim())
        ) {
          flush();
          active = "objective";
          readingAudienceBeforeObjective = false;
          deferredCommunicationObjective = false;
        }
      }
    }
    flush();
  }
  return Object.freeze({
    schemaVersion: 1,
    parserVersion: IMC_PARSER_VERSION,
    sourceText,
    fields: Object.freeze(
      Object.fromEntries(
        imcSchema.map((def) => [def.key, classify(found.get(def.key) ?? [])]),
      ) as Record<IMCFieldKey, ParsedIMCField>,
    ),
    supplemental: Object.freeze(
      Object.fromEntries(
        supplementalSchema.map((def) => [
          def.key,
          classify(found.get(def.key) ?? []),
        ]),
      ),
    ),
  });
}
