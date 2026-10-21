import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  discoveryDisplayStatus,
  studioModeDisclosure,
} from "../../lib/discovery-display";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioPack,
  prefillWorkspaceSuggestions,
} from "../../lib/discovery-studio";
import {
  workspaceStartingPoint,
  workspaceHistoryLabels,
  workspaceSourceVersion,
} from "../../lib/workspace-presentation";
import {
  saveWorkspaceDraft,
  workspaceFieldKeys,
  consolidateWorkspaceFields,
} from "../../lib/workspace-suggestions";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";

const scopes = detectIMCCampaignScopes(
  readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  ),
);
for (const [input, label] of [
  [
    { working: false, hasVersion: false, hasHistory: false, stale: false },
    "Awaiting Exploration",
  ],
  [
    {
      working: true,
      status: "failed",
      hasVersion: true,
      hasHistory: true,
      stale: true,
    },
    "Exploring",
  ],
  [
    {
      working: false,
      status: "failed",
      hasVersion: true,
      hasHistory: true,
      stale: false,
    },
    "Needs Attention",
  ],
  [
    {
      working: false,
      status: "cancelled",
      hasVersion: true,
      hasHistory: true,
      stale: false,
    },
    "Exploration Paused",
  ],
  [
    { working: false, hasVersion: true, hasHistory: true, stale: true },
    "Refresh Required",
  ],
  [
    { working: false, hasVersion: true, hasHistory: true, stale: false },
    "Insights Ready",
  ],
] as const)
  test(`professional display status: ${label}`, () => {
    const original = structuredClone(input);
    expect(discoveryDisplayStatus(input).label).toBe(label);
    expect(input).toEqual(original);
    if (label === "Awaiting Exploration")
      expect(discoveryDisplayStatus(input).tone).toBe("neutral");
  });

test("a persisted processing state cannot be mislabeled as awaiting exploration", () => {
  expect(
    discoveryDisplayStatus({
      working: false,
      status: "researching",
      stale: false,
      hasVersion: false,
      hasHistory: false,
    }).label,
  ).toBe("Exploring");
});

test("live cost disclosure remains explicit without model/provider/runtime details", () => {
  const live = studioModeDisclosure("live"),
    demo = studioModeDisclosure("mock");
  expect(live.label).toBe("Live AI");
  expect(live.description).toContain("paid AI requests");
  expect(live.description).toContain("retries may add requests");
  expect(live.description).not.toMatch(/gpt-|OpenAI|token|AI_MODE/);
  expect(demo.label).toBe("Demo Mode");
  expect(demo.description).toContain("simulated");
});

for (const scope of scopes)
  test(`${scope.title}: AI starting point never becomes a human line automatically`, () => {
    const pack = studioPack(applyStudioSource(emptyStudio(), scope.sourceText));
    pack.selectedSparks = [
      {
        id: "selected",
        title: "Selected campaign angle",
        text: "Explore only this selected angle.",
        idea: "Explore only this selected angle.",
        version: 2,
        versionId: "spark-v2",
        rationale: "A proposed angle, not proof.",
      },
    ];
    const state = seedStudioDiscovery(pack);
    expect(state.humanBriefLine).toBe("");
    const reference = workspaceStartingPoint(state);
    expect(reference.candidate).toBe(pack.selectedSparks[0].idea);
    expect(reference.chips).toContain("Selected campaign angle");
    expect(workspaceSourceVersion(pack.selectedSparks[0].version)).toBe("V1");
    expect(workspaceSourceVersion(1)).toBe("V0");
    expect(workspaceSourceVersion()).toBe("Version not recorded");
    expect(state.workingAudience).toBe(pack.audience.trim());
    const changedPack = {
      ...pack,
      selectedSparks: [
        {
          ...pack.selectedSparks[0],
          title: "Unselected later angle",
          idea: "A different angle.",
        },
      ],
    };
    expect(workspaceStartingPoint(state)).toEqual(reference);
    const saved = saveWorkspaceDraft({
      ...state,
      humanBriefLine: "Kevin's exact strategy.",
    });
    const reopened = prefillWorkspaceSuggestions(saved, changedPack);
    expect(reopened.humanBriefLine).toBe("Kevin's exact strategy.");
    expect(reopened.fieldVersions).toEqual(saved.fieldVersions);
    expect(workspaceStartingPoint(reopened)).toEqual(reference);
  });

test("all 19 historical field contracts and values survive consolidation and draft saving", () => {
  expect(workspaceFieldKeys).toHaveLength(13);
  expect(Object.keys(workspaceHistoryLabels)).toHaveLength(19);
  const state = seedStudioDiscovery(
    studioPack(applyStudioSource(emptyStudio(), scopes[0].sourceText)),
  );
  state.fieldVersions = Object.fromEntries(
    Object.keys(workspaceHistoryLabels).map((key, index) => [
      key,
      [
        {
          id: `v-${index}`,
          number: 1,
          value: `Exact preserved value ${index}`,
          savedAt: "2026-10-18T12:00:00.000Z",
        },
      ],
    ]),
  );
  state.humanTension = "Kevin's earlier tension";
  state.hypothesis = "Kevin's earlier hypothesis";
  const original = structuredClone(state.fieldVersions);
  const merged = consolidateWorkspaceFields(state);
  expect(merged.evidenceInsights).toContain("Kevin's earlier tension");
  expect(merged.strategicDirection).toContain("Kevin's earlier hypothesis");
  const saved = saveWorkspaceDraft(merged);
  for (const [key, values] of Object.entries(original))
    expect(saved.fieldVersions![key]).toEqual(expect.arrayContaining(values));
});
