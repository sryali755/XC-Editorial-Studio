import { expect, test } from "@playwright/test";
import { demoPack } from "../../lib/demo";
import { emptyDiscoveryState, inputPackVersion } from "../../lib/discovery";
import {
  archiveOutdatedDiscoveryResponse,
  completeDiscoveryRequest,
} from "../../lib/discovery-state";
import type {
  DiscoveryFinding,
  DiscoveryRetryRequest,
  DiscoveryRunVersion,
} from "../../lib/types";

const packVersion = inputPackVersion(demoPack);
const question = "What makes movers leave?";
const finding: DiscoveryFinding = {
  id: "consumer-finding",
  researchRunId: "run-1",
  title: "Customer interviews establish a transfer failure",
  whatWeFound:
    "Customer interviews show that movers abandon Xfinity because the transfer app fails.",
  evidence: [
    {
      source: "IMC brief",
      locator: "Source page 2",
      excerpt: "Drive retention during the move moment.",
      date: "Not supplied",
      audience: "Not supplied",
      context: "Supplied campaign objective",
      accessScope: "supplied",
    },
  ],
  whyItMayMatter: "This could guide investigation.",
  whatComplicatesIt: "No customer interviews are supplied.",
  questionToExplore: "What actual transfer barriers exist?",
  evidenceState: "evidence_supported",
  lensId: "consumer",
  inputPackVersion: packVersion,
  runVersion: 1,
  provider: "mock",
};

const request: DiscoveryRetryRequest = {
  lensId: "consumer",
  action: "explore_deeper",
  guidance: "Test the transfer premise.",
  question,
  investigationType: "problem",
  inputPackVersion: packVersion,
};

const version: DiscoveryRunVersion = {
  id: "run-1",
  number: 1,
  question,
  investigationType: "problem",
  action: "explore_deeper",
  guidance: request.guidance,
  createdAt: "2026-10-17T12:00:00.000Z",
  inputPackVersion: packVersion,
  inputPackSnapshot: structuredClone(demoPack),
  findings: [finding],
  sourceCoverage: [],
  provider: "mock",
  retrievalStatus: "supplied_only",
  retrievalNote: "Only the supplied brief was reviewed.",
  revisionSummary: "An agent-proposed transfer reading.",
};

test("current conversation separates unverified interpretation from source excerpt", () => {
  const state = emptyDiscoveryState();
  state.question = question;
  const next = completeDiscoveryRequest(state, request, version);
  const reply = next.runs[0].thread.at(-1)?.text ?? "";
  expect(reply).toContain("Agent revision summary · unverified:");
  expect(reply).toContain(
    `Agent interpretation · unverified:\n${finding.title}\n${finding.whatWeFound}`,
  );
  expect(reply).toContain(
    `Supplied source excerpt (not independent verification): IMC brief (Source page 2): “${finding.evidence[0].excerpt}”`,
  );
  expect(reply.indexOf("Agent interpretation · unverified:")).toBeLessThan(
    reply.indexOf("Supplied source excerpt"),
  );
  expect(next.runs[0].versions[0].findings[0]).toEqual(finding);
});

test("earlier-context reply keeps the same interpretation and source distinction", () => {
  const state = emptyDiscoveryState();
  state.question = question;
  const next = archiveOutdatedDiscoveryResponse(state, request, version);
  const reply = next.runs[0].thread.at(-1)?.text ?? "";
  expect(reply).toContain("Earlier-context response · V0");
  expect(reply).toContain(
    `Agent interpretation · unverified:\n${finding.title}\n${finding.whatWeFound}`,
  );
  expect(reply).toContain(
    "Supplied source excerpt (not independent verification):",
  );
  expect(reply.indexOf("Agent interpretation · unverified:")).toBeLessThan(
    reply.indexOf("Supplied source excerpt"),
  );
  expect(next.runs[0].versions[0].findings[0]).toEqual(finding);
});
