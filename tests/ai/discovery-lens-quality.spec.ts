import { expect, test } from "@playwright/test";
import {
  batchCrossLensOverlaps,
  crossLensIssue,
  discoveryLensRoleIssue,
  currentPeerFindings,
  LENS_CONTRACT_VERSION,
  lensAssignments,
} from "../../lib/discovery-lens-quality";
import { discoveryPrompt } from "../../lib/ai/discovery-prompts";
import { requestSchema, type AgentDataMap } from "../../lib/ai/schemas";
import { validateDiscoveryEvidence } from "../../lib/ai/discovery-evidence";
import { discoveryFoundation } from "../../lib/discovery-context";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { emptyDiscoveryState, inputPackVersion } from "../../lib/discovery";
import sample from "../../lib/samples/kevin-imc.json";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { generateAgentResponse } from "../../lib/ai/provider";
import type {
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryRunVersion,
} from "../../lib/types";

const peer: DiscoveryFinding = {
  id: "consumer-one",
  lensId: "consumer",
  inputPackVersion: "pack",
  runVersion: 1,
  title:
    "For existing customers, one less thing is specifically framed as transfer ease plus continuity",
  whatWeFound:
    "The customer message frames service transfer through the app alongside uninterrupted connectivity.",
  evidence: [],
  evidenceState: "research_gap",
  whyItMayMatter: "Tentative only.",
  whatComplicatesIt: "No behavior evidence.",
  questionToExplore: "Which transfer step creates friction?",
};

for (const lens of [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
] as DiscoveryLensId[]) {
  test(`${lens} owns a distinctive first answer and receives the complete brief`, () => {
    const request = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation: discoveryFoundation(
          studioPack(applyStudioSource(emptyStudio(), sample.text)),
        ),
        lens,
        investigationType: "problem",
        question: "What does reassurance mean?",
        action: "refresh",
        previousFindings: [],
        peerFindings: [peer],
      },
    });
    if (request.agentType !== "discovery") throw new Error("Wrong agent");
    const prompt = discoveryPrompt(request);
    expect(prompt.instructions).toContain(lensAssignments[lens]);
    expect(prompt.instructions).toContain("FIRST finding");
    expect(prompt.input).toContain(JSON.stringify(sample.text));
    expect(JSON.parse(prompt.input).peerFindings[0].id).toBe(peer.id);
    if (lens === "analogous") {
      expect(prompt.instructions).toContain("NOT an analogous case");
      expect(prompt.instructions).toContain("evidence must be empty");
    }
    if (lens !== "consumer") {
      const data: AgentDataMap["discovery"] = {
        findings: [{ ...peer }],
        retrievalNote: "Supplied analysis only.",
      };
      expect(validateDiscoveryEvidence(request, data)).toContain("overlaps");
    }
  });
}

test("an Analogous audience recap is repaired to a case-research gap without invented evidence", async () => {
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(
        studioPack(applyStudioSource(emptyStudio(), sample.text)),
      ),
      lens: "analogous",
      investigationType: "problem",
      question: "What barriers need investigating?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery") throw Error("Wrong agent");
  const good = mockDiscovery(request);
  const bad = structuredClone(good);
  bad.findings = [
    {
      ...bad.findings[0],
      title:
        "Conductors need obvious, effortless proof; Bloomers need reassurance against disruption",
      whatWeFound:
        "The brief divides existing customers into two audience segments with different upgrade barriers.",
    },
  ];
  expect(validateDiscoveryEvidence(request, bad)).toContain(
    "campaign or audience recap",
  );
  const model = createOfflineModelClient([
    JSON.stringify(bad),
    JSON.stringify(good),
  ]);
  const result = await generateAgentResponse(request, model.sdk);
  expect(result.data).toEqual(good);
  expect(model.calls()).toBe(2);
  expect(
    JSON.parse(String(model.requests()[1].input)).validationFeedback.problem,
  ).toContain("campaign or audience recap");
});

test("role checks keep invalid saved Analogous recaps from blocking Brand", () => {
  const state = emptyDiscoveryState();
  const pack = studioPack(applyStudioSource(emptyStudio(), sample.text));
  const run = state.runs.find((item) => item.lensId === "analogous")!;
  const finding = {
    ...peer,
    lensId: "analogous" as const,
    title: "Conductors and Bloomers have different upgrade barriers",
    whatWeFound: "The target audience values reliability and simplicity.",
  };
  run.versions = [
    {
      id: "bad-role",
      number: 1,
      inputPackVersion: inputPackVersion(pack),
      question: "Current focus",
      investigationType: "problem",
      findings: [finding],
      lensContractVersion: LENS_CONTRACT_VERSION,
    } as DiscoveryRunVersion,
  ];
  run.currentVersionId = "bad-role";
  expect(
    currentPeerFindings(
      state,
      "brand",
      inputPackVersion(pack),
      "Current focus",
    ),
  ).toEqual([]);
  expect(run.versions[0].findings).toEqual([finding]);
  expect(
    discoveryLensRoleIssue("analogous", {
      title: "A documented onboarding case is needed",
      whatWeFound: "Which comparable intervention reduced transition friction?",
    }),
  ).toBe("");
});

test("pasted paraphrased transfer answers are detected across lenses", () => {
  for (const title of [
    "For existing customers, one less thing is supported as transfer simplicity plus continuity",
    "For existing customers, one less thing is framed as transfer ease plus continuity, not price certainty",
    "For existing customers, one less thing is specifically framed as transfer ease plus staying connected",
  ])
    expect(
      crossLensIssue(
        "culture",
        [{ title, whatWeFound: "Different body wording." }],
        [peer],
      ),
    ).toContain("overlaps");
});

test("batch overlap advice is independent of lens completion order", () => {
  const state = emptyDiscoveryState();
  const version = "same-pack";
  const question = "Current focus";
  for (const lensId of ["consumer", "culture"] as const) {
    const run = state.runs.find((item) => item.lensId === lensId)!;
    run.currentVersionId = `current-${lensId}`;
    run.versions = [
      {
        id: run.currentVersionId,
        number: 1,
        inputPackVersion: version,
        question,
        investigationType: state.investigationType,
        findings: [{ ...peer, id: `${lensId}-one`, lensId }],
        lensContractVersion: LENS_CONTRACT_VERSION,
      } as DiscoveryRunVersion,
    ];
  }
  const expected = batchCrossLensOverlaps(state, version, question);
  expect(expected).toEqual(["culture and consumer"]);
  state.runs.reverse();
  expect(batchCrossLensOverlaps(state, version, question)).toEqual(expected);
});

test("distinct roles can reuse a quotation without duplicating its interpretation", () => {
  const titles = {
    culture: "Which moving rituals change the meaning of home?",
    category:
      "Offer eligibility prevents a like-for-like comparison across audiences",
    brand:
      "An intended promise does not establish approved product substantiation",
    analogous:
      "A documented handover case is needed to investigate reducing transition effort",
  };
  for (const [lens, title] of Object.entries(titles))
    expect(
      crossLensIssue(
        lens as DiscoveryLensId,
        [{ title, whatWeFound: title }],
        [peer],
      ),
    ).toBe("");
  expect(crossLensIssue("consumer", [peer], [peer])).toBe("");
});

test("only current validated peers participate; old history remains untouched", () => {
  const state = emptyDiscoveryState();
  const pack = studioPack(applyStudioSource(emptyStudio(), sample.text));
  const version = {
    id: "run-one",
    number: 1,
    inputPackVersion: inputPackVersion(pack),
    question: "Current focus",
    investigationType: "problem",
    findings: [peer],
    lensContractVersion: LENS_CONTRACT_VERSION,
  } as DiscoveryRunVersion;
  state.runs[0].versions = [version];
  state.runs[0].currentVersionId = version.id;
  expect(
    currentPeerFindings(
      state,
      "culture",
      version.inputPackVersion,
      version.question,
    ),
  ).toHaveLength(1);
  expect(
    currentPeerFindings(state, "culture", "stale-pack", version.question),
  ).toHaveLength(0);
  expect(
    currentPeerFindings(
      state,
      "culture",
      version.inputPackVersion,
      "Different focus",
    ),
  ).toHaveLength(0);
  delete version.lensContractVersion;
  expect(
    currentPeerFindings(
      state,
      "culture",
      version.inputPackVersion,
      version.question,
    ),
  ).toHaveLength(0);
  expect(state.runs[0].versions).toHaveLength(1);
});
