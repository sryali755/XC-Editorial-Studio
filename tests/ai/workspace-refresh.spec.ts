import { test, expect } from "@playwright/test";
import { phase2Fixture } from "../fixtures/phase2-roundtable";
import {
  readStudio,
  studioStorageKey,
  emptyStudio,
} from "../../lib/discovery-studio";
import {
  compactStringify,
  discoveryStorageKey,
} from "../../lib/discovery-persistence";
import { saveWorkspaceDraft } from "../../lib/workspace-suggestions";
import { discoveryFindingRef } from "../../lib/discovery";
import { initializeDevelopmentWorkspace } from "../../lib/development-clean-start";

test("refresh restores exact human edits, selections, histories and original approval/brief snapshots", async () => {
  const fixture = phase2Fixture();
  const state = saveWorkspaceDraft({
    ...fixture.state,
    humanBriefLine:
      "My exact human-authored line.\nKeep this second paragraph.",
    workingJTBD: "My manually edited job.",
    evidenceInsights: "",
    notes: "Private notes preserved.",
    savedFindingIds: [
      discoveryFindingRef(fixture.state.runs[0].versions[0].findings[0]),
    ],
  });
  fixture.session.approved = {
    approvalState: "Approved",
    approvedAt: "2026-10-19T12:00:00.000Z",
    approvedBy: "Kevin",
    briefLine: "Previously approved snapshot — not the edited draft.",
    strategyInputPack: fixture.pack,
    source: "Explicit offline fixture approval",
  };
  fixture.session.approvals = [structuredClone(fixture.session.approved)];
  fixture.session.approvalSnapshots = { saved: structuredClone(state) };
  fixture.session.briefs = [
    {
      id: "saved-brief",
      campaign: fixture.pack.campaignName,
      createdAt: "2026-10-19T12:00:00.000Z",
      mock: true,
      sections: [
        { title: "Approved strategy", content: "Exact prior exported content" },
      ],
    },
  ];
  const records = new Map([
    [studioStorageKey, compactStringify(fixture.session)],
    [discoveryStorageKey(fixture.pack), compactStringify(state)],
  ]);
  const before = [...records];
  await initializeDevelopmentWorkspace();
  const restored = readStudio({ getItem: (key) => records.get(key) ?? null });
  expect([...records]).toEqual(before);
  expect(restored.session.preparation.outputs).toEqual(
    fixture.session.preparation.outputs,
  );
  expect(restored.session.selectedRtbVersionId).toBe(
    fixture.session.selectedRtbVersionId,
  );
  expect(restored.session.selectedResearchIds).toEqual(
    fixture.session.selectedResearchIds,
  );
  expect(restored.session.preparation.selectedSparkIds).toEqual(
    fixture.session.preparation.selectedSparkIds,
  );
  expect(restored.session.approved).toEqual(fixture.session.approved);
  expect(restored.session.approvals).toEqual(fixture.session.approvals);
  expect(restored.session.approvalSnapshots).toEqual(
    fixture.session.approvalSnapshots,
  );
  expect(restored.session.briefs).toEqual(fixture.session.briefs);
  for (const key of [
    "humanBriefLine",
    "workingJTBD",
    "evidenceInsights",
    "notes",
    "savedFindingIds",
    "fieldVersions",
    "runs",
  ] as const)
    expect(restored.discovery[key]).toEqual(state[key]);
});

test("interrupted preparation restores as retryable, preserving prior versions rather than pretending generation resumed", () => {
  const fixture = phase2Fixture();
  fixture.session.preparation.outputs.forEach((output) => {
    output.status = "pending";
  });
  const before = structuredClone(fixture.session.preparation.outputs);
  const raw = compactStringify(fixture.session);
  const restored = readStudio({
    getItem: (key) => (key === studioStorageKey ? raw : null),
  });
  for (const output of restored.session.preparation.outputs) {
    expect(output.status).toBe("failed");
    expect(output.error).toContain("interrupted by a page reload");
    expect(output.versions).toEqual(
      before.find((item) => item.agentId === output.agentId)!.versions,
    );
    expect(output.currentVersionId).toBe(
      before.find((item) => item.agentId === output.agentId)!.currentVersionId,
    );
  }
  expect(fixture.session.preparation.outputs).toEqual(before);
});

test("a genuinely empty workspace stays empty and does not acquire a campaign, generated outputs, approval or brief", () => {
  const restored = readStudio({ getItem: () => null });
  expect(restored.session).toEqual(emptyStudio());
  expect(restored.discovery.humanBriefLine ?? "").toBe("");
  expect(restored.discovery.savedFindingIds).toEqual([]);
  expect(
    restored.discovery.runs.every((run) => run.versions.length === 0),
  ).toBe(true);
});
