import type { CampaignIdentity } from "./types";
import { usableCampaignName } from "./campaign-display";
import { parseIMCBrief } from "./imc-parser";

export interface CampaignNameConfirmation {
  name: string;
  sourceBrief: string;
  confirmedAt: string;
}

// A stable local grouping key, not an authentication token. Source validation
// and isolation also compare the complete selected source, never this hash alone.
export function campaignSourceId(source: string) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `campaign-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourceLocation(source: string, offset: number) {
  const prior = source.slice(0, offset);
  const markers = [...prior.matchAll(/^## Source (slide|page) (\d+)\s*$/gm)];
  const last = markers.at(-1);
  if (last) return `imc:${last[1]}:${last[2]}`;
  const line = prior.split(/\r?\n/).length;
  return `imc:lines:${line}-${line}`;
}

function coverTitle(source: string) {
  const marker = /^## Source (?:slide|page) \d+\s*$/m.exec(source);
  const begin = marker ? marker.index + marker[0].length : 0;
  const body = source
    .slice(begin)
    .split(/^## Source (?:slide|page) \d+\s*$/m, 1)[0];
  const lines = body.split(/\r?\n/);
  const selected: string[] = [];
  for (const line of lines) {
    const value = line.trim().replace(/^#{1,6}\s+/, "");
    if (!value || /^\d+$/.test(value)) continue;
    if (/^(?:Source|Extraction|Import notes|Document title)\s*:/i.test(value))
      continue;
    if (
      /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\d{4}\b|\d{1,2}[/-]\d)/i.test(
        value,
      )
    )
      break;
    if (
      value.includes(":") ||
      /[.!?]$/.test(value) ||
      /^(?:Business Objective|Target Audience|Product|Brand|Creative Platform|Increase|Drive|Improve|Encourage|Generate|Grow|Reduce|Retain|Help|Position)\b/i.test(
        value,
      ) ||
      value.length > 120 ||
      value.split(/\s+/).length > 18
    )
      break;
    selected.push(line.trim());
    if (/\b(?:toolkit|campaign|brief)\b/i.test(value) || selected.length === 3)
      break;
  }
  const excerpt = selected.join("\n");
  const name = excerpt
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  // Cover titles are candidates only. Product names, platform names, prose,
  // generic template labels and filenames never become official campaign names.
  if (
    !/\b(?:toolkit|campaign|brief)\b/i.test(name) ||
    /^(?:(?:imc|creative|campaign|tactical|marketing)\s+)*(?:brief|toolkit|campaign)(?:\s+template)?$/i.test(
      name,
    ) ||
    !usableCampaignName(name) ||
    !source.includes(excerpt)
  )
    return undefined;
  return {
    name,
    kind: "cover_title" as const,
    excerpt,
    locator: sourceLocation(source, source.indexOf(excerpt, begin)),
  };
}

function explicitCandidate(source: string, name: string) {
  const normalize = (value: string) =>
    value.trim().replace(/\s*([-–—])\s*/, " $1 ");
  const lines = [...source.matchAll(/^.*$/gm)];
  const line =
    lines.find((entry) => {
      const clean = entry[0]
        .trim()
        .replace(/^#{1,6}\s+/, "")
        .replace(/\*\*|__/g, "");
      const labeled = clean.match(
        /^Campaign(?:[ _](?:name|title))?\s*:\s*(.+)$/i,
      )?.[1];
      return normalize(labeled ?? clean) === normalize(name);
    }) ??
    lines.find(
      (entry) =>
        !/^(?:Source|Extraction|Import notes)\s*:/i.test(entry[0]) &&
        entry[0].includes(name),
    );
  const excerpt = line && line[0].trim().length <= 600 ? line[0].trim() : name;
  const offset = line
    ? line.index! + line[0].indexOf(excerpt)
    : source.indexOf(name);
  return {
    name,
    kind: "explicit" as const,
    excerpt,
    locator: sourceLocation(source, Math.max(0, offset)),
  };
}

export function resolveCampaignIdentity(
  source: string,
  confirmation?: CampaignNameConfirmation,
): CampaignIdentity {
  let names: string[] = [];
  let parseable = true;
  try {
    names = [
      ...new Set(
        parseIMCBrief(source).fields.campaign.occurrences.filter(
          usableCampaignName,
        ),
      ),
    ];
  } catch {
    // A partially typed JSON/CSV draft must not crash the preview. Building
    // still uses the canonical parser and reports the actual parse failure.
    parseable = false;
  }
  const sourceName = names.length === 1 ? names[0] : "";
  const cover = parseable ? coverTitle(source) : undefined;
  const candidate = sourceName
    ? explicitCandidate(source, sourceName)
    : names.length > 1
      ? undefined
      : cover;
  const confirmed =
    parseable &&
    !!confirmation &&
    confirmation.sourceBrief === source &&
    names.length < 2 &&
    usableCampaignName(confirmation.name) &&
    confirmation.name.length <= 300 &&
    Number.isFinite(Date.parse(confirmation.confirmedAt));
  const displayName = confirmed ? confirmation!.name : sourceName;
  const humanAlias = confirmed && confirmation!.name !== sourceName;
  return {
    id: campaignSourceId(source),
    displayName,
    sourceName,
    sourceDocumentTitle: cover?.name || "",
    sourceDocumentFileName:
      source.match(/^Source:\s*([^\r\n]+)$/m)?.[1]?.trim() || "",
    ...(candidate ? { sourceCandidate: candidate } : {}),
    origin: humanAlias ? "human_confirmed" : "source",
    sourceReference: humanAlias
      ? "Human-confirmed campaign name; not extracted from the IMC brief."
      : sourceName
        ? `IMC campaign field: ${sourceName}`
        : "Campaign name unresolved; source title is a candidate only.",
    confirmationStatus: confirmed
      ? humanAlias
        ? "human_confirmed"
        : "source_confirmed"
      : sourceName
        ? "source_confirmed"
        : "unresolved",
    ...(confirmed
      ? {
          humanConfirmedName: confirmation!.name,
          confirmedAt: confirmation!.confirmedAt,
        }
      : {}),
  };
}

export function campaignIdentityIssue(
  source: string,
  displayName: string,
  identity: CampaignIdentity,
) {
  const expected = resolveCampaignIdentity(
    source,
    identity.humanConfirmedName && identity.confirmedAt
      ? {
          name: identity.humanConfirmedName,
          sourceBrief: source,
          confirmedAt: identity.confirmedAt,
        }
      : undefined,
  );
  for (const key of [
    "id",
    "displayName",
    "sourceName",
    "sourceDocumentTitle",
    "sourceDocumentFileName",
    "origin",
    "sourceReference",
    "confirmationStatus",
    "humanConfirmedName",
    "confirmedAt",
  ] as const)
    if (identity[key] !== expected[key])
      return `Campaign identity ${key} does not match the selected source and confirmed display metadata.`;
  for (const key of ["name", "kind", "excerpt", "locator"] as const)
    if (identity.sourceCandidate?.[key] !== expected.sourceCandidate?.[key])
      return "The campaign-name candidate or source attribution cannot be verified in the selected brief.";
  if (displayName !== expected.displayName)
    return "campaignName conflicts with the confirmed campaign display metadata.";
  return "";
}

export function campaignDisplayLabel(pack: {
  campaignName: string;
  campaignIdentity?: CampaignIdentity;
}) {
  return (
    pack.campaignIdentity?.displayName ||
    pack.campaignName ||
    (pack.campaignIdentity?.sourceCandidate
      ? "Campaign name awaiting confirmation"
      : "Campaign not supplied")
  );
}
