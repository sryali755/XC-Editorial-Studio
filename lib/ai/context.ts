import type { StrategyInputPack } from "../types";
import { extractUpstream } from "../upstream";
import type { Foundation } from "./schemas";

// Only current outputs and selected sparks cross into perspective/synthesis requests.
export function selectedFoundation(pack: StrategyInputPack): Foundation {
  const { campaignName, objective, audience, product, channel, constraints } =
    pack;
  const requirements = pack.upstream ?? extractUpstream("");
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
      status: requirements.fields.originalRTB.status,
      reviewNote: requirements.fields.originalRTB.note,
    },
    currentResearch: pack.research,
    selectedSparks:
      pack.selectedSparks?.map(({ id, text, versionId, version }) => ({
        id,
        text,
        versionId,
        version,
      })) ??
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
    research: foundation.currentResearch,
    sparks: foundation.selectedSparks.map((s) => s.text).join("\n"),
    selectedSparks: foundation.selectedSparks,
    researchFocus: foundation.researchEmphasis,
  };
}
