import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { demoPack } from "../../lib/demo";
import {
  discoveryFindingRef,
  emptyDiscoveryState,
  inputPackVersion,
} from "../../lib/discovery";
import {
  archiveOutdatedDiscoveryResponse,
  beginDiscoveryRequest,
  completeDiscoveryRequest,
  failDiscoveryRequest,
  recoverDiscoveryState,
} from "../../lib/discovery-state";
import { discoveryFoundation } from "../../lib/discovery-context";
import { validateConnectionFindingEvidence } from "../../lib/discovery-connection-evidence";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import type {
  DiscoveryFinding,
  DiscoveryRetryRequest,
  DiscoveryRunVersion,
} from "../../lib/types";

const packVersion = inputPackVersion(demoPack);
const question = "Which supplied evidence explains the barrier?";

function finding(runVersion: number): DiscoveryFinding {
  return {
    id: "consumer-finding",
    researchRunId: `run-${runVersion}`,
    title: `Audience interpretation V${runVersion}`,
    whatWeFound: `The supplied audience wording supports interpretation ${runVersion}, not observed behavior.`,
    evidence: [],
    whyItMayMatter: "This might focus further investigation.",
    whatComplicatesIt: "No independent audience research is connected.",
    questionToExplore: "What would distinguish the explanations?",
    evidenceState: "research_gap",
    lensId: "consumer",
    inputPackVersion: packVersion,
    runVersion,
    provider: "mock",
  };
}

function version(runVersion: number): DiscoveryRunVersion {
  return {
    id: `run-${runVersion}`,
    number: runVersion,
    question,
    investigationType: "problem",
    action: "explore_deeper",
    guidance: "Look more closely at the supplied audience wording.",
    createdAt: "2026-10-17T12:00:00.000Z",
    inputPackVersion: packVersion,
    inputPackSnapshot: structuredClone(demoPack),
    findings: [finding(runVersion)],
    sourceCoverage: [],
    provider: "mock",
    retrievalStatus: "insufficient",
    retrievalNote:
      "Only supplied sources were checked. No external research was retrieved.",
    ...(runVersion > 1
      ? { revisesFindingRef: discoveryFindingRef(finding(runVersion - 1)) }
      : {}),
  };
}

function request(selectedFinding?: DiscoveryFinding): DiscoveryRetryRequest {
  return {
    lensId: "consumer",
    action: "explore_deeper",
    guidance: "Look more closely at the supplied audience wording.",
    turnId: selectedFinding
      ? `turn-${selectedFinding.runVersion}`
      : "agent-turn",
    threadId: selectedFinding
      ? `finding-thread-${selectedFinding.runVersion}`
      : "agent-thread",
    question,
    investigationType: "problem",
    inputPackVersion: packVersion,
    ...(selectedFinding ? { selectedFinding } : {}),
  };
}

test("failed turn retries in place and stores the actual qualified reply once", () => {
  let state = emptyDiscoveryState();
  state.question = question;
  state.drafts = {
    agents: { consumer: request().guidance, brand: "Unsent brand draft" },
    findings: {},
    routes: {},
    connections: "My connection draft",
  };
  const turn = request();
  state = beginDiscoveryRequest(state, turn, packVersion);
  expect(state.runs[0].thread).toHaveLength(1);
  expect(state.runs[0].thread[0]).toMatchObject({
    id: "agent-turn",
    status: "pending",
    scope: "agent",
  });
  state = failDiscoveryRequest(state, turn, "Local simulated failure.");
  expect(state.runs[0].thread[0]).toMatchObject({
    status: "failed",
    error: "Local simulated failure.",
  });
  state = beginDiscoveryRequest(state, turn, packVersion);
  expect(state.runs[0].thread).toHaveLength(1);
  expect(state.runs[0].thread[0].status).toBe("pending");
  state = completeDiscoveryRequest(state, turn, version(1));
  expect(state.runs[0].thread).toHaveLength(2);
  expect(state.runs[0].thread[0].status).toBe("complete");
  expect(state.runs[0].thread[1].text).toContain("Audience interpretation V1");
  expect(state.runs[0].thread[1].text).toContain(
    "No independent audience research",
  );
  expect(state.runs[0].thread[1].retrievalStatus).toBe("insufficient");
  expect(state.drafts?.agents.consumer).toBe("");
  expect(state.drafts?.agents.brand).toBe("Unsent brand draft");
  expect(state.drafts?.connections).toBe("My connection draft");
  state = completeDiscoveryRequest(state, turn, version(1));
  expect(state.runs[0].versions).toHaveLength(1);
  expect(state.runs[0].thread).toHaveLength(2);
});

test("finding discussions and drafts remain attached to exact V1 and V2 references", () => {
  let state = emptyDiscoveryState();
  state.question = question;
  const first = finding(1);
  const second = finding(2);
  const firstRef = discoveryFindingRef(first);
  const secondRef = discoveryFindingRef(second);
  state = beginDiscoveryRequest(state, request(first), packVersion);
  state = completeDiscoveryRequest(state, request(first), version(1));
  state = beginDiscoveryRequest(state, request(second), packVersion);
  state = completeDiscoveryRequest(state, request(second), version(2));
  expect(first.id).toBe(second.id);
  expect(firstRef).not.toBe(secondRef);
  expect(state.findingThreads[firstRef]).toHaveLength(2);
  expect(state.findingThreads[secondRef]).toHaveLength(2);
  expect(state.findingThreads[firstRef][1].researchRunId).toBe("run-1");
  expect(state.findingThreads[secondRef][1].researchRunId).toBe("run-2");
  expect(state.runs[0].thread).toHaveLength(0);
  expect(
    state.runs[0].versions.map((item) => item.revisesFindingRef),
  ).toContain(firstRef);
  state.drafts = {
    agents: {},
    findings: { [firstRef]: "Ask about V1", [secondRef]: "Ask about V2" },
    routes: {},
    connections: "",
  };
  const recovered = recoverDiscoveryState(structuredClone(state));
  expect(recovered.drafts?.findings[firstRef]).toBe("Ask about V1");
  expect(recovered.drafts?.findings[secondRef]).toBe("Ask about V2");
  expect(recovered.findingThreads[firstRef]).toHaveLength(2);
  expect(recovered.findingThreads[secondRef]).toHaveLength(2);
});

test("legacy bare-ID history migrates by exact recorded finding version; pending refresh is interrupted", () => {
  const state = emptyDiscoveryState();
  state.question = question;
  const first = finding(1),
    second = finding(2);
  const firstRef = discoveryFindingRef(first),
    secondRef = discoveryFindingRef(second);
  state.findingThreads[first.id] = [
    {
      id: "old-1",
      author: "Kevin",
      text: "V1 question",
      createdAt: "2026-10-17T12:00:00.000Z",
      findingRef: firstRef,
      status: "complete",
    },
    {
      id: "old-2",
      author: "Kevin",
      text: "V2 question",
      createdAt: "2026-10-17T12:01:00.000Z",
      findingRef: secondRef,
      status: "pending",
    },
    {
      id: "unresolved",
      author: "Kevin",
      text: "Older unversioned note",
      createdAt: "2026-10-17T12:02:00.000Z",
    },
  ];
  state.runs[0].status = "researching";
  const recovered = recoverDiscoveryState(state);
  expect(recovered.findingThreads[firstRef].map((item) => item.id)).toEqual([
    "old-1",
  ]);
  expect(recovered.findingThreads[secondRef][0]).toMatchObject({
    id: "old-2",
    status: "interrupted",
  });
  expect(recovered.findingThreads[first.id][0].id).toBe("unresolved");
  expect(recovered.runs[0].status).toBe("cancelled");
});

test("outdated result stays historical instead of replacing the active finding", () => {
  let state = emptyDiscoveryState();
  state.question = question;
  const turn = request(finding(1));
  state = beginDiscoveryRequest(state, turn, packVersion);
  state.question = "A different investigation";
  state.humanBriefLine = "Kevin's untouched strategy";
  state = archiveOutdatedDiscoveryResponse(state, turn, version(2));
  expect(state.runs[0].currentVersionId).toBe("");
  expect(state.runs[0].versions).toHaveLength(1);
  expect(
    state.findingThreads[discoveryFindingRef(finding(1))][1].text,
  ).toContain("Earlier-context response");
  expect(state.humanBriefLine).toBe("Kevin's untouched strategy");
});

test("an explicitly simulated offline source replay remains labeled as simulation and source-valid", () => {
  const fixture = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  );
  const movers = detectIMCCampaignScopes(fixture)[0];
  const pack = studioPack(applyStudioSource(emptyStudio(), movers.sourceText));
  const source = discoverySourceDocuments(discoveryFoundation(pack)).find(
    (item) => item.identity === "IMC brief — audience",
  );
  expect(source).toBeDefined();
  const excerpt = "Existing customers & prospects who are moving.";
  expect(source!.text).toContain(excerpt);
  const simulatedFinding: DiscoveryFinding = {
    ...finding(1),
    id: "fixture-audience",
    inputPackVersion: inputPackVersion(pack),
    title:
      "The supplied mover audience includes existing customers and prospects",
    whatWeFound:
      "This is the audience named in the brief, not a measured behavior result.",
    evidenceState: "evidence_supported",
    evidence: [
      {
        source: source!.identity,
        locator: source!.locator,
        excerpt,
        date: "Not supplied",
        audience: "Not supplied",
        context: "Offline fixture replay of original IMC audience text",
        accessScope: "supplied",
      },
    ],
  };
  expect(validateConnectionFindingEvidence(pack, [simulatedFinding])).toBe("");
  const simulatedVersion: DiscoveryRunVersion = {
    ...version(1),
    findings: [simulatedFinding],
    inputPackVersion: inputPackVersion(pack),
    inputPackSnapshot: pack,
    retrievalStatus: "simulated_fixture",
    retrievalNote:
      "Offline fixture replay of supplied IMC audience text; no external source was contacted.",
  };
  let state = emptyDiscoveryState();
  state.question = question;
  state = completeDiscoveryRequest(state, request(), simulatedVersion);
  expect(state.runs[0].thread.at(-1)).toMatchObject({
    author: "Agent",
    retrievalStatus: "simulated_fixture",
    usedNewRetrieval: true,
  });
  expect(state.runs[0].thread.at(-1)?.text).toContain(excerpt);
  expect(state.runs[0].thread.at(-1)?.text).toContain("Offline fixture replay");
});

test("an offline simulated source failure remains a limitation, not a validated answer", () => {
  const failedSource: DiscoveryRunVersion = {
    ...version(1),
    findings: [finding(1)],
    retrievalStatus: "failed",
    retrievalNote:
      "Offline simulated research source failed; no new evidence was retrieved or verified.",
  };
  let state = emptyDiscoveryState();
  state.question = question;
  state = completeDiscoveryRequest(state, request(), failedSource);
  const reply = state.runs[0].thread.at(-1);
  expect(reply).toMatchObject({
    author: "Agent",
    retrievalStatus: "failed",
    usedNewRetrieval: false,
  });
  expect(reply?.text).toContain("Offline simulated research source failed");
  expect(reply?.text).toContain("Research gap: no supporting source excerpt");
  expect(reply?.text).not.toContain("verified external result");
});
