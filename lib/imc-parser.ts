import type {
  IMCFieldKey,
  ParsedIMCBrief,
  ParsedIMCField,
  UpstreamKey,
} from "./types";

// One canonical extraction schema, independent of agent prompts and UI field names.
export const imcSchema: {
  key: IMCFieldKey;
  upstreamKey: UpstreamKey;
  aliases: string[];
}[] = [
  { key: "campaign", upstreamKey: "campaignName", aliases: ["Campaign name"] },
  {
    key: "objective",
    upstreamKey: "objective",
    aliases: ["Objectives", "Campaign objective"],
  },
  {
    key: "audience",
    upstreamKey: "audience",
    aliases: ["Priority audience", "Target audience"],
  },
  {
    key: "product",
    upstreamKey: "product",
    aliases: ["Offer", "Offer / product", "Offer and product details"],
  },
  { key: "channels", upstreamKey: "channel", aliases: ["Channel"] },
  { key: "constraints", upstreamKey: "constraints", aliases: [] },
  {
    key: "reason_to_believe",
    upstreamKey: "originalRTB",
    aliases: ["RTB", "Reasons to believe", "Original upstream RTB"],
  },
  {
    key: "research",
    upstreamKey: "research",
    aliases: [
      "Evidence",
      "Data & research",
      "Supporting data & research",
      "Supporting research",
    ],
  },
  { key: "brief_type", upstreamKey: "briefType", aliases: [] },
  { key: "campaign_tier", upstreamKey: "campaignTier", aliases: ["Tier"] },
  {
    key: "kpis",
    upstreamKey: "kpis",
    aliases: ["Success measures", "Success measures / KPIs"],
  },
  {
    key: "brand_messaging",
    upstreamKey: "brandMessaging",
    aliases: ["Approved brand messaging"],
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
    aliases: ["Claim evidence", "Substantiation / claim evidence"],
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
  if (!labels.has(normalize(firstLabel)) && !/^(field|key)$/i.test(firstLabel))
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
  if (header.length > 1 && header.every((cell) => labels.has(normalize(cell))))
    return rows
      .slice(1)
      .flatMap((record) =>
        header.map(
          (label, i) =>
            [labels.get(normalize(label))!, record[i] ?? ""] as [
              string,
              string,
            ],
        ),
      );
  return rows.flatMap(([label, ...cells]) => {
    const key = labels.get(normalize(label));
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
    const flush = () => {
      if (active) {
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        append(active, lines.join("\n"));
      }
      active = undefined;
      lines = [];
    };
    for (const line of sourceText.split(/\r?\n/)) {
      // Markdown tables: field | value, including an optional outer pipe.
      const table = line.trim().match(/^\|?\s*([^|]+?)\s*\|\s*(.*?)\s*\|?$/);
      if (table && labels.has(normalize(table[1]))) {
        flush();
        append(labels.get(normalize(table[1]))!, table[2]);
        continue;
      }
      const heading = /^\s*#{1,6}\s+/.test(line);
      const decorated = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)/.test(line);
      const clean = line
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
        .replace(/^\s*(?:\*\*|__)/, "");
      const colon = clean.indexOf(":");
      const label = (colon >= 0 ? clean.slice(0, colon) : clean)
        .replace(/(?:\*\*|__)\s*$/, "")
        .trim();
      const key = labels.get(normalize(label));
      if (
        key &&
        (colon >= 0 ||
          heading ||
          decorated ||
          normalize(clean) === normalize(label))
      ) {
        flush();
        active = key;
        if (colon >= 0) {
          let value = clean.slice(colon + 1);
          if (decorated && /^\s*(?:\*\*|__)/.test(value))
            value = value.replace(/^\s*(?:\*\*|__)/, "");
          value = value.replace(/^[ \t]+/, "");
          if (value.length) lines.push(value);
        }
        continue;
      }
      // Unknown section headings delimit recognized sections; do not absorb the next section.
      const unknownSection =
        heading ||
        (!/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) &&
          /^(?:Creative ask|Source|FAQs|Next steps):/i.test(clean));
      if (unknownSection) {
        flush();
        continue;
      }
      if (active) lines.push(line);
    }
    flush();
  }
  return Object.freeze({
    schemaVersion: 1,
    parserVersion: 2,
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
