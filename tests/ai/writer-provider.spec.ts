import { test, expect } from "@playwright/test";
import {
  aiConfig,
  publicAIStatus,
  DEFAULT_WRITER_MODEL,
} from "../../lib/ai/config";
import { generateWriter } from "../../lib/ai/writer-provider";
import { generateAgentResponse } from "../../lib/ai/provider";
import { generateMock } from "../../lib/ai/mock-provider";
import { runAgent } from "../../lib/ai/client";
import { runDiscoveryAgent } from "../../lib/ai/discovery-client";
import {
  outputSchemas,
  requestSchema,
  type AgentRequest,
} from "../../lib/ai/schemas";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import { studioPack } from "../../lib/discovery-studio";
import { discoveryFoundation } from "../../lib/discovery-context";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { validatedModelSettings } from "../../lib/ai/capabilities";

const environment = { ...process.env };
const originalFetch = globalThis.fetch;
let requests: { url: string; init?: RequestInit }[];
function fakeWriter(content: string, status = 200, finish = "stop") {
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(
      { choices: [{ finish_reason: finish, message: { content } }] },
      { status },
    );
  };
}
test.beforeEach(() => {
  process.env.AI_MODE = "live";
  process.env.AI_PROVIDER = "writer";
  process.env.WRITER_API_KEY = "writer-private-test-sentinel";
  delete process.env.WRITER_MODEL;
  process.env.OPENAI_API_KEY = "openai-must-never-be-called";
  // Only the in-memory fetch below can answer. The test process also uses the
  // repository no-network preload; this does not authorize a real live request.
  process.env.XC_OFFLINE_TEST = "0";
  requests = [];
  globalThis.fetch = async () => {
    throw Error("No mock transport registered");
  };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of [
    "AI_MODE",
    "AI_PROVIDER",
    "WRITER_API_KEY",
    "WRITER_MODEL",
    "OPENAI_API_KEY",
    "XC_OFFLINE_TEST",
  ])
    if (environment[key] === undefined) delete process.env[key];
    else process.env[key] = environment[key];
});

function preparation(
  agentType: "rtb" | "research" | "sparks",
  file = "movers_source_text.txt",
): AgentRequest {
  const { source } = phase1Fixture(file);
  return {
    agentType,
    context: {
      parsedIMC: parseIMCBrief(source),
      upstream: extractUpstream(source),
    },
  };
}
function discovery(
  lens = "consumer",
  file = "movers_source_text.txt",
): Extract<AgentRequest, { agentType: "discovery" }> {
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(studioPack(phase1Fixture(file).session)),
      lens,
      investigationType: "problem",
      question: "What supplied barrier or evidence gap needs investigation?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery")
    throw Error("Discovery request required");
  return request;
}
async function modelContent(request: AgentRequest) {
  const data = await generateMock(request);
  if ("sparks" in data)
    return JSON.stringify({
      sparks: data.sparks.map((s) => ({
        territory_type: s.territory_type,
        title: s.title,
        territory: s.territory,
        idea: s.idea,
        excerpt: s.excerpt,
        rationale: s.rationale,
        hypothesis: s.hypothesis,
      })),
    });
  return JSON.stringify(data);
}

test("Writer is the default; explicit provider overrides work and secrets stay private", () => {
  delete process.env.AI_PROVIDER;
  expect(aiConfig()).toMatchObject({
    provider: "writer",
    model: DEFAULT_WRITER_MODEL,
  });
  expect(publicAIStatus()).toMatchObject({
    provider: "writer",
    mode: "live",
    configured: true,
  });
  expect(JSON.stringify(publicAIStatus())).not.toContain(
    "private-test-sentinel",
  );
  process.env.AI_PROVIDER = "openai";
  expect(publicAIStatus()).toMatchObject({
    provider: "openai",
    configured: true,
  });
  process.env.AI_PROVIDER = "unknown";
  expect(publicAIStatus().configured).toBe(false);
});
test("missing Writer key fails explicitly even when an OpenAI key exists", async () => {
  delete process.env.WRITER_API_KEY;
  await expect(generateAgentResponse(preparation("rtb"))).rejects.toThrow(
    "WRITER_API_KEY",
  );
  expect(requests).toHaveLength(0);
});
test("mock mode and the offline guard prevent Writer requests even with a key", async () => {
  fakeWriter("{}");
  process.env.AI_MODE = "mock";
  expect((await generateAgentResponse(preparation("rtb"))).provider).toBe(
    "mock",
  );
  await expect(generateWriter(preparation("rtb"))).rejects.toThrow(
    "not the selected live provider",
  );
  process.env.AI_MODE = "live";
  process.env.XC_OFFLINE_TEST = "1";
  await expect(generateAgentResponse(preparation("rtb"))).rejects.toMatchObject(
    { code: "offline_test_external_ai_blocked" },
  );
  expect(requests).toHaveLength(0);
});

for (const file of ["movers_source_text.txt", "xfinity_pro_source_text.txt"])
  for (const agent of [
    "rtb",
    "research",
    "sparks",
    "consumer",
    "culture",
    "category",
    "brand",
    "analogous",
  ] as const)
    test(`${file}: ${agent} uses Writer with the unchanged context, schema and validation`, async () => {
      const request = ["rtb", "research", "sparks"].includes(agent)
        ? preparation(agent as "rtb" | "research" | "sparks", file)
        : discovery(agent, file);
      fakeWriter(await modelContent(request));
      const result = await generateAgentResponse(request);
      expect(result.provider).toBe("writer");
      expect(result.model).toBe(DEFAULT_WRITER_MODEL);
      expect(
        outputSchemas[request.agentType].safeParse(result.data).success,
      ).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe("https://api.writer.com/v1/chat");
      const body = JSON.parse(String(requests[0].init!.body));
      const prompt = buildAgentPrompt(request);
      expect(body.messages).toEqual([
        { role: "system", content: prompt.instructions },
        { role: "user", content: prompt.input },
      ]);
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.schema.type).toBe("object");
      expect(body.max_tokens).toBeLessThanOrEqual(8192);
      expect(body).not.toHaveProperty("tools");
      expect(body).not.toHaveProperty("reasoning");
      expect(requests[0].init!.redirect).toBe("error");
      if ("sparks" in result.data) expect(result.data.sparks).toHaveLength(6);
    });

for (const status of [401, 402, 403, 429, 500])
  test(`Writer HTTP ${status} stays sanitized, without retries or OpenAI fallback`, async () => {
    fakeWriter("writer-private-test-sentinel: private prompt", status);
    const error = await generateAgentResponse(preparation("rtb")).catch(
      (e) => e,
    );
    expect(error.message).toContain("Writer");
    expect(error.message).not.toContain("private-test-sentinel");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.writer.com/v1/chat");
  });
test("unknown Palmyra IDs and unsupported model controls are rejected before transport", async () => {
  fakeWriter("{}");
  process.env.WRITER_MODEL = "palmyra";
  await expect(generateAgentResponse(preparation("rtb"))).rejects.toThrow(
    "capability registration",
  );
  delete process.env.WRITER_MODEL;
  expect(() =>
    validatedModelSettings("writer", DEFAULT_WRITER_MODEL, {
      reasoningEffort: "low",
    }),
  ).toThrow("reasoning effort");
  expect(requests).toHaveLength(0);
});
test("malformed Discovery output is repaired on Writer, not a different provider", async () => {
  const request = discovery();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: calls++ ? await modelContent(request) : "invalid JSON",
          },
        },
      ],
    });
  };
  expect((await generateAgentResponse(request)).provider).toBe("writer");
  expect(requests).toHaveLength(2);
  expect(
    requests.every((r) => r.url === "https://api.writer.com/v1/chat"),
  ).toBe(true);
});
test("conversation regeneration sends the human message and previous findings through Writer", async () => {
  const request = discovery();
  request.context.action = "another_answer";
  request.context.conversation = {
    scope: {
      kind: "agent",
      threadId: "writer-conversation",
      inputPackVersion: "pack-test",
      question: request.context.question,
      investigationType: "problem",
    },
    currentMessageId: "human-1",
    selectionPolicy: "all-user-and-recent-agent",
    messages: [
      {
        id: "human-1",
        role: "user",
        text: "Investigate the supplied audience without inventing research.",
        createdAt: new Date().toISOString(),
      },
    ],
    omittedMessageIds: [],
    budgetCharacters: 10000,
    usedCharacters: 1000,
  };
  expect(requestSchema.safeParse(request).success).toBe(true);
  fakeWriter(await modelContent(request));
  expect((await generateAgentResponse(request)).provider).toBe("writer");
  expect(
    JSON.parse(String(requests[0].init!.body)).messages[1].content,
  ).toContain("Investigate the supplied audience without inventing research.");
});
test("timeout and refusal errors remain explicit without automatic billable retries", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("Timed out", "TimeoutError");
  };
  await expect(generateAgentResponse(preparation("rtb"))).rejects.toMatchObject(
    { code: "provider_timeout" },
  );
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        { finish_reason: "stop", message: { refusal: "Cannot comply" } },
      ],
    });
  await expect(generateAgentResponse(preparation("rtb"))).rejects.toMatchObject(
    { code: "model_refusal" },
  );
});
test("fabricated Discovery evidence still fails validation with Writer", async () => {
  const request = discovery();
  const data = await generateMock(request);
  if (!("findings" in data)) throw Error("Expected findings");
  for (const finding of data.findings) {
    finding.evidenceState = "evidence_supported";
    finding.evidence = [
      {
        source: "Invented document",
        locator: "invented",
        excerpt: "An invented customer quotation",
        date: "Not supplied",
        audience: "Not supplied",
        context: "Invented",
        accessScope: "supplied",
      },
    ];
  }
  fakeWriter(JSON.stringify(data));
  await expect(generateAgentResponse(request)).rejects.toThrow();
  expect(requests.length).toBeLessThanOrEqual(2);
});
for (const finish of ["length", "content_filter"])
  test(`Writer ${finish} responses are rejected without pretending success`, async () => {
    fakeWriter("{}", 200, finish);
    await expect(generateAgentResponse(preparation("rtb"))).rejects.toThrow(
      "Writer",
    );
    expect(requests).toHaveLength(1);
  });
test("browser response contracts accept Writer provenance without rebranding it", async () => {
  for (const request of [preparation("rtb"), discovery()]) {
    const response = {
      provider: "writer",
      model: DEFAULT_WRITER_MODEL,
      data: await generateMock(request),
      generatedAt: new Date().toISOString(),
    };
    globalThis.fetch = async () => Response.json(response);
    const result =
      request.agentType === "discovery"
        ? await runDiscoveryAgent(request)
        : await runAgent(request);
    expect(result.provider).toBe("writer");
  }
});
