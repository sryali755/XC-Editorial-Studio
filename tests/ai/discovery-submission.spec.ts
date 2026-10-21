import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { POST } from "../../app/api/ai/agent/route";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import {
  discoverySubmissionIssue,
  runValidatedAgentRequest,
} from "../../lib/ai/discovery-submission";
import {
  discoveryFoundation,
  discoveryFoundationVersion,
} from "../../lib/discovery-context";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { requestSchema, type AgentRequest } from "../../lib/ai/schemas";
import { sourceContext } from "../../lib/upstream";
import {
  generateDiscoveryVersion,
  inputPackVersion,
} from "../../lib/discovery";

const fixture = path.join(
  __dirname,
  "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
);
const fullText = readFileSync(fixture, "utf8");
const [movers, pro] = detectIMCCampaignScopes(fullText);

function requestFor(sourceBrief: string) {
  const pack = studioPack(applyStudioSource(emptyStudio(), sourceBrief));
  pack.selectedSparks = [
    {
      id: "selected-source-spark",
      text: "Examine the supplied mover or product message.",
      versionId: "offline-v0",
      version: 0,
      excerpt: sourceBrief.includes("Transfer your services in a snap")
        ? "Transfer your services in a snap"
        : "Prioritize A Device",
    },
  ];
  return requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question: "What could explain the selected campaign challenge?",
      action: "initial",
      previousFindings: [],
    },
    versionNumber: 1,
  }) as Extract<AgentRequest, { agentType: "discovery" }>;
}

function findingFor(sourceBrief: string) {
  const request = requestFor(sourceBrief);
  return {
    ...mockDiscovery(request).findings[0],
    id: "current-source-finding",
    lensId: "consumer" as const,
    inputPackVersion: discoveryFoundationVersion(request.context.foundation),
    runVersion: 1,
  };
}

test.beforeEach(() => {
  process.env.AI_MODE = "mock";
  process.env.OPENAI_API_KEY = "";
  process.env.XC_OFFLINE_TEST = "1";
});

test("both selected PDF campaigns pass server-side consistency checks", () => {
  expect(movers?.sourceText).toBeTruthy();
  expect(pro?.sourceText).toBeTruthy();
  expect(
    discoverySubmissionIssue(requestFor(movers.sourceText)),
  ).toBeUndefined();
  expect(discoverySubmissionIssue(requestFor(pro.sourceText))).toBeUndefined();
});

test("Discovery rejects mismatched selected, previous and peer findings before provider invocation", async () => {
  const base = requestFor(movers.sourceText);
  const valid = findingFor(movers.sourceText);
  const other = findingFor(pro.sourceText);
  const tampered = [
    {
      ...base,
      context: { ...base.context, selectedFinding: other },
    },
    {
      ...base,
      context: {
        ...base.context,
        previousFindings: [
          {
            ...valid,
            evidence: [
              {
                ...valid.evidence[0],
                excerpt: "Unsupported audience research from another source",
              },
            ],
          },
        ],
      },
    },
    {
      ...base,
      context: {
        ...base.context,
        peerFindings: [
          {
            ...valid,
            lensId: "brand" as const,
            evidence: [{ ...valid.evidence[0], locator: "imc:page:11" }],
          },
        ],
      },
    },
    {
      ...base,
      context: {
        ...base.context,
        selectedFinding: {
          ...valid,
          title: "67% of movers leave Xfinity during a move",
        },
      },
    },
  ];
  for (const item of tampered) {
    let invocations = 0;
    await expect(
      runValidatedAgentRequest(item, async () => {
        invocations++;
        return "must not run";
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "discovery_submission_mismatch",
      retryable: false,
    });
    expect(invocations).toBe(0);
  }
});

test("legitimate same-Input-Pack prior versions and selected peers reach invocation", async () => {
  const base = requestFor(movers.sourceText);
  const current = findingFor(movers.sourceText);
  const historical = { ...current, id: "earlier-version", runVersion: 2 };
  const peer = { ...current, id: "peer-version", lensId: "brand" as const };
  const request = {
    ...base,
    context: {
      ...base.context,
      selectedFinding: current,
      previousFindings: [historical],
      peerFindings: [peer],
    },
  };
  let invocations = 0;
  expect(
    await runValidatedAgentRequest(request, async (received) => {
      invocations++;
      expect(received).toBe(request);
      return "validated offline";
    }),
  ).toBe("validated offline");
  expect(invocations).toBe(1);
});

test("the API accepts UI-versioned findings with extended Discovery context", async () => {
  const pack = studioPack(applyStudioSource(emptyStudio(), movers.sourceText));
  pack.selectedPreparationVersions = { research: "offline-v1" };
  pack.preparationGuidance = { research: "Focus on supplied evidence" };
  pack.sourceAvailability = [
    {
      source: "Tableau",
      status: "not_connected",
      detail: "Not connected in this offline test",
    },
  ];
  pack.selectedResearchSources = [];
  const uiVersion = inputPackVersion(pack);
  const extended = discoveryFoundation(pack);
  expect(discoveryFoundationVersion(extended)).toBe(uiVersion);
  const initial = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: extended,
      lens: "consumer",
      investigationType: "problem",
      question: "Why might existing movers leave?",
      action: "initial",
      previousFindings: [],
    },
    versionNumber: 1,
  }) as Extract<AgentRequest, { agentType: "discovery" }>;
  const selectedFinding = {
    ...mockDiscovery(initial).findings[0],
    id: "ui-selected-finding",
    lensId: "consumer" as const,
    inputPackVersion: uiVersion,
    runVersion: 1,
  };
  const followup = requestSchema.parse({
    ...initial,
    context: {
      ...initial.context,
      action: "explore_deeper",
      selectedFinding,
      previousFindings: [selectedFinding],
    },
    versionNumber: 2,
  });
  if (followup.agentType !== "discovery")
    throw new Error("Expected Discovery request.");
  expect(followup.context.foundation).toEqual(extended);
  expect(discoveryFoundationVersion(followup.context.foundation)).toBe(
    uiVersion,
  );
  expect(discoverySubmissionIssue(followup)).toBeUndefined();
  const response = await POST(
    new Request("http://127.0.0.1:3173/api/ai/agent", {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3173" },
      body: JSON.stringify(followup),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).provider).toBe("mock");
});

test("an Input Pack change preserves V0 but excludes stale findings from refreshed model context", async () => {
  const firstPack = studioPack(
    applyStudioSource(emptyStudio(), movers.sourceText),
  );
  firstPack.selectedSparks = [
    {
      id: "selected-source-spark",
      text: "Investigate mover transfer ease.",
      versionId: "offline-v0",
      version: 0,
    },
  ];
  const changedPack = structuredClone(firstPack);
  changedPack.researchFocus =
    "Investigate the same campaign with revised focus.";
  const captured: Extract<AgentRequest, { agentType: "discovery" }>[] = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const parsed = requestSchema.parse(JSON.parse(String(init?.body)));
      if (parsed.agentType !== "discovery")
        throw new Error("Expected Discovery request.");
      captured.push(parsed);
      const issue = discoverySubmissionIssue(parsed);
      if (issue) return Response.json({ error: issue }, { status: 422 });
      return Response.json({
        provider: "mock",
        generatedAt: new Date().toISOString(),
        data: mockDiscovery(parsed),
      });
    };
    const common = {
      lensId: "consumer" as const,
      question: "What could block retention for existing movers?",
      investigationType: "problem" as const,
      guidance: "",
    };
    const v0 = await generateDiscoveryVersion({
      ...common,
      pack: firstPack,
      action: "initial",
      previous: [],
    });
    const changed = await generateDiscoveryVersion({
      ...common,
      pack: changedPack,
      action: "refresh",
      previous: [v0],
    });
    expect(v0.inputPackVersion).not.toBe(changed.inputPackVersion);
    expect(v0.findings.length).toBeGreaterThan(0);
    expect(captured[1].context.previousFindings).toEqual([]);
    const next = await generateDiscoveryVersion({
      ...common,
      pack: changedPack,
      action: "refresh",
      previous: [v0, changed],
    });
    expect(next.number).toBe(3);
    expect(captured[2].context.previousFindings.map((item) => item.id)).toEqual(
      changed.findings.map((item) => item.id),
    );
    expect(
      captured[2].context.previousFindings.map((item) => item.id),
    ).not.toContain(v0.findings[0].id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the full two-campaign source and cross-campaign source fields are rejected before generation", async () => {
  const request = requestFor(movers.sourceText);
  const invalid = [
    {
      ...request,
      context: {
        ...request.context,
        foundation: { ...request.context.foundation, sourceBrief: undefined },
      },
    },
    {
      ...request,
      context: {
        ...request.context,
        foundation: { ...request.context.foundation, sourceBrief: fullText },
      },
    },
    {
      ...request,
      context: {
        ...request.context,
        foundation: {
          ...request.context.foundation,
          sourceBrief: pro.sourceText,
        },
      },
    },
  ] as AgentRequest[];
  for (const item of invalid) {
    let invocations = 0;
    await expect(
      runValidatedAgentRequest(item, async () => {
        invocations++;
        return "must not run";
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "discovery_submission_mismatch",
      retryable: false,
    });
    expect(invocations).toBe(0);
  }
});

test("campaign context, original RTB and Spark source claims cannot contradict selected text", () => {
  const request = requestFor(movers.sourceText);
  const foundation = request.context.foundation;
  const altered = [
    {
      ...foundation,
      campaignContext: {
        ...foundation.campaignContext,
        campaignName: "Another campaign",
      },
    },
    {
      ...foundation,
      currentRtb: { ...foundation.currentRtb, original: "A different RTB" },
    },
    {
      ...foundation,
      selectedSparks: foundation.selectedSparks.map((spark) => ({
        ...spark,
        excerpt: "Unrelated fabricated product claim",
      })),
    },
    {
      ...foundation,
      requirements: {
        ...foundation.requirements,
        fields: {
          ...foundation.requirements.fields,
          objective: {
            ...foundation.requirements.fields.objective,
            sourceValue: "A different objective",
          },
        },
      },
    },
    {
      ...foundation,
      campaignContext: {
        ...foundation.campaignContext,
        objective: "A different, off-source objective",
      },
      requirements: {
        ...foundation.requirements,
        fields: {
          ...foundation.requirements.fields,
          objective: {
            ...foundation.requirements.fields.objective,
            value: "A different, off-source objective",
            status: "Supplied" as const,
          },
        },
      },
    },
  ];
  for (const item of altered) {
    expect(
      discoverySubmissionIssue({
        ...request,
        context: { ...request.context, foundation: item },
      }),
    ).toBeTruthy();
  }
});

test("forged GTM approval is rejected before the Discovery provider runs", async () => {
  const base = requestFor(movers.sourceText);
  const forged = {
    ...base,
    context: {
      ...base.context,
      foundation: {
        ...base.context.foundation,
        currentRtb: {
          ...base.context.foundation.currentRtb,
          approvalStatus:
            base.context.foundation.currentRtb.approvalStatus === "approved"
              ? ("unknown" as const)
              : ("approved" as const),
        },
      },
    },
  };
  let invocations = 0;
  await expect(
    runValidatedAgentRequest(forged, async () => {
      invocations++;
      return "must not run";
    }),
  ).rejects.toMatchObject({
    status: 422,
    code: "discovery_submission_mismatch",
    retryable: false,
  });
  expect(invocations).toBe(0);
});

test("parser source occurrences and conversation scope cannot be forged into a current request", async () => {
  const base = requestFor(movers.sourceText);
  const field = base.context.foundation.requirements.fields
    .objective as typeof base.context.foundation.requirements.fields.objective & {
    present?: boolean;
    occurrences?: string[];
  };
  expect(field.occurrences?.length).toBeGreaterThan(0);
  const wrongMetadata = {
    ...base,
    context: {
      ...base.context,
      foundation: {
        ...base.context.foundation,
        requirements: {
          ...base.context.foundation.requirements,
          fields: {
            ...base.context.foundation.requirements.fields,
            objective: { ...field, occurrences: ["Invented source line"] },
          },
        },
      },
    },
  };
  const wrongConversation = requestSchema.parse({
    ...base,
    context: {
      ...base.context,
      conversation: {
        scope: {
          kind: "agent",
          threadId: "consumer-current",
          inputPackVersion: "pack-from-another-context",
          question: base.context.question,
          investigationType: "problem",
        },
        currentMessageId: "current-turn",
        selectionPolicy: "all-user-and-recent-agent",
        messages: [
          {
            id: "current-turn",
            role: "user",
            text: "Investigate this campaign.",
            createdAt: "2026-10-17T12:00:00.000Z",
          },
        ],
        omittedMessageIds: [],
        budgetCharacters: 2048,
        usedCharacters: 26,
      },
    },
  });
  for (const request of [wrongMetadata, wrongConversation]) {
    let invoked = false;
    await expect(
      runValidatedAgentRequest(request, async () => {
        invoked = true;
        return "must not run";
      }),
    ).rejects.toMatchObject({ code: "discovery_submission_mismatch" });
    expect(invoked).toBe(false);
  }
});

test("disconnected enterprise sources cannot be claimed as retrieved or supplied", () => {
  const base = requestFor(movers.sourceText);
  const source = {
    source: "Tableau",
    detail: "No connector is configured.",
  };
  for (const status of [
    "connected_searched",
    "available_not_searched",
    "search_failed",
    "supplied_analyzed",
    "supplied_not_analyzed",
  ] as const) {
    expect(
      discoverySubmissionIssue({
        ...base,
        context: {
          ...base.context,
          foundation: {
            ...base.context.foundation,
            sourceAvailability: [{ ...source, status }],
          },
        },
      }),
    ).toBeTruthy();
  }
  expect(
    discoverySubmissionIssue({
      ...base,
      context: {
        ...base.context,
        foundation: {
          ...base.context.foundation,
          sourceAvailability: [{ ...source, status: "not_connected" }],
        },
      },
    }),
  ).toBeUndefined();
});

test("human clarification can travel as unconfirmed context without masquerading as supplied IMC text", () => {
  const request = requestFor(movers.sourceText);
  const foundation = request.context.foundation;
  const requirements = {
    ...foundation.requirements,
    fields: {
      ...foundation.requirements.fields,
      constraints: {
        ...foundation.requirements.fields.constraints,
        status: "Needs clarification" as const,
        value: "Human-proposed execution constraint",
        note: "Requires source-owner review",
      },
    },
  };
  expect(
    discoverySubmissionIssue({
      ...request,
      context: {
        ...request.context,
        foundation: {
          ...foundation,
          requirements,
          campaignContext: {
            ...foundation.campaignContext,
            ...sourceContext(requirements),
          },
        },
      },
    }),
  ).toBeUndefined();
});

test("API returns an actionable 422 in mock mode for mismatched source without invoking generation", async () => {
  const request = requestFor(movers.sourceText);
  const bad = {
    ...request,
    context: {
      ...request.context,
      foundation: {
        ...request.context.foundation,
        sourceBrief: pro.sourceText,
      },
    },
  };
  const response = await POST(
    new Request("http://127.0.0.1:3173/api/ai/agent", {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3173" },
      body: JSON.stringify(bad),
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    code: "discovery_submission_mismatch",
    retryable: false,
  });
});

test("a selected campaign request reaches the mock API without external credentials", async () => {
  const request = requestFor(movers.sourceText);
  const response = await POST(
    new Request("http://127.0.0.1:3173/api/ai/agent", {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3173" },
      body: JSON.stringify(request),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.provider).toBe("mock");
  expect(body.data.findings.length).toBeGreaterThan(0);
  expect(body.data.retrievalNote).toContain("No external");
});

test("connections API also rejects wrong-campaign historical snapshots and invalid finding locations before generation", async () => {
  const current = requestFor(movers.sourceText).context.foundation;
  const other = requestFor(pro.sourceText).context.foundation;
  const base = {
    researchRunId: "offline-run",
    inputPackVersion: "offline-pack",
    runVersion: 1,
    title: "The brief states a mover objective",
    whatWeFound: "The supplied brief states a retention objective.",
    evidence: [
      {
        source: "IMC brief — source page 7",
        locator: "imc:page:7",
        excerpt:
          "Reinforce why a customer must stay with Xfinity during the move moment.",
        date: "Not supplied",
        audience: "Not supplied",
        context: "Original brief objective, not observed behavior.",
        accessScope: "supplied",
      },
    ],
    whyItMayMatter: "It frames a question.",
    whatComplicatesIt: "Behavioral evidence is absent.",
    questionToExplore: "Why do movers choose a provider?",
    evidenceState: "evidence_supported",
  };
  const findings = [
    { ...base, id: "one", lensId: "consumer" },
    { ...base, id: "two", lensId: "brand" },
  ];
  const valid = requestSchema.parse({
    agentType: "connections",
    context: { foundation: current, findings },
  });
  expect(discoverySubmissionIssue(valid)).toBeUndefined();
  const wrongCampaign = requestSchema.parse({
    agentType: "connections",
    context: {
      foundation: current,
      findings,
      sourceFoundations: [current, other],
    },
  });
  const wrongLocation = requestSchema.parse({
    agentType: "connections",
    context: {
      foundation: current,
      findings: [
        findings[0],
        {
          ...findings[1],
          evidence: [{ ...findings[1].evidence[0], locator: "imc:page:11" }],
        },
      ],
    },
  });
  const inventedStatistic = requestSchema.parse({
    agentType: "connections",
    context: {
      foundation: current,
      findings: [
        findings[0],
        { ...findings[1], title: "67% of movers switched providers" },
      ],
    },
  });
  for (const request of [wrongCampaign, wrongLocation, inventedStatistic]) {
    let invoked = false;
    await expect(
      runValidatedAgentRequest(request, async () => {
        invoked = true;
        return "must not run";
      }),
    ).rejects.toMatchObject({ code: "discovery_submission_mismatch" });
    expect(invoked).toBe(false);
  }
});

test("manual evidence cannot impersonate a PDF page or IMC source identity", () => {
  const request = requestFor(movers.sourceText);
  const foundation = request.context.foundation;
  const manual = {
    id: "manual-one",
    source: "IMC brief",
    locator: "imc:page:7",
    text: "Fabricated survey says most movers switch.",
    date: "Not supplied",
    audience: "Not supplied",
    accessScope: "supplied" as const,
  };
  for (const item of [
    manual,
    { ...manual, source: "Interview notes", locator: "imc:page:7" },
    { ...manual, source: "IMC brief", locator: "manual:note:1" },
    { ...manual, source: " IMC brief ", locator: "manual:note:1" },
    { ...manual, source: "Interview notes", locator: " imc:page:7 " },
    {
      ...manual,
      source: "Original upstream research",
      locator: "manual:note:1",
    },
    {
      ...manual,
      source: "Supplied IMC source — original research",
      locator: "manual:note:1",
    },
    {
      ...manual,
      source: "IMC brief — source page 99",
      locator: "manual:note:1",
    },
  ]) {
    expect(
      discoverySubmissionIssue({
        ...request,
        context: {
          ...request.context,
          foundation: { ...foundation, suppliedEvidence: [item] },
        },
      }),
    ).toContain("IMC source identity or locator");
  }
  expect(
    discoverySubmissionIssue({
      ...request,
      context: {
        ...request.context,
        foundation: {
          ...foundation,
          suppliedEvidence: [
            { ...manual, source: "Interview notes", locator: "manual:note:1" },
          ],
        },
      },
    }),
  ).toBeUndefined();
});
