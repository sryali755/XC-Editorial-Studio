import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { discoveryFoundation } from "../../lib/discovery-context";
import {
  discoverySubmissionIssue,
  runValidatedAgentRequest,
} from "../../lib/ai/discovery-submission";
import {
  outputSchemas,
  requestSchema,
  type AgentRequest,
} from "../../lib/ai/schemas";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { POST } from "../../app/api/ai/agent/route";
import { generateMock } from "../../lib/ai/mock-provider";
import { generateAgentResponse } from "../../lib/ai/provider";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";

const document = readFileSync(
  path.join(
    __dirname,
    "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
  ),
  "utf8",
);
const [movers, pro] = detectIMCCampaignScopes(document);
const question =
  "What could prevent the supplied audience from achieving the campaign objective?";
function requestFor(source: string) {
  const pack = studioPack(applyStudioSource(emptyStudio(), source));
  return requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question,
      action: "initial",
      previousFindings: [],
    },
  });
}
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});
for (const scope of [movers, pro]) {
  test(`${scope.title}: duplicate campaign metadata passes without concatenating identity`, () => {
    const source = `Campaign: ${scope.title}\n\n${scope.sourceText}\n\nCampaign: ${scope.title}\n`;
    const request = requestFor(source);
    if (request.agentType !== "discovery") throw Error("Expected Discovery");
    expect(request.context.foundation.campaignContext.campaignName).toBe(
      scope.title,
    );
    expect(discoverySubmissionIssue(request)).toBeUndefined();
  });
}
test("source campaign metadata does not absorb the parent platform or proposed JTBD", () => {
  const original = movers.sourceText.replace(
    /Movers\s*[-–—]\s*Campaign Extensions Refresh Brief/g,
    "Movers – Campaign Extensions Refresh Brief",
  );
  const source = `Campaign:\nMovers – Campaign Extensions Refresh Brief\n\nParent platform:\nXfinity. Imagine That.\n\nProposed JTBD (internal testing material; NOT approved):\nHelp movers transfer service without adding uncertainty.\n\n${original}`;
  const pack = studioPack(applyStudioSource(emptyStudio(), source));
  expect(pack.parsedIMC!.fields.campaign.occurrences).toEqual([
    "Movers – Campaign Extensions Refresh Brief",
  ]);
  expect(pack.originalJTBD).toBe("");
  expect(pack.campaignName).toBe("Movers – Campaign Extensions Refresh Brief");
  expect(pack.parentPlatform).toMatchObject({
    name: "Imagine That",
    sourceValue: "Xfinity. Imagine That.",
  });
  expect(pack.jtbdContext!.proposed[0]).toMatchObject({
    text: "Help movers transfer service without adding uncertainty.",
    approvalStatus: "not_approved",
  });
  const request = requestFor(source);
  expect(discoverySubmissionIssue(request)).toBeUndefined();
});
test("separate exact customer and prospect JTBD spans pass without a fabricated joined quotation", () => {
  const source = `${movers.sourceText}\n\n## Customer JTBD\nTransfer existing service during the move.\n\n## Prospect JTBD\nEstablish service in the new home.\n`;
  const request = requestFor(source);
  expect(discoverySubmissionIssue(request)).toBeUndefined();
});

test("original JTBD, source proposals and RTB adaptation remain separate and source-attributed", () => {
  const source = `${movers.sourceText}\n\n## Original JTBD\nTransfer existing service during a move.\n\n## Proposed JTBD — internal testing, NOT approved\nMake moving day simpler.\n`;
  const pack = studioPack(applyStudioSource(emptyStudio(), source));
  expect(pack.originalJTBD).toBe("Transfer existing service during a move.");
  expect(pack.jtbdContext!.original[0].approvalStatus).toBe("unknown");
  expect(pack.jtbdContext!.proposed[0].approvalStatus).toBe("not_approved");
  for (const entry of [
    ...pack.jtbdContext!.original,
    ...pack.jtbdContext!.proposed,
  ])
    expect(source).toContain(entry.excerpt);
  expect(pack.reasonToBelieve).toContain("Prospect & TOT only");
  expect(pack.rtbApprovalStatus).toBe("unknown");
  expect(pack.proposedRTB).toBe("");
  expect(discoverySubmissionIssue(requestFor(source))).toBeUndefined();
});

test("forged campaign names, stale campaign state, platform and JTBD promotions fail before provider invocation", async () => {
  const source = `${movers.sourceText}\n\nParent platform: Xfinity. Imagine That.\n\n## Proposed JTBD — internal testing, NOT approved\nMake moving day simpler.\n`;
  const valid = requestFor(source);
  if (valid.agentType !== "discovery") throw Error("Expected Discovery");
  const mutations = [
    (r: typeof valid) => {
      r.context.foundation.campaignContext.campaignName = pro.title;
    },
    (r: typeof valid) => {
      r.context.foundation.campaignContext.campaignName = "Imagine That";
    },
    (r: typeof valid) => {
      r.context.foundation.campaignContext.jobToBeDone =
        "Make moving day simpler.";
    },
    (r: typeof valid) => {
      r.context.foundation.jtbdContext!.proposed[0].excerpt =
        "Fabricated source text";
    },
    (r: typeof valid) => {
      r.context.foundation.parentPlatform!.name = "Unrelated platform";
    },
    (r: typeof valid) => {
      r.context.foundation.sourceBrief = pro.sourceText;
    },
    (r: typeof valid) => {
      r.context.foundation.campaignIdentity = {
        origin: "human_confirmed",
        sourceReference:
          "Human-confirmed campaign name; not extracted from the IMC brief.",
        confirmedAt: new Date().toISOString(),
      };
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid);
    mutate(changed);
    let calls = 0;
    await expect(
      runValidatedAgentRequest(changed, async () => {
        calls++;
        return "never";
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "discovery_submission_mismatch",
    });
    expect(calls).toBe(0);
  }
});

test("campaign switch preserves earlier pack snapshot while current identity follows only selected source", () => {
  const initial = applyStudioSource(emptyStudio(), movers.sourceText);
  const previous = structuredClone(studioPack(initial));
  const switched = applyStudioSource(initial, pro.sourceText);
  expect(studioPack(switched).campaignName).toBe(pro.title);
  expect(switched.packHistory[0].pack).toEqual(previous);
  expect(
    studioPack(applyStudioSource(switched, movers.sourceText)).campaignName,
  ).toBe(movers.title);
  expect(studioPack(initial)).toEqual(previous);
});

test("human confirmation remains labeled metadata only when the source genuinely lacks campaign identity", () => {
  const source =
    "Business objective: Retain customers.\nAudience: Existing customers.\nReason to believe: Supplied proof.";
  const pack = studioPack(
    confirmStudioCampaignName(
      applyStudioSource(emptyStudio(), source),
      "Kevin's confirmed campaign",
    ),
  );
  const request = requestSchema.parse({
    ...requestFor(source),
    context: {
      ...requestFor(source).context,
      foundation: discoveryFoundation(pack),
    },
  });
  expect(discoverySubmissionIssue(request)).toBeUndefined();
  expect(pack.parsedIMC!.fields.campaign.status).toBe("Not supplied");
});

for (const scope of [movers, pro]) {
  test(`${scope.title}: all eight agents use the real SDK parsing path through deterministic offline transport`, async () => {
    const source = `Campaign: ${scope.title}\n\n${scope.sourceText}\n\nCampaign: ${scope.title}\n`;
    const parsedIMC = parseIMCBrief(source),
      upstream = extractUpstream(parsedIMC);
    const requests: AgentRequest[] = ["rtb", "research", "sparks"].map(
      (agentType) =>
        requestSchema.parse({ agentType, context: { parsedIMC, upstream } }),
    );
    const base = requestFor(source);
    if (base.agentType !== "discovery") throw Error("Expected Discovery");
    for (const lens of [
      "consumer",
      "culture",
      "category",
      "brand",
      "analogous",
    ] as const)
      requests.push(
        requestSchema.parse({ ...base, context: { ...base.context, lens } }),
      );
    for (const request of requests) {
      const mock = await generateMock(request);
      const wire =
        "sparks" in mock
          ? {
              sparks: mock.sparks.map(
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
          : mock;
      const model = createOfflineModelClient([JSON.stringify(wire)]);
      const response = await runValidatedAgentRequest(request, (r) =>
        generateAgentResponse(r, model.sdk),
      );
      expect(model.calls()).toBe(1);
      expect(response.provider).toBe("mock");
      expect(
        outputSchemas[request.agentType].safeParse(response.data).success,
      ).toBe(true);
      const input = String(model.requests()[0].input);
      expect(input).toContain(
        request.agentType === "sparks" ? source.trim() : JSON.stringify(source),
      );
      if (request.agentType === "discovery") {
        expect(input).toContain(question);
        expect(input).toContain(scope.title);
      }
      if ("campaignName" in response.data)
        expect(response.data.campaignName).toBe(scope.title);
      if ("sparks" in response.data)
        expect(response.data.sparks).toHaveLength(6);
    }
  });
  test(`${scope.title}: all five Discovery API routes accept the selected real campaign without paid calls`, async () => {
    const base = requestFor(
      `Campaign: ${scope.title}\n\n${scope.sourceText}\n\nCampaign: ${scope.title}\n`,
    );
    if (base.agentType !== "discovery") throw Error("Expected Discovery");
    for (const lens of [
      "consumer",
      "culture",
      "category",
      "brand",
      "analogous",
    ] as const) {
      const response = await POST(
        new Request("http://127.0.0.1:3281/api/ai/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...base, context: { ...base.context, lens } }),
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).provider).toBe("mock");
    }
  });
}
