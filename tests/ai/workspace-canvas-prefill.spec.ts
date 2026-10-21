import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  prefillWorkspaceSuggestions,
  readStudio,
  seedStudioDiscovery,
  studioPack,
  studioStorageKey,
} from "../../lib/discovery-studio";
import {
  compactStringify,
  writeDiscoveryDraft,
} from "../../lib/discovery-persistence";
import { discoveryFindingRef, inputPackVersion } from "../../lib/discovery";
import { discoveryFoundation } from "../../lib/discovery-context";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import {
  prepareWorkspaceDraft,
  preserveRestoredWorkspace,
  saveWorkspaceDraft,
} from "../../lib/workspace-suggestions";
import { workspaceStartingPoint } from "../../lib/workspace-presentation";
import type { DiscoveryFinding, StrategyInputPack } from "../../lib/types";
import { mobileIMCBrief } from "../fixtures/mobile-imc-brief";

const source = (name: string) =>
  readFileSync(
    path.join(__dirname, "../fixtures/client-input-pack", name),
    "utf8",
  );
function fixture(name = "movers_source_text.txt") {
  const session = applyStudioSource(emptyStudio(), source(name));
  const pack = studioPack(session);
  return { session, pack, state: seedStudioDiscovery(pack) };
}
function findingState(pack: StrategyInputPack) {
  const state = seedStudioDiscovery(pack);
  const document = discoverySourceDocuments(discoveryFoundation(pack)).find(
    (item) => item.text.includes("Business  Objective"),
  )!;
  const finding: DiscoveryFinding = {
    id: "initial-consumer-finding",
    title: "Mover source distinguishes retention and switching",
    whatWeFound:
      "The supplied Movers brief separates staying and switching; investigate each audience's needs rather than assuming one barrier.",
    whyItMayMatter: "Separate the decisions before proposing a common answer.",
    whatComplicatesIt:
      "This is an interpretation of the brief, not consumer research.",
    questionToExplore: "Which decision needs additional evidence?",
    evidenceState: "evidence_supported",
    lensId: "consumer",
    runVersion: 1,
    researchRunId: "initial-run",
    inputPackVersion: inputPackVersion(pack),
    provider: "mock",
    evidence: [
      {
        source: document.identity,
        locator: document.locator,
        excerpt: document.text.slice(0, 150),
        audience: "Supplied campaign audience",
        context: "Supplied brief interpretation",
        date: "Not supplied",
        accessScope: "supplied",
      },
    ],
  };
  state.runs[0] = {
    ...state.runs[0],
    status: "complete",
    currentVersionId: "initial-run",
    versions: [
      {
        id: "initial-run",
        number: 1,
        question: "What needs investigation?",
        investigationType: "problem",
        action: "initial",
        guidance: "",
        createdAt: "2026-10-18T12:00:00Z",
        inputPackVersion: inputPackVersion(pack),
        findings: [finding],
        sourceCoverage: [],
        provider: "mock",
      },
    ],
  };
  state.savedFindingIds = [discoveryFindingRef(finding)];
  return { state, finding };
}
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

for (const [file, ownText, foreignText] of [
  [
    "movers_source_text.txt",
    /moving|move moment/i,
    /Xfinity Pro|work-from-home/,
  ],
  [
    "xfinity_pro_source_text.txt",
    /streaming|gaming|work-from-home/i,
    /move moment|I am moving/,
  ],
] as const) {
  test(`${file}: meaningful source-specific Insight/JTBD, no automatic human line`, async ({}, info) => {
    const { pack, session, state } = fixture(file);
    expect(state.problemStatement).toBe(pack.objective.trim());
    expect(state.workingAudience).toBe(pack.audience.trim());
    expect(state.evidenceInsights).toMatch(ownText);
    expect(state.workingJTBD).toMatch(ownText);
    expect(state.evidenceInsights).not.toMatch(foreignText);
    expect(state.workingJTBD).not.toMatch(foreignText);
    expect(state.workingJTBD).toMatch(/^When .+, I want .+, so I can .+\.$/);
    expect(state.humanBriefLine).toBe("");
    expect(
      state.workspaceSuggestionContext!.fields.evidenceInsights,
    ).toMatchObject({ kind: "interpretation" });
    expect(
      state.workspaceSuggestionContext!.fields.evidenceInsights.label,
    ).toContain("Validate with research");
    expect(
      state.workspaceSuggestionContext!.fields.workingJTBD.label,
    ).toContain("not original or approved");
    expect(pack.originalJTBD).toBe("");
    expect(pack.rtbApprovalStatus).toBe("unknown");
    expect(session.approved).toBeNull();
    await info.attach("actual-new-draft-content", {
      body: JSON.stringify(
        {
          campaign: pack.campaignName,
          insight: state.evidenceInsights,
          jtbd: state.workingJTBD,
          humanBriefLine: state.humanBriefLine,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
}
test("selected evidence is preferred to a fallback; missing research and metadata are not insights", () => {
  const { pack } = fixture();
  pack.selectedResearch = [
    {
      id: "research",
      version: 1,
      versionId: "r0",
      category: "AUDIENCE CONTEXT",
      text: "Supplied mover interviews describe the service-transfer decision, not an approved consumer truth.",
      source: "Manually supplied interviews",
      status: "supplied",
    },
  ];
  expect(seedStudioDiscovery(pack).evidenceInsights).toBe(
    pack.selectedResearch[0].text,
  );
  pack.selectedResearch = [
    {
      ...pack.selectedResearch[0],
      category: "CAMPAIGN NAME",
      text: "Never use this metadata as an insight",
    },
    {
      ...pack.selectedResearch[0],
      category: "HISTORICAL / CREATIVE PERFORMANCE",
      text: "No connected historical performance results were retrieved.",
    },
  ];
  const state = seedStudioDiscovery(pack);
  expect(state.evidenceInsights).toContain("The brief addresses");
  expect(state.evidenceInsights).not.toContain("Never use this metadata");
  expect(state.evidenceInsights).not.toContain("results were retrieved");
});
test("explicitly selected supplied audience evidence takes priority over a source tension without rewriting it", () => {
  const pack = studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief));
  const sourceBefore = structuredClone(pack.parsedIMC);
  pack.selectedResearch = [
    {
      id: "selected-supplied-interviews",
      category: "AUDIENCE CONTEXT",
      text: "Supplied interviews distinguish understanding eligibility from comparing plan benefits. This needs interpretation, not presumed approval.",
      source: "Manually supplied audience interviews",
      status: "supplied",
      version: 1,
      versionId: "r0",
    },
  ];
  const state = seedStudioDiscovery(pack);
  expect(state.evidenceInsights).toBe(pack.selectedResearch[0].text);
  expect(state.workspaceSuggestionContext!.fields.evidenceInsights.kind).toBe(
    "selected",
  );
  expect(
    state.workspaceSuggestionContext!.fields.evidenceInsights.label,
  ).toContain(pack.selectedResearch[0].source);
  expect(pack.parsedIMC).toEqual(sourceBefore);
});
test("only selected Spark hypotheses can inform initial Insight; no Spark fills the human line", () => {
  const { pack } = fixture();
  pack.sparks = "UNSELECTED IDEA MUST NOT LEAK";
  pack.selectedSparks = [
    {
      id: "chosen",
      text: "Chosen idea",
      title: "Chosen angle",
      idea: "A separate strategic starting point.",
      hypothesis: "Validate whether transfer uncertainty matters to movers.",
      version: 1,
      versionId: "s0",
    },
  ];
  const state = seedStudioDiscovery(pack);
  expect(state.evidenceInsights).toContain(pack.selectedSparks[0].hypothesis!);
  expect(JSON.stringify(state)).not.toContain("UNSELECTED IDEA");
  expect(workspaceStartingPoint(state).candidate).toBe(
    pack.selectedSparks[0].idea,
  );
  expect(state.humanBriefLine).toBe("");
});
test("a source original stays exact, separate from selected RTB and the editable JTBD", () => {
  const pack = studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief));
  const original = pack.originalJTBD;
  const untouched = structuredClone(pack);
  const state = seedStudioDiscovery(pack);
  expect(state.workingJTBD).toBe(original);
  expect(state.workspaceSuggestionContext!.fields.workingJTBD.kind).toBe(
    "supplied",
  );
  expect(state.workspaceSuggestionContext!.fields.workingJTBD.label).toContain(
    "approval not established",
  );
  expect(pack).toEqual(untouched);
  pack.selectedResearch = [
    {
      id: "chosen-job",
      category: "PROPOSED JTBD",
      text: "When reviewing my mobile choices, I want an understandable option, so I can make my own decision.",
      source: "Explicitly selected preparation proposal",
      status: "ai_synthesis",
      version: 1,
      versionId: "r0",
    },
  ];
  const selected = seedStudioDiscovery(pack);
  expect(selected.workingJTBD).toBe(pack.selectedResearch[0].text);
  expect(selected.workspaceSuggestionContext!.fields.workingJTBD.kind).toBe(
    "selected",
  );
  expect(
    selected.workspaceSuggestionContext!.fields.workingJTBD.label,
  ).toContain("not approved");
  expect(pack.originalJTBD).toBe(original);
  expect(selected.evidenceInsights).not.toBe(selected.workingJTBD);
});
test("supplied internal-test proposed jobs and RTB adaptations do not masquerade as original JTBD", () => {
  const { pack } = fixture();
  pack.jtbdContext!.proposed = [
    {
      label: "Proposed JTBD",
      text: "Internal testing addendum — RAW TEST ANNOTATION",
      excerpt: "RAW TEST ANNOTATION",
      line: 1,
      approvalStatus: "not_approved",
    },
  ];
  pack.proposedRTB = "Selected RTB framing — not a job adaptation.";
  const state = seedStudioDiscovery(pack);
  expect(state.workingJTBD).not.toMatch(/RAW TEST|Selected RTB/);
  expect(state.workingRTB).toBe(pack.proposedRTB);
  expect(pack.originalJTBD).toBe("");
  expect(pack.jtbdContext!.proposed[0].text).toContain("RAW TEST");
});
test("relevant saved finding available at first canvas initialization is an unverified interpretation", () => {
  const { pack } = fixture();
  const { state, finding } = findingState(pack);
  const opened = prepareWorkspaceDraft(
    state,
    pack,
    seedStudioDiscovery(pack, state),
  );
  expect(opened.evidenceInsights).toBe(finding.whatWeFound);
  expect(
    opened.workspaceSuggestionContext!.fields.evidenceInsights.label,
  ).toContain("saved consumer finding");
  expect(opened.workspaceSuggestionContext!.fields.evidenceInsights.kind).toBe(
    "interpretation",
  );
  expect(opened.humanBriefLine).toBe("");
  expect(opened.savedFindingIds).toEqual(state.savedFindingIds);
  const afterSave = saveWorkspaceDraft({
    ...opened,
    evidenceInsights: "Kevin's edited insight",
  });
  expect(
    prepareWorkspaceDraft(afterSave, pack, seedStudioDiscovery(pack, state)),
  ).toBe(afterSave);
});
for (const invalid of ["stale", "forged-source", "gap"] as const)
  test(`${invalid} saved finding cannot seed a source-supported insight`, () => {
    const { pack } = fixture();
    const { state, finding } = findingState(pack);
    if (invalid === "stale") finding.inputPackVersion = "pack-another-campaign";
    if (invalid === "forged-source")
      finding.evidence[0].source = "Unconnected enterprise source";
    if (invalid === "gap") finding.evidenceState = "research_gap";
    state.savedFindingIds = [discoveryFindingRef(finding)];
    expect(seedStudioDiscovery(pack, state).evidenceInsights).not.toBe(
      finding.whatWeFound,
    );
  });
test("insufficient source stays blank with honest validation provenance, never stored placeholders", () => {
  const pack = studioPack(
    applyStudioSource(
      emptyStudio(),
      "Campaign: Sparse campaign\nBackground: A supplied document without audience needs or objectives.",
    ),
  );
  const state = seedStudioDiscovery(pack);
  expect(state.evidenceInsights).toBe("");
  expect(state.workingJTBD).toBe("");
  for (const key of ["evidenceInsights", "workingJTBD"])
    expect(state.workspaceSuggestionContext!.fields[key]).toMatchObject({
      kind: "missing",
      value: "",
      label: expect.stringContaining("Needs validation"),
    });
  expect(state.humanBriefLine).toBe("");
  expect(JSON.stringify(state)).not.toContain("Write your brief line here");
});
test("legacy empty fields and an old AI-filled line survive hydration and first opening exactly", () => {
  const { session, pack, state } = fixture();
  const legacy = {
    ...state,
    evidenceInsights: "",
    workingJTBD: "",
    humanBriefLine: "Exact legacy AI-filled line — keep its existing origin",
    workspaceSuggestionsSeeded: undefined,
  };
  legacy.workspaceSuggestionContext = {
    ...state.workspaceSuggestionContext!,
    fields: {
      ...state.workspaceSuggestionContext!.fields,
      humanBriefLine: {
        value: legacy.humanBriefLine,
        kind: "supplied",
        label: "Legacy source suggestion — unapproved",
      },
    },
  };
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
  storage.setItem(studioStorageKey, compactStringify(session));
  writeDiscoveryDraft(storage, pack, legacy);
  const restored = readStudio(storage).discovery;
  expect(restored.humanBriefLine).toBe(legacy.humanBriefLine);
  expect(restored.evidenceInsights).toBe("");
  expect(restored.workingJTBD).toBe("");
  expect(restored.workspaceSuggestionContext!.fields.humanBriefLine).toEqual(
    legacy.workspaceSuggestionContext.fields.humanBriefLine,
  );
  expect(prepareWorkspaceDraft(restored, pack, seedStudioDiscovery(pack))).toBe(
    restored,
  );
  const withoutMetadata = { ...legacy, workspaceSuggestionContext: undefined };
  expect(prefillWorkspaceSuggestions(withoutMetadata, pack)).toBe(
    withoutMetadata,
  );
  expect(preserveRestoredWorkspace(withoutMetadata)).toBe(withoutMetadata);
});
test("saved values, intentional clears and histories survive a context change without implicit approval", () => {
  const { state, pack, session } = fixture();
  const opened = prepareWorkspaceDraft(state, pack, state);
  const edited = saveWorkspaceDraft({
    ...opened,
    evidenceInsights: "Kevin's insight",
    workingJTBD: "Kevin's job",
    humanBriefLine: "Kevin's exact line",
  });
  const cleared = saveWorkspaceDraft({
    ...edited,
    evidenceInsights: "",
    workingJTBD: "",
  });
  const changed = {
    ...pack,
    selectedSparks: [],
    selectedResearch: [],
    objective: "Later reviewed objective",
  };
  expect(
    prepareWorkspaceDraft(cleared, changed, seedStudioDiscovery(changed)),
  ).toBe(cleared);
  expect(prefillWorkspaceSuggestions(cleared, changed)).toBe(cleared);
  expect(cleared.humanBriefLine).toBe("Kevin's exact line");
  expect(cleared.fieldVersions!.evidenceInsights.map((v) => v.value)).toEqual([
    "",
    "Kevin's insight",
  ]);
  expect(cleared.fieldVersions!.workingJTBD.map((v) => v.value)).toEqual([
    "",
    "Kevin's job",
  ]);
  expect(session.approved).toBeNull();
});
