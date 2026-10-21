import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { discoveryFoundation } from "../../lib/discovery-context";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { discoveryFindingRef, inputPackVersion } from "../../lib/discovery";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import {
  compactStringify,
  writeDiscoveryDraft,
} from "../../lib/discovery-persistence";
import {
  archiveOutdatedDiscoveryResponse,
  completeDiscoveryRequest,
} from "../../lib/discovery-state";
import {
  applyStudioSource,
  emptyStudio,
  prefillWorkspaceSuggestions,
  readStudio,
  seedStudioDiscovery,
  studioPack,
  studioStorageKey,
  studioStrategySession,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import type { DiscoveryRunVersion, DiscoveryState } from "../../lib/types";

const campaigns = detectIMCCampaignScopes(
  readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  ),
);

function campaignState(index: number) {
  const campaign = campaigns[index];
  const session = applyStudioSource(emptyStudio(), campaign.sourceText);
  const pack = studioPack(session);
  const state = seedStudioDiscovery(pack);
  state.question = `What needs evidence in ${campaign.title}?`;
  const output = mockDiscovery({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question: state.question,
      action: "initial",
      previousFindings: [],
    },
  });
  const version: DiscoveryRunVersion = {
    id: `${campaign.id}-run-1`,
    number: 1,
    question: state.question,
    investigationType: "problem",
    action: "initial",
    guidance: "",
    createdAt: "2026-10-17T12:00:00.000Z",
    inputPackVersion: inputPackVersion(pack),
    inputPackSnapshot: structuredClone(pack),
    sourceCoverage: [],
    provider: "mock",
    findings: output.findings.map((finding, i) => ({
      ...finding,
      id: `${campaign.id}-finding-${i}`,
      lensId: "consumer",
      inputPackVersion: inputPackVersion(pack),
      runVersion: 1,
      researchRunId: `${campaign.id}-run-1`,
      provider: "mock",
    })),
  };
  state.runs[0] = {
    ...state.runs[0],
    status: "complete",
    currentVersionId: version.id,
    versions: [version],
  };
  return { campaign, session, pack, state, version };
}

for (const index of [0, 1]) {
  test(`${campaigns[index].title}: starter fields remain editable, removable, unapproved and source-bound`, () => {
    const { session, pack, state } = campaignState(index);
    expect(state.contextVersion).toBe(inputPackVersion(pack));
    // Context is not stored as a box; the brief uses the campaign name.
    expect(state.wholeBrief?.context).toBeUndefined();
    expect(pack.campaignName).toBe(campaigns[index].title);
    expect(state.workingRTB).toBe(pack.reasonToBelieve);
    expect(pack.reasonToBelieve).toBe(
      pack.parsedIMC!.fields.reason_to_believe.sourceValue,
    );
    expect(pack.rtbApprovalStatus).toBe("unknown");
    expect(session.approved).toBeNull();
    expect(state.savedFindingIds).toEqual([]);
    const edited: DiscoveryState = {
      ...state,
      humanBriefLine: "Kevin's line",
      problemStatement: "Kevin's problem",
      workingRTB: "Kevin's unapproved adaptation",
      workingJTBD: "",
      hypothesis: "",
      openQuestions: "What evidence is still missing?",
      wholeBrief: { ...state.wholeBrief, objective: "" },
    };
    const refreshed = prefillWorkspaceSuggestions(edited, {
      ...pack,
      objective: "Changed source review context",
    });
    expect(refreshed).toBe(edited);
    expect(refreshed.workingJTBD).toBe("");
    expect(refreshed.wholeBrief?.objective).toBe("");
    expect(pack.reasonToBelieve).not.toBe(edited.workingRTB);
    expect(studioPack(session).reasonToBelieve).toBe(pack.reasonToBelieve);
  });

  test(`${campaigns[index].title}: storage and approval preserve human history, support provenance and exact source`, () => {
    const { session, pack, state, version } = campaignState(index);
    const ref = discoveryFindingRef(version.findings[0]);
    const edited: DiscoveryState = {
      ...state,
      savedFindingIds: [ref],
      selectedFindingIds: [],
      humanBriefLine: "Kevin's reviewed strategy",
      workingRTB: "Human proposed proof interpretation",
      fieldVersions: {
        humanBriefLine: [
          {
            id: "v2",
            number: 2,
            value: "Kevin's reviewed strategy",
            savedAt: "2026-10-17T12:01:00Z",
          },
          {
            id: "v1",
            number: 1,
            value: "Kevin's earlier draft",
            savedAt: "2026-10-17T12:00:00Z",
          },
        ],
      },
      activeFieldVersionIds: { humanBriefLine: "v2" },
    };
    const before = structuredClone(edited);
    const handed = approveDiscoveryCanvas(
      studioStrategySession(session, edited),
      pack,
      edited,
      edited.humanBriefLine!,
      "2026-10-17T12:02:00Z",
    );
    expect(edited).toEqual(before);
    expect(handed.approved?.approvalState).toBe("Approved");
    expect(handed.approved?.discoveryCanvas?.findingReferences).toEqual([ref]);
    expect(handed.approved?.strategyInputPack.reasonToBelieve).toBe(
      pack.reasonToBelieve,
    );
    expect(handed.approved?.strategyInputPack.rtbApprovalStatus).toBe(
      "unknown",
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const approved = handed.approved!;
    storage.setItem(
      studioStorageKey,
      compactStringify({
        ...session,
        screen: "strategy",
        approved,
        approvals: [approved],
        approvalSnapshots: { [approved.approvedAt]: structuredClone(edited) },
      }),
    );
    writeDiscoveryDraft(storage, pack, edited);
    const restored = readStudio(storage);
    expect(restored.discovery).toEqual(edited);
    expect(restored.session.approvalSnapshots[approved.approvedAt]).toEqual(
      edited,
    );
    expect(restored.discovery.runs[0].versions[0].inputPackSnapshot).toEqual(
      pack,
    );
    expect(restored.discovery.runs[0].versions[0].findings[0]).toEqual(
      version.findings[0],
    );
    edited.humanBriefLine = "Later draft";
    edited.savedFindingIds = [];
    edited.fieldVersions!.humanBriefLine[0].value = "Later changed history";
    expect(handed.discovery!.humanBriefLine).toBe("Kevin's reviewed strategy");
    expect(handed.discovery!.fieldVersions!.humanBriefLine[0].value).toBe(
      "Kevin's reviewed strategy",
    );
    expect(handed.approved!.discoveryCanvas!.briefLine).toBe(
      "Kevin's reviewed strategy",
    );
    expect(handed.brief).toBeNull();
  });

  test(`${campaigns[index].title}: completed and stale Discovery updates retain the latest human canvas`, () => {
    const { state, pack, version } = campaignState(index);
    const human = {
      ...state,
      humanBriefLine: "Newer human line",
      problemStatement: "Newer human problem",
      workingRTB: "Newer proposed adaptation",
      openQuestions: "Still unresolved",
      fieldVersions: {
        problemStatement: [
          {
            id: "human-v1",
            number: 1,
            value: "Earlier human problem",
            savedAt: "2026-10-17T12:00:00Z",
          },
        ],
      },
    };
    const request = {
      lensId: "consumer" as const,
      action: "explore_deeper" as const,
      guidance: "Why?",
      question: state.question,
      investigationType: "problem" as const,
      inputPackVersion: inputPackVersion(pack),
      turnId: "pending-turn",
    };
    for (const updated of [
      completeDiscoveryRequest(human, request, {
        ...version,
        id: "new-run",
        number: 2,
      }),
      archiveOutdatedDiscoveryResponse(human, request, {
        ...version,
        id: "old-run",
        number: 2,
      }),
    ]) {
      expect(updated.humanBriefLine).toBe(human.humanBriefLine);
      expect(updated.problemStatement).toBe(human.problemStatement);
      expect(updated.workingRTB).toBe(human.workingRTB);
      expect(updated.openQuestions).toBe(human.openQuestions);
      expect(updated.fieldVersions).toEqual(human.fieldVersions);
      expect(updated.savedFindingIds).toEqual(human.savedFindingIds);
    }
  });
}

test("approval rejects an empty human brief line without mutating campaign state", () => {
  const { session, pack, state } = campaignState(0);
  const before = structuredClone(state);
  expect(() =>
    approveDiscoveryCanvas(
      studioStrategySession(session, state),
      pack,
      state,
      "  ",
    ),
  ).toThrow("Write the brief line");
  expect(state).toEqual(before);
  expect(session.approved).toBeNull();
});
