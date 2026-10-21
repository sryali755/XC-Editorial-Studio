import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioPack,
} from "../../lib/discovery-studio";
import {
  saveWorkspaceDraft,
  workspaceFieldKeys,
} from "../../lib/workspace-suggestions";
import {
  applyMissingSuggestions,
  previewMissingSuggestions,
  missingSuggestionPreviewIsCurrent,
} from "../../lib/workspace-missing-suggestions";
import { canvasPrefill } from "../../lib/workspace-canvas-prefill";
import { workspaceCategoryContext } from "../../lib/workspace-presentation";

function fixture(file = "movers_source_text.txt") {
  const pack = studioPack(
    applyStudioSource(
      emptyStudio(),
      readFileSync(
        path.join(__dirname, "../fixtures/client-input-pack", file),
        "utf8",
      ),
    ),
  );
  const state = seedStudioDiscovery(pack);
  state.evidenceInsights = "";
  state.workingJTBD = "";
  state.humanBriefLine = "Kevin's exact saved human strategy.";
  state.notes = "Private, unchanged.";
  return { pack, state: saveWorkspaceDraft(state) };
}
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

test("preview is read-only, offers only empty Insight/JTBD, and explicit selection fills only one", () => {
  const { pack, state } = fixture();
  const before = structuredClone(state),
    source = structuredClone(pack);
  const preview = previewMissingSuggestions(
    state,
    pack,
    seedStudioDiscovery(pack, state),
  );
  expect(preview.fields.map((field) => field.key)).toEqual([
    "evidenceInsights",
    "workingJTBD",
  ]);
  expect(state).toEqual(before);
  expect(applyMissingSuggestions(state, pack, preview, [])).toBe(state);
  const filled = applyMissingSuggestions(state, pack, preview, [
    "evidenceInsights",
  ]);
  expect(filled.evidenceInsights).toContain("working hypothesis");
  expect(filled.workingJTBD).toBe("");
  for (const key of workspaceFieldKeys.filter(
    (key) => key !== "evidenceInsights",
  )) {
    if (key.startsWith("wholeBrief."))
      expect(filled.wholeBrief).toEqual(state.wholeBrief);
    else
      expect(filled[key as keyof typeof state]).toEqual(
        state[key as keyof typeof state],
      );
  }
  expect(filled.fieldVersions).toEqual(state.fieldVersions);
  expect(filled.activeFieldVersionIds).toEqual(state.activeFieldVersionIds);
  expect(filled.workspaceSuggestionContext!.originalFields).toEqual(
    state.workspaceSuggestionContext!.originalFields,
  );
  expect(
    filled.workspaceSuggestionContext!.fields.evidenceInsights.label,
  ).toContain("added by your selection");
  expect(state).toEqual(before);
  expect(pack).toEqual(source);
});

test("intentional blank with saved history requires explicit consent, never disappears from history", () => {
  const { pack, state } = fixture();
  const preview = previewMissingSuggestions(
    state,
    pack,
    seedStudioDiscovery(pack),
  );
  const filled = applyMissingSuggestions(state, pack, preview, ["workingJTBD"]);
  expect(filled.workingJTBD).toMatch(/^When .+, I want .+, so I can .+\.$/);
  expect(filled.fieldVersions!.workingJTBD[0].value).toBe("");
  expect(filled.humanBriefLine).toBe(state.humanBriefLine);
  expect(filled.evidenceInsights).toBe("");
});

for (const change of [
  "edit",
  "history",
  "spark",
  "campaign",
  "finding",
] as const)
  test(`${change}: a changed draft/source invalidates a preview without overwriting anything`, () => {
    const { pack, state } = fixture();
    const preview = previewMissingSuggestions(
      state,
      pack,
      seedStudioDiscovery(pack),
    );
    const newer = structuredClone(state),
      changedPack = structuredClone(pack);
    if (change === "edit")
      newer.evidenceInsights = "Kevin typed this after preview.";
    if (change === "history")
      newer.fieldVersions!.workingJTBD[0].id = "different-restored-version";
    if (change === "spark")
      changedPack.selectedSparks = [
        { id: "new", text: "New selection", version: 2, versionId: "new" },
      ];
    if (change === "campaign")
      Object.assign(changedPack, fixture("xfinity_pro_source_text.txt").pack);
    if (change === "finding")
      newer.savedFindingIds = ["a newly saved finding reference"];
    const snapshot = structuredClone(newer);
    expect(missingSuggestionPreviewIsCurrent(preview, newer, changedPack)).toBe(
      false,
    );
    expect(
      applyMissingSuggestions(newer, changedPack, preview, [
        "evidenceInsights",
        "workingJTBD",
      ]),
    ).toBe(newer);
    expect(newer).toEqual(snapshot);
  });

test("legacy draft without provenance gains only chosen origins and preserves human text and every version", () => {
  const { pack, state } = fixture();
  state.workspaceSuggestionContext = undefined;
  const before = structuredClone(state);
  const preview = previewMissingSuggestions(
    state,
    pack,
    seedStudioDiscovery(pack),
  );
  const filled = applyMissingSuggestions(state, pack, preview, ["workingJTBD"]);
  expect(filled.workingJTBD).toBeTruthy();
  expect(filled.workspaceSuggestionContext!.originalFields).toEqual({});
  expect(filled.workspaceSuggestionContext!.fields.humanBriefLine.value).toBe(
    before.humanBriefLine,
  );
  expect(
    filled.workspaceSuggestionContext!.fields.humanBriefLine.label,
  ).toContain("original provenance not recorded");
  expect(filled.fieldVersions).toEqual(before.fieldVersions);
  expect(filled.humanBriefLine).toBe(before.humanBriefLine);
  expect(filled.notes).toBe(before.notes);
});

test("insufficient context cannot be filled with placeholders or invented research", () => {
  const pack = studioPack(
    applyStudioSource(
      emptyStudio(),
      "Campaign: Sparse campaign\nBackground: No supplied audience or objective.",
    ),
  );
  const state = seedStudioDiscovery(pack);
  const preview = previewMissingSuggestions(
    state,
    pack,
    seedStudioDiscovery(pack),
  );
  expect(preview.fields).toHaveLength(2);
  expect(
    preview.fields.every(
      (field) =>
        field.suggestion.kind === "missing" && field.suggestion.value === "",
    ),
  ).toBe(true);
  expect(
    applyMissingSuggestions(state, pack, preview, [
      "workingJTBD",
      "evidenceInsights",
    ]),
  ).toBe(state);
  expect(state.humanBriefLine).toBe("");
});

test("audience/objective duplicates are not insights, and the fallback states a tension to validate", () => {
  const { pack } = fixture();
  pack.selectedResearch = [
    {
      id: "duplicate",
      version: 1,
      versionId: "v0",
      source: "IMC brief",
      category: "AUDIENCE CONTEXT",
      status: "ai_synthesis",
      text: pack.audience,
    },
  ];
  const state = seedStudioDiscovery(pack);
  expect(state.evidenceInsights).not.toBe(pack.audience);
  expect(state.evidenceInsights).not.toBe(pack.objective);
  expect(state.evidenceInsights).toContain("yet arranging their connection");
  expect(state.evidenceInsights).toMatch(/^A working hypothesis/);
  expect(state.workspaceSuggestionContext!.fields.evidenceInsights.kind).toBe(
    "interpretation",
  );
  expect(
    state.workspaceSuggestionContext!.fields.evidenceInsights.label,
  ).toContain("Validate with research");
  expect(state.humanBriefLine).toBe("");
});

test("first-person JTBD normalization removes You can without changing original source", () => {
  const { pack } = fixture();
  const before = structuredClone(pack);
  const canvas = canvasPrefill(pack, {
    insight: "",
    originalJob: "",
    message:
      "You can transfer your services simply and stay connected to what you love.",
  });
  expect(canvas.job.value).toBe(
    "When I am moving, I want to transfer my services simply, so I can stay connected to what I love.",
  );
  expect(canvas.job.label).toContain(
    "Proposed V0 JTBD · not original or approved",
  );
  expect(pack).toEqual(before);
  const pro = fixture("xfinity_pro_source_text.txt").pack;
  const proposed = seedStudioDiscovery(pro).workingJTBD;
  expect(proposed).not.toMatch(/\bour\b/i);
  expect(proposed).toContain("the available features and equipment");
});

test("category truth preserves selected supplied context, but unavailable sources stay validation gaps", () => {
  const { pack } = fixture();
  expect(workspaceCategoryContext(pack)).toBe("");
  pack.selectedResearch = [
    {
      id: "category",
      version: 1,
      versionId: "v0",
      source: "Manually supplied category note",
      category: "MARKET / CATEGORY CONTEXT",
      status: "supplied",
      text: "The supplied category note compares service-transfer steps; no independent verification is claimed.",
    },
  ];
  const before = structuredClone(pack);
  expect(workspaceCategoryContext(pack)).toBe(pack.selectedResearch[0].text);
  expect(pack).toEqual(before);
  pack.selectedResearch[0].text =
    "No connected market or category results were retrieved. Not supplied.";
  expect(workspaceCategoryContext(pack)).toBe("");
});
