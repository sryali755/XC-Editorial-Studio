import { expect, test } from "@playwright/test";
import { emptyDiscoveryState, inputPackVersion } from "../../lib/discovery";
import {
  archiveOutdatedDiscoveryResponse,
  beginDiscoveryRequest,
  dismissOutdatedDiscoveryRequest,
} from "../../lib/discovery-state";
import { demoPack } from "../../lib/demo";
import type { DiscoveryRunVersion } from "../../lib/types";

const request = {
  lensId: "consumer" as const,
  action: "initial" as const,
  guidance: "",
};
const earlier: DiscoveryRunVersion = {
  id: "earlier-run",
  number: 1,
  question: "Earlier question",
  investigationType: "problem",
  action: "initial",
  guidance: "",
  createdAt: "2026-10-17T12:00:00.000Z",
  inputPackVersion: inputPackVersion(demoPack),
  inputPackSnapshot: structuredClone(demoPack),
  findings: [],
  sourceCoverage: [],
  provider: "mock",
};

test("an older answer is archived, not promoted or allowed to rewrite human strategy", () => {
  let state = emptyDiscoveryState();
  state.question = "Earlier question";
  state = beginDiscoveryRequest(state, request, earlier.inputPackVersion);
  state.question = "New investigation question";
  state.humanBriefLine = "Kevin's current draft";
  state.savedFindingIds = ["saved-finding@1"];
  const result = archiveOutdatedDiscoveryResponse(state, request, earlier);
  expect(result.question).toBe("New investigation question");
  expect(result.humanBriefLine).toBe("Kevin's current draft");
  expect(result.savedFindingIds).toEqual(["saved-finding@1"]);
  expect(result.runs[0].versions).toEqual([earlier]);
  expect(result.runs[0].currentVersionId).toBe("");
  expect(result.runs[0].status).toBe("idle");
  expect(result.contextVersion).toBe("");
});

test("an older failure cannot replace an already-current version", () => {
  const state = emptyDiscoveryState();
  state.runs[0] = {
    ...state.runs[0],
    status: "researching",
    retryRequest: request,
    currentVersionId: "current-run",
    versions: [{ ...earlier, id: "current-run" }],
  };
  const result = dismissOutdatedDiscoveryRequest(state, request);
  expect(result.runs[0].currentVersionId).toBe("current-run");
  expect(result.runs[0].versions).toHaveLength(1);
  expect(result.runs[0].status).toBe("complete");
  expect(result.runs[0].retryRequest).toBeUndefined();
});
