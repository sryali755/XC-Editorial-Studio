import { selectedFoundation } from "./ai/context";
import type { StrategyInputPack } from "./types";
import type { Foundation } from "./ai/schemas";

export function discoveryFoundation(pack: StrategyInputPack): Foundation {
  const base = selectedFoundation(pack);
  const campaignContext = { ...base.campaignContext };
  if (pack.originalJTBD !== undefined) {
    delete campaignContext.jobToBeDone;
    if (pack.originalJTBD) campaignContext.jobToBeDone = pack.originalJTBD;
  }
  return {
    ...base,
    campaignContext,
    ...(pack.jtbdContext ? { jtbdContext: pack.jtbdContext } : {}),
    ...(pack.parentPlatform ? { parentPlatform: pack.parentPlatform } : {}),
    ...(pack.campaignIdentity
      ? { campaignIdentity: pack.campaignIdentity }
      : {}),
    ...(pack.selectedPreparationVersions
      ? { selectedPreparationVersions: pack.selectedPreparationVersions }
      : {}),
    ...(pack.preparationGuidance
      ? { preparationGuidance: pack.preparationGuidance }
      : {}),
    ...(pack.sourceAvailability
      ? { sourceAvailability: pack.sourceAvailability }
      : {}),
    ...(pack.suppliedEvidence
      ? { suppliedEvidence: pack.suppliedEvidence }
      : {}),
    ...(pack.evidenceSparks ? { evidenceSparks: pack.evidenceSparks } : {}),
    ...(pack.selectedResearch
      ? { selectedResearch: pack.selectedResearch }
      : {}),
    ...(pack.selectedResearchSources
      ? { selectedResearchSources: pack.selectedResearchSources }
      : {}),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// The current Input Pack version and Discovery request use this same extended
// foundation, including selection and source context.
export function discoveryFoundationVersion(foundation: Foundation): string {
  // Display-name corrections are metadata, not different source evidence.
  // Retain the historical source-named hash basis for existing campaign runs.
  let basis = foundation;
  const identity = foundation.campaignIdentity;
  if (identity?.id) {
    const { campaignIdentity: _identity, ...content } = foundation;
    void _identity;
    basis = {
      ...content,
      campaignContext: {
        ...content.campaignContext,
        campaignName: identity.sourceName || "",
      },
      ...(identity.sourceName
        ? {
            campaignIdentity: {
              origin: "source" as const,
              sourceReference: `IMC campaign field: ${identity.sourceName}`,
            },
          }
        : {}),
    };
  }
  const value = canonical(basis);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pack-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
