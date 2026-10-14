import { expect, test } from "@playwright/test";
import { selectedFoundation } from "../../lib/ai/context";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import {
  discoveryEvidenceIssue,
  generateAgentResponse,
} from "../../lib/ai/provider";
import {
  discoveryLensIds,
  outputSchemas,
  requestSchema,
  type AgentDataMap,
  type AgentRequest,
} from "../../lib/ai/schemas";
import {
  discoverySourceCoverage,
  emptyDiscoveryState,
  inputPackVersion,
} from "../../lib/discovery";
import { demoPack } from "../../lib/demo";

const originalMode = process.env.AI_MODE;

test.beforeEach(() => {
  process.env.AI_MODE = "mock";
});

test.afterEach(() => {
  if (originalMode === undefined) delete process.env.AI_MODE;
  else process.env.AI_MODE = originalMode;
});

function request(
  lens: (typeof discoveryLensIds)[number],
  action: Extract<
    AgentRequest,
    { agentType: "discovery" }
  >["context"]["action"] = "initial",
): Extract<AgentRequest, { agentType: "discovery" }> {
  return {
    agentType: "discovery",
    context: {
      foundation: selectedFoundation(demoPack),
      lens,
      investigationType: "problem",
      question: "What might explain the campaign problem?",
      action,
      previousFindings: [],
    },
    guidance: "Preserve uncertainty and identify the next evidence need.",
    versionNumber: 1,
  };
}

test("all five discovery lenses return distinct, schema-valid and source-verifiable findings", async () => {
  const titles = new Set<string>();
  for (const lens of discoveryLensIds) {
    const discoveryRequest = request(lens);
    expect(requestSchema.safeParse(discoveryRequest).success).toBe(true);
    const response = await generateAgentResponse(discoveryRequest);
    const data = outputSchemas.discovery.parse(response.data);
    expect(response.provider).toBe("mock");
    expect(discoveryEvidenceIssue(discoveryRequest, data)).toBe("");
    expect(data.findings.length).toBeGreaterThan(0);
    titles.add(data.findings[0].title);
  }
  expect(titles.size).toBe(5);
});

test("unsupported, connected-source and gap-with-evidence claims are rejected", () => {
  const discoveryRequest = request("brand");
  const base: AgentDataMap["discovery"] = {
    findings: [
      {
        title: "Claim",
        whatWeFound: "A claim was returned.",
        evidence: [
          {
            source: "Tableau",
            excerpt: "A result that is not in the pack.",
            date: "Not supplied",
            audience: "Not supplied",
            context: "Unverified",
            accessScope: "connected",
          },
        ],
        whyItMayMatter: "It might matter.",
        whatComplicatesIt: "It is not supported.",
        questionToExplore: "Can an authorized source verify it?",
        evidenceState: "evidence_supported",
      },
    ],
    retrievalNote: "",
  };
  expect(discoveryEvidenceIssue(discoveryRequest, base)).toContain(
    "not connected",
  );
  const inventedExcerpt = structuredClone(base);
  inventedExcerpt.findings[0].evidence[0].accessScope = "supplied";
  expect(discoveryEvidenceIssue(discoveryRequest, inventedExcerpt)).toContain(
    "cannot be verified",
  );
  const gapWithEvidence = structuredClone(inventedExcerpt);
  gapWithEvidence.findings[0].evidenceState = "research_gap";
  expect(discoveryEvidenceIssue(discoveryRequest, gapWithEvidence)).toContain(
    "research gap",
  );
});

test("discovery prompts keep evidence, interpretation and human strategy ownership separate", () => {
  const prompt = buildAgentPrompt(request("consumer"));
  expect(prompt.instructions).toContain("do not originate, select, approve");
  expect(prompt.instructions).toContain(
    "Every evidence excerpt must be copied exactly",
  );
  expect(prompt.instructions).toContain("Do not write ads");
  expect(prompt.input).toContain("What might explain the campaign problem?");
  expect(prompt.input).toContain("Preserve uncertainty");
});

test("source coverage is honest and input-pack versions change with evidence context", () => {
  const coverage = discoverySourceCoverage(demoPack);
  expect(
    coverage.filter((source) => source.status === "not_connected").length,
  ).toBeGreaterThan(0);
  expect(
    coverage
      .filter((source) => source.status === "not_connected")
      .every((source) => source.detail.includes("No live retrieval")),
  ).toBe(true);
  const initialVersion = inputPackVersion(demoPack);
  expect(
    inputPackVersion({
      ...demoPack,
      research: `${demoPack.research}\nNew evidence.`,
    }),
  ).not.toBe(initialVersion);
  const state = emptyDiscoveryState();
  expect(state.runs.map((run) => run.lensId)).toEqual(discoveryLensIds);
});

test("follow-up requests accept exact finding-version provenance", async () => {
  const first = await generateAgentResponse(request("brand"));
  const raw = outputSchemas.discovery.parse(first.data).findings[0];
  const selectedFinding = {
    ...raw,
    id: "brand-finding-v1",
    researchRunId: "brand-run-v1",
    createdAt: first.generatedAt,
    updatedAt: first.generatedAt,
    version: 1,
    lensId: "brand" as const,
    inputPackVersion: inputPackVersion(demoPack),
    runVersion: 1,
  };
  const initial = request("brand", "explore_deeper");
  const followUp = {
    ...initial,
    context: {
      ...initial.context,
      selectedFinding,
      previousFindings: [selectedFinding],
    },
  };
  expect(requestSchema.safeParse(followUp).success).toBe(true);
});

test("connections remain editable interpretations tied to selected finding versions", async () => {
  const consumer = await generateAgentResponse(request("consumer"));
  const brand = await generateAgentResponse(request("brand"));
  const consumerData = outputSchemas.discovery.parse(consumer.data);
  const brandData = outputSchemas.discovery.parse(brand.data);
  const findings = [consumerData.findings[0], brandData.findings[0]].map(
    (finding, index) => ({
      ...finding,
      id: `finding-${index + 1}`,
      lensId: index === 0 ? ("consumer" as const) : ("brand" as const),
      inputPackVersion: "pack-test",
      runVersion: 1,
    }),
  );
  const response = await generateAgentResponse({
    agentType: "connections",
    context: { foundation: selectedFoundation(demoPack), findings },
    guidance: "Look for tension rather than agreement.",
  });
  const data = outputSchemas.connections.parse(response.data);
  expect(data.note).toContain("Kevin should edit or reject");
  expect(data.tensions).not.toHaveLength(0);
  expect(data.questions).not.toHaveLength(0);
});
