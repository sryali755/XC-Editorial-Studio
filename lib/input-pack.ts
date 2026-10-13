import { selectedFoundation } from "./ai/context";
import {
  compileInputPack,
  currentPreparation,
  preparationAgents,
} from "./preparation";
import { sourceContext, upstreamFields } from "./upstream";
import type {
  InputPackSnapshot,
  ParsedIMCBrief,
  PreparationState,
} from "./types";
import { imcSchema } from "./imc-parser";

export function snapshotInputPack(state: PreparationState): InputPackSnapshot {
  return structuredClone({
    savedAt: new Date().toISOString(),
    sourceBrief: state.sourceSnapshot,
    pack: compileInputPack(state),
    versions: Object.fromEntries(
      preparationAgents.map(({ id }) => {
        const version = currentPreparation(state, id);
        return [id, { id: version?.id ?? "", number: version?.number ?? 0 }];
      }),
    ) as InputPackSnapshot["versions"],
  });
}

// A direction can restore only versions from the active, parsed source. Histories stay intact.
export function candidateUnavailable(
  state: PreparationState,
  snapshot: InputPackSnapshot,
): string | null {
  if (state.upstreamDraft.trim() !== state.sourceSnapshot.trim())
    return "Prepare the changed IMC brief before choosing a direction.";
  if (snapshot.sourceBrief !== state.sourceSnapshot)
    return "Saved with a different IMC brief. Prepare and save a new direction.";
  if (
    preparationAgents.some(
      ({ id }) =>
        !state.outputs
          .find((o) => o.agentId === id)
          ?.versions.some(
            (v) =>
              v.id === snapshot.versions[id].id &&
              v.sourceBrief === state.sourceSnapshot,
          ),
    )
  )
    return "A saved preparation version is no longer available.";
  const sparks = state.outputs
    .find((o) => o.agentId === "sparks")!
    .versions.find((v) => v.id === snapshot.versions.sparks.id)!;
  if (
    !snapshot.pack.selectedSparks?.length ||
    snapshot.pack.selectedSparks.some(
      (s) => !sparks.sparks.some((saved) => saved.id === s.id),
    )
  )
    return "The saved Spark selection is no longer available.";
  return null;
}

export function restoreInputPack(
  state: PreparationState,
  snapshot: InputPackSnapshot,
): PreparationState {
  if (candidateUnavailable(state, snapshot)) return state;
  const upstream = structuredClone(snapshot.pack.upstream!);
  return {
    ...state,
    upstream,
    context: sourceContext(upstream),
    outputs: state.outputs.map((o) => ({
      ...o,
      currentVersionId: snapshot.versions[o.agentId].id,
      error: undefined,
    })),
    selectedSparkIds: snapshot.pack.selectedSparks!.map((s) => s.id),
    keptSparkIds: [],
    focus: snapshot.pack.researchFocus ?? "",
    selectionNotice: undefined,
  };
}

export function inputPackChanges(
  before: InputPackSnapshot,
  after: InputPackSnapshot,
): string[] {
  const changes: string[] = [];
  if (before.sourceBrief !== after.sourceBrief)
    changes.push("Original IMC brief changed.");
  for (const [id, name] of [
    ["reasonToBelieve", "RTB proposal"],
    ["research", "Research"],
    ["sparks", "Sparks"],
  ] as const) {
    const a = before.versions[id],
      b = after.versions[id];
    if (a.id !== b.id) changes.push(`${name}: V${a.number} → V${b.number}.`);
  }
  const a = selectedFoundation(before.pack),
    b = selectedFoundation(after.pack);
  if (JSON.stringify(a.selectedSparks) !== JSON.stringify(b.selectedSparks))
    changes.push(
      `Spark selection: ${a.selectedSparks.length} → ${b.selectedSparks.length} selected.`,
    );
  if (a.researchEmphasis !== b.researchEmphasis)
    changes.push("Additional direction changed.");
  for (const { key, label } of upstreamFields) {
    if (
      JSON.stringify(a.requirements.fields[key]) !==
      JSON.stringify(b.requirements.fields[key])
    )
      changes.push(`${label}: source or review details changed.`);
  }
  return changes;
}

// These are exact text matches, not semantic citations or verification of a claim.
export function sparkSourceMatches(rationale: string, parsed: ParsedIMCBrief) {
  const quotes = [...rationale.matchAll(/[“"]([^”"\n]{12,})[”"]/g)].map(
    (m) => m[1],
  );
  return imcSchema.flatMap(({ key, upstreamKey }) => {
    const field = parsed.fields[key];
    if (field.status !== "Supplied" || !field.sourceValue.trim()) return [];
    const fullMatch =
      field.sourceValue.length >= 20 && rationale.includes(field.sourceValue);
    const excerpt = fullMatch
      ? field.sourceValue
      : quotes.find((q) => field.sourceValue.includes(q));
    return excerpt
      ? [
          {
            key,
            label: upstreamFields.find((f) => f.key === upstreamKey)!.label,
            excerpt,
          },
        ]
      : [];
  });
}

export function sparkReasoning(rationale: string) {
  const match = rationale.match(
    /^\s*Premise:\s*([\s\S]*?)\s*Grounding:\s*([\s\S]*?)\s*Validate:\s*([\s\S]*)$/i,
  );
  return match
    ? { premise: match[1], grounding: match[2], validate: match[3] }
    : null;
}
