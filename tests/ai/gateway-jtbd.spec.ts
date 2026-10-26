import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { generateAgentResponse } from "../../lib/ai/provider";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { discoverySubmissionIssue } from "../../lib/ai/discovery-submission";
import { rtbOutputIssue } from "../../lib/ai/rtb-quality";
import {
  outputSchemas,
  rtbGenerationSchema,
  requestSchema,
  type AgentDataMap,
} from "../../lib/ai/schemas";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream, getUpstream, resolveRtb } from "../../lib/upstream";
import { preparationText } from "../../lib/ai/format";
import { studioPreparationIssue } from "../../lib/preparation";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import {
  preparationCardState,
  selectedJtbdFraming,
} from "../../lib/input-pack-presentation";
import { discoveryFoundation } from "../../lib/discovery-context";
import { foundationPack } from "../../lib/ai/context";
import { stageCampaignRebuild } from "../../lib/campaign-rebuild";
import { seedStudioDiscovery, studioPack } from "../../lib/discovery-studio";
import {
  preserveRestoredWorkspace,
  saveWorkspaceDraft,
} from "../../lib/workspace-suggestions";

const source = readFileSync(
  path.join(__dirname, "../fixtures/client-input-pack/gateway_source_text.txt"),
  "utf8",
);
const upstream = extractUpstream(source);
const request = {
  agentType: "rtb" as const,
  context: { parsedIMC: parseIMCBrief(source), upstream },
};
// Deliberate model response fixture. Never used as a production fallback.
const proposedJTBD =
  "When I feel my existing WiFi is good enough and distrust an upgrade offer, I want to understand its useful benefits and requirements, so I can decide whether upgrading my Gateway is worth changing what already works.";
const adaptation =
  "Show the Gateway's supplied security, home awareness and family controls through everyday household moments. This is a proposed creative interpretation; upgrade eligibility and pricing require confirmation.";
function output(): AgentDataMap["rtb"] {
  return {
    originalRtb: resolveRtb(upstream).field.sourceValue,
    originalRtbStatus: "supplied",
    originalRtbApprovalStatus: "unknown",
    xcAdaptation: adaptation,
    proposedJTBD,
    adaptationStatus: "not_approved",
    reviewNotes: [
      "Source: Gateway IMC Brief – Revised for Helix Test; Background, Target Audience and RTBs. JTBD is an interpretation.",
    ],
    evidenceGaps: [
      "Confirm upgrade eligibility and pricing before advertising a free upgrade.",
    ],
  };
}
function fixture() {
  const result = phase1Fixture("gateway_source_text.txt");
  result.versions.reasonToBelieve.data = output();
  result.versions.reasonToBelieve.text = preparationText(output());
  return result;
}
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

test("plural RTB headings and cached pre-fix extractions retain supplied proof", () => {
  for (const heading of ["RTB", "RTBs", "Reasons to Believe (RTBs)"]) {
    const changed = source.replace("RTBs:", `${heading}:`);
    expect(resolveRtb(extractUpstream(changed)).field.sourceValue).toContain(
      "More built-in security",
    );
  }
  const { session } = fixture();
  session.preparation.parsedIMC = {
    ...parseIMCBrief(source),
    parserVersion: 5,
    fields: {
      ...parseIMCBrief(source).fields,
      reason_to_believe: {
        ...parseIMCBrief(source).fields.reason_to_believe,
        value: "Not supplied.",
        sourceValue: "",
        status: "Not supplied",
        note: "Old extraction",
      },
    },
  };
  expect(
    resolveRtb(getUpstream(session.preparation)).field.sourceValue,
  ).toContain("More built-in security");
  expect(session.preparation.sourceSnapshot).toBe(source);
});

test("actual Gateway DOCX matches the approved text fixture, including barriers and all four RTBs", () => {
  const docx = process.env.XC_GATEWAY_DOCX;
  test.skip(
    !docx,
    "Set XC_GATEWAY_DOCX to the approved local Gateway IMC Brief KM.docx.",
  );
  const extracted = execFileSync(
    "/usr/bin/textutil",
    ["-convert", "txt", "-stdout", docx!],
    { encoding: "utf8" },
  );
  const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
  expect(normalized(extracted)).toBe(normalized(source));
  expect(upstream.fields.objective.value).toContain("Reduce churn");
  expect(upstream.fields.audience.value).toContain(
    "older eligible Gateway equipment",
  );
  expect(source).toContain("bait and switch");
  for (const benefit of [
    "More built-in security",
    "More peace of mind",
    "More family tools",
    "More intelligently sharing",
  ])
    expect(resolveRtb(upstream).field.sourceValue).toContain(benefit);
});

test("real generation path returns distinct agent proposals and preserves source facts without a network client", async () => {
  const client = createOfflineModelClient([JSON.stringify(output())]);
  const response = await generateAgentResponse(request, client.sdk);
  expect(response.provider).toBe("mock");
  const expected = output();
  expect(response.data).toEqual({
    ...expected,
    reviewNotes: [...expected.reviewNotes, resolveRtb(upstream).approvalNote],
  });
  expect(client.calls()).toBe(1);
  expect(client.requests()[0].instructions).toContain(
    "When I ..., I want to ..., so I can ...",
  );
  expect(JSON.stringify(client.requests()[0].input)).toContain(
    "bait and switch",
  );
  expect(response.promptTemplateVersion).toBe("xc-rtb-3.3");
});

for (const field of ["proposedJTBD", "xcAdaptation"] as const)
  test(`missing ${field} fails generation and readiness; no fabricated replacement`, async () => {
    const bad = { ...output(), [field]: null };
    const client = createOfflineModelClient([JSON.stringify(bad)]);
    await expect(
      generateAgentResponse(request, client.sdk),
    ).rejects.toMatchObject({ code: "rtb_output_incomplete" });
    expect(client.calls()).toBe(1);
    const { session, versions } = fixture();
    versions.reasonToBelieve.data = bad;
    expect(
      studioPreparationIssue(session.preparation, "reasonToBelieve"),
    ).toContain(
      field === "xcAdaptation" ? "no XC adaptation" : "no proposed JTBD",
    );
    expect(preparationCardState(session, "reasonToBelieve", "mock").state).toBe(
      "failed",
    );
    expect(studioPack(session).proposedRTB).toBe("");
    expect(studioPack(session).proposedJTBD).toBeUndefined();
  });

test("inadequate source context remains an explicit gap; copied objectives and missing new jobs are rejected", () => {
  const sparse = extractUpstream("Campaign: Sparse source\nRTB: Not supplied");
  const absent: AgentDataMap["rtb"] = {
    ...output(),
    originalRtb: null,
    originalRtbStatus: "not_supplied",
    xcAdaptation: null,
    proposedJTBD: null,
    evidenceGaps: ["Audience and objective not supplied."],
  };
  expect(rtbOutputIssue(absent, sparse, true)).toBeUndefined();
  expect(
    rtbOutputIssue(
      { ...output(), proposedJTBD: upstream.fields.objective.sourceValue },
      upstream,
      true,
    ),
  ).toContain("repeats the campaign objective");
  const legacy = { ...output() };
  delete legacy.proposedJTBD;
  expect(outputSchemas.rtb.safeParse(legacy).success).toBe(true);
  expect(rtbGenerationSchema.safeParse(legacy).success).toBe(false);
});

test("selected Gateway job survives handoff, is never original evidence, and does not populate the human line", () => {
  const { session } = fixture();
  const pack = studioPack(session);
  expect(pack.originalJTBD).toBe("");
  expect(pack.jtbdContext?.original).toEqual([]);
  expect(pack.proposedJTBD).toBe(proposedJTBD);
  expect(pack.proposedRTB).toBe(adaptation);
  expect(selectedJtbdFraming(pack).text).toBe(proposedJTBD);
  const foundation = discoveryFoundation(pack);
  expect(foundation.campaignContext.jobToBeDone).toBeUndefined();
  expect(foundation.proposedJTBD).toBe(proposedJTBD);
  expect(foundationPack(foundation).proposedJTBD).toBe(proposedJTBD);
  for (const lens of [
    "consumer",
    "culture",
    "category",
    "brand",
    "analogous",
  ] as const) {
    const discoveryRequest = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation,
        lens,
        investigationType: "problem",
        question: "Which supplied barrier needs investigation?",
        action: "initial",
        previousFindings: [],
      },
    });
    if (discoveryRequest.agentType !== "discovery")
      throw Error("Expected Discovery request");
    expect(discoverySubmissionIssue(discoveryRequest)).toBeUndefined();
    expect(discoveryRequest.context.foundation.proposedJTBD).toBe(proposedJTBD);
  }
  const state = seedStudioDiscovery(pack);
  expect(state.workingJTBD).toBe(proposedJTBD);
  expect(state.humanBriefLine).toBe("");
  expect(state.workspaceSuggestionContext!.fields.workingJTBD.label).toContain(
    "not original or approved",
  );
  const saved = saveWorkspaceDraft({
    ...state,
    humanBriefLine: "Kevin's exact human line.",
    workingJTBD: "Kevin's edited job.",
  });
  const reopened = preserveRestoredWorkspace(saved);
  expect(reopened.humanBriefLine).toBe("Kevin's exact human line.");
  expect(reopened.workingJTBD).toBe("Kevin's edited job.");
  expect(reopened.fieldVersions).toEqual(saved.fieldVersions);
  session.selectedRtbVersionId = "";
  expect(studioPack(session).proposedJTBD).toBeUndefined();
  for (const campaign of [
    "movers_source_text.txt",
    "xfinity_pro_source_text.txt",
  ]) {
    const other = studioPack(phase1Fixture(campaign).session);
    expect(other.proposedJTBD).toBeUndefined();
    expect(other.reasonToBelieve).not.toContain("More family tools");
  }
});

test("explicit original JTBD stays separate from a selected proposal", () => {
  const original =
    "When I manage my home, I want to understand my equipment, so I can make an informed choice.";
  const { session, versions } = phase1Fixture(
    "gateway_source_text.txt",
    source + "\nJTBD: " + original,
  );
  const data = {
    ...output(),
    originalRtb: resolveRtb(getUpstream(session.preparation)).field.sourceValue,
  };
  versions.reasonToBelieve.data = data;
  const pack = studioPack(session);
  expect(pack.originalJTBD).toBe(original);
  expect(pack.proposedJTBD).toBe(proposedJTBD);
  expect(seedStudioDiscovery(pack).workingJTBD).toBe(proposedJTBD);
});

test("rebuild does not select a changed JTBD just because its RTB adaptation is unchanged", async () => {
  const { session, versions } = fixture();
  const rebuilt = await stageCampaignRebuild(
    session,
    async ({ agentId }) => {
      const next = structuredClone(versions[agentId]);
      next.id = `fresh-${agentId}`;
      if (agentId === "reasonToBelieve")
        next.data = {
          ...output(),
          proposedJTBD:
            "When I consider upgrading, I want to understand the requirements, so I can decide with confidence.",
        };
      return next;
    },
    "mock",
  );
  expect(rebuilt.selectedRtbVersionId).toBe("");
  expect(studioPack(rebuilt).proposedJTBD).toBeUndefined();
  expect(studioPack(session).proposedJTBD).toBe(proposedJTBD);
});

test("mock preparation also supplies a distinct JTBD without credentials", async () => {
  const response = await generateAgentResponse(request);
  const data = outputSchemas.rtb.parse(response.data);
  expect(data.proposedJTBD).toMatch(/^When I.+I want to.+so I can/);
  expect(data.originalRtb).toBe(resolveRtb(upstream).field.sourceValue);
  expect(data.adaptationStatus).toBe("not_approved");
});

test("a proposed job can be selected without manufacturing absent RTBs", async () => {
  const noProof =
    "Campaign: Equipment review\nObjective: Help customers understand equipment choices.\nAudience: Existing customers considering an equipment change.\nRTBs: Not supplied.";
  const { session, versions } = phase1Fixture(
    "gateway_source_text.txt",
    noProof,
  );
  const response = await generateAgentResponse({
    agentType: "rtb",
    context: {
      parsedIMC: parseIMCBrief(noProof),
      upstream: extractUpstream(noProof),
    },
  });
  const data = outputSchemas.rtb.parse(response.data);
  expect(data.originalRtb).toBe("Not supplied.");
  expect(data.originalRtbStatus).toBe("not_supplied");
  expect(data.xcAdaptation).toBeNull();
  expect(data.proposedJTBD?.trim()).toBeTruthy();
  versions.reasonToBelieve.data = data;
  versions.reasonToBelieve.text = preparationText(data);
  expect(
    studioPreparationIssue(session.preparation, "reasonToBelieve"),
  ).toBeUndefined();
  const pack = studioPack(session);
  expect(pack.proposedJTBD).toBe(data.proposedJTBD);
  expect(pack.proposedRTB).toBe("");
  expect(pack.reasonToBelieve).toMatch(/not supplied/i);
  expect(pack.originalJTBD).toBe("");
});

for (const [variation, job] of [
  [
    "When my",
    "When my existing WiFi feels good enough and upgrade offers seem suspicious, I want to understand the Gateway benefits and conditions, so I can decide whether changing equipment makes sense.",
  ],
  [
    "want without to",
    "When I consider upgrading my Gateway, I want clarity about its benefits and conditions, so I can make a confident decision.",
  ],
  [
    "so that",
    "When I consider a Gateway upgrade, I want to understand its benefits and requirements, so that I can decide whether it is worth changing what works.",
  ],
  [
    "contractions",
    "When I’m wary of changing equipment that works, I’d like clear information about the Gateway benefits and conditions so I can decide confidently.",
  ],
  [
    "need",
    "When my current Gateway works, I need a trustworthy explanation of what upgrading changes, so I can weigh the useful benefits against disruption.",
  ],
  [
    "audience narrative",
    "Existing customers need to understand what a Gateway upgrade changes and which conditions apply before they can decide whether the added household benefits justify changing equipment that already works.",
  ],
] as const)
  test(`complete agent JTBD with ${variation} survives validation verbatim`, async () => {
    const client = createOfflineModelClient([
      JSON.stringify({ ...output(), proposedJTBD: job }),
    ]);
    const response = await generateAgentResponse(request, client.sdk);
    const data = outputSchemas.rtb.parse(response.data);
    expect(data.proposedJTBD).toBe(job);
    expect(data.originalRtb).toBe(resolveRtb(upstream).field.sourceValue);
    expect(data.adaptationStatus).toBe("not_approved");
    expect(client.calls()).toBe(1);
  });

for (const placeholder of [
  " ",
  "Not supplied.",
  "No original JTBD supplied.",
  "No separate proposed JTBD recorded.",
  "When I…, I want to…, so I can…",
])
  test(`a placeholder is not a completed JTBD: ${placeholder.trim() || "whitespace"}`, async () => {
    const client = createOfflineModelClient([
      JSON.stringify({ ...output(), proposedJTBD: placeholder }),
    ]);
    await expect(
      generateAgentResponse(request, client.sdk),
    ).rejects.toMatchObject({ code: "rtb_output_incomplete" });
    expect(client.calls()).toBe(1);
  });

test("Gateway rebuild recovers from the screenshot's old extraction without discarding valid natural JTBD wording", async () => {
  const { session, versions } = fixture();
  // The previous parser recorded no proof and this saved V0 predates JTBD.
  versions.reasonToBelieve.data = {
    ...output(),
    originalRtb: null,
    originalRtbStatus: "not_supplied",
    xcAdaptation: null,
    proposedJTBD: undefined,
  };
  versions.reasonToBelieve.text = "Saved pre-fix RTB analysis.";
  const before = structuredClone(session);
  expect(
    studioPreparationIssue(session.preparation, "reasonToBelieve"),
  ).toContain("original RTB does not match");
  const replacementVersion = (agentId: keyof typeof versions) => ({
    ...structuredClone(versions[agentId]),
    id: `replacement-${agentId}`,
  });
  // A real absence still fails atomically and keeps the old workspace intact.
  await expect(
    stageCampaignRebuild(
      session,
      async ({ agentId }) => {
        const next = replacementVersion(agentId);
        if (agentId === "reasonToBelieve")
          next.data = { ...output(), proposedJTBD: null };
        return next;
      },
      "mock",
    ),
  ).rejects.toThrow("no proposed JTBD");
  expect(session).toEqual(before);

  const naturalJob =
    "When my current WiFi feels good enough, I want a trustworthy explanation of what a Gateway upgrade changes, so that I can decide whether the benefits fit my household.";
  const client = createOfflineModelClient([
    JSON.stringify({ ...output(), proposedJTBD: naturalJob }),
  ]);
  const rebuilt = await stageCampaignRebuild(
    session,
    async ({ agentId }) => {
      const next = replacementVersion(agentId);
      if (agentId === "reasonToBelieve") {
        const response = await generateAgentResponse(request, client.sdk);
        next.data = response.data;
        next.text = preparationText(response.data);
      }
      return next;
    },
    "mock",
  );
  expect(
    studioPreparationIssue(rebuilt.preparation, "reasonToBelieve"),
  ).toBeUndefined();
  expect(
    rebuilt.preparation.outputs.find(
      (item) => item.agentId === "reasonToBelieve",
    )!.versions[0].data,
  ).toMatchObject({
    proposedJTBD: naturalJob,
    originalRtb: resolveRtb(upstream).field.sourceValue,
  });
  rebuilt.selectedRtbVersionId = "replacement-reasonToBelieve";
  const pack = studioPack(rebuilt);
  expect(pack.proposedJTBD).toBe(naturalJob);
  expect(pack.originalJTBD).toBe("");
  expect(seedStudioDiscovery(pack).workingJTBD).toBe(naturalJob);
  expect(seedStudioDiscovery(pack).humanBriefLine).toBe("");
  expect(session).toEqual(before);
  expect(client.calls()).toBe(1);
});
