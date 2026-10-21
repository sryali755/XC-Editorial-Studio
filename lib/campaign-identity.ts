import type { DiscoveryState, StrategyInputPack } from "./types";
import { usableCampaignName } from "./campaign-display";
import { campaignIdentityIssue } from "./campaign-naming";
export { usableCampaignName } from "./campaign-display";

// Display identity is metadata, never guessed from product, objective or filename.
export function assertCampaignName(pack: StrategyInputPack) {
  if (!usableCampaignName(pack.campaignName))
    throw new Error(
      "Confirm the campaign name in Input Pack before approving or generating an XC Brief. No name will be inferred from product or audience content.",
    );
  if (pack.campaignIdentity?.id) {
    const issue = campaignIdentityIssue(
      pack.parsedIMC?.sourceText ?? "",
      pack.campaignName,
      pack.campaignIdentity,
    );
    if (issue || pack.campaignIdentity.confirmationStatus === "unresolved")
      throw new Error(
        issue ||
          "Confirm the campaign name in Input Pack before approving or exporting a brief.",
      );
  }
}

// Repair only an untouched metadata starter when identity is resolved. A human
// edit (including an intentional clear) or saved context version is immutable.
export function reviewWorkspaceCampaignName(
  state: DiscoveryState,
  pack: StrategyInputPack,
): DiscoveryState {
  const seed = state.workspaceSuggestionContext,
    key = "wholeBrief.context";
  if (
    !pack.campaignName ||
    !seed?.fields[key] ||
    state.fieldVersions?.[key]?.length ||
    state.wholeBrief?.context !== seed.fields[key].value
  )
    return state;
  return {
    ...state,
    wholeBrief: { ...state.wholeBrief, context: pack.campaignName },
    workspaceSuggestionContext: {
      ...seed,
      originalFields: seed.originalFields ?? seed.fields,
      fields: {
        ...seed.fields,
        [key]: {
          value: pack.campaignName,
          kind:
            pack.campaignIdentity?.origin === "human_confirmed"
              ? "interpretation"
              : "supplied",
          label:
            pack.campaignIdentity?.origin === "human_confirmed"
              ? "Human-confirmed campaign name · not source-extracted"
              : "Supplied IMC campaign name",
        },
      },
    },
  };
}
