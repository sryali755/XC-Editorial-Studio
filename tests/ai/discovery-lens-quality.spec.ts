import { expect, test } from "@playwright/test";
import {
  crossLensIssue,
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
