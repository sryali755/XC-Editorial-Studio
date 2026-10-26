import { inputPackVersion } from "./discovery";
import type {
  DiscoveryState,
  DiscoveryWholeBrief,
  StrategyInputPack,
  WorkspaceStarterField,
} from "./types";

// The 13 editable Working Space fields: 7 core boxes, 3 optional boxes and
// the 3 editable IMC execution fields. This is provenance, not a draft.
export const workspaceFieldKeys = [
  "humanBriefLine",
  "problemStatement",
  "evidenceInsights",
  "workingAudience",
  "workingJTBD",
  "workingRTB",
  "strategicDirection",
  "openQuestions",
  "executionConsiderations",
  "notes",
  "wholeBrief.deliverables",
  "wholeBrief.mandatories",
  "wholeBrief.timelines",
] as const;
// Fields from the earlier 19-field layout, and the box that now holds them.
const retiredWorkspaceFields = [
  ["humanTension", "evidenceInsights", "Human tension"],
  ["hypothesis", "strategicDirection", "Working hypothesis"],
  ["wholeBrief.audience", "workingAudience", "Whole-brief audience"],
  ["wholeBrief.thoughtStarters", "executionConsiderations", "Thought-starters"],
  ["wholeBrief.context", "executionConsiderations", "Context"],
  ["wholeBrief.objective", "problemStatement", "Objective (your edit)"],
] as const;
export type WorkspaceFieldKey = (typeof workspaceFieldKeys)[number];
type Seed = NonNullable<DiscoveryState["workspaceSuggestionContext"]>;

export function workspaceFieldValue(
  state: DiscoveryState,
  key: string,
): string {
  if (key.startsWith("wholeBrief."))
    return (
      state.wholeBrief?.[
        key.slice(11) as keyof NonNullable<DiscoveryState["wholeBrief"]>
      ] ?? ""
    );
  return (
    (state[key as Exclude<WorkspaceFieldKey, `wholeBrief.${string}`>] as
      string | undefined) ?? ""
  );
}

function selectionContext(pack: StrategyInputPack) {
  return {
    packVersion: inputPackVersion(pack),
    campaign: pack.campaignName,
    framing: [pack.proposedJTBD?.trim(), pack.proposedRTB?.trim()]
      .filter(Boolean)
      .join("\n\n"),
    research: (pack.selectedResearch ?? []).map(
      (x) => `${x.id} · V${x.version} · ${x.text}`,
    ),
    sparks: (pack.selectedSparks ?? []).map(
      (x) => `${x.id} · V${x.version} · ${x.title || x.text}`,
    ),
  };
}

export function seedSelectedWorkspace(
  state: DiscoveryState,
  pack: StrategyInputPack,
  labels: Partial<Record<WorkspaceFieldKey, string>> = {},
  canvasFields: Partial<Record<WorkspaceFieldKey, WorkspaceStarterField>> = {},
): DiscoveryState {
  const sparks = pack.selectedSparks ?? [];
  const research = pack.selectedResearch ?? [];
  const framing = pack.proposedRTB?.trim() ?? "";
  // Explicitly selected Input Pack context replaces the IMC starting point
  // for the box it belongs to. Values stay plain text; provenance is the label.
  const next: DiscoveryState = { ...state };
  // New drafts keep AI/source starting content separate from the single
  // human-owned line. Existing drafts are never passed through this initializer.
  const suggestedLine =
    sparks[0]?.idea || sparks[0]?.text || state.humanBriefLine || "";
  next.humanBriefLine = "";
  const selected: Partial<Record<WorkspaceFieldKey, string>> = {};
  if (framing) {
    next.workingRTB = framing;
    selected.workingRTB = "Selected XC RTB adaptation · not GTM-approved";
  }
  if (sparks.length) {
    next.strategicDirection = sparks
      .map((x) => {
        const hypothesis = x.hypothesis || x.hypothesisToValidate;
        return [
          `${x.title || x.text}: ${x.idea || x.text}`,
          hypothesis ? `Hypothesis to validate: ${hypothesis}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    selected.strategicDirection = "From selected Sparks · not approved";
  }
  const gaps = research
    .filter((x) =>
      ["RESEARCH TO VALIDATE", "EVIDENCE GAPS"].includes(
        x.category.toUpperCase(),
      ),
    )
    .map((x) => x.text);
  if (gaps.length) {
    next.openQuestions = [state.openQuestions?.trim(), ...gaps]
      .filter(Boolean)
      .join("\n\n");
    selected.openQuestions = "From selected research gaps and the IMC brief";
  }
  const fields: Seed["fields"] = {};
  for (const key of workspaceFieldKeys) {
    const value = workspaceFieldValue(next, key);
    fields[key] =
      canvasFields[key] ??
      (!value.trim()
        ? {
            value,
            kind: "missing",
            label: "Not in the Input Pack · add your own",
          }
        : selected[key]
          ? { value, kind: "selected", label: selected[key] }
          : {
              value,
              kind: key === "openQuestions" ? "interpretation" : "supplied",
              label: labels[key] ?? "From the Input Pack",
            });
  }
  return {
    ...next,
    workspaceSuggestionContext: {
      ...selectionContext(pack),
      fields,
      originalFields: {
        ...fields,
        humanBriefLine: {
          value: suggestedLine,
          kind: sparks.length
            ? "selected"
            : suggestedLine
              ? "supplied"
              : "missing",
          label: sparks.length
            ? "From the top selected Spark · unaccepted suggestion"
            : labels.humanBriefLine ||
              "From the Input Pack · unaccepted suggestion",
        },
      },
      opened: false,
    },
  };
}

// Merges text from the retired 19-field layout into the box that replaced it.
// Untouched old suggestions are dropped (a fresh prefill supersedes them);
// anything Kevin wrote is kept, labelled, and never silently lost.
export function consolidateWorkspaceFields(
  state: DiscoveryState,
): DiscoveryState {
  // Only retired fields holding text need work; empty leftovers are inert.
  if (
    !retiredWorkspaceFields.some(([from]) =>
      workspaceFieldValue(state, from).trim(),
    )
  )
    return state;
  const seeded = state.workspaceSuggestionContext?.fields ?? {};
  const next: DiscoveryState = { ...state };
  const wholeBrief = { ...state.wholeBrief };
  for (const [from, to, label] of retiredWorkspaceFields) {
    const value = workspaceFieldValue(state, from).trim();
    if (from.startsWith("wholeBrief."))
      delete wholeBrief[from.slice(11) as keyof DiscoveryWholeBrief];
    else delete next[from as "humanTension" | "hypothesis"];
    if (!value || seeded[from]?.value.trim() === value) continue;
    const current = (next[to] ?? "").trim();
    if (current.includes(value)) continue;
    next[to] = [current, `${label}: ${value}`].filter(Boolean).join("\n\n");
  }
  return { ...next, wholeBrief };
}

export function prepareWorkspaceDraft(
  state: DiscoveryState,
  pack: StrategyInputPack,
  fresh: DiscoveryState,
): DiscoveryState {
  const seed = state.workspaceSuggestionContext;
  // Older saved canvases have no provenance snapshot: never infer they are untouched.
  if (!pack.parsedIMC?.sourceText.trim() || !seed || seed.opened) return state;
  const humanDraft = workspaceFieldKeys.some(
    (key) =>
      workspaceFieldValue(state, key) !== seed.fields[key]?.value ||
      Boolean(state.fieldVersions?.[key]?.length),
  );
  // Preserve even an untouched AI-filled legacy line. New initializers always
  // leave this field empty; no restoration may silently clear an older value.
  if (humanDraft || state.humanBriefLine?.trim())
    return { ...state, workspaceSuggestionContext: { ...seed, opened: true } };
  const updated = { ...state };
  for (const key of workspaceFieldKeys) {
    if (key.startsWith("wholeBrief."))
      updated.wholeBrief = {
        ...updated.wholeBrief,
        [key.slice(11)]: workspaceFieldValue(fresh, key),
      };
    else Object.assign(updated, { [key]: workspaceFieldValue(fresh, key) });
  }
  return {
    ...updated,
    workspaceSuggestionContext: {
      ...fresh.workspaceSuggestionContext!,
      opened: true,
    },
  };
}

// A stored draft is never a new-draft initialization opportunity. Seal the
// unopened selection review, preserving all values, origins and versions.
export function preserveRestoredWorkspace(
  state: DiscoveryState,
): DiscoveryState {
  const seed = state.workspaceSuggestionContext;
  return seed && !seed.opened
    ? { ...state, workspaceSuggestionContext: { ...seed, opened: true } }
    : state;
}

export function workspaceContextChanges(
  state: DiscoveryState,
  pack: StrategyInputPack,
): string[] {
  const before = state.workspaceSuggestionContext;
  if (!before || before.packVersion === inputPackVersion(pack)) return [];
  const after = selectionContext(pack),
    changes: string[] = [];
  if (before.framing !== after.framing)
    changes.push("Selected XC framing changed.");
  if (JSON.stringify(before.research) !== JSON.stringify(after.research))
    changes.push("Selected data points or their versions changed.");
  if (JSON.stringify(before.sparks) !== JSON.stringify(after.sparks))
    changes.push("Selected Sparks or their versions changed.");
  return changes.length
    ? changes
    : ["The Input Pack source context or version changed."];
}

// An explicit Finalize Strategy inclusion choice can revise source-derived
// proposals, but never human text, a saved draft, or the original V0 snapshot.
export function reviewWorkspaceSupport(
  state: DiscoveryState,
  suggested: DiscoveryState,
): DiscoveryState {
  const seed = state.workspaceSuggestionContext;
  if (!seed || !suggested.workspaceSuggestionContext) return state;
  const next = { ...state },
    fields = { ...seed.fields };
  let changed = false;
  // Supporting-context choices never own the human line, including an older
  // autosaved source/Spark suggestion that has no explicit field version yet.
  for (const key of [
    "workingRTB",
    "evidenceInsights",
    "strategicDirection",
    "openQuestions",
  ] as const) {
    const current = workspaceFieldValue(state, key),
      value = workspaceFieldValue(suggested, key);
    if (
      current !== fields[key]?.value ||
      state.fieldVersions?.[key]?.length ||
      current === value
    )
      continue;
    if (key.startsWith("wholeBrief."))
      next.wholeBrief = { ...next.wholeBrief, [key.slice(11)]: value };
    else Object.assign(next, { [key]: value });
    fields[key] = suggested.workspaceSuggestionContext.fields[key];
    changed = true;
  }
  return changed
    ? {
        ...next,
        workspaceSuggestionContext: {
          ...seed,
          fields,
          originalFields: seed.originalFields ?? seed.fields,
          reviewPackVersion: suggested.workspaceSuggestionContext.packVersion,
        },
      }
    : state;
}

export function saveWorkspaceDraft(state: DiscoveryState): DiscoveryState {
  const versions = { ...state.fieldVersions },
    active = { ...state.activeFieldVersionIds };
  let changed = false;
  for (const key of workspaceFieldKeys) {
    const prior = versions[key] ?? [],
      value = workspaceFieldValue(state, key);
    const current = prior.find((x) => x.id === active[key]) ?? prior[0];
    if (current?.value === value) continue;
    const id = crypto.randomUUID();
    versions[key] = [
      {
        id,
        number: Math.max(0, ...prior.map((x) => x.number)) + 1,
        value,
        savedAt: new Date().toISOString(),
      },
      ...prior,
    ];
    active[key] = id;
    changed = true;
  }
  return changed
    ? { ...state, fieldVersions: versions, activeFieldVersionIds: active }
    : state;
}
