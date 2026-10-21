import { test, expect } from "@playwright/test";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import { stageCampaignRebuild } from "../../lib/campaign-rebuild";
import {
  campaignStorageKey,
  discoveryStorageKey,
  compactStringify,
  readDiscoveryDraft,
} from "../../lib/discovery-persistence";
import {
  applyStudioSource,
  studioPack,
  seedStudioDiscovery,
} from "../../lib/discovery-studio";
import {
  componentHarness,
  button,
  click,
} from "../helpers/phase1-component-harness";
import type { PreparationAgentId } from "../../lib/types";

test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

test("confirmation cancellation makes zero agent calls and preserves all campaign state", async () => {
  const { session } = phase1Fixture();
  const before = structuredClone(session);
  const app = componentHarness(session, async () => {
    throw Error("No generation authorized");
  });
  app.confirmBuild(false);
  click(button(app.tree, "Build Input Pack"));
  await app.settle();
  expect(app.session).toEqual(before);
});

test("repeated fresh builds reset only the target campaign and namespace all downstream drafts", async () => {
  const movers = phase1Fixture(),
    pro = phase1Fixture("xfinity_pro_source_text.txt");
  const candidate = applyStudioSource(pro.session, movers.source);
  // Seed the target with an old history as well as unrelated campaign state.
  Object.assign(candidate, movers.session, {
    campaignArchive: candidate.campaignArchive,
  });
  candidate.approved = {} as never;
  candidate.approvals = [{} as never];
  candidate.approvalSnapshots = {
    old: seedStudioDiscovery(studioPack(candidate)),
  };
  candidate.briefs = [{ id: "old-test-brief" } as never];
  candidate.briefInputs = { old: {} as never };
  candidate.confirmationFingerprint = "old-test-confirmation";
  candidate.packHistory = [movers.session, pro.session].map((session) => ({
    version: "old",
    pack: studioPack(session),
    createdAt: "offline fixture",
  }));
  const before = structuredClone(candidate),
    calls: string[] = [];
  const generate = async (request: {
    agentId: PreparationAgentId;
    previous: unknown[];
  }) => {
    calls.push(request.agentId);
    expect(request.previous).toEqual([]);
    return {
      ...structuredClone(movers.versions[request.agentId]),
      id: `fresh-${calls.length}-${request.agentId}`,
    };
  };
  const first = await stageCampaignRebuild(candidate, generate, "mock");
  const second = await stageCampaignRebuild(first, generate, "mock");
  expect(calls).toHaveLength(6);
  expect(first.workspaceBuildId).not.toBe(second.workspaceBuildId);
  for (const next of [first, second]) {
    expect(next.approved).toBeNull();
    expect(next.approvals).toEqual([]);
    expect(next.approvalSnapshots).toEqual({});
    expect(next.briefs).toEqual([]);
    expect(next.briefInputs).toEqual({});
    expect(next.confirmationFingerprint).toBeUndefined();
    expect(next.preparation.sourceSnapshot).toBe(
      candidate.preparation.sourceSnapshot,
    );
    expect(
      next.preparation.outputs.every(
        (output) =>
          output.versions.length === 1 && output.versions[0].number === 1,
      ),
    ).toBe(true);
    expect(next.packHistory.map((entry) => entry.pack.campaignName)).toEqual([
      studioPack(pro.session).campaignName,
    ]);
    const proKey = campaignStorageKey(studioPack(pro.session));
    expect(next.campaignArchive![proKey]).toEqual(
      before.campaignArchive![proKey],
    );
    const targetKey = campaignStorageKey(studioPack(next));
    expect(next.campaignArchive![targetKey].approved).toBeNull();
    const oldDraft = {
      ...seedStudioDiscovery(studioPack(candidate)),
      humanBriefLine: "Old human draft",
      notes: "Old private notes",
    };
    const oldRaw = compactStringify(oldDraft);
    expect(
      readDiscoveryDraft(
        {
          getItem: (key) =>
            key === discoveryStorageKey(studioPack(candidate)) ||
            key === "xc-insight-discovery-v1"
              ? oldRaw
              : null,
        },
        studioPack(next),
      ),
    ).toBeUndefined();
    const fresh = seedStudioDiscovery(studioPack(next));
    expect(fresh.humanBriefLine).toBe("");
    expect(fresh.savedFindingIds).toEqual([]);
    expect(fresh.selectedFindingIds).toEqual([]);
    expect(
      fresh.runs.every((run) => !run.versions.length && !run.thread.length),
    ).toBe(true);
    const switched = applyStudioSource(
      applyStudioSource(next, pro.source),
      movers.source,
    );
    expect(switched.workspaceBuildId).toBe(next.workspaceBuildId);
    expect(switched.approved).toBeNull();
    expect(switched.briefs).toEqual([]);
  }
  expect(candidate).toEqual(before);
});

test("failed staging, stale same-campaign responses, and retry cannot mix old and new generations", async () => {
  const fixture = phase1Fixture();
  const before = structuredClone(fixture.session);
  const app = componentHarness(fixture.session, async (request) => {
    const id = request.agentId as PreparationAgentId;
    if (id === "research") throw Error("Controlled offline failure");
    return fixture.versions[id];
  });
  click(button(app.tree, "Build Input Pack"));
  await app.settle();
  expect(app.session).toEqual(before);
  let resolve!: (value: typeof fixture.versions.sparks) => void;
  const gate = new Promise<typeof fixture.versions.sparks>((done) => {
    resolve = done;
  });
  const stale = componentHarness(fixture.session, () => gate);
  click(button(stale.tree, "Regenerate Sparks Agent"));
  const next = {
    ...structuredClone(fixture.session),
    workspaceBuildId: "new-build",
  };
  stale.replace(next);
  resolve(fixture.versions.sparks);
  await stale.settle();
  expect(stale.session).toEqual(next);
  const retry = await stageCampaignRebuild(
    fixture.session,
    async ({ agentId }) => fixture.versions[agentId],
    "mock",
  );
  expect(retry.workspaceBuildId).toBeTruthy();
  expect(retry.preparation.outputs).toHaveLength(3);
});

test("a campaign change during staging discards every late replacement result", async () => {
  const fixture = phase1Fixture(),
    other = phase1Fixture("xfinity_pro_source_text.txt").session;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = componentHarness(fixture.session, async (request) => {
    await gate;
    return fixture.versions[request.agentId as PreparationAgentId];
  });
  click(button(app.tree, "Build Input Pack"));
  app.replace(other);
  release();
  await app.settle();
  expect(app.session).toEqual(other);
});

test("only selected preparation inputs are supplied; changed hypotheses are not silently selected", async () => {
  const fixture = phase1Fixture();
  const pack = studioPack(fixture.session);
  const next = await stageCampaignRebuild(
    fixture.session,
    async (request) => {
      expect(request.selectedContent?.reasonToBelieve?.text).toBe(
        pack.proposedRTB,
      );
      expect(request.selectedContent?.research?.text).toBe(
        pack.selectedResearch!.map((item) => item.text).join("\n\n"),
      );
      expect(request.selectedContent?.selectedSparks).toEqual(
        pack.selectedSparks,
      );
      const version = structuredClone(fixture.versions[request.agentId]);
      version.id = `fresh-selected-${request.agentId}`;
      if (request.agentId === "sparks")
        version.sparks[0].hypothesisToValidate =
          "Validate whether a different audience tension is relevant before using this new hypothesis.";
      return version;
    },
    "mock",
  );
  expect(next.preparation.selectedSparkIds).not.toContain(
    fixture.versions.sparks.sparks[0].id,
  );
  expect(next.selectedRtbVersionId).toBe("fresh-selected-reasonToBelieve");
  expect(
    next.selectedResearchIds?.every((id) =>
      id.startsWith("fresh-selected-research:"),
    ),
  ).toBe(true);
});
