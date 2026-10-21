import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  packageDiscoveryBrief,
  prefillWorkspaceSuggestions,
  seedStudioDiscovery,
  studioStrategySession,
  readStudio,
} from "../../lib/discovery-studio";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import { discoveryFoundation as selectedFoundation } from "../../lib/discovery-context";
import { requestSchema } from "../../lib/ai/schemas";
import {
  normalizeDiscoveryEvidenceMetadata,
  validateDiscoveryEvidence,
} from "../../lib/ai/discovery-evidence";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import {
  mobileIMCBrief,
  mobileReasonToBelieve,
} from "../fixtures/mobile-imc-brief";
import { buildBriefDocument } from "../../lib/brief-document";
import { buildAgentPrompt } from "../../lib/ai/prompts";

test("input preparation has dedicated evidence synthesis and sourced inspiration roles", () => {
  const foundation = selectedFoundation(
    studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief)),
  );
  for (const preparationRole of [
    "data_synthesis",
    "evidence_sparks",
  ] as const) {
    const request = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation,
        preparationRole,
        lens: preparationRole === "data_synthesis" ? "consumer" : "analogous",
        investigationType: "problem",
        question: "What does the source establish?",
        action: "initial",
        previousFindings: [],
      },
    });
    const prompt = buildAgentPrompt(request);
    expect(prompt.instructions).toContain(
      preparationRole === "data_synthesis"
        ? "DATA ANALYSIS & SYNTHESIS"
        : "EVIDENCE-LED SPARKS",
    );
    expect(prompt.instructions).not.toContain("CONSUMER / AUDIENCE LENS");
    expect(prompt.input).toContain(JSON.stringify(mobileIMCBrief));
  }
});

test("Discovery accepts a complete source without requiring prepared research or creative Sparks", () => {
  const session = applyStudioSource(emptyStudio(), mobileIMCBrief),
    pack = studioPack(session);
  expect(pack.reasonToBelieve).toBe(mobileReasonToBelieve);
  expect(pack.rtbApprovalStatus).toBe("unknown");
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: selectedFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question: "What explains uncertainty?",
      action: "initial",
      previousFindings: [],
    },
  });
  expect(request.context).toHaveProperty("foundation.selectedSparks", []);
});
test("the initial Input Pack seeds editable Working Space suggestions without approving them", () => {
  const session = applyStudioSource(emptyStudio(), mobileIMCBrief);
  const pack = studioPack(session);
  const state = seedStudioDiscovery(pack);
  // Every box this brief can support starts from plain Input Pack text.
  for (const key of [
    "problemStatement",
    "workingAudience",
    "workingJTBD",
    "workingRTB",
    "evidenceInsights",
    "strategicDirection",
    "openQuestions",
    "executionConsiderations",
  ] as const)
    expect(state[key]?.trim(), key).toBeTruthy();
  expect(state.workingRTB).toBe(mobileReasonToBelieve);
  // The supplied consumer tension starts the Insight box, without a wrapper.
  expect(state.evidenceInsights).toBe(
    "People want mobile connectivity to support their lives without having to spend unnecessary time thinking about their phone plans.",
  );
  expect(state.problemStatement).toContain("Increase awareness");
  expect(state.humanBriefLine).toBe("");
  expect(
    state.workspaceSuggestionContext!.originalFields!.humanBriefLine.value,
  ).toBe("Your phone does a lot. Your mobile choice should feel simple.");
  // No timeline is supplied: the box stays empty instead of holding filler.
  expect(state.wholeBrief?.timelines).toBe("");
  expect(
    state.workspaceSuggestionContext!.fields["wholeBrief.timelines"],
  ).toMatchObject({ kind: "missing" });
  expect(session.approved).toBeNull();

  const existing = {
    ...state,
    workspaceSuggestionsSeeded: undefined,
    humanBriefLine: "Kevin's own line",
    evidenceInsights: "",
    wholeBrief: { ...state.wholeBrief, objective: "Kevin's objective" },
  };
  const migrated = prefillWorkspaceSuggestions(existing, pack);
  expect(migrated.humanBriefLine).toBe("Kevin's own line");
  expect(migrated.wholeBrief?.objective).toBe("Kevin's objective");
  // Hydration is not new-draft initialization: the clear may be intentional.
  expect(migrated.evidenceInsights).toBe("");
  expect(
    prefillWorkspaceSuggestions({ ...migrated, evidenceInsights: "" }, pack)
      .evidenceInsights,
  ).toBe("");
});
test("manual evidence requires exact source, excerpt, locator and metadata", () => {
  const session = applyStudioSource(emptyStudio(), mobileIMCBrief);
  session.evidence = [
    {
      id: "interviews",
      source: "Campaign interviews",
      locator: "doc:interviews",
      text: "Participants described uncertainty when comparing plans.",
      date: "2026-10-01",
      audience: "Eligible customers",
      accessScope: "supplied",
    },
  ];
  const pack = studioPack(session),
    foundation = selectedFoundation(pack);
  expect(
    discoverySourceDocuments(foundation).find(
      (source) => source.identity === "Campaign interviews",
    )?.text,
  ).toBe(session.evidence[0].text);
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation,
      lens: "consumer",
      investigationType: "hypothesis",
      question: "Does comparison uncertainty matter?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery") throw new Error("Wrong request");
  const finding = {
    title: "A documented uncertainty",
    whatWeFound: "A supplied qualitative claim",
    evidence: [
      {
        source: "Campaign interviews",
        locator: "doc:interviews",
        excerpt: session.evidence[0].text,
        date: "2026-10-01",
        audience: "Eligible customers",
        context: "Supplied interviews",
        accessScope: "supplied" as const,
      },
    ],
    whyItMayMatter: "Possible barrier",
    whatComplicatesIt: "Not representative",
    questionToExplore: "How common is it?",
    evidenceState: "evidence_supported" as const,
  };
  expect(
    validateDiscoveryEvidence(request, {
      findings: [finding],
      retrievalNote: "Supplied evidence only",
    }),
  ).toBe("");
  expect(
    validateDiscoveryEvidence(request, {
      findings: [
        {
          ...finding,
          evidence: [
            { ...finding.evidence[0], excerpt: "Customers prefer Xfinity." },
          ],
        },
      ],
      retrievalNote: "Supplied evidence only",
    }),
  ).toContain("cannot be verified");
  expect(
    validateDiscoveryEvidence(request, {
      findings: [
        {
          ...finding,
          evidence: [{ ...finding.evidence[0], date: "2027-01-01" }],
        },
      ],
      retrievalNote: "Supplied evidence only",
    }),
  ).toContain("invents a source date");
  expect(request.context.foundation.campaignContext.audience).not.toBe(
    session.evidence[0].audience,
  );
  expect(
    validateDiscoveryEvidence(request, {
      findings: [
        {
          ...finding,
          evidence: [
            {
              ...finding.evidence[0],
              audience: request.context.foundation.campaignContext.audience,
            },
          ],
        },
      ],
      retrievalNote: "Supplied evidence only",
    }),
  ).toContain("invents source audience metadata");
  const normalized = normalizeDiscoveryEvidenceMetadata(request, {
    findings: [
      {
        ...finding,
        evidence: [
          {
            ...finding.evidence[0],
            date: "2027-01-01",
            audience: "Movers (paraphrased audience)",
          },
        ],
      },
    ],
    retrievalNote: "Supplied evidence only",
  });
  expect(validateDiscoveryEvidence(request, normalized)).toBe("");
  if (!("findings" in normalized)) throw new Error("Missing findings");
  expect(normalized.findings[0].evidence[0].audience).toBe(
    session.evidence[0].audience,
  );
  expect(normalized.findings[0].evidence[0].date).toBe(
    session.evidence[0].date,
  );
  const invented = normalizeDiscoveryEvidenceMetadata(request, {
    findings: [
      {
        ...finding,
        evidence: [
          { ...finding.evidence[0], excerpt: "Customers prefer Xfinity." },
        ],
      },
    ],
    retrievalNote: "Supplied evidence only",
  });
  expect(validateDiscoveryEvidence(request, invented)).toContain(
    "cannot be verified",
  );
});
test("human approval freezes the canvas and final packaging uses no generated strategy or private notes", () => {
  const session = applyStudioSource(emptyStudio(), mobileIMCBrief),
    pack = studioPack(session);
  const state = seedStudioDiscovery(pack);
  state.humanBriefLine = "Help households make an informed mobile decision.";
  state.notes = "Private thinking";
  state.wholeBrief = {
    deliverables: "One landing page",
    timelines: "To be agreed",
  };
  const approved = approveDiscoveryCanvas(
    studioStrategySession(session, state),
    pack,
    state,
    state.humanBriefLine,
  ).approved!;
  state.humanBriefLine = "A later draft";
  state.wholeBrief.deliverables = "Unapproved assets";
  const brief = packageDiscoveryBrief(approved, state);
  expect(
    brief.sections.find((section) => section.title === "Brief")?.content,
  ).toBe("Help households make an informed mobile decision.");
  expect(
    brief.sections.find((section) => section.title === "Deliverables")?.content,
  ).toBe("One landing page");
  expect(JSON.stringify(brief)).not.toContain("Private thinking");
  expect(brief.provider).toBe("manual");
  expect(buildBriefDocument(brief).status).toContain("HUMAN-APPROVED");
  expect(() =>
    packageDiscoveryBrief({ ...approved, approvalState: undefined }, state),
  ).toThrow("Approve");
});
test("existing creative sessions import their context while leaving the original saved session untouched", () => {
  const legacy = {
    preparation: applyStudioSource(emptyStudio(), mobileIMCBrief).preparation,
    step: 1,
    outputs: [{ agentId: "humor" }],
    selected: [{ text: "A generated old line" }],
  };
  const raw = JSON.stringify(legacy);
  const storage = {
    getItem: (key: string) => (key === "xc-strategy-session-v1" ? raw : null),
  };
  const migrated = readStudio(storage);
  expect(migrated.session.screen).toBe("inputs");
  expect(studioPack(migrated.session).reasonToBelieve).toBe(
    mobileReasonToBelieve,
  );
  expect(migrated.discovery.humanBriefLine).toBe("");
  expect(
    migrated.discovery.workspaceSuggestionContext!.originalFields!
      .humanBriefLine.value,
  ).toBeTruthy();
  expect(storage.getItem("xc-strategy-session-v1")).toBe(raw);
});
