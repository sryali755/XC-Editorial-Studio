import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { discoveryPrompt } from "../../lib/ai/discovery-prompts";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { generateMock } from "../../lib/ai/mock-provider";
import { generateAgentResponse } from "../../lib/ai/provider";
import { preparationText } from "../../lib/ai/format";
import {
  requestSchema,
  type AgentData,
  type AgentRequest,
} from "../../lib/ai/schemas";
import { discoveryFoundation } from "../../lib/discovery-context";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  studioResearchChoices,
} from "../../lib/discovery-studio";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import type { DiscoveryLensId, PreparationVersion } from "../../lib/types";

const fixture = path.join(
  __dirname,
  "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
);
const lenses: DiscoveryLensId[] = [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
];
const question = "What might explain this campaign's objective?";

function campaignScopes() {
  const scopes = detectIMCCampaignScopes(readFileSync(fixture, "utf8"));
  expect(scopes).toHaveLength(2);
  return scopes;
}

function version(
  id: string,
  data: AgentData,
  sourceBrief: string,
): PreparationVersion {
  return {
    id,
    number: 1,
    text: preparationText(data),
    guidance: "Initial preparation from IMC brief",
    createdAt: "2026-10-17T00:00:00.000Z",
    sourceBrief,
    provider: "mock",
    generatedAt: "2026-10-17T00:00:00.000Z",
    data,
    sparks: "sparks" in data ? data.sparks : [],
    inputContext: {
      sourceBrief,
      selectedContent: { selectedSparks: [] },
      steeringText: "",
    },
  };
}

async function campaignRequests(sourceBrief: string) {
  const session = applyStudioSource(emptyStudio(), sourceBrief);
  const parsedIMC = parseIMCBrief(sourceBrief);
  const upstream = extractUpstream(parsedIMC);
  const [rtb, research, sparks] = await Promise.all([
    generateMock({ agentType: "rtb", context: { parsedIMC, upstream } }),
    generateMock({ agentType: "research", context: { parsedIMC, upstream } }),
    generateMock({ agentType: "sparks", context: { parsedIMC, upstream } }),
  ]);
  if (
    !("originalRtb" in rtb) ||
    !("suppliedEvidence" in research) ||
    !("sparks" in sparks)
  )
    throw new Error(
      "The deterministic preparation fixture has an unexpected shape.",
    );
  session.preparation.outputs = [
    {
      agentId: "reasonToBelieve",
      status: "mock",
      currentVersionId: "rtb-v0",
      versions: [version("rtb-v0", rtb, sourceBrief)],
    },
    {
      agentId: "research",
      status: "mock",
      currentVersionId: "research-v0",
      versions: [version("research-v0", research, sourceBrief)],
    },
    {
      agentId: "sparks",
      status: "mock",
      currentVersionId: "sparks-v0",
      versions: [version("sparks-v0", sparks, sourceBrief)],
    },
  ];
  session.selectedRtbVersionId = "rtb-v0";
  session.preparation.selectedSparkIds = [sparks.sparks[0].id];
  session.selectedResearchIds = [studioResearchChoices(session)[0].id];
  session.selectedResearchSources = ["Tableau"];
  const pack = studioPack(session);
  const foundation = discoveryFoundation(pack);
  const requests = lenses.map((lens) => {
    const parsed = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation,
        lens,
        investigationType: "problem",
        question,
        action: "initial",
        previousFindings: [],
      },
      guidance: "Kevin's question is human steering, not source evidence.",
      versionNumber: 1,
    });
    if (parsed.agentType !== "discovery")
      throw new Error("Expected Discovery request.");
    return parsed;
  });
  return { pack, requests };
}

function strictMockOutput(
  request: Extract<AgentRequest, { agentType: "discovery" }>,
) {
  const sources = discoverySourceDocuments(request.context.foundation);
  const result = mockDiscovery(request);
  return {
    ...result,
    findings: result.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((citation) => ({
        ...citation,
        locator:
          sources.find((source) =>
            [source.identity, ...source.aliases].includes(citation.source),
          )?.locator ?? "",
      })),
    })),
  };
}

test("both PDF campaigns give five lenses one scoped, selected Input Pack snapshot and distinct research prompts", async () => {
  const [movers, pro] = campaignScopes();
  for (const [selected, other] of [
    [movers, pro],
    [pro, movers],
  ] as const) {
    const { pack, requests } = await campaignRequests(selected.sourceText);
    const baseline = requests[0].context.foundation;
    expect(requests.map((request) => request.context.lens)).toEqual(lenses);
    for (const request of requests) {
      expect(request.context.foundation).toEqual(baseline);
      expect(request.context.question).toBe(question);
      expect(request.context.foundation.sourceBrief).toBe(selected.sourceText);
      expect(request.context.foundation.selectedPreparationVersions).toEqual({
        reasonToBelieve: "rtb-v0",
        research: "research-v0",
        sparks: "sparks-v0",
      });
      expect(request.context.foundation.selectedResearch).toHaveLength(1);
      expect(request.context.foundation.selectedSparks).toHaveLength(1);
      expect(request.context.foundation.selectedResearchSources).toEqual([
        "Tableau",
      ]);
      expect(request.context.foundation.sourceAvailability).toContainEqual(
        expect.objectContaining({ source: "Tableau", status: "not_connected" }),
      );
      expect(
        request.context.foundation.campaignContext.jobToBeDone,
      ).toBeUndefined();
      expect(request.context.foundation.currentRtb.approvalStatus).toBe(
        "unknown",
      );
      expect(request.context.foundation.currentRtb.original).toBe(
        pack.reasonToBelieve,
      );
      expect(request.context.foundation.currentRtb.proposal).toBe(
        pack.proposedRTB,
      );
      expect(JSON.stringify(request.context.foundation)).not.toContain(
        other.title,
      );
    }
    const instructions = requests.map(
      (request) => discoveryPrompt(request).instructions,
    );
    expect(new Set(instructions).size).toBe(5);
    for (const [index, expected] of [
      "CONSUMER / AUDIENCE LENS",
      "CULTURE LENS",
      "CATEGORY / COMPETITION LENS",
      "BRAND LENS",
      "ANALOGOUS SOLUTIONS LENS",
    ].entries()) {
      expect(instructions[index]).toContain(expected);
      const prompt = discoveryPrompt(requests[index]);
      expect(prompt.input).toContain(question);
      expect(prompt.input).toContain(selected.title);
      expect(prompt.input).toContain("selectedPreparationVersions");
      expect(prompt.input).toContain("strategistGuidance");
    }
  }
});

test("real campaign context reaches the parser and evidence validator through the in-memory model boundary", async () => {
  for (const selected of campaignScopes()) {
    const { requests } = await campaignRequests(selected.sourceText);
    for (const request of requests) {
      const fake = createOfflineModelClient([
        JSON.stringify(strictMockOutput(request)),
      ]);
      const response = await generateAgentResponse(request, fake.sdk);
      expect(fake.calls()).toBe(1);
      expect(response.provider).toBe("mock");
      expect(response.model).toBe("deterministic-offline-model");
      expect(response.data).toHaveProperty("findings");
      if (!("findings" in response.data)) throw new Error("Missing findings.");
      expect(response.data.findings[0].evidenceState).toBe(
        request.context.lens === "culture" ||
          request.context.lens === "analogous"
          ? "research_gap"
          : "evidence_supported",
      );
    }
  }
});

test("other-campaign, unknown-source, wrong-source and wrong-locator citations fail without becoming validated findings", async () => {
  const [movers, pro] = campaignScopes();
  const { requests } = await campaignRequests(movers.sourceText);
  const request = requests.find((item) => item.context.lens === "brand")!;
  const supported = strictMockOutput(request);
  const citation = supported.findings[0].evidence[0];
  expect(citation).toBeDefined();
  const variants = [
    {
      ...citation,
      source: "IMC brief",
      locator: "imc:brief",
      excerpt: "Choose a device to boost",
    },
    {
      ...citation,
      source: "Unapproved external report",
      locator: "",
      excerpt: citation.excerpt,
    },
    {
      ...citation,
      source: "IMC brief — audience",
      locator: "imc:audience",
      excerpt: citation.excerpt,
    },
    { ...citation, locator: "imc:objective" },
  ];
  expect(pro.sourceText).toContain("Choose a device to boost");
  for (const invalidCitation of variants) {
    const invalid = {
      ...supported,
      findings: [{ ...supported.findings[0], evidence: [invalidCitation] }],
    };
    const fake = createOfflineModelClient([
      JSON.stringify(invalid),
      JSON.stringify(invalid),
    ]);
    await expect(
      generateAgentResponse(request, fake.sdk),
    ).rejects.toMatchObject({
      code: "discovery_evidence_validation_failed",
    });
    expect(fake.calls()).toBe(2);
  }
});
