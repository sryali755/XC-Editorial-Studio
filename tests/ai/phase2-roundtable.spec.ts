import { test, expect } from "@playwright/test";
import {
  phase2Fixture,
  phase2Turn,
  phase2Version,
} from "../fixtures/phase2-roundtable";
import {
  archiveOutdatedDiscoveryResponse,
  beginDiscoveryRequest,
  completeDiscoveryRequest,
  dismissOutdatedDiscoveryRequest,
  failDiscoveryRequest,
  recoverDiscoveryState,
} from "../../lib/discovery-state";
import {
  campaignGenerations,
  conversationHistory,
  matchesInvestigation,
} from "../../lib/roundtable-history";
import {
  discoveryFindingRef,
  knownDiscoveryFindings,
} from "../../lib/discovery";
import {
  compactParse,
  compactStringify,
  readDiscoveryDraft,
  writeDiscoveryDraft,
  discoveryStorageKey,
} from "../../lib/discovery-persistence";

test("A/J: new campaigns and investigation changes never reuse unrelated current findings", () => {
  const movers = phase2Fixture(),
    pro = phase2Fixture("xfinity_pro_source_text.txt", false);
  expect(pro.state.runs.every((run) => !run.versions.length)).toBe(true);
  expect(campaignGenerations(movers.state.runs[0], pro.pack)).toEqual([]);
  expect(
    matchesInvestigation(
      movers.state.runs[0].versions[0],
      movers.pack,
      "A different focus",
      "problem",
    ),
  ).toBe(false);
  expect(discoveryStorageKey(movers.pack)).not.toBe(
    discoveryStorageKey(pro.pack),
  );
});
test("B/C/D/H: individual regeneration retains five versions and immutable saved V2 finding 2", () => {
  const { state, pack, question } = phase2Fixture();
  const saved = state.runs[0].versions.find((v) => v.number === 3)!.findings[1]; // displayed V2
  expect(saved).toBeTruthy();
  const ref = discoveryFindingRef(saved),
    original = structuredClone(saved),
    others = structuredClone(state.runs.slice(1));
  state.savedFindingIds = [ref];
  const request = phase2Turn(pack, question, 6, "generation");
  const pending = beginDiscoveryRequest(
    state,
    request,
    request.inputPackVersion!,
  );
  expect(
    pending.runs
      .filter((run) => run.status === "researching")
      .map((run) => run.lensId),
  ).toEqual(["consumer"]);
  const next = completeDiscoveryRequest(
    pending,
    request,
    phase2Version(pack, "consumer", 6, question),
  );
  expect(next.runs[0].versions).toHaveLength(6);
  expect(next.runs[0].thread).toEqual([]);
  expect(next.runs.slice(1)).toEqual(others);
  expect(campaignGenerations(next.runs[0], pack).map((v) => v.number)).toEqual([
    6, 5, 4, 3, 2, 1,
  ]);
  expect(knownDiscoveryFindings(next).get(ref)).toEqual(original);
  expect(next.savedFindingIds).toEqual([ref]);
});
test("E/F: three paired conversations are newest first without structured generation promotion", () => {
  let { state } = phase2Fixture();
  const { pack, question } = phase2Fixture();
  const versions = structuredClone(state.runs[0].versions),
    current = state.runs[0].currentVersionId;
  for (let n = 1; n <= 3; n++) {
    const request = phase2Turn(pack, question, n);
    state = beginDiscoveryRequest(state, request, request.inputPackVersion!);
    state = completeDiscoveryRequest(
      state,
      request,
      phase2Version(pack, "consumer", 6, question),
    );
  }
  const history = conversationHistory(state, "consumer", pack);
  expect(history.map((turn) => turn.number)).toEqual([3, 2, 1]);
  for (const turn of history) {
    expect(turn.question?.turnId).toBe(turn.answer?.turnId);
    expect(turn.question?.researchRunId).toBe("consumer-generation-5");
    expect(turn.answer?.responseVersionId).toBe("consumer-generation-6");
    expect(turn.answer?.text).toContain("No external research retrieved");
  }
  expect(state.runs[0].versions).toEqual(versions);
  expect(state.runs[0].currentVersionId).toBe(current);
  expect(conversationHistory(state, "culture", pack)).toEqual([]);
});
test("E/J: pairing isolates finding scope, wrong campaigns and lenses; legacy messages remain readable", () => {
  let { state } = phase2Fixture();
  const { pack, question } = phase2Fixture();
  const selected = state.runs[0].versions[2].findings[1];
  const request = {
    ...phase2Turn(pack, question, 1),
    selectedFinding: selected,
    generationContextId: selected.researchRunId,
  };
  state = completeDiscoveryRequest(
    beginDiscoveryRequest(state, request, request.inputPackVersion!),
    request,
    phase2Version(pack, "consumer", 6, question),
  );
  const pair = state.findingThreads[discoveryFindingRef(selected)];
  state.runs[1].thread = pair;
  state.runs[0].thread = pair.map((item) => ({
    ...item,
    campaignKey: "another-campaign",
  }));
  expect(conversationHistory(state, "consumer", pack)).toHaveLength(1);
  expect(conversationHistory(state, "culture", pack)).toEqual([]);
  expect(
    conversationHistory(state, "consumer", pack)[0].question?.findingRef,
  ).toBe(discoveryFindingRef(selected));
  state.findingThreads[discoveryFindingRef(selected)] = pair.map((item) => ({
    ...item,
    turnId: undefined,
  }));
  expect(conversationHistory(state, "consumer", pack)).toHaveLength(1);
});
test("L: failed generation, conversation and retry preserve successful histories and exact turn", () => {
  const fixture = phase2Fixture();
  let state = fixture.state;
  for (const operation of ["generation", "conversation"] as const) {
    const request = phase2Turn(fixture.pack, fixture.question, 8, operation);
    const versions = structuredClone(state.runs.map((run) => run.versions));
    state = failDiscoveryRequest(
      beginDiscoveryRequest(state, request, request.inputPackVersion!),
      request,
      "Offline simulated failure",
    );
    expect(state.runs.map((run) => run.versions)).toEqual(versions);
    expect(state.runs[0].retryRequest?.operation).toBe(operation);
    state = completeDiscoveryRequest(
      beginDiscoveryRequest(state, request, request.inputPackVersion!),
      request,
      phase2Version(fixture.pack, "consumer", 8, fixture.question),
    );
    if (operation === "conversation")
      expect(conversationHistory(state, "consumer", fixture.pack)).toHaveLength(
        1,
      );
  }
  expect(state.runs.slice(1).every((run) => run.status === "complete")).toBe(
    true,
  );
});
test("J/L: older pending successes and failures cannot replace a newer accepted request", () => {
  const { state, pack, question } = phase2Fixture();
  const old = phase2Turn(pack, question, 6, "generation"),
    newer = phase2Turn(pack, question, 7, "generation");
  const pending = beginDiscoveryRequest(
    beginDiscoveryRequest(state, old, old.inputPackVersion!),
    newer,
    newer.inputPackVersion!,
  );
  for (const next of [
    completeDiscoveryRequest(
      pending,
      old,
      phase2Version(pack, "consumer", 6, question),
    ),
    archiveOutdatedDiscoveryResponse(
      pending,
      old,
      phase2Version(pack, "consumer", 6, question),
    ),
    dismissOutdatedDiscoveryRequest(pending, old),
    failDiscoveryRequest(pending, old, "late failure"),
  ]) {
    expect(next.runs[0].retryRequest?.turnId).toBe(newer.turnId);
    expect(next.runs[0].status).toBe("researching");
    expect(next.runs[0].currentVersionId).toBe(state.runs[0].currentVersionId);
  }
});
test("K: persisted generations, conversations, human strategy, selections and steering restore per campaign", () => {
  const { pack, question } = phase2Fixture();
  let { state } = phase2Fixture();
  state.humanBriefLine = "My unchanged human strategy";
  state.notes = "Private human notes";
  state.drafts!.generations = { consumer: "Unsent steering" };
  state.savedFindingIds = [
    discoveryFindingRef(state.runs[0].versions[2].findings[1]),
  ];
  const turn = phase2Turn(pack, question, 1);
  state = completeDiscoveryRequest(
    beginDiscoveryRequest(state, turn, turn.inputPackVersion!),
    turn,
    phase2Version(pack, "consumer", 6, question),
  );
  const map = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => map.set(key, value),
    getItem: (key: string) => map.get(key) ?? null,
  };
  writeDiscoveryDraft(storage, pack, state);
  const restored = readDiscoveryDraft(storage, pack)!;
  expect(restored.humanBriefLine).toBe(state.humanBriefLine);
  expect(restored.notes).toBe(state.notes);
  expect(restored.runs).toEqual(state.runs);
  expect(restored.savedFindingIds).toEqual(state.savedFindingIds);
  expect(restored.drafts?.generations).toEqual(state.drafts?.generations);
  expect(conversationHistory(restored, "consumer", pack)).toHaveLength(1);
  expect(
    readDiscoveryDraft(
      storage,
      phase2Fixture("xfinity_pro_source_text.txt").pack,
    ),
  ).toBeUndefined();
  expect(
    recoverDiscoveryState(compactParse(compactStringify(state)) as typeof state)
      .runs,
  ).toEqual(state.runs);
});

test("E/J: late conversation retains every qualified answer in its original thread, never structured history", () => {
  const { pack, question } = phase2Fixture();
  let { state } = phase2Fixture();
  const turn = phase2Turn(pack, question, 9);
  state = beginDiscoveryRequest(state, turn, turn.inputPackVersion!);
  const response = phase2Version(pack, "consumer", 6, question),
    versions = structuredClone(state.runs[0].versions);
  state = archiveOutdatedDiscoveryResponse(
    { ...state, question: "New focus", focusByMode: { problem: "New focus" } },
    turn,
    response,
  );
  const history = conversationHistory(state, "consumer", pack);
  expect(history).toHaveLength(1);
  for (const finding of response.findings) {
    expect(history[0].answer?.text).toContain(finding.title);
    expect(history[0].answer?.text).toContain(finding.whatComplicatesIt);
  }
  expect(state.runs[0].versions).toEqual(versions);
  expect(state.question).toBe("New focus");
});
