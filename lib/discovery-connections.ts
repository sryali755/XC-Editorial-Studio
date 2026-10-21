import { discoveryFindingRef, inputPackVersion } from "./discovery";
import { discoveryStorageKey } from "./discovery-persistence";
import { validateConnectionFindingEvidence } from "./discovery-connection-evidence";
import type {
  DiscoveryConnectionNote,
  DiscoveryFinding,
  DiscoveryState,
  StrategyInputPack,
} from "./types";

export interface ConnectionSelection {
  findings: DiscoveryFinding[];
  sourcePacks: StrategyInputPack[];
  issue: string;
  earlierContext: boolean;
  selectionKey: string;
}

export function connectionSelectionKey(
  state: DiscoveryState,
  pack: StrategyInputPack,
): string {
  return JSON.stringify({
    campaign: discoveryStorageKey(pack),
    inputPackVersion: inputPackVersion(pack),
    investigationType: state.investigationType,
    question: state.question,
    findingRefs: state.selectedFindingIds,
  });
}

// Compare only the exact finding versions the strategist ticked. Historical
// versions from this campaign need consent for this particular selection.
export function resolveConnectionSelection(
  state: DiscoveryState,
  pack: StrategyInputPack,
  allowEarlierContext?: string,
): ConnectionSelection {
  const selectionKey = connectionSelectionKey(state, pack);
  const fail = (issue: string): ConnectionSelection => ({
    findings: [],
    sourcePacks: [],
    issue,
    earlierContext: false,
    selectionKey,
  });
  const refs = state.selectedFindingIds;
  if (refs.length < 2)
    return fail("Select at least two exact finding versions to compare.");
  if (refs.length > 12)
    return fail("Compare no more than 12 finding versions at a time.");
  if (new Set(refs).size !== refs.length)
    return fail(
      "The comparison includes a duplicate finding version. Reselect the findings.",
    );

  const findings: DiscoveryFinding[] = [];
  const sourcePacks: StrategyInputPack[] = [];
  let earlierContext = false;
  const currentVersion = inputPackVersion(pack);
  const currentCampaign = discoveryStorageKey(pack);
  for (const ref of refs) {
    const matches = state.runs.flatMap((run) =>
      run.versions.flatMap((version) =>
        version.findings
          .filter((finding) => discoveryFindingRef(finding) === ref)
          .map((finding) => ({ run, version, finding })),
      ),
    );
    // A finding may be carried unchanged into a later run version. Its own
    // researchRunId/runVersion, not the container that copied it, identifies
    // the exact version Kevin originally selected.
    const origins = matches.filter(({ version, finding }) =>
      finding.researchRunId
        ? version.id === finding.researchRunId
        : version.number === finding.runVersion,
    );
    if (origins.length !== 1)
      return fail(
        "A selected finding is unavailable or does not identify one exact version. Reselect it from its agent card.",
      );
    const { run, version, finding } = origins[0];
    if (
      run.lensId !== finding.lensId ||
      version.inputPackVersion !== finding.inputPackVersion ||
      (finding.researchRunId && version.id !== finding.researchRunId)
    )
      return fail(
        "A selected finding has inconsistent source-version metadata.",
      );
    const originalPack = version.inputPackSnapshot;
    if (!originalPack) {
      if (finding.inputPackVersion !== currentVersion)
        return fail(
          "An earlier finding has no inspectable Input Pack snapshot. Restore its source context before comparing.",
        );
    } else if (discoveryStorageKey(originalPack) !== currentCampaign) {
      return fail("Findings from different campaigns cannot be compared.");
    }
    if (
      finding.inputPackVersion !== currentVersion ||
      version.question.trim() !== state.question.trim() ||
      version.investigationType !== state.investigationType
    )
      earlierContext = true;
    const evidenceIssue = validateConnectionFindingEvidence(
      originalPack ?? pack,
      [finding],
    );
    if (evidenceIssue)
      return fail(
        `Selected finding ${finding.title} cannot be compared: ${evidenceIssue}`,
      );
    findings.push(finding);
    sourcePacks.push(originalPack ?? pack);
  }
  if (new Set(findings.map((finding) => finding.lensId)).size < 2)
    return fail("Select findings from at least two different agents.");
  if (earlierContext && allowEarlierContext !== selectionKey)
    return {
      findings,
      sourcePacks,
      issue:
        "These findings include an earlier Input Pack or investigation focus. Confirm this exact selection before comparing different context versions.",
      earlierContext,
      selectionKey,
    };
  return { findings, sourcePacks, issue: "", earlierContext, selectionKey };
}

export function editConnectionNote(
  note: DiscoveryConnectionNote,
  text: string,
): DiscoveryConnectionNote {
  if (text === note.note) return note;
  return {
    ...note,
    ...(!note.generatedNote && !note.editedByKevin
      ? { generatedNote: note.note }
      : {}),
    note: text,
    editedByKevin: true,
  };
}

export function saveConnectionNote(
  note: DiscoveryConnectionNote,
): DiscoveryConnectionNote {
  const versions = note.editVersions ?? [];
  if (versions[0]?.text === note.note) return { ...note, saved: true };
  return {
    ...note,
    saved: true,
    editVersions: [
      {
        id: crypto.randomUUID(),
        text: note.note,
        createdAt: new Date().toISOString(),
      },
      ...versions,
    ],
  };
}

export function connectionSourceIssue(
  note: DiscoveryConnectionNote,
  state: DiscoveryState,
  pack: StrategyInputPack,
): string {
  const currentPackVersion = inputPackVersion(pack);
  const originVersions = note.findingVersions.map((reference) =>
    state.runs
      .flatMap((run) => run.versions)
      .find(
        (version) =>
          (reference.researchRunId
            ? version.id === reference.researchRunId
            : version.number === reference.runVersion) &&
          version.findings.some(
            (finding) =>
              finding.id === reference.findingId &&
              finding.runVersion === reference.runVersion,
          ),
      ),
  );
  const prior = note.findingVersions.some(
    (reference, index) =>
      reference.inputPackVersion !== currentPackVersion ||
      (originVersions[index] &&
        (originVersions[index].question.trim() !== state.question.trim() ||
          originVersions[index].investigationType !== state.investigationType)),
  );
  const newer = note.findingVersions.filter((reference) =>
    state.runs.some((run) =>
      run.versions.some((version) =>
        version.findings.some(
          (finding) =>
            finding.id === reference.findingId &&
            finding.runVersion > reference.runVersion,
        ),
      ),
    ),
  );
  if (originVersions.some((version) => !version))
    return "A referenced finding version is unavailable. This saved note has not been retargeted.";
  if (
    originVersions.some(
      (version) =>
        version?.inputPackSnapshot &&
        discoveryStorageKey(version.inputPackSnapshot) !==
          discoveryStorageKey(pack),
    )
  )
    return "A source finding belongs to another campaign. This note cannot be used in the current campaign.";
  if (prior)
    return "Earlier Input Pack or investigation focus referenced. Reconsider this note before using it with current context.";
  if (newer.length)
    return "A source finding has a newer version. This note still cites the original selected version.";
  return "";
}
