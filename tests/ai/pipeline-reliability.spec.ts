import { test, expect } from "@playwright/test";
import { canonicalCampaign } from "../../lib/canonical-campaign";
import { discoveryFoundation } from "../../lib/discovery-context";
import { studioPack } from "../../lib/discovery-studio";
import { requestSchema } from "../../lib/ai/schemas";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import { pipelineCampaigns } from "../fixtures/pipeline-campaigns";
import { classifyCampaignHeading } from "../../lib/campaign-field-classifier";
import {
  buildSourceRegistry,
  originalSourceExcerpt,
} from "../../lib/source-registry";
import {
  discoverySourceDocuments,
  resolveDiscoveryCitation,
} from "../../lib/discovery-sources";
import {
  normalizeDiscoveryEvidenceMetadata,
  validateDiscoveryEvidence,
} from "../../lib/ai/discovery-evidence";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { generateAgentResponse } from "../../lib/ai/provider";
import { generateMock } from "../../lib/ai/mock-provider";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { discoverySubmissionIssue } from "../../lib/ai/discovery-submission";
import {
  outputSchemas,
  type AgentDataMap,
  type AgentRequest,
} from "../../lib/ai/schemas";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioStrategySession,
  confirmStudioCampaignName,
} from "../../lib/discovery-studio";
import { extractUpstream, sourceContext } from "../../lib/upstream";
import { parseIMCBrief } from "../../lib/imc-parser";
import { buildStudioCampaign } from "../../lib/input-pack-presentation";
import { inputPackVersion, discoveryFindingRef } from "../../lib/discovery";
import {
  writeDiscoveryDraft,
  readDiscoveryDraft,
} from "../../lib/discovery-persistence";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import { buildStudioBriefInput } from "../../lib/studio-brief-input";
import { execFileSync } from "node:child_process";
import type { DiscoveryLensId, DiscoveryRunVersion } from "../../lib/types";

type Request = Extract<AgentRequest, { agentType: "discovery" }>;
const lenses: DiscoveryLensId[] = [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
];
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});
function requestFor(
  source: string,
  lens: DiscoveryLensId = "consumer",
): Request {
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(
        studioPack(applyStudioSource(emptyStudio(), source)),
      ),
      lens,
      investigationType: "problem",
      question: "Which supplied barrier or evidence gap needs investigation?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery") throw Error("Expected Discovery");
  return request;
}
function modelOutput(request: Request): AgentDataMap["discovery"] {
  const lens = request.context.lens;
  const registry = request.context.foundation.canonicalCampaign!.sourceRegistry;
  const passage =
    registry.passages.find((item) =>
      /Audience|talking to|Target audience/i.test(item.text),
    ) ?? registry.passages[0];
  const gap = ["culture", "analogous"].includes(lens);
  const title = {
    consumer: "The supplied audience context needs behavioral validation",
    culture: "Wider social routines need specific cultural research",
    category: "Keeping the current option needs comparison with changing it",
    brand: "Supplied claims and their approval remain distinct",
    analogous: "A documented comparable case is needed",
  }[lens];
  return {
    findings: [
      {
        title,
        whatWeFound: gap
          ? lens === "culture"
            ? "The supplied campaign does not establish wider social norms; investigate which routines matter to this audience."
            : "No outside-category case document is supplied. Investigate a comparable barrier using a documented original case."
          : "The source supplies campaign context, not independently validated evidence of how the audience makes this decision.",
        evidence: gap
          ? []
          : [
              {
                source: passage.documentId,
                locator: passage.id,
                excerpt: passage.text,
                date: "Not supplied",
                audience: "Not supplied",
                context: "Source context only; no independent verification.",
                accessScope: "supplied",
              },
            ],
        whyItMayMatter:
          "This may help define a precise investigation; it does not choose the human strategy.",
        whatComplicatesIt:
          "The supplied material alone does not validate the interpretation or grant approval.",
        questionToExplore:
          "Which original evidence would distinguish the plausible explanations?",
        evidenceState: gap ? "research_gap" : "evidence_supported",
      },
    ],
    retrievalNote: "Supplied sources only; no external research retrieved.",
  };
}

test("canonical campaign survives request validation unchanged", () => {
  const foundation = discoveryFoundation(studioPack(phase1Fixture().session));
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation,
      lens: "consumer",
      investigationType: "problem",
      question: "What needs investigation?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery") throw Error("Expected Discovery");
  expect(request.context.foundation.canonicalCampaign).toEqual(
    canonicalCampaign(request.context.foundation),
  );
});

test("shared heading classification covers composite proof, natural labels and reviewable ambiguity", () => {
  for (const label of [
    "Proof/RTB",
    "Product proof",
    "Supporting proof",
    "RTBs",
  ])
    expect(classifyCampaignHeading(label).key).toBe("rtbs");
  expect(classifyCampaignHeading("Our commercial goal")).toMatchObject({
    key: "businessObjectives",
    method: "semantic",
  });
  expect(classifyCampaignHeading("Proof and metrics")).toMatchObject({
    method: "unmapped",
    candidates: expect.arrayContaining(["rtbs", "kpis"]),
  });
  expect(classifyCampaignHeading("RTB approval status").key).toBeUndefined();
});

for (const [name, source] of Object.entries(pipelineCampaigns)) {
  if (name === "unusable") continue;
  test(`${name}: extraction retains exact source, canonical fields and uncertainty`, () => {
    const parsed = parseIMCBrief(source);
    expect(parsed.sourceText).toBe(source);
    const campaign = canonicalCampaign({
      sourceBrief: source,
      requirements: extractUpstream(source),
    });
    expect(campaign.sourceRegistry.documents[0].originalText).toBe(
      source.trim(),
    );
    expect(campaign.usable).toBe(true);
    for (const field of Object.values(campaign.fields))
      for (const value of field.values) {
        expect(value.origin).toBe("source");
        expect(value.approval).toBe("unknown");
        for (const ref of value.references) {
          const doc = campaign.sourceRegistry.documents.find(
            (item) => item.id === ref.documentId,
          )!;
          expect(doc.originalText).toContain(ref.excerpt);
        }
      }
    if (name === "missing")
      expect(campaign.fields.rtbs).toMatchObject({
        state: "not_supplied",
        values: [],
      });
    if (name === "renamed" || name === "tables") {
      expect(campaign.fields.businessObjectives.values).toHaveLength(1);
      expect(campaign.fields.communicationObjectives.values).toHaveLength(1);
      expect(campaign.fields.rtbs.values[0].value).toContain("participating");
    }
    if (name === "multiple") {
      expect(campaign.fields.audiences.values[0].value).toContain(
        "Daily commuters",
      );
      expect(campaign.fields.audiences.values[0].value).toContain(
        "Occasional visitors",
      );
      expect(campaign.fields.rtbs.values[0].value).toContain(
        "weekday timetable only",
      );
      expect(campaign.fields.rtbs.values[0].value).toContain("expires");
    }
    if (name === "ambiguous") {
      expect(
        campaign.unknowns.some(
          (item) =>
            item.label === "Proof and metrics" && item.state === "needs_review",
        ),
      ).toBe(true);
      expect(campaign.fields.rtbs.state).toBe("not_supplied");
      expect(parsed.fields.objective.sourceValue).not.toContain(
        "does not distinguish",
      );
      const tableSource =
        "| Campaign | Oak Trial |\n| Business objective | Explore whether the trial is relevant. |\n| Proof and metrics | Ambiguous evaluation targets. |";
      const tableModel = canonicalCampaign({
        sourceBrief: tableSource,
        requirements: extractUpstream(tableSource),
      });
      expect(tableModel.unknowns).toContainEqual(
        expect.objectContaining({
          label: "Proof and metrics",
          state: "needs_review",
        }),
      );
      expect(
        extractUpstream(tableSource).fields.objective.sourceValue,
      ).not.toContain("Ambiguous evaluation");
    }
  });
  test(`${name}: all five roles receive identical canonical/source context and complete validated offline contracts`, async () => {
    const canonical = canonicalCampaign({
      sourceBrief: source,
      requirements: extractUpstream(source),
    });
    for (const lens of lenses) {
      const request = requestFor(source, lens);
      expect(discoverySubmissionIssue(request)).toBeUndefined();
      const prompt = JSON.parse(buildAgentPrompt(request).input);
      expect(prompt.canonicalCampaign.sourceRegistry).toEqual(
        canonical.sourceRegistry,
      );
      expect(prompt.inputPack.sourceBrief).toBe(source);
      expect(prompt.suppliedSourceCatalog[0]).toMatchObject({
        documentId: expect.any(String),
        passageId: expect.any(String),
        text: expect.any(String),
      });
      const client = createOfflineModelClient([
        JSON.stringify(modelOutput(request)),
      ]);
      const response = await generateAgentResponse(request, client.sdk);
      const data = outputSchemas.discovery.parse(response.data);
      expect(validateDiscoveryEvidence(request, data)).toBe("");
      expect(data.findings[0].title).toBe(
        modelOutput(request).findings[0].title,
      );
      expect(client.calls()).toBe(1);
      for (const evidence of data.findings[0].evidence) {
        expect(evidence.documentId).toBeTruthy();
        expect(evidence.passageId).toBeTruthy();
        expect(
          discoverySourceDocuments(request.context.foundation).some((item) =>
            item.text.includes(evidence.excerpt),
          ),
        ).toBe(true);
      }
    }
  });
}

test("source IDs survive filename and harmless formatting changes; canonical matches resolve original text", () => {
  const body = pipelineCampaigns.renamed;
  const withoutImportNotes = buildSourceRegistry(
    `Source: independent.docx\nExtraction: Word text only.\n${body}`,
  );
  expect(withoutImportNotes.documents[0].originalText).toBe(body);
  expect(withoutImportNotes.passages[0].text).toContain(
    "Project name: Cedar Cycle Membership",
  );
  const a = buildSourceRegistry(
    "Source: alpha.docx\nExtraction: Word\nImport notes: local\n\nCampaign: Sample\n\nProof: A\u00a0“supported”\ncapability.",
  );
  const b = buildSourceRegistry(
    'Source: renamed.docx\nExtraction: Word\nImport notes: other\n\nCampaign: Sample\n\nProof: A "supported" capability.',
  );
  expect(a.documents[0].id).toBe(b.documents[0].id);
  expect(a.passages.map((item) => item.id)).toEqual(
    b.passages.map((item) => item.id),
  );
  expect(
    originalSourceExcerpt(
      "A\u00a0“supported”\ncapability.",
      'A "supported" capability.',
    ),
  ).toMatchObject({
    excerpt: "A\u00a0“supported”\ncapability.",
    method: "format_normalized",
  });
  expect(
    originalSourceExcerpt(
      "A supported capability.",
      "A guaranteed capability.",
    ),
  ).toBeUndefined();
});

test("format normalization matches the first occurrence when a phrase appears multiple times", () => {
  const source =
    "A\u00a0“supported” capability in section 1. Other context. A\u00a0“supported” capability in section 2.";
  const match = originalSourceExcerpt(source, 'A "supported" capability');
  expect(match).toMatchObject({
    excerpt: "A\u00a0“supported” capability",
    method: "format_normalized",
    start: 0,
  });
});

test("format normalization never changes attribution, source meaning or page", () => {
  const request = requestFor(pipelineCampaigns.wrappedPdf);
  const source = discoverySourceDocuments(request.context.foundation).find(
    (item) => item.locator === "imc:page:1",
  )!;
  const output = modelOutput(request);
  output.findings[0].evidence = [
    {
      source: source.documentId!,
      locator: source.passageId!,
      excerpt:
        "Scheduled maintenance is included at participating service locations; replacement parts are excluded.",
      audience: "Not supplied",
      date: "Not supplied",
      context: "A supplied claim, not approval.",
      accessScope: "supplied",
    },
  ];
  const normalized = normalizeDiscoveryEvidenceMetadata(
    request,
    output,
  ) as typeof output;
  expect(normalized.findings[0].evidence[0]).toMatchObject({
    matchMethod: "format_normalized",
    locator: "imc:page:1",
    excerpt:
      "Scheduled maintenance is included at\nparticipating service locations; replacement parts are excluded.",
  });
  expect(validateDiscoveryEvidence(request, normalized)).toBe("");
  const wrong = structuredClone(normalized);
  wrong.findings[0].evidence[0].locator = "imc:page:2";
  expect(validateDiscoveryEvidence(request, wrong)).toContain("locator");
  wrong.findings[0].evidence[0].locator = "imc:page:1";
  wrong.findings[0].evidence[0].documentId = "doc-forged";
  expect(validateDiscoveryEvidence(request, wrong)).toContain("source");
  const invented = structuredClone(normalized);
  invented.findings[0].whatWeFound =
    "A customer said “It solves every problem.”";
  expect(validateDiscoveryEvidence(request, invented)).toContain("unsupported");
});

test("ambiguous citations and unregistered generated proposals remain rejected", () => {
  const request = requestFor(pipelineCampaigns.missing);
  request.context.foundation.suppliedEvidence = [
    {
      id: "a",
      source: "Research report",
      locator: "doc:1",
      text: "A limited source observation.",
      date: "Not supplied",
      audience: "Not supplied",
      accessScope: "supplied",
    },
    {
      id: "b",
      source: "Research report",
      locator: "doc:1",
      text: "A limited source observation.",
      date: "Not supplied",
      audience: "Not supplied",
      accessScope: "supplied",
    },
  ];
  expect(
    resolveDiscoveryCitation(
      discoverySourceDocuments(request.context.foundation),
      {
        source: "Research report",
        locator: "doc:1",
        excerpt: "A limited source observation.",
      },
    ),
  ).toBeUndefined();
  const bad = modelOutput(request);
  bad.findings[0].evidence[0] = {
    source: "Generated Spark",
    locator: "spark:1",
    excerpt: "A generated creative possibility.",
    date: "Not supplied",
    audience: "Not supplied",
    context: "Proposal, not source.",
    accessScope: "supplied",
  };
  expect(validateDiscoveryEvidence(request, bad)).toContain(
    "cannot be verified",
  );
});

test("a partial model response preserves validated findings, reports the failed field and does not invent replacements", async () => {
  const request = requestFor(pipelineCampaigns.renamed);
  const mixed = modelOutput(request);
  mixed.findings.push({
    ...structuredClone(mixed.findings[0]),
    title: "An invalid second finding",
    evidence: [
      { ...mixed.findings[0].evidence[0], source: "Unregistered source" },
    ],
  });
  const client = createOfflineModelClient([
    JSON.stringify(mixed),
    JSON.stringify(mixed),
  ]);
  const response = await generateAgentResponse(request, client.sdk);
  const data = outputSchemas.discovery.parse(response.data);
  expect(data.findings).toHaveLength(1);
  expect(data.findings[0].title).toBe(mixed.findings[0].title);
  expect(data.validationIssues?.[0]).toMatchObject({
    path: "findings[1]",
    message: expect.stringContaining("findings[1].evidence[0].source"),
  });
  expect(data.retrievalNote).toContain("withheld");
  expect(client.calls()).toBe(2);
});

test("total failure remains actionable and cannot replace earlier valid findings", async () => {
  const request = requestFor(pipelineCampaigns.renamed);
  const previous = modelOutput(request);
  const unchanged = structuredClone(previous);
  const bad = structuredClone(previous);
  bad.findings[0].evidence[0].excerpt = "An invented claim not in this source.";
  const client = createOfflineModelClient([
    JSON.stringify(bad),
    JSON.stringify(bad),
  ]);
  await expect(
    generateAgentResponse(request, client.sdk),
  ).rejects.toMatchObject({
    code: "discovery_evidence_validation_failed",
    message: expect.stringContaining("findings[0].evidence[0].excerpt"),
  });
  expect(previous).toEqual(unchanged);
});

test("Consumer cannot pass an analogous-case gap as its audience finding", () => {
  const request = requestFor(pipelineCampaigns.renamed);
  const bad = modelOutput(requestFor(pipelineCampaigns.renamed, "analogous"));
  bad.findings[0].title = "No documented analogous case is supplied";
  expect(validateDiscoveryEvidence(request, bad)).toContain(
    "analogous-case gap",
  );
});

test("unknown documents stop before generation; ambiguous fields and human edits never gain source approval", () => {
  const before = emptyStudio();
  expect(() =>
    buildStudioCampaign(
      before,
      pipelineCampaigns.unusable,
      "Review this document",
    ),
  ).toThrow("No usable campaign context");
  expect(before).toEqual(emptyStudio());
  const upstream = extractUpstream(pipelineCampaigns.renamed);
  upstream.fields.audience = {
    ...upstream.fields.audience,
    value: "Kevin's edited audience",
    status: "Needs clarification",
  };
  const model = canonicalCampaign({
    sourceBrief: pipelineCampaigns.renamed,
    requirements: upstream,
    proposedJTBD: "An agent-proposed job.",
  });
  expect(model.humanEdits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "audience",
        value: expect.objectContaining({
          origin: "human_edit",
          approval: "not_approved",
        }),
      }),
    ]),
  );
  expect(model.suggestions[0].value).toMatchObject({
    origin: "ai_suggestion",
    approval: "not_approved",
    references: [],
  });
  expect(model.fields.audiences.values[0].value).not.toContain("Kevin");
  const conflicting = canonicalCampaign({
    sourceBrief:
      "Campaign: Alpha\nCampaign: Beta\nObjective: Explain the service.",
    requirements: extractUpstream(
      "Campaign: Alpha\nCampaign: Beta\nObjective: Explain the service.",
    ),
  });
  expect(conflicting.fields.campaignName.state).toBe("needs_review");
});

test("tampered canonical passages fail source validation before a model can run", () => {
  const request = requestFor(pipelineCampaigns.renamed);
  request.context.foundation.canonicalCampaign!.sourceRegistry.passages[0].text +=
    " Invented proof.";
  expect(discoverySubmissionIssue(request)).toContain("canonical campaign");
});

test("human clarification preserves source integrity and stale derived suggestions are recomputed, not trusted", () => {
  const request = requestFor(pipelineCampaigns.renamed);
  const foundation = request.context.foundation;
  foundation.requirements.fields.audience.value =
    "Human audience clarification";
  foundation.requirements.fields.audience.status = "Needs clarification";
  foundation.campaignContext = {
    ...foundation.campaignContext,
    ...sourceContext(foundation.requirements),
  };
  foundation.canonicalCampaign!.suggestions.push({
    field: "jtbd",
    value: {
      value: "An obsolete derived suggestion",
      origin: "ai_suggestion",
      approval: "not_approved",
      references: [],
    },
  });
  expect(discoverySubmissionIssue(request)).toBeUndefined();
  const payload = JSON.parse(buildAgentPrompt(request).input);
  expect(payload.inputPack.canonicalCampaign).toEqual(
    canonicalCampaign(foundation),
  );
  expect(payload.inputPack.canonicalCampaign.humanEdits).toContainEqual(
    expect.objectContaining({ field: "audience" }),
  );
  expect(JSON.stringify(payload.inputPack.canonicalCampaign)).not.toContain(
    "obsolete derived suggestion",
  );
  expect(foundation.sourceBrief).toBe(pipelineCampaigns.renamed);
});

test("saved findings and exact source IDs survive persistence and explicit Finalize Strategy approval", async () => {
  const session = applyStudioSource(emptyStudio(), pipelineCampaigns.renamed);
  const pack = studioPack(session),
    state = seedStudioDiscovery(pack);
  expect(state.humanBriefLine).toBe("");
  for (const lens of lenses) {
    const request = requestFor(pipelineCampaigns.renamed, lens);
    const response = await generateAgentResponse(
      request,
      createOfflineModelClient([JSON.stringify(modelOutput(request))]).sdk,
    );
    const data = outputSchemas.discovery.parse(response.data),
      id = `test-${lens}`;
    const version: DiscoveryRunVersion = {
      id,
      number: 1,
      question: state.question,
      investigationType: "problem",
      action: "initial",
      guidance: "",
      createdAt: "2026-10-23T12:00:00Z",
      inputPackVersion: inputPackVersion(pack),
      inputPackSnapshot: structuredClone(pack),
      sourceCoverage: [],
      provider: "mock",
      findings: data.findings.map((finding, index) => ({
        ...finding,
        id: `${id}-${index}`,
        researchRunId: id,
        lensId: lens,
        runVersion: 1,
        inputPackVersion: inputPackVersion(pack),
        createdAt: "2026-10-23T12:00:00Z",
      })),
    };
    const run = state.runs.find((run) => run.lensId === lens)!;
    run.versions = [version];
    run.currentVersionId = id;
    run.status = "complete";
    state.savedFindingIds.push(...version.findings.map(discoveryFindingRef));
  }
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  writeDiscoveryDraft(storage, pack, state);
  const restored = readDiscoveryDraft(storage, pack)!;
  expect(restored.savedFindingIds).toEqual(state.savedFindingIds);
  expect(
    restored.runs[0].versions[0].findings[0].evidence[0].documentId,
  ).toBeTruthy();
  restored.humanBriefLine = "Kevin's exact human-authored test strategy.";
  const approved = approveDiscoveryCanvas(
    studioStrategySession(session, restored),
    pack,
    restored,
    restored.humanBriefLine,
  ).approved!;
  const brief = buildStudioBriefInput(approved, restored);
  expect(brief.briefLine).toBe(restored.humanBriefLine);
  expect(brief.selectedAgentFindings).toHaveLength(5);
  expect(brief.selectedAgentFindings[0].evidence[0].documentId).toBe(
    restored.runs[0].versions[0].findings[0].evidence[0].documentId,
  );
});

test("actual Gateway IMC is input; completed creative brief is a separate reference only", async () => {
  const imcPath = process.env.XC_GATEWAY_IMC_DOCX,
    referencePath = process.env.XC_GATEWAY_REFERENCE_DOCX;
  test.skip(
    !imcPath || !referencePath,
    "Supply both approved local DOCX paths for this local-source check.",
  );
  const imc = execFileSync(
    "/usr/bin/textutil",
    ["-convert", "txt", "-stdout", imcPath!],
    { encoding: "utf8" },
  );
  const reference = execFileSync(
    "/usr/bin/textutil",
    ["-convert", "txt", "-stdout", referencePath!],
    { encoding: "utf8" },
  );
  const session = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), imc),
    "Gateway IMC Brief – Revised for Helix Test",
  );
  const input = discoveryFoundation(studioPack(session));
  expect(input.sourceBrief).toBe(imc);
  expect(input.sourceBrief).not.toContain("5G Battery Back-Up");
  expect(input.sourceBrief).not.toContain(
    "BRIEF: Show how the Gateway quietly makes everyday WiFi work better.",
  );
  expect(input.canonicalCampaign!.fields.rtbs.values[0].value).toContain(
    "More built-in security",
  );
  const independentReference = canonicalCampaign({
    sourceBrief: reference,
    requirements: extractUpstream(reference),
  });
  expect(independentReference.fields.rtbs.values[0].value).toContain(
    "5G Battery Back-Up",
  );
  expect(independentReference.sourceRegistry.documents[0].id).not.toBe(
    input.canonicalCampaign!.sourceRegistry.documents[0].id,
  );
  for (const lens of lenses) {
    const request = requestFor(imc, lens);
    expect(discoverySubmissionIssue(request)).toBeUndefined();
    const payload = JSON.parse(buildAgentPrompt(request).input);
    expect(payload.inputPack.sourceBrief).toBe(imc);
    expect(JSON.stringify(payload.canonicalCampaign)).not.toContain(
      "5G Battery Back-Up",
    );
    const response = await generateAgentResponse(
      request,
      createOfflineModelClient([JSON.stringify(modelOutput(request))]).sdk,
    );
    expect(response.provider).toBe("mock");
    expect(
      validateDiscoveryEvidence(
        request,
        outputSchemas.discovery.parse(response.data),
      ),
    ).toBe("");
  }
  const parsedIMC = parseIMCBrief(imc),
    upstream = extractUpstream(parsedIMC);
  for (const agentType of ["rtb", "research", "sparks"] as const) {
    const request = requestSchema.parse({
      agentType,
      context: { parsedIMC, upstream },
    });
    const generated = await generateMock(request);
    const wire =
      "sparks" in generated
        ? {
            sparks: generated.sparks.map(
              ({
                territory_type,
                title,
                territory,
                idea,
                excerpt,
                rationale,
                hypothesis,
              }) => ({
                territory_type,
                title,
                territory,
                idea,
                excerpt,
                rationale,
                hypothesis,
              }),
            ),
          }
        : generated;
    const model = createOfflineModelClient([JSON.stringify(wire)]);
    const response = await generateAgentResponse(request, model.sdk);
    expect(model.calls()).toBe(1);
    expect(response.provider).toBe("mock");
    expect(outputSchemas[agentType].safeParse(response.data).success).toBe(
      true,
    );
    const prompt = String(model.requests()[0].input);
    expect(prompt).toContain(
      agentType === "sparks"
        ? "REGISTERED CAMPAIGN CONTEXT"
        : "canonicalCampaign",
    );
    expect(prompt).toContain("sourceRegistry");
    expect(prompt).not.toContain("5G Battery Back-Up");
  }
});
