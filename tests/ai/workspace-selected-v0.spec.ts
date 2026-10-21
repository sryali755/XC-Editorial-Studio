import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import {
  consolidateWorkspaceFields,
  prepareWorkspaceDraft,
  reviewWorkspaceSupport,
  saveWorkspaceDraft,
  workspaceContextChanges,
  workspaceFieldKeys,
  workspaceFieldValue,
} from "../../lib/workspace-suggestions";

const campaigns = detectIMCCampaignScopes(
  readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  ),
);
function fixture(index: number) {
  const session = applyStudioSource(emptyStudio(), campaigns[index].sourceText),
    pack = studioPack(session);
  // Deterministic local selection fixtures. These are not retrieved research.
  pack.proposedRTB = `Selected ${campaigns[index].title} framing — proposed only.`;
  pack.selectedSparks = [0, 1].map((i) => ({
    id: `spark-${index}-${i}`,
    version: 1,
    versionId: "v1",
    text: `Selected territory ${index}/${i}`,
    title: `Selected territory ${index}/${i}`,
    idea: `Explore supplied audience context ${index}/${i}.`,
    hypothesis: `Validate the proposed response ${index}/${i}.`,
  }));
  // Categories are the research section titles the app produces. A point
  // that only restates the campaign name must never become the Insight.
  pack.selectedResearch = [
    {
      id: `research-name-${index}`,
      version: 1,
      versionId: "r1",
      category: "CAMPAIGN NAME",
      source: "IMC brief",
      status: "ai_synthesis",
      text: `Restated campaign name ${index}`,
    },
    {
      id: `research-${index}`,
      version: 1,
      versionId: "r1",
      category: "AUDIENCE CONTEXT",
      source: "IMC brief",
      status: "ai_synthesis",
      text: `Selected campaign audience analysis ${index} — unverified.`,
    },
  ];
  pack.sparks = "UNSELECTED-CONTENT — must not shape Suggested V0";
  pack.research = "UNSELECTED-CONTENT — must not shape Suggested V0";
  return { pack, session };
}
for (const index of [0, 1]) {
  test(`${campaigns[index].title}: explicit brief inclusion updates only unedited unsaved proposals and preserves original V0`, () => {
    const { pack } = fixture(index),
      state = seedStudioDiscovery(pack);
    const scoped = {
      ...pack,
      selectedSparks: pack.selectedSparks!.slice(0, 1),
      selectedResearch: [],
      proposedRTB: "",
    };
    const human = {
      ...state,
      humanBriefLine: "Kevin's exact own line",
      workingJTBD: "",
    };
    const reviewed = reviewWorkspaceSupport(human, seedStudioDiscovery(scoped));
    expect(reviewed.humanBriefLine).toBe(human.humanBriefLine);
    expect(reviewed.workingJTBD).toBe("");
    // Excluding the XC framing returns untouched Proof / RTB to the original.
    expect(reviewed.workingRTB).toBe(pack.reasonToBelieve.trim());
    expect(reviewed.strategicDirection).not.toContain(
      pack.selectedSparks![1].title!,
    );
    expect(reviewed.evidenceInsights).not.toContain(
      pack.selectedResearch![1].text,
    );
    expect(reviewed.workspaceSuggestionContext?.originalFields).toEqual(
      state.workspaceSuggestionContext!.originalFields ??
        state.workspaceSuggestionContext!.fields,
    );
    expect(reviewed.fieldVersions).toEqual(human.fieldVersions);
    const saved = saveWorkspaceDraft(state);
    expect(reviewWorkspaceSupport(saved, seedStudioDiscovery(scoped))).toBe(
      saved,
    );
  });
  test(`${campaigns[index].title}: first opening prefills the 13 Working Space fields from current selected context only`, () => {
    const { pack, session } = fixture(index);
    const oldPack = {
      ...pack,
      selectedSparks: [],
      selectedResearch: [],
      proposedRTB: "",
    };
    const initial = seedStudioDiscovery(oldPack);
    const state = prepareWorkspaceDraft(
      initial,
      pack,
      seedStudioDiscovery(pack),
    );
    expect(workspaceFieldKeys).toHaveLength(13);
    const fields = state.workspaceSuggestionContext!.fields;
    expect(Object.keys(fields)).toEqual([...workspaceFieldKeys]);
    expect(state.workspaceSuggestionContext?.opened).toBe(true);
    // The selected XC framing is an RTB adaptation: it fills Proof / RTB.
    expect(state.workingRTB).toBe(pack.proposedRTB);
    expect(fields.workingRTB.label).toContain("not GTM-approved");
    expect(state.strategicDirection).not.toContain(pack.proposedRTB!);
    for (const spark of pack.selectedSparks!) {
      expect(state.strategicDirection).toContain(spark.idea!);
      expect(state.strategicDirection).toContain(spark.hypothesis!);
    }
    expect(state.humanBriefLine).toBe("");
    expect(
      state.workspaceSuggestionContext!.originalFields!.humanBriefLine.value,
    ).toBe(pack.selectedSparks![0].idea);
    expect(state.evidenceInsights).toBe(pack.selectedResearch![1].text);
    expect(fields.evidenceInsights).toMatchObject({ kind: "selected" });
    expect(fields.evidenceInsights.label).toContain("not validated");
    expect(state.problemStatement).toBe(pack.objective.trim());
    expect(state.workingAudience).toBe(pack.audience.trim());
    expect(state.workingJTBD).toMatch(/^When .+, I want .+, so I can .+\.$/);
    expect(fields.workingJTBD.kind).toBe("interpretation");
    expect(fields.workingJTBD.label).toContain("not original or approved");
    // Values are plain source text; provenance lives only in the label, and
    // a missing source leaves an empty box rather than stored filler.
    for (const key of workspaceFieldKeys) {
      const value = workspaceFieldValue(state, key);
      expect(value).not.toMatch(
        /Suggested interpretation|Explore the barrier|not supplied in the Input Pack|Proposed interpretation to refine|Suggested direction to refine/,
      );
      if (!value.trim()) expect(fields[key].kind).toBe("missing");
    }
    expect(state.humanTension ?? "").toBe("");
    expect(state.hypothesis ?? "").toBe("");
    expect(Object.keys(state.wholeBrief ?? {}).sort()).toEqual([
      "deliverables",
      "mandatories",
      "timelines",
    ]);
    expect(pack.rtbApprovalStatus).toBe("unknown");
    expect(session.approved).toBeNull();
    expect(state.fieldVersions).toBeUndefined();
    expect(JSON.stringify(state.workspaceSuggestionContext)).not.toContain(
      "UNSELECTED-CONTENT",
    );
  });
  test(`${campaigns[index].title}: saved and cleared human fields survive reopening, selection changes and finding saves`, () => {
    const { pack } = fixture(index);
    const seeded = seedStudioDiscovery(pack),
      opened = prepareWorkspaceDraft(seeded, pack, seeded);
    const human = saveWorkspaceDraft({
      ...opened,
      humanBriefLine: "Kevin's exact line",
      problemStatement: "Kevin's problem",
      evidenceInsights: "",
      strategicDirection: "Kevin's direction",
      wholeBrief: { ...opened.wholeBrief, timelines: "" },
    });
    const changed = {
      ...pack,
      proposedRTB: "Another selected proposal",
      selectedSparks: pack.selectedSparks!.slice(1),
      selectedResearch: [],
    };
    const reopened = prepareWorkspaceDraft(
      human,
      changed,
      seedStudioDiscovery(changed),
    );
    expect(reopened).toBe(human);
    expect(reopened.evidenceInsights).toBe("");
    expect(reopened.wholeBrief?.timelines).toBe("");
    expect(workspaceContextChanges(reopened, changed)).toEqual([
      "Selected XC framing changed.",
      "Selected data points or their versions changed.",
      "Selected Sparks or their versions changed.",
    ]);
    expect(
      prepareWorkspaceDraft(
        { ...human, savedFindingIds: ["new-support"] },
        pack,
        seedStudioDiscovery(pack),
      ).humanBriefLine,
    ).toBe("Kevin's exact line");
    const twice = saveWorkspaceDraft(human);
    expect(twice).toBe(human);
    expect(Object.values(human.fieldVersions!)).toHaveLength(13);
    expect(
      Object.values(human.fieldVersions!).every((x) => x.length === 1),
    ).toBe(true);
    const version2 = saveWorkspaceDraft({
      ...human,
      evidenceInsights: "A human interpretation",
    });
    expect(
      version2.fieldVersions!.evidenceInsights.map((x) => x.value),
    ).toEqual(["A human interpretation", ""]);
    for (const key of workspaceFieldKeys)
      expect(workspaceFieldValue(version2, key)).toBe(
        workspaceFieldValue(
          key === "evidenceInsights"
            ? { ...human, evidenceInsights: "A human interpretation" }
            : human,
          key,
        ),
      );
  });
  test(`${campaigns[index].title}: early human edits and legacy drafts are never reinterpreted as untouched suggestions`, () => {
    const { pack } = fixture(index),
      seeded = seedStudioDiscovery(pack);
    const edited = {
      ...seeded,
      workingJTBD: "",
      humanBriefLine: "Early human edit",
    };
    const current = prepareWorkspaceDraft(
      edited,
      pack,
      seedStudioDiscovery(pack),
    );
    expect(current.workingJTBD).toBe("");
    expect(current.humanBriefLine).toBe("Early human edit");
    const legacy = { ...edited, workspaceSuggestionContext: undefined };
    expect(prepareWorkspaceDraft(legacy, pack, seeded)).toBe(legacy);
  });
}
test("campaign starter snapshots are isolated and never import the other campaign's selections", () => {
  const movers = seedStudioDiscovery(fixture(0).pack),
    pro = seedStudioDiscovery(fixture(1).pack);
  expect(JSON.stringify(movers)).not.toContain("Selected territory 1/");
  expect(JSON.stringify(pro)).not.toContain("Selected territory 0/");
  expect(movers.workspaceSuggestionContext?.packVersion).not.toBe(
    pro.workspaceSuggestionContext?.packVersion,
  );
});
test("an explicitly supplied structured JTBD stays exact even when a raw-text heading heuristic cannot find it", () => {
  const { pack } = fixture(0);
  pack.originalJTBD = "Exact supplied structured job — not an XC adaptation.";
  const state = seedStudioDiscovery(pack);
  expect(state.workingJTBD).toBe(pack.originalJTBD);
  expect(state.workspaceSuggestionContext!.fields.workingJTBD.kind).toBe(
    "supplied",
  );
});
test("earlier 19-field drafts merge Kevin's text into the box that replaced it", () => {
  const { pack } = fixture(0);
  const seeded = seedStudioDiscovery(pack);
  const legacy = {
    ...seeded,
    evidenceInsights: "Kevin's insight.",
    strategicDirection: "Kevin's direction.",
    humanTension: "Kevin's tension.",
    hypothesis: "Kevin's hypothesis.",
    executionConsiderations: "",
    wholeBrief: {
      ...seeded.wholeBrief,
      audience: "Kevin's whole-brief audience.",
      thoughtStarters: "Kevin's thought-starter.",
      context: "",
      objective: "",
    },
    workspaceSuggestionContext: {
      ...seeded.workspaceSuggestionContext!,
      fields: {
        ...seeded.workspaceSuggestionContext!.fields,
        // An untouched old suggestion is superseded by the new prefill.
        "wholeBrief.audience": {
          value: "Kevin's whole-brief audience.",
          kind: "supplied" as const,
          label: "Supplied IMC campaign context",
        },
      },
    },
  };
  const merged = consolidateWorkspaceFields(legacy);
  expect(merged.evidenceInsights).toBe(
    "Kevin's insight.\n\nHuman tension: Kevin's tension.",
  );
  expect(merged.strategicDirection).toBe(
    "Kevin's direction.\n\nWorking hypothesis: Kevin's hypothesis.",
  );
  expect(merged.executionConsiderations).toBe(
    "Thought-starters: Kevin's thought-starter.",
  );
  expect(merged.workingAudience).toBe(seeded.workingAudience);
  expect(merged.humanTension).toBeUndefined();
  expect(merged.hypothesis).toBeUndefined();
  // Once merged, nothing remains in the retired fields to resurface.
  expect(Object.keys(merged.wholeBrief ?? {}).sort()).toEqual([
    "deliverables",
    "mandatories",
    "timelines",
  ]);
  // Idempotent: a consolidated or fresh state is returned unchanged.
  expect(consolidateWorkspaceFields(merged)).toBe(merged);
  expect(consolidateWorkspaceFields(seeded)).toBe(seeded);
});
