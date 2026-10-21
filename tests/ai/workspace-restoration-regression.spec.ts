import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyStudioSource,
  emptyStudio,
  readStudio,
  seedStudioDiscovery,
  studioPack,
  studioStorageKey,
} from "../../lib/discovery-studio";
import {
  compactStringify,
  writeDiscoveryDraft,
} from "../../lib/discovery-persistence";
import {
  reviewWorkspaceSupport,
  saveWorkspaceDraft,
  workspaceFieldKeys,
} from "../../lib/workspace-suggestions";
import {
  workspaceStartingPoint,
  isRestoredBriefLineSuggestion,
} from "../../lib/workspace-presentation";

function fixture(file = "movers_source_text.txt") {
  const source = readFileSync(
    path.join(__dirname, "../fixtures/client-input-pack", file),
    "utf8",
  );
  const session = applyStudioSource(emptyStudio(), source);
  const pack = studioPack(session);
  pack.selectedSparks = [
    {
      id: "selected",
      text: "Source-scoped selected Spark",
      title: "Selected Spark",
      idea: "A proposed selected direction, not Kevin's line.",
      version: 1,
      versionId: "spark-v0",
    },
  ];
  return { session, pack, state: seedStudioDiscovery(pack) };
}
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

for (const file of ["movers_source_text.txt", "xfinity_pro_source_text.txt"])
  test(`${file}: a fresh selected Spark is reference-only, never the human line`, () => {
    const { pack, state } = fixture(file);
    expect(state.humanBriefLine).toBe("");
    expect(workspaceStartingPoint(state).candidate).toBe(
      pack.selectedSparks![0].idea,
    );
    expect(state.evidenceInsights?.trim()).toBeTruthy();
    expect(state.workingJTBD?.trim()).toBeTruthy();
    expect(state.workspaceSuggestionContext!.fields.humanBriefLine.kind).toBe(
      "missing",
    );
    expect(state.fieldVersions).toBeUndefined();
    expect(
      state.workspaceSuggestionContext!.fields.workingJTBD.label,
    ).toContain("not original or approved");
    expect(pack.originalJTBD).toBe("");
  });
test("saved legacy Spark text is restored exactly and is not a new-draft initialization", () => {
  const { session, pack, state } = fixture();
  const legacy = {
    ...state,
    humanBriefLine: pack.selectedSparks![0].idea!,
    workspaceSuggestionContext: {
      ...state.workspaceSuggestionContext!,
      originalFields: undefined,
      fields: {
        ...state.workspaceSuggestionContext!.fields,
        humanBriefLine: {
          value: pack.selectedSparks![0].idea!,
          kind: "selected" as const,
          label: "From the top selected Spark · suggestion",
        },
      },
    },
  };
  const storage = memory();
  storage.setItem(studioStorageKey, compactStringify(session));
  writeDiscoveryDraft(storage, pack, legacy);
  const restored = readStudio(storage).discovery;
  expect(restored.humanBriefLine).toBe(legacy.humanBriefLine);
  expect(restored.workspaceSuggestionContext!.fields.humanBriefLine).toEqual(
    legacy.workspaceSuggestionContext.fields.humanBriefLine,
  );
  expect(restored.fieldVersions).toEqual(legacy.fieldVersions);
  expect(restored.workspaceSuggestionContext!.opened).toBe(true);
});
test("an explicit supporting-context review must not clear an autosaved unversioned legacy line", () => {
  const { pack, state } = fixture();
  const legacy = {
    ...state,
    humanBriefLine: pack.selectedSparks![0].idea!,
    workspaceSuggestionContext: {
      ...state.workspaceSuggestionContext!,
      fields: {
        ...state.workspaceSuggestionContext!.fields,
        humanBriefLine: {
          value: pack.selectedSparks![0].idea!,
          kind: "selected" as const,
          label: "From the top selected Spark · suggestion",
        },
      },
    },
  };
  const before = structuredClone(legacy);
  const reviewed = reviewWorkspaceSupport(
    legacy,
    seedStudioDiscovery({ ...pack, selectedSparks: [] }),
  );
  expect(reviewed.humanBriefLine).toBe(before.humanBriefLine);
  expect(reviewed.workspaceSuggestionContext!.fields.humanBriefLine).toEqual(
    before.workspaceSuggestionContext!.fields.humanBriefLine,
  );
  expect(legacy).toEqual(before);
});
test("authored text and intentional empty lines survive supporting-context review without versions", () => {
  const { pack, state } = fixture();
  for (const value of ["Kevin's exact human line — unchanged.", ""]) {
    const human = { ...state, humanBriefLine: value };
    const result = reviewWorkspaceSupport(
      human,
      seedStudioDiscovery({ ...pack, selectedSparks: [] }),
    );
    expect(result.humanBriefLine).toBe(value);
    expect(result.fieldVersions).toBeUndefined();
  }
});
test("autosaved human values restore without field versions; explicit Save Draft adds history separately", () => {
  const { session, pack, state } = fixture();
  const human = {
    ...state,
    humanBriefLine: "Kevin's autosaved human line.",
    notes: "Private thought.",
  };
  const storage = memory();
  storage.setItem(studioStorageKey, compactStringify(session));
  writeDiscoveryDraft(storage, pack, human);
  const restored = readStudio(storage).discovery;
  expect(restored.humanBriefLine).toBe(human.humanBriefLine);
  expect(restored.notes).toBe(human.notes);
  expect(restored.fieldVersions).toBeUndefined();
  const saved = saveWorkspaceDraft(restored);
  expect(saved.fieldVersions!.humanBriefLine[0].value).toBe(
    human.humanBriefLine,
  );
  expect(Object.keys(saved.fieldVersions!)).toHaveLength(
    workspaceFieldKeys.length,
  );
  expect(saved.savedFindingIds).toEqual(restored.savedFindingIds);
});
test("restored-suggestion notice requires actual historical source provenance, not merely a matching Spark", () => {
  const { state, pack } = fixture();
  const candidate = pack.selectedSparks![0].idea!;
  expect(isRestoredBriefLineSuggestion(state, "")).toBe(false);
  // Explicitly adopting the separate modern reference is not legacy restoration.
  expect(
    isRestoredBriefLineSuggestion(
      { ...state, humanBriefLine: candidate },
      candidate,
    ),
  ).toBe(false);
  const legacy = structuredClone(state);
  legacy.workspaceSuggestionContext!.fields.humanBriefLine = {
    value: candidate,
    kind: "selected",
    label: "From the top selected Spark · suggestion",
  };
  expect(isRestoredBriefLineSuggestion(legacy, candidate)).toBe(true);
  expect(isRestoredBriefLineSuggestion(legacy, "Kevin's edited line")).toBe(
    false,
  );
  legacy.workspaceSuggestionContext!.fields.humanBriefLine = {
    value: candidate,
    kind: "supplied",
    label: "Kevin's saved human draft",
  };
  expect(isRestoredBriefLineSuggestion(legacy, candidate)).toBe(false);
});
