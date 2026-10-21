import { expect, test } from "@playwright/test";
import { demoPack } from "../../lib/demo";
import { emptyDiscoveryState, inputPackVersion } from "../../lib/discovery";
import {
  connectionSourceIssue,
  editConnectionNote,
  resolveConnectionSelection,
  saveConnectionNote,
} from "../../lib/discovery-connections";
import { parseIMCBrief } from "../../lib/imc-parser";
import type {
  DiscoveryConnectionNote,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryRunVersion,
  DiscoveryState,
  StrategyInputPack,
} from "../../lib/types";

const brief =
  "Campaign name: The Moving Moment\nBusiness objective: Retain current customers during a move.";
const pack = {
  ...demoPack,
  parsedIMC: parseIMCBrief(brief),
} satisfies StrategyInputPack;

function finding(
  lensId: DiscoveryLensId,
  sourcePack = pack,
  number = 1,
): DiscoveryFinding {
  return {
    id: `${lensId}-finding`,
    researchRunId: `${lensId}-run-${number}`,
    lensId,
    inputPackVersion: inputPackVersion(sourcePack),
    runVersion: number,
    title: `${lensId} moving question`,
    whatWeFound: "The supplied campaign brief names retention as an objective.",
    evidence: [
      {
        source: "IMC brief",
        locator: "imc:lines:1-2",
        excerpt: "Retain current customers during a move.",
        date: "Not supplied",
        audience: "Not supplied",
        context: "Supplied business objective, not audience research.",
        accessScope: "supplied",
      },
    ],
    whyItMayMatter: "This may frame a retention question.",
    whatComplicatesIt: "No customer behavior evidence is supplied.",
    questionToExplore: "Why would existing customers leave?",
    evidenceState: "evidence_supported",
  };
}

function version(
  lensId: DiscoveryLensId,
  sourcePack = pack,
  number = 1,
): DiscoveryRunVersion {
  return {
    id: `${lensId}-run-${number}`,
    number,
    question: "Why do movers reconsider service?",
    investigationType: "problem",
    action: "initial",
    guidance: "",
    createdAt: "2026-10-17T00:00:00.000Z",
    inputPackVersion: inputPackVersion(sourcePack),
    inputPackSnapshot: structuredClone(sourcePack),
    findings: [finding(lensId, sourcePack, number)],
    sourceCoverage: [],
    provider: "mock",
  };
}

function stateWith(...versions: DiscoveryRunVersion[]): DiscoveryState {
  const state = emptyDiscoveryState();
  state.question = "Why do movers reconsider service?";
  state.selectedFindingIds = versions.map(
    (item) => `${item.findings[0].id}@${item.number}`,
  );
  state.runs = state.runs.map((run) => ({
    ...run,
    versions: versions.filter((item) => item.findings[0].lensId === run.lensId),
  }));
  return state;
}

test("connections require two different lenses, exact references and verified supplied excerpts", () => {
  const state = stateWith(version("consumer"), version("brand"));
  const selection = resolveConnectionSelection(state, pack);
  expect(selection.issue).toBe("");
  expect(selection.findings.map((item) => item.lensId)).toEqual([
    "consumer",
    "brand",
  ]);
  expect(selection.sourcePacks).toHaveLength(2);

  // A later run may carry the unchanged source finding. Its canonical run is
  // still the origin; an extra container is not an ambiguous selection.
  const carried = version("consumer", pack, 2);
  carried.findings = [state.runs[0].versions[0].findings[0]];
  state.runs[0].versions.unshift(carried);
  expect(resolveConnectionSelection(state, pack).issue).toBe("");

  const sameLens = stateWith(version("consumer"), version("consumer", pack, 2));
  expect(resolveConnectionSelection(sameLens, pack).issue).toContain(
    "different agents",
  );
  state.selectedFindingIds[1] = "brand-finding";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "one exact version",
  );
  state.selectedFindingIds[1] = "brand-finding@1";
  const selectedEvidence = state.runs.find((run) => run.lensId === "brand")!
    .versions[0].findings[0].evidence[0];
  selectedEvidence.excerpt = "A result from a source we did not provide.";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "cannot be verified",
  );
  selectedEvidence.excerpt = "Retain current customers during a move.";
  selectedEvidence.source = "Tableau";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "cannot be verified",
  );
  selectedEvidence.source = "IMC brief";
  selectedEvidence.locator = "imc:brief";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "source location",
  );
  selectedEvidence.locator = "imc:wrong";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "unsupported source locator",
  );
  selectedEvidence.locator = "imc:brief";
  selectedEvidence.accessScope = "restricted";
  expect(resolveConnectionSelection(state, pack).issue).toContain(
    "not supplied and accessible",
  );
  selectedEvidence.accessScope = "supplied";
  const gap = state.runs.find((run) => run.lensId === "brand")!.versions[0]
    .findings[0];
  gap.evidenceState = "research_gap";
  gap.evidence = [];
  expect(resolveConnectionSelection(state, pack).issue).toBe("");
});

test("earlier same-campaign context requires consent tied to that exact selection; another campaign is rejected", () => {
  const revised = { ...pack, research: "New selected research context." };
  const state = stateWith(version("consumer"), version("brand"));
  const pending = resolveConnectionSelection(state, revised);
  expect(pending.earlierContext).toBe(true);
  expect(pending.issue).toContain("Confirm this exact selection");
  expect(
    resolveConnectionSelection(state, revised, pending.selectionKey).issue,
  ).toBe("");
  state.question = "A new investigation question";
  expect(
    resolveConnectionSelection(state, revised, pending.selectionKey).issue,
  ).toContain("Confirm this exact selection");
  const focusOnly = stateWith(version("consumer"), version("brand"));
  focusOnly.question = "A different investigation focus";
  expect(resolveConnectionSelection(focusOnly, pack).earlierContext).toBe(true);

  const otherPack = {
    ...pack,
    parsedIMC: parseIMCBrief(
      "Campaign name: Another Campaign\nBusiness objective: Acquire new subscribers.",
    ),
  };
  expect(resolveConnectionSelection(state, otherPack).issue).toContain(
    "different campaigns",
  );
});

test("connection edits keep the generated original and recoverable saved versions; source changes are flagged", () => {
  const state = stateWith(version("consumer"), version("brand"));
  const note: DiscoveryConnectionNote = {
    id: "connection-1",
    findingIds: ["consumer-finding", "brand-finding"],
    findingVersions: [
      {
        findingId: "consumer-finding",
        runVersion: 1,
        researchRunId: "consumer-run-1",
        inputPackVersion: inputPackVersion(pack),
      },
      {
        findingId: "brand-finding",
        runVersion: 1,
        researchRunId: "brand-run-1",
        inputPackVersion: inputPackVersion(pack),
      },
    ],
    relationships: [],
    tensions: [],
    questions: [],
    note: "Model working interpretation.",
    generatedNote: "Model working interpretation.",
    createdAt: "2026-10-17T00:00:00.000Z",
    editedByKevin: false,
  };
  const first = saveConnectionNote(
    editConnectionNote(note, "Kevin's first interpretation."),
  );
  const second = saveConnectionNote(
    editConnectionNote(first, "Kevin's refined interpretation."),
  );
  expect(second.generatedNote).toBe("Model working interpretation.");
  expect(second.editVersions?.map((item) => item.text)).toEqual([
    "Kevin's refined interpretation.",
    "Kevin's first interpretation.",
  ]);
  expect(saveConnectionNote(second).editVersions).toHaveLength(2);
  expect(connectionSourceIssue(second, state, pack)).toBe("");
  const newer = version("consumer", pack, 2);
  state.runs.find((run) => run.lensId === "consumer")!.versions.unshift(newer);
  expect(connectionSourceIssue(second, state, pack)).toContain("newer version");
  expect(
    connectionSourceIssue(second, state, {
      ...pack,
      research: "A later selected preparation version.",
    }),
  ).toContain("Earlier Input Pack");
  const restored = JSON.parse(
    JSON.stringify(second),
  ) as DiscoveryConnectionNote;
  expect(restored.generatedNote).toBe(note.note);
  expect(restored.editVersions).toHaveLength(2);
});
