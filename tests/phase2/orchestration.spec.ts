import { test, expect } from "@playwright/test";
import { featureHarness } from "../helpers/phase2-feature-harness";
import { phase2Fixture, phase2Version } from "../fixtures/phase2-roundtable";
import type { generateDiscoveryVersion } from "../../lib/discovery";
import { discoveryFindingRef, discoveryLenses } from "../../lib/discovery";
import { conversationRegenerationRequest } from "../../lib/roundtable-history";

test("A/B/C: actual feature waits for human action and binds one selected campaign snapshot to five independent lenses", async () => {
  const fixture = phase2Fixture(undefined, false),
    requests: Parameters<typeof generateDiscoveryVersion>[0][] = [];
  const app = featureHarness(fixture.state, fixture.pack, async (request) => {
    requests.push(request);
    return phase2Version(
      request.pack,
      request.lensId,
      request.nextVersionNumber!,
      request.question,
    );
  });
  app.render();
  expect(requests).toEqual([]);
  await app.handlers.onRefreshAll();
  expect(requests.map((request) => request.lensId)).toEqual([
    "consumer",
    "culture",
    "category",
    "brand",
    "analogous",
  ]);
  for (const request of requests) {
    expect(request.pack).toEqual(fixture.pack);
    expect(request.question).toBe(fixture.question);
    expect(request.pack.selectedSparks).toEqual(fixture.pack.selectedSparks);
  }
  expect(app.state.runs.every((run) => run.status === "complete")).toBe(true);
});
for (const outcome of ["success", "failure"] as const)
  test(`J: actual feature drops late cross-campaign ${outcome} without publishing into the new campaign`, async () => {
    const movers = phase2Fixture(),
      pro = phase2Fixture("xfinity_pro_source_text.txt");
    let resolve!: (value: ReturnType<typeof phase2Version>) => void,
      reject!: (reason: Error) => void;
    const promise = new Promise<ReturnType<typeof phase2Version>>(
      (res, rej) => {
        resolve = res;
        reject = rej;
      },
    );
    const app = featureHarness(movers.state, movers.pack, () => promise);
    const pending = app.handlers.onRunLens({
      lensId: "consumer",
      operation: "generation",
      action: "refresh",
      guidance: "New angle",
    });
    app.replace(pro.state, pro.pack);
    const before = structuredClone(app.state);
    if (outcome === "success")
      resolve(phase2Version(movers.pack, "consumer", 6, movers.question));
    else reject(new Error("Late mock failure"));
    expect(await pending).toBe(false);
    expect(app.state).toEqual(before);
  });
test("J: actual feature archives a late earlier-focus result without overwriting the new question or human strategy", async () => {
  const fixture = phase2Fixture();
  let resolve!: (value: ReturnType<typeof phase2Version>) => void;
  const app = featureHarness(
    fixture.state,
    fixture.pack,
    () =>
      new Promise((res) => {
        resolve = res;
      }),
  );
  const pending = app.handlers.onRunLens({
    lensId: "consumer",
    operation: "generation",
    action: "refresh",
    guidance: "New angle",
  });
  app.replace({
    ...app.state,
    question: "New focus",
    focusByMode: { problem: "New focus" },
    humanBriefLine: "Unchanged human line",
  });
  resolve(phase2Version(fixture.pack, "consumer", 6, fixture.question));
  expect(await pending).toBe(false);
  expect(app.state.runs[0].versions).toHaveLength(6);
  expect(app.state.runs[0].currentVersionId).toBe("consumer-generation-5");
  expect(app.state.question).toBe("New focus");
  expect(app.state.humanBriefLine).toBe("Unchanged human line");
});
test("E/F: finding conversation binds exact viewed V2 while retaining current structured V4 and source provenance", async () => {
  const fixture = phase2Fixture(),
    selected = fixture.state.runs[0].versions[2].findings[1];
  let captured: Parameters<typeof generateDiscoveryVersion>[0] | undefined;
  const app = featureHarness(fixture.state, fixture.pack, async (request) => {
    captured = request;
    return phase2Version(request.pack, "consumer", 6, request.question);
  });
  expect(
    await app.handlers.onRunLens({
      lensId: "consumer",
      operation: "conversation",
      action: "explore_deeper",
      guidance: "Why this conclusion?",
      selectedFinding: selected,
    }),
  ).toBe(true);
  expect(captured?.selectedFinding).toEqual(selected);
  expect(captured?.generationContextId).toBe(selected.researchRunId);
  expect(app.state.runs[0].versions).toEqual(fixture.state.runs[0].versions);
  const thread = app.state.findingThreads[discoveryFindingRef(selected)];
  expect(thread).toHaveLength(2);
  expect(thread[1].researchRunId).toBe(selected.researchRunId);
  expect(thread[1].text).toContain("No external research retrieved");
  expect(thread[1].text).toContain(selected.title);
  expect(thread[1].text).not.toContain(
    fixture.state.runs[0].versions[2].findings[0].title,
  );
});

for (const lens of discoveryLenses) {
  test(`${lens.id}: regenerate a conversation without replacing replies, findings or human drafts`, async () => {
    const fixture = phase2Fixture();
    fixture.state.humanBriefLine = "Exact human strategy must remain unchanged";
    fixture.state.savedFindingIds = [
      discoveryFindingRef(fixture.state.runs[0].versions[0].findings[0]),
    ];
    const calls: Parameters<typeof generateDiscoveryVersion>[0][] = [];
    const app = featureHarness(fixture.state, fixture.pack, async (request) => {
      calls.push(request);
      return phase2Version(request.pack, request.lensId, 6, request.question);
    });
    const guidance = "What evidence supports your interpretation?";
    expect(
      await app.handlers.onRunLens({
        lensId: lens.id,
        operation: "conversation",
        action: "explore_deeper",
        guidance,
      }),
    ).toBe(true);
    const first = app.state.runs.find((run) => run.lensId === lens.id)!
      .thread[0];
    expect(
      await app.handlers.onRunLens({
        lensId: lens.id,
        operation: "conversation",
        action: "find_contrary",
        guidance: "A later question that regeneration must not include",
      }),
    ).toBe(true);
    const prior = structuredClone(app.state);
    app.replace({
      ...app.state,
      drafts: {
        ...app.state.drafts!,
        agents: { ...app.state.drafts!.agents, [lens.id]: guidance },
      },
    });
    const request = conversationRegenerationRequest(
      app.state,
      fixture.pack,
      lens.id,
      first.turnId!,
    )!;
    expect(request.guidance).toBe(guidance);
    expect(request.generationContextId).toBe(first.researchRunId);
    expect(await app.handlers.onRunLens(request)).toBe(true);
    expect(calls[2].generationContextId).toBe(first.researchRunId);
    expect(calls[2].threadMessages).toEqual([]);
    const after = app.state.runs.find((run) => run.lensId === lens.id)!;
    expect(after.thread.slice(0, 4)).toEqual(
      prior.runs.find((run) => run.lensId === lens.id)!.thread,
    );
    expect(after.thread).toHaveLength(6);
    expect(after.thread[5].regeneratesTurnId).toBe(first.turnId);
    expect(after.thread[5].turnId).not.toBe(first.turnId);
    for (const run of app.state.runs)
      expect(run.versions).toEqual(
        prior.runs.find((item) => item.lensId === run.lensId)!.versions,
      );
    expect(app.state.savedFindingIds).toEqual(prior.savedFindingIds);
    expect(app.state.humanBriefLine).toBe(prior.humanBriefLine);
    expect(app.state.drafts!.agents[lens.id]).toBe(guidance);
    const repeated = conversationRegenerationRequest(
      app.state,
      fixture.pack,
      lens.id,
      after.thread[4].turnId!,
    )!;
    expect(repeated.regeneratesTurnId).toBe(first.turnId);
    expect(repeated.guidance).toBe(guidance);
    expect(
      conversationRegenerationRequest(
        app.state,
        phase2Fixture("xfinity_pro_source_text.txt").pack,
        lens.id,
        first.turnId!,
      ),
    ).toBeUndefined();
    const changed = {
      ...app.state,
      focusByMode: { problem: "Different focus" },
    };
    expect(
      conversationRegenerationRequest(
        changed,
        fixture.pack,
        lens.id,
        first.turnId!,
      ),
    ).toBeUndefined();
    expect(
      await app.handlers.onRunLens({
        ...request,
        guidance: "Forged replacement question",
      }),
    ).toBe(false);
    expect(calls).toHaveLength(3);
  });
}

test("finding reply regeneration keeps exact historical finding scope and survives failure/retry", async () => {
  const fixture = phase2Fixture(),
    selectedFinding = fixture.state.runs[0].versions[2].findings[1];
  let fail = false;
  const calls: Parameters<typeof generateDiscoveryVersion>[0][] = [];
  const app = featureHarness(fixture.state, fixture.pack, async (request) => {
    calls.push(request);
    if (fail) throw new Error("Controlled offline reply failure");
    return phase2Version(request.pack, request.lensId, 6, request.question);
  });
  await app.handlers.onRunLens({
    lensId: "consumer",
    operation: "conversation",
    action: "find_contrary",
    guidance: "Challenge this exact historical finding",
    selectedFinding,
  });
  const ref = discoveryFindingRef(selectedFinding),
    original = structuredClone(app.state.findingThreads[ref]);
  const request = conversationRegenerationRequest(
    app.state,
    fixture.pack,
    "consumer",
    original[0].turnId!,
  )!;
  expect(request.selectedFinding).toEqual(selectedFinding);
  expect(request.generationContextId).toBe(selectedFinding.researchRunId);
  fail = true;
  expect(await app.handlers.onRunLens(request)).toBe(false);
  expect(app.state.findingThreads[ref].slice(0, 2)).toEqual(original);
  expect(app.state.findingThreads[ref]).toHaveLength(3);
  expect(app.state.findingThreads[ref][2].status).toBe("failed");
  fail = false;
  expect(await app.handlers.onRetryLens("consumer")).toBe(true);
  expect(app.state.findingThreads[ref]).toHaveLength(4);
  expect(app.state.findingThreads[ref].slice(0, 2)).toEqual(original);
  expect(calls[2].threadMessages).toEqual([]);
  expect(app.state.runs[0].versions).toEqual(fixture.state.runs[0].versions);
});

test("L: restored pre-Phase-2 conversation retry is conversational, not an implicit generation", async () => {
  const fixture = phase2Fixture();
  fixture.state.runs[0].status = "failed";
  fixture.state.runs[0].retryRequest = {
    lensId: "consumer",
    action: "explore_deeper",
    guidance: "Retry my older conversation",
    turnId: "legacy-turn",
  };
  const app = featureHarness(fixture.state, fixture.pack, async (request) =>
    phase2Version(request.pack, "consumer", 6, request.question),
  );
  expect(await app.handlers.onRetryLens("consumer")).toBe(true);
  expect(app.state.runs[0].versions).toEqual(fixture.state.runs[0].versions);
  expect(app.state.runs[0].currentVersionId).toBe("consumer-generation-5");
  expect(
    app.state.runs[0].thread.filter((item) => item.author === "Agent"),
  ).toHaveLength(1);
});
