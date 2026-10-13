import type { StrategyInputPack } from "../types";
import { extractUpstream, resolveRtb } from "../upstream";
import type { Foundation } from "./schemas";

// Only current outputs and selected sparks cross into perspective/synthesis requests.
export function selectedFoundation(pack: StrategyInputPack): Foundation {
  const { campaignName, objective, audience, product, channel, constraints } =
    pack;
  const requirements = pack.upstream ?? extractUpstream("");
  const rtb = resolveRtb(requirements);
  return {
    campaignContext: {
      campaignName,
      objective,
      audience,
      product,
      channel,
      constraints,
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
        }) => ({
          id,
          text,
          versionId,
          version,
          ...(title ? { title } : {}),
          ...(rationale ? { rationale } : {}),
          ...(campaignGrounding ? { campaignGrounding } : {}),
          ...(hypothesisToValidate ? { hypothesisToValidate } : {}),
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
