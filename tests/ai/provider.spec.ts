import { test, expect } from "@playwright/test";
import OpenAI from "openai";
import {
  classifyOpenAIError,
  generateOpenAI,
} from "../../lib/ai/openai-provider";
import { generateAgentResponse, preserveSource } from "../../lib/ai/provider";
import { publicAIStatus } from "../../lib/ai/config";
import {
  requestSchema,
  outputSchemas,
  type AgentRequest,
  type AgentDataMap,
} from "../../lib/ai/schemas";
import { selectedFoundation } from "../../lib/ai/context";
import { demoExecution } from "../../lib/demo";
import {
  demoIMCBrief,
  compileInputPack,
  emptyPreparation,
} from "../../lib/preparation";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import { POST } from "../../app/api/ai/agent/route";
import { agentPromptVersion } from "../../lib/ai/prompts";

const originalEnvironment = {
  AI_MODE: process.env.AI_MODE,
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};
test.beforeEach(() => {
  process.env.AI_MODE = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.AI_PROVIDER;
});
test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const preparationContext = () => ({
  parsedIMC: parseIMCBrief(demoIMCBrief),
  upstream: extractUpstream(demoIMCBrief),
});
const prep = (agentType: "rtb" | "research" | "sparks"): AgentRequest => ({
  agentType,
  context: preparationContext(),
});
function foundation() {
  const pack = compileInputPack({
    ...emptyPreparation,
    sourceSnapshot: demoIMCBrief,
    upstreamDraft: demoIMCBrief,
  });
  pack.selectedSparks = [
    {
      id: "selected-1",
      text: "What if connection made room for everyday life?",
      version: 1,
      versionId: "v1",
    },
  ];
  pack.research = "Supplied demonstration evidence; no live retrieval.";
  return selectedFoundation(pack);
}
const finalRequest = (): AgentRequest => ({
  agentType: "finalBrief",
  context: {
    foundation: foundation(),
    approvedStrategy: {
      approvalState: "Approved",
      briefLine: "Human-approved direction, verbatim.",
      approvedBy: "Kevin",
      approvedAt: "2026-10-07T12:00:00.000Z",
      source: "Humorous / Witty · V0",
    },
    executionDirection: demoExecution,
  },
});

test("mock provider supplies valid structured responses for all ten agents without a key", async () => {
  const selected = [
    {
      id: "one",
      agentId: "humor",
      personaName: "Humorous / Witty",
      version: 0,
      text: "First candidate.",
    },
    {
      id: "two",
      agentId: "culture",
      personaName: "Cultural / Social",
      version: 0,
      text: "Second candidate.",
    },
  ];
  const requests: AgentRequest[] = [
    prep("rtb"),
    prep("research"),
    prep("sparks"),
    ...(["humor", "culture", "audience", "market", "brand"] as const).map(
      (agentType) => ({ agentType, context: foundation() }),
    ),
    {
      agentType: "synthesis",
      context: {
        foundation: foundation(),
        lines: selected,
        weights: { one: 70, two: 30 },
      },
    },
    finalRequest(),
  ];
  for (const request of requests) {
    expect(requestSchema.safeParse(request).success).toBe(true);
    const response = await generateAgentResponse(request);
    expect(response.provider).toBe("mock");
    expect(response.promptTemplateVersion).toBe(
      agentPromptVersion(request.agentType),
    );
    expect(
      outputSchemas[request.agentType].safeParse(response.data).success,
    ).toBe(true);
  }
});

test("live missing-key/provider configuration is explicit, sanitized and never silently mocked", async () => {
  delete process.env.AI_MODE;
  expect(publicAIStatus()).toMatchObject({ mode: "mock", configured: true });
  process.env.AI_MODE = "live";
  await expect(generateAgentResponse(prep("rtb"))).rejects.toThrow(
    "Live AI requires OPENAI_API_KEY",
  );
  const response = await POST(
    new Request("http://localhost/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prep("rtb")),
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error:
      "Live AI requires OPENAI_API_KEY on the server. Configure it or set AI_MODE=mock.",
    code: "agent_error",
    retryable: false,
  });
  process.env.OPENAI_API_KEY = "sk-test-private-sentinel";
  process.env.AI_PROVIDER = "writer";
  expect(publicAIStatus().configured).toBe(false);
  expect(JSON.stringify(publicAIStatus())).not.toContain(
    "sk-test-private-sentinel",
  );
});

test("route validates shape, approval, size and origin before any generation", async () => {
  async function post(body: unknown, headers = {}) {
    return POST(
      new Request("http://localhost/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
  }
  expect((await post({ agentType: "unknown", context: {} })).status).toBe(400);
  expect((await post({ agentType: "research", context: {} })).status).toBe(400);
  expect(
    (await post(prep("rtb"), { origin: "https://another-site.test" })).status,
  ).toBe(403);
  expect(
    (await post(prep("rtb"), { "content-length": "1000001" })).status,
  ).toBe(413);
  expect((await post({ padding: "x".repeat(1_000_001) })).status).toBe(413);
  const unapproved = finalRequest();
  if (unapproved.agentType === "finalBrief")
    unapproved.context.approvedStrategy.approvalState =
      "Not approved" as "Approved";
  expect((await post(unapproved)).status).toBe(400);
  expect(
    (
      await POST(
        new Request("http://localhost/api/ai/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{bad",
        }),
      )
    ).status,
  ).toBe(400);
  // Next dev may use 0.0.0.0 internally while the browser uses localhost.
  expect(
    (
      await POST(
        new Request("http://0.0.0.0:3000/api/ai/agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "localhost:3000",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify(prep("rtb")),
        }),
      )
    ).status,
  ).toBe(200);
});

test("source preservation prevents model edits to original RTB, evidence and approved direction", async () => {
  const request = prep("rtb");
  const output = {
    originalRtb: "A replacement claim",
    originalRtbStatus: "not_supplied" as const,
    originalRtbApprovalStatus: "unknown" as const,
    xcAdaptation: "A proposal",
    adaptationStatus: "not_approved" as const,
    reviewNotes: [],
    evidenceGaps: [],
  };
  const preserved = preserveSource(request, output);
  expect(preserved).toMatchObject({
    originalRtb:
      preparationContext().parsedIMC.fields.reason_to_believe.sourceValue,
    originalRtbStatus: "supplied",
    originalRtbApprovalStatus: "unknown",
  });
  const excluded = {
    agentType: "rtb" as const,
    context: {
      parsedIMC: parseIMCBrief("Reason to believe: Intentionally excluded."),
      upstream: extractUpstream("Reason to believe: Intentionally excluded."),
    },
  };
  expect(preserveSource(excluded, output)).toMatchObject({
    originalRtbStatus: "intentionally_excluded",
    xcAdaptation: null,
  });
  const approvedSource = "GTM-approved RTB: Exact approved proof.";
  const approvedRequest: AgentRequest = {
    agentType: "rtb",
    context: {
      parsedIMC: parseIMCBrief(approvedSource),
      upstream: extractUpstream(approvedSource),
    },
  };
  expect(preserveSource(approvedRequest, output)).toMatchObject({
    originalRtb: "Exact approved proof.",
    originalRtbStatus: "supplied",
    originalRtbApprovalStatus: "approved",
  });
  const generated = await generateAgentResponse(finalRequest());
  expect(
    preserveSource(finalRequest(), {
      ...generated.data,
      approvedStrategy: "Changed by the model",
    } as typeof generated.data),
  ).toMatchObject({ approvedStrategy: "Human-approved direction, verbatim." });
});

test("research preserves campaign fields, separates evidence classes and removes disconnected-source result claims", () => {
  const data: AgentDataMap["research"] = {
    campaignName: "Changed campaign",
    objectives: "Changed objective",
    audience: "Changed audience",
    productInformation: "Changed product",
    suppliedEvidence: ["Invented evidence"],
    verifiedEvidence: ["Invented verified result"],
    illustrativeAssumptions: ["A proposed creative question"],
    audienceContext: ["Audience interpretation"],
    historicalPerformance: ["Tableau shows a 42% lift."],
    creativePerformance: ["iSpot proves the ad won."],
    marketContext: ["Datorama reports category leadership."],
    researchToValidate: [
      { source: "Tableau", question: "Which historical result is relevant?" },
    ],
    evidenceGaps: ["Need campaign-specific performance evidence."],
    sourceNotes: [],
  };
  const preserved = preserveSource(prep("research"), data);
  if (!("suppliedEvidence" in preserved)) throw new Error("Expected research");
  expect(preserved.campaignName).toBe("Life, connected");
  expect(preserved.objectives).toBe(
    "Make Xfinity the first choice for households looking for dependable home connectivity.",
  );
  expect(preserved.productInformation).toBe("Xfinity home internet");
  expect(preserved.suppliedEvidence.join("\n")).toContain(
    preparationContext().parsedIMC.fields.research.sourceValue,
  );
  expect(preserved.verifiedEvidence).toEqual([]);
  expect(preserved.illustrativeAssumptions.join("\n")).toContain(
    "Illustrative audience observation",
  );
  expect(
    [
      ...preserved.historicalPerformance,
      ...preserved.creativePerformance,
      ...preserved.marketContext,
    ].join("\n"),
  ).not.toMatch(/Tableau|iSpot|Datorama/);
  expect(preserved.researchToValidate[0].source).toBe("Tableau");
});

test("OpenAI SDK sends Responses JSON schemas and validates transport outputs without network", async () => {
  process.env.OPENAI_MODEL = "gpt-5.5";
  let sent: Record<string, unknown> = {};
  const data = {
    originalRtb: "Original",
    originalRtbStatus: "supplied",
    originalRtbApprovalStatus: "unknown",
    xcAdaptation: "Proposal",
    adaptationStatus: "not_approved",
    reviewNotes: [],
    evidenceGaps: [],
  };
  const sdk = new OpenAI({
    apiKey: "sk-test-private-sentinel",
    maxRetries: 0,
    fetch: async (url, init) => {
      expect(String(url)).toContain("/responses");
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "resp_test",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_test",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(data),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  expect(await generateOpenAI(prep("rtb"), sdk)).toEqual(data);
  expect(sent.model).toBe("gpt-5.5");
  expect(sent.store).toBe(false);
  expect(sent.text).toMatchObject({
    format: { type: "json_schema", strict: true },
  });
  expect(JSON.stringify(sent)).not.toContain("sk-test-private-sentinel");
  expect(sent).not.toHaveProperty("tools");
});

test("provider errors distinguish quota, authentication and retryable throttling", async () => {
  const quota = classifyOpenAIError(
    OpenAI.APIError.generate(
      429,
      {
        error: {
          message: "No credits",
          type: "insufficient_quota",
          code: "credit_balance_exhausted",
        },
      },
      "No credits",
      new Headers(),
    ),
  );
  expect(quota).toMatchObject({
    category: "quota",
    code: "credit_balance_exhausted",
    retryable: false,
  });
  const authentication = classifyOpenAIError(
    OpenAI.APIError.generate(
      401,
      { error: { type: "authentication_error", code: "invalid_api_key" } },
      "Invalid key",
      new Headers(),
    ),
  );
  expect(authentication).toMatchObject({
    category: "authentication",
    retryable: false,
  });

  const data = {
    originalRtb: "Original",
    originalRtbStatus: "supplied",
    originalRtbApprovalStatus: "unknown",
    xcAdaptation: "Proposal",
    adaptationStatus: "not_approved",
    reviewNotes: [],
    evidenceGaps: [],
  };
  let calls = 0;
  const sdk = new OpenAI({
    apiKey: "sk-test-private-sentinel",
    maxRetries: 0,
    fetch: async () => {
      calls++;
      if (calls === 1)
        return new Response(
          JSON.stringify({
            error: {
              message: "Slow down",
              type: "rate_limit_error",
              code: "slow_down",
            },
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "0",
            },
          },
        );
      return new Response(
        JSON.stringify({
          id: "resp_after_retry",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_after_retry",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(data),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  expect(await generateOpenAI(prep("rtb"), sdk)).toEqual(data);
  expect(calls).toBe(2);

  let quotaCalls = 0;
  const quotaSdk = new OpenAI({
    apiKey: "sk-test-private-sentinel",
    maxRetries: 0,
    fetch: async () => {
      quotaCalls++;
      return new Response(
        JSON.stringify({
          error: {
            message: "No credits",
            type: "insufficient_quota",
            code: "credit_balance_exhausted",
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    },
  });
  await expect(generateOpenAI(prep("rtb"), quotaSdk)).rejects.toMatchObject({
    code: "credit_balance_exhausted",
    retryable: false,
  });
  expect(quotaCalls).toBe(1);
});

test("malformed, refused, truncated and provider-error responses produce sanitized errors", async () => {
  for (const testCase of [
    "malformed",
    "refused",
    "truncated",
    "unauthorized",
  ]) {
    const sdk = new OpenAI({
      apiKey: "sk-test-private-sentinel",
      maxRetries: 0,
      fetch: async () =>
        new Response(
          JSON.stringify(
            testCase === "unauthorized"
              ? {
                  error: {
                    message: "sk-test-private-sentinel INTERNAL STACK",
                    type: "authentication_error",
                  },
                }
              : {
                  id: "resp_test",
                  object: "response",
                  status: testCase === "truncated" ? "incomplete" : "completed",
                  output: [
                    {
                      type: "message",
                      role: "assistant",
                      content:
                        testCase === "refused"
                          ? [{ type: "refusal", refusal: "Cannot comply" }]
                          : [
                              {
                                type: "output_text",
                                text: '{"unexpected":true}',
                                annotations: [],
                              },
                            ],
                    },
                  ],
                },
          ),
          {
            status: testCase === "unauthorized" ? 401 : 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });
    try {
      await generateOpenAI(prep("rtb"), sdk);
      throw new Error("Expected failure");
    } catch (error) {
      expect(String(error)).not.toContain("sk-test-private-sentinel");
      expect(String(error)).not.toContain("INTERNAL STACK");
      expect(String(error)).not.toContain("Expected failure");
    }
  }
});

test("malformed model JSON reports an actionable parser error", async () => {
  const sdk = new OpenAI({
    apiKey: "sk-test-private-sentinel",
    maxRetries: 0,
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: "resp_invalid_json",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_invalid_json",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "not valid JSON",
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  await expect(generateOpenAI(prep("rtb"), sdk)).rejects.toMatchObject({
    code: "model_output_invalid_json",
    retryable: true,
  });
});
