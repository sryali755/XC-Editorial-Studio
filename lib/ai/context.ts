import type { StrategyInputPack } from "../types";
import { extractUpstream, resolveRtb } from "../upstream";
import type { Foundation } from "./schemas";

export function extractJobToBeDone(source = "") {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    const inline = raw.match(
      /^(?:#{1,6}\s*)?(?:\*{1,2})?(?:job\s+to\s+be\s+done|jtbd)(?:\*{1,2})?\s*:\s*(.+)$/i,
    );
    if (inline?.[1]?.trim()) return inline[1].trim();
    if (
      /^(?:#{1,6}\s*)?(?:\*{1,2})?(?:job\s+to\s+be\s+done|jtbd)(?:\*{1,2})?\s*:?\s*$/i.test(
        raw,
      )
    ) {
      const collected: string[] = [];
      for (let next = index + 1; next < lines.length; next++) {
        const value = lines[next].trim();
        if (!value && !collected.length) continue;
        if (/^#{1,6}\s+/.test(value) || /^[^:]{2,60}:\s+/.test(value)) break;
        if (!value) break;
        collected.push(value.replace(/^[-*]\s+/, ""));
      }
      if (collected.length) return collected.join("\n");
    }
  }
  return "";
}

// Only current outputs and selected sparks cross into perspective/synthesis requests.
export function selectedFoundation(pack: StrategyInputPack): Foundation {
  const { campaignName, objective, audience, product, channel, constraints } =
    pack;
  const requirements = pack.upstream ?? extractUpstream("");
  const rtb = resolveRtb(requirements);
  const jobToBeDone = extractJobToBeDone(pack.parsedIMC?.sourceText);
  return {
    ...(pack.parsedIMC?.sourceText
      ? { sourceBrief: pack.parsedIMC.sourceText }
      : {}),
    campaignContext: {
      campaignName,
      objective,
      audience,
      product,
      channel,
      constraints,
      ...(jobToBeDone ? { jobToBeDone } : {}),
    },
    currentRtb: {
      original: pack.reasonToBelieve,
      proposal: pack.proposedRTB ?? "",
      status: rtb.field.status,
      approvalStatus: pack.rtbApprovalStatus ?? rtb.approvalStatus,
      reviewNote: [requirements.fields.originalRTB.note, rtb.approvalNote]
        .filter(Boolean)
        .join(" "),
    },
    currentResearch: pack.research,
    selectedSparks:
      pack.selectedSparks?.map(
        ({
          id,
          text,
          versionId,
          version,
          title,
          rationale,
          campaignGrounding,
          hypothesisToValidate,
          territory_type,
          territory,
          idea,
          excerpt,
          hypothesis,
          excerpt_verified,
        }) => ({
          id,
          text,
          versionId,
          version,
          ...(title ? { title } : {}),
          ...(rationale ? { rationale } : {}),
          ...(campaignGrounding ? { campaignGrounding } : {}),
          ...(hypothesisToValidate ? { hypothesisToValidate } : {}),
          ...(territory_type ? { territory_type } : {}),
          ...(territory ? { territory } : {}),
          ...(idea ? { idea } : {}),
          ...(excerpt ? { excerpt } : {}),
          ...(hypothesis ? { hypothesis } : {}),
          ...(excerpt_verified !== undefined ? { excerpt_verified } : {}),
        }),
      ) ??
      pack.sparks
        .split("\n")
        .filter(Boolean)
        .map((text, i) => ({
          id: `legacy-${i}`,
          text,
          versionId: "legacy",
          version: 0,
        })),
    researchEmphasis: pack.researchFocus ?? "",
    requirements,
  };
}
export function foundationPack(foundation: Foundation): StrategyInputPack {
  return {
    ...foundation.campaignContext,
    upstream: foundation.requirements,
    reasonToBelieve: foundation.currentRtb.original,
    proposedRTB: foundation.currentRtb.proposal,
    rtbApprovalStatus: foundation.currentRtb.approvalStatus,
    research: foundation.currentResearch,
    sparks: foundation.selectedSparks.map((s) => s.text).join("\n"),
    selectedSparks: foundation.selectedSparks,
    researchFocus: foundation.researchEmphasis,
  };
}
