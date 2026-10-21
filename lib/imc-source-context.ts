import type { ParsedIMCBrief } from "./types";
import { usableCampaignName } from "./campaign-identity";
import { extractStudioIMCRecords } from "./studio-imc-records";

// Canonical identity is separate from the exact, possibly repeated source cells.
// Do not collapse different titles, punctuation variants or human edits together.
export function sourceCampaignNames(parsed: ParsedIMCBrief): string[] {
  return [
    ...new Set(parsed.fields.campaign.occurrences.filter(usableCampaignName)),
  ];
}

export function sourceJobContext(source: string) {
  const records = extractStudioIMCRecords(source).filter(
    (record) => record.group === "job_to_be_done",
  );
  type Record = { label: string; text: string; excerpt: string; line: number };
  const original: (Record & { approvalStatus: "unknown" })[] = [];
  const proposed: (Record & { approvalStatus: "not_approved" })[] = [];
  for (const record of records) {
    const isProposal =
      /\b(?:proposed|suggested|inferred|xc)\b/i.test(record.label) ||
      /^\s*(?:proposed|suggested|inferred|internal testing)\b/i.test(
        record.text,
      );
    const entry = {
      label: record.label,
      text: record.text,
      excerpt: record.excerpt,
      line: record.line,
    };
    if (isProposal) proposed.push({ ...entry, approvalStatus: "not_approved" });
    else original.push({ ...entry, approvalStatus: "unknown" });
  }
  return { original, proposed };
}
export type SourceJobContext = ReturnType<typeof sourceJobContext>;

export function sourceParentPlatform(source: string) {
  const records = extractStudioIMCRecords(source).filter(
    (record) => record.group === "parent_platform",
  );
  if (records.length !== 1) return undefined;
  const record = records[0];
  return {
    // The brand signature remains exact in sourceValue and excerpt.
    name: record.text.match(/^Xfinity\.\s*(.+?)\.?$/i)?.[1] ?? record.text,
    sourceValue: record.text,
    excerpt: record.excerpt,
    line: record.line,
  };
}
export type SourceParentPlatform = ReturnType<typeof sourceParentPlatform>;
