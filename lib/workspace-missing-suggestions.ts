import { inputPackVersion } from "./discovery";
import { discoveryStorageKey } from "./discovery-persistence";
import {
  workspaceFieldKeys,
  workspaceFieldValue,
} from "./workspace-suggestions";
import type {
  DiscoveryState,
  StrategyInputPack,
  WorkspaceStarterField,
} from "./types";

export const missingSuggestionFields = [
  { key: "evidenceInsights", label: "Insight" },
  { key: "workingJTBD", label: "Job to be done" },
] as const;
export type MissingSuggestionKey =
  (typeof missingSuggestionFields)[number]["key"];
export interface MissingSuggestionPreview {
  fingerprint: string;
  fields: {
    key: MissingSuggestionKey;
    label: string;
    suggestion: WorkspaceStarterField;
  }[];
}

// Preview identity includes source, selected context, saved research and the two
// target values/histories. A delayed preview can never clobber a later edit,
// intentional clear, different campaign, or restored field version.
function fingerprint(state: DiscoveryState, pack: StrategyInputPack) {
  return JSON.stringify({
    source: discoveryStorageKey(pack),
    campaign: pack.campaignName,
    pack: inputPackVersion(pack),
    findings: state.savedFindingIds,
    fields: missingSuggestionFields.map(({ key }) => [
      key,
      workspaceFieldValue(state, key),
      state.fieldVersions?.[key],
      state.activeFieldVersionIds?.[key],
    ]),
  });
}

// The caller produces fresh proposals only after the explicit preview action.
// This helper neither mutates the draft nor marks an empty value as a mistake.
export function previewMissingSuggestions(
  state: DiscoveryState,
  pack: StrategyInputPack,
  fresh: DiscoveryState,
): MissingSuggestionPreview {
  return {
    fingerprint: fingerprint(state, pack),
    fields: missingSuggestionFields
      .filter(({ key }) => !workspaceFieldValue(state, key).trim())
      .map(({ key, label }) => ({
        key,
        label,
        suggestion: fresh.workspaceSuggestionContext?.fields[key] ?? {
          value: "",
          kind: "missing",
          label:
            "Needs validation · add campaign audience and objective context",
        },
      })),
  };
}

export function missingSuggestionPreviewIsCurrent(
  preview: MissingSuggestionPreview,
  state: DiscoveryState,
  pack: StrategyInputPack,
) {
  return (
    Boolean(pack.parsedIMC?.sourceText.trim()) &&
    preview.fingerprint === fingerprint(state, pack)
  );
}

export function applyMissingSuggestions(
  state: DiscoveryState,
  pack: StrategyInputPack,
  preview: MissingSuggestionPreview,
  selected: readonly MissingSuggestionKey[],
): DiscoveryState {
  if (!missingSuggestionPreviewIsCurrent(preview, state, pack)) return state;
  const chosen = preview.fields.filter(
    ({ key, suggestion }) =>
      missingSuggestionFields.some((field) => field.key === key) &&
      selected.includes(key) &&
      !workspaceFieldValue(state, key).trim() &&
      suggestion.kind !== "missing" &&
      suggestion.value.trim(),
  );
  if (!chosen.length) return state;
  const existing = state.workspaceSuggestionContext;
  const fields = existing
    ? { ...existing.fields }
    : Object.fromEntries(
        workspaceFieldKeys.map((key) => [
          key,
          {
            value: workspaceFieldValue(state, key),
            kind: workspaceFieldValue(state, key).trim()
              ? "interpretation"
              : "missing",
            label: "Existing draft · original provenance not recorded",
          } satisfies WorkspaceStarterField,
        ]),
      );
  const next = { ...state };
  for (const { key, suggestion } of chosen) {
    next[key] = suggestion.value;
    fields[key] = {
      ...suggestion,
      label: `${suggestion.label} · added by your selection`,
    };
  }
  // Never relabel an old human field as a new seed, reset versions, or replace
  // frozen V0. A provenance-less legacy draft gains only the chosen origins;
  // an empty originalFields map prevents promoting old writing into AI reference.
  next.workspaceSuggestionContext = existing
    ? { ...existing, fields }
    : {
        packVersion: inputPackVersion(pack),
        campaign: pack.campaignName,
        opened: true,
        framing: pack.proposedRTB?.trim() ?? "",
        sparks: (pack.selectedSparks ?? []).map(
          (s) => `${s.id} · V${s.version} · ${s.title || s.text}`,
        ),
        research: (pack.selectedResearch ?? []).map(
          (r) => `${r.id} · V${r.version} · ${r.text}`,
        ),
        fields,
        originalFields: {},
      };
  return next;
}
