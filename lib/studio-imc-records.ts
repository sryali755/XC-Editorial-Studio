export type StudioIMCGroup =
  | "campaign_name"
  | "parent_platform"
  | "business_objective"
  | "marketing_objective"
  | "audience_segment"
  | "product_offer"
  | "channel"
  | "creative_constraint"
  | "research_evidence"
  | "source_reference"
  | "brand_positioning"
  | "reason_to_believe"
  | "job_to_be_done"
  | "key_message"
  | "deliverable"
  | "timing"
  | "campaign_background";

export interface StudioIMCRecord {
  id: string;
  group: StudioIMCGroup;
  label: string;
  text: string;
  excerpt: string;
  line: number;
}

function group(label: string): StudioIMCGroup | undefined {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:campaign|campaign name)$/.test(normalized)) return "campaign_name";
  if (/^(?:parent (?:brand )?platform|brand platform)$/.test(normalized))
    return "parent_platform";
  if (/\b(business|commercial) objectives?\b/.test(normalized))
    return "business_objective";
  if (/\b(marketing|communications?) objectives?\b/.test(normalized))
    return "marketing_objective";
  if (/\b(reason(?:s)? to believe|rtb)\b/.test(normalized))
    return "reason_to_believe";
  if (/\b(job to be done|jtbd)\b/.test(normalized)) return "job_to_be_done";
  if (
    /^(?:product|offer|offer product|offer and product details)$/.test(
      normalized,
    )
  )
    return "product_offer";
  if (/^(?:channels?|media channels?|placements?)$/.test(normalized))
    return "channel";
  if (
    /^(?:constraints?|creative requirements?|creative considerations?|mandatories?)$/.test(
      normalized,
    )
  )
    return "creative_constraint";
  if (
    /^(?:research|evidence|supporting research|supporting evidence|data and research|data research)$/.test(
      normalized,
    )
  )
    return "research_evidence";
  if (
    /^(?:resources?|source references?|supporting source references?)$/.test(
      normalized,
    )
  )
    return "source_reference";
  if (
    /^(?:brand positioning|positioning|brand messaging|original messaging|core message)$/.test(
      normalized,
    )
  )
    return "brand_positioning";
  if (
    /^audiences?$/.test(normalized) ||
    /\b(primary|secondary|target|priority|multicultural|hispanic|general market|gm|hm) audience\b/.test(
      normalized,
    )
  )
    return "audience_segment";
  if (/\b(key|core|customer|prospect) messages?\b/.test(normalized))
    return "key_message";
  if (/\b(deliverables?|required assets?)\b/.test(normalized))
    return "deliverable";
  if (/\b(timing|timeline|launch date|flight dates?)\b/.test(normalized))
    return "timing";
  if (/\b(background|campaign context)\b/.test(normalized))
    return "campaign_background";
}

function labelAt(line: string) {
  // Extracted PDFs often have unpunctuated headings, unlike pasted Markdown.
  // Limit this path to exact heading labels so campaign prose is not reclassified.
  const plain = line.match(
    /^\s*(Background|Key Messages?|Timing|Deliverables|Creative Considerations|Reasons to Believe|Business Objectives?|Communication Objectives?|Target Audience|Channels?)\s*$/i,
  )?.[1];
  const heading = line.match(/^\s*#{1,6}\s+(?:\d+[.)]\s*)?(.+?)\s*$/);
  const headingInline = heading?.[1].match(/^(.{3,90}?):\s*(.*)$/);
  const inline = line.match(
    /^\s*(?:[-*]\s+)?(?:\*\*)?([^:\n]{3,90}?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/,
  );
  const raw = headingInline?.[1] ?? heading?.[1] ?? inline?.[1] ?? plain;
  if (!raw) return undefined;
  const label = raw
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
  const category = group(label);
  return category
    ? { category, label, inlineValue: headingInline?.[2] ?? inline?.[2] ?? "" }
    : undefined;
}

// This supplements, rather than replaces, canonical IMC extraction. Each
// record is copied from a contiguous source span; no AI interpretation is used.
export function extractStudioIMCRecords(source: string): StudioIMCRecord[] {
  const lines = source.split(/\r?\n/);
  const records: StudioIMCRecord[] = [];
  for (let index = 0; index < lines.length; index++) {
    const found = labelAt(lines[index]);
    if (!found) continue;
    let end = index + 1;
    while (
      end < lines.length &&
      !/^\s*(?:=+\s*$|(?:Source|Source pages|Pages|Note):)/i.test(lines[end]) &&
      !/^\s*(?:## Source page|PDF PAGE)\s+\d+\s*$/i.test(lines[end]) &&
      !/^\s*#{1,6}\s+/.test(lines[end]) &&
      !labelAt(lines[end]) &&
      !/^\s*(?:\*\*)[^\n]{2,90}:/.test(lines[end])
    )
      end++;
    const body = lines.slice(index + 1, end);
    const text = [found.inlineValue, ...body].join("\n").trim();
    if (text && !/^not supplied\.?$/i.test(text))
      records.push({
        id: `${found.category}:${index + 1}`,
        group: found.category,
        label: found.label,
        text,
        excerpt: lines.slice(index, end).join("\n").trim(),
        line: index + 1,
      });
  }
  return records;
}
