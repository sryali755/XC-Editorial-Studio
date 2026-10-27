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
import { studioPack, seedStudioDiscovery } from "../../lib/discovery-studio";
import { strategySuggestionContext } from "../../lib/ai/strategy-suggestions";
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
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain(prompt.instructions);
      if (agent === "sparks") {
        expect(body.messages[1].content).toContain(prompt.input);
        expect(body.messages[1].content).toContain("sourceExcerptCatalog");
      } else
        expect(body.messages[1]).toEqual({
          role: "user",
          content: prompt.input,
        });
      expect(body.response_format.type).toBe("json_schema");
      expect(body.messages[0].content).toContain("OUTPUT CONTRACT");
      expect(body.messages[0].content).toContain(
        JSON.stringify(body.response_format.json_schema.schema),
      );
      expect(body.response_format.json_schema.schema.type).toBe("object");
      expect(body.max_tokens).toBeLessThanOrEqual(8192);
      expect(body).not.toHaveProperty("tools");
      expect(body).not.toHaveProperty("reasoning");
      expect(requests[0].init!.redirect).toBe("error");
      if ("sparks" in result.data) expect(result.data.sparks).toHaveLength(6);
    });

test("initial Sparks select source IDs and resolve to exact original passages", async () => {
  const request = preparation("sparks");
  const initial = JSON.parse(await modelContent(request));
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const body = JSON.parse(String(init?.body));
    expect(
      body.response_format.json_schema.schema.properties.sparks.items.required,
    ).toContain("excerptId");
    const catalog = JSON.parse(
      body.messages[1].content.split(
        "sourceExcerptCatalog (exact raw-source slices):\n",
      )[1],
    ) as { id: string; excerpt: string }[];
    expect(catalog.length).toBeGreaterThanOrEqual(6);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              sparks: initial.sparks.map(
                (spark: Record<string, unknown>, index: number) => {
                  const { excerpt: _excerpt, ...rest } = spark;
                  void _excerpt;
                  return { ...rest, excerptId: catalog[index].id };
                },
              ),
            }),
          },
        },
      ],
    });
  };
  const result = await generateAgentResponse(request);
  if (!("sparks" in result.data)) throw Error("Expected Sparks");
  expect(result.data.sparks).toHaveLength(6);
  expect(result.data.sparks.every((spark) => spark.excerpt_verified)).toBe(
    true,
  );
  expect(requests).toHaveLength(1);
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
test("Writer normalizes RTB note containers before strict validation", async () => {
  const request = preparation("rtb");
  const data = await generateMock(request);
  if (!("originalRtb" in data)) throw Error("Expected RTB output");
  fakeWriter(
    JSON.stringify({
      ...data,
      reviewNotes: Array.from({ length: 35 }, (_, index) => ({
        note: `Review note ${index + 1}`,
        owner: "GTM",
      })),
    }),
  );
  const result = await generateWriter(request);
  if (!("originalRtb" in result)) throw Error("Expected RTB output");
  expect(result.reviewNotes).toHaveLength(30);
  expect(result.reviewNotes[0]).toContain("Review note 1");
  expect(outputSchemas.rtb.safeParse(result).success).toBe(true);
});
test("Writer normalizes Research list items and strips question metadata", async () => {
  const request = preparation("research");
  const data = await generateMock(request);
  if (!("suppliedEvidence" in data)) throw Error("Expected Research output");
  fakeWriter(
    JSON.stringify({
      ...data,
      suppliedEvidence: [{ source: "Brief", evidence: "Supplied proof" }],
      historicalPerformance: "No connected history retrieved.",
      researchToValidate: [
        {
          source: "Tableau",
          question: "Which supplied KPI changed?",
          decisionInformed: "Whether to reuse the approach",
        },
      ],
    }),
  );
  const result = await generateWriter(request);
  if (!("suppliedEvidence" in result)) throw Error("Expected Research output");
  expect(result.suppliedEvidence[0]).toContain("Supplied proof");
  expect(result.historicalPerformance).toEqual([
    "No connected history retrieved.",
  ]);
  expect(result.researchToValidate).toEqual([
    { source: "Tableau", question: "Which supplied KPI changed?" },
  ]);
  expect(outputSchemas.research.safeParse(result).success).toBe(true);
});
for (const agentType of ["rtb", "research"] as const)
  test(`${agentType} receives one corrective Writer attempt after malformed output`, async () => {
    const request = preparation(agentType);
    const valid = await modelContent(request);
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: calls++ ? valid : "not-json" },
          },
        ],
      });
    };
    expect((await generateAgentResponse(request)).provider).toBe("writer");
    expect(requests).toHaveLength(2);
    const retry = JSON.parse(String(requests[1].init?.body));
    expect(retry.messages[1].content).toContain(
      "Correct the prior structured-output failure",
    );
  });
for (const validChoice of [true, false])
  test(`Spark 4 source repair ${validChoice ? "resolves the model-selected ID exactly" : "rejects an unknown ID without a fallback"}`, async () => {
    const request = preparation("sparks");
    const initial = JSON.parse(await modelContent(request));
    initial.sparks[3].excerpt =
      "A fabricated product quote absent from the brief.";
    let selected = "";
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1)
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(initial) },
            },
          ],
        });
      const body = JSON.parse(String(init?.body));
      const wire =
        body.response_format.json_schema.schema.properties.sparks.items;
      expect(wire.required).toContain("excerptId");
      expect(wire.properties).not.toHaveProperty("excerpt");
      const catalog = JSON.parse(
        body.messages[1].content.split(
          "sourceExcerptCatalog (exact raw-source slices):\n",
        )[1],
      ) as { id: string; excerpt: string }[];
      const choice =
        catalog.find((entry) => /Most reliable WiFi/.test(entry.excerpt)) ??
        catalog[catalog.length - 1];
      selected = choice.excerpt;
      const { excerpt: _quote, ...spark } = initial.sparks[3];
      void _quote;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                sparks: [
                  {
                    ...spark,
                    excerptId: validChoice ? choice.id : "not-a-source-id",
                  },
                ],
              }),
            },
          },
        ],
      });
    };
    if (!validChoice)
      await expect(generateAgentResponse(request)).rejects.toMatchObject({
        code: "model_output_schema_invalid",
      });
    else {
      const result = await generateAgentResponse(request);
      if (!("sparks" in result.data)) throw Error("Expected Sparks");
      expect(result.data.sparks[3].excerpt).toBe(selected);
      expect(result.data.sparks.every((spark) => spark.excerpt_verified)).toBe(
        true,
      );
      for (const index of [0, 1, 2, 4, 5])
        expect(result.data.sparks[index].idea).toBe(initial.sparks[index].idea);
    }
    expect(requests).toHaveLength(2);
  });

for (const lens of ["consumer", "culture", "category", "brand", "analogous"])
  test(`${lens}: derives malformed scope only from a verified supplied citation`, async () => {
    const request = discovery(lens);
    const data = await generateMock(discovery("consumer"));
    if (!("findings" in data)) throw Error("Expected findings");
    let changed = 0;
    for (const finding of data.findings)
      for (const evidence of finding.evidence) {
        evidence.accessScope = "supplied_document" as "supplied";
        changed++;
      }
    expect(changed).toBeGreaterThan(0);
    fakeWriter(JSON.stringify(data));
    const result = await generateWriter(request);
    if (!("findings" in result)) throw Error("Expected findings");
    expect(result.findings.flatMap((finding) => finding.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accessScope: "supplied" }),
      ]),
    );
    expect(requests).toHaveLength(1);
  });

for (const audience of [["Existing customers", "Mobile shoppers"], null])
  test(`verified citation metadata accepts ${JSON.stringify(audience)} audience and extra fields`, async () => {
    const request = discovery("analogous");
    const data = await generateMock(discovery());
    if (!("findings" in data)) throw Error("Expected findings");
    const finding = data.findings.find((entry) => entry.evidence.length)!;
    const original = finding.evidence[0];
    const changed = {
      ...original,
      audience,
      date: null,
      context: ["Supplied brief"],
      audienceNotes: "Additional model metadata",
    };
    finding.evidence[0] = changed as unknown as typeof original;
    fakeWriter(JSON.stringify(data));
    const result = await generateWriter(request);
    if (!("findings" in result)) throw Error("Expected findings");
    const citation = result.findings.find((entry) => entry.evidence.length)!
      .evidence[0];
    expect(citation).toMatchObject({
      source: original.source,
      locator: original.locator,
      excerpt: original.excerpt,
      audience: audience?.join("; ") ?? "Not supplied",
      date: "Not supplied",
      context: "Supplied brief",
    });
    expect(citation).not.toHaveProperty("audienceNotes");
    expect(requests).toHaveLength(1);
  });

test("citation metadata normalization cannot rescue an invented excerpt", async () => {
  const request = discovery();
  const data = await generateMock(request);
  if (!("findings" in data)) throw Error("Expected findings");
  const finding = data.findings.find((entry) => entry.evidence.length)!;
  const original = finding.evidence[0];
  finding.evidence[0] = {
    ...original,
    excerpt: "Invented quotation",
    audience: ["Shoppers"],
    unknownField: "Extra",
  } as unknown as typeof original;
  fakeWriter(JSON.stringify(data));
  await expect(generateWriter(request)).rejects.toMatchObject({
    code: "model_output_schema_invalid",
  });
});

test("schema correction reports the expected metadata type and unexpected keys", async () => {
  const request = discovery();
  const data = await generateMock(request);
  if (!("findings" in data)) throw Error("Expected findings");
  const finding = data.findings.find((entry) => entry.evidence.length)!;
  const original = finding.evidence[0];
  finding.evidence[0] = {
    ...original,
    excerpt: "Unlocatable excerpt",
    audience: ["Shoppers"],
    extraMetadata: "Extra",
  } as unknown as typeof original;
  fakeWriter(JSON.stringify(data));
  await expect(generateWriter(request)).rejects.toMatchObject({
    message: expect.stringContaining("expected string"),
  });
  await expect(generateWriter(request)).rejects.toMatchObject({
    message: expect.stringContaining("extraMetadata"),
  });
});

for (const state of ["supported", "missing", "invented_label"])
  test(`derives malformed evidence state ${state} from verified citations only`, async () => {
    const request = discovery();
    const data = await generateMock(request);
    if (!("findings" in data)) throw Error("Expected findings");
    const expected = data.findings.map((finding) =>
      finding.evidence.length ? "evidence_supported" : "research_gap",
    );
    for (const finding of data.findings)
      finding.evidenceState = state as "research_gap";
    fakeWriter(JSON.stringify(data));
    const result = await generateWriter(request);
    if (!("findings" in result)) throw Error("Expected findings");
    expect(result.findings.map((finding) => finding.evidenceState)).toEqual(
      expected,
    );
  });

test("unverified citations cannot acquire evidence-supported state", async () => {
  const request = discovery();
  const data = await generateMock(request);
  if (!("findings" in data)) throw Error("Expected findings");
  const finding = data.findings.find((entry) => entry.evidence.length)!;
  finding.evidenceState = "supported" as "research_gap";
  finding.evidence[0].excerpt =
    "Invented quotation absent from the supplied source";
  fakeWriter(JSON.stringify(data));
  await expect(generateWriter(request)).rejects.toMatchObject({
    code: "model_output_schema_invalid",
  });
});

for (const defect of ["source", "locator", "excerpt"] as const)
  test(`unverifiable ${defect} cannot acquire supplied access scope`, async () => {
    const request = discovery();
    const data = await generateMock(request);
    if (!("findings" in data)) throw Error("Expected findings");
    const evidence = data.findings.flatMap((finding) => finding.evidence);
    expect(evidence.length).toBeGreaterThan(0);
    for (const citation of evidence) {
      citation.accessScope = "supplied_document" as "supplied";
      citation[defect] = "unmatched private sentinel";
    }
    fakeWriter(JSON.stringify(data));
    await expect(generateWriter(request)).rejects.toMatchObject({
      code: "model_output_schema_invalid",
    });
  });

for (const scope of ["connected", "restricted"] as const)
  test(`explicit ${scope} scope is never relabeled as supplied`, async () => {
    const request = discovery();
    const data = await generateMock(request);
    if (!("findings" in data)) throw Error("Expected findings");
    data.findings = data.findings.filter((finding) => finding.evidence.length);
    const evidence = data.findings.flatMap((finding) => finding.evidence);
    expect(evidence.length).toBeGreaterThan(0);
    for (const citation of evidence) citation.accessScope = scope;
    fakeWriter(JSON.stringify(data));
    const result = await generateWriter(request);
    if (!("findings" in result)) throw Error("Expected findings");
    expect(
      result.findings
        .flatMap((finding) => finding.evidence)
        .every((citation) => citation.accessScope === scope),
    ).toBe(true);
    await expect(generateAgentResponse(request)).rejects.toMatchObject({
      code: "discovery_evidence_validation_failed",
    });
  });

test("Writer normalizes equivalent suggestion envelopes without inventing references", async () => {
  const pack = studioPack(phase1Fixture().session);
  const context = strategySuggestionContext(pack, seedStudioDiscovery(pack));
  const request = requestSchema.parse({
    agentType: "strategySuggestions",
    context,
  });
  const data = await generateMock(request);
  if (!("suggestions" in data)) throw Error("Expected suggestions");
  const directions = data.suggestions.map((item) => ({
    brief_line: item.briefLine,
    rationale: item.rationale,
    evidence_ids: item.evidenceIds,
    spark_ids: item.sparkIds,
    finding_links: item.findingLinks,
    validation_gap: item.validationGap,
  }));
  for (const payload of [
    { directions },
    {
      suggestions: Object.fromEntries(
        directions.map((item, index) => [String(index), item]),
      ),
    },
  ]) {
    fakeWriter(JSON.stringify(payload));
    expect(await generateWriter(request)).toEqual(data);
  }
  fakeWriter(
    JSON.stringify({
      directions: directions.map((item) => ({ ...item, evidence_ids: [] })),
    }),
  );
  await expect(generateWriter(request)).rejects.toMatchObject({
    code: "model_output_schema_invalid",
  });
});

test("Writer normalizes comparison containers and excludes extra output metadata", async () => {
  const foundation = discovery().context.foundation;
  const generated = await generateMock(discovery());
  if (!("findings" in generated)) throw Error("Expected findings");
  const request = requestSchema.parse({
    agentType: "connections",
    context: {
      foundation,
      findings: generated.findings.slice(0, 2).map((finding, index) => ({
        ...finding,
        id: `fixture-${index}`,
        lensId: "consumer",
        inputPackVersion: "pack-test",
        runVersion: 1,
      })),
    },
  });
  fakeWriter(
    JSON.stringify({
      relationships: {
        interpretation: "A shared source does not prove a shared cause.",
      },
      tensions: "A proposed explanation still needs validation.",
      questionsToExplore: ["What evidence would distinguish the explanations?"],
      note: "Comparison of supplied material only.",
      outputMetadata: { generated: true },
    }),
  );
  const result = await generateWriter(request);
  expect(outputSchemas.connections.safeParse(result).success).toBe(true);
  if (!("relationships" in result)) throw Error("Expected comparison");
  expect(result.questions).toEqual([
    "What evidence would distinguish the explanations?",
  ]);
  expect(result.tensions).toEqual([
    "A proposed explanation still needs validation.",
  ]);
  const retry = buildAgentPrompt(
    request,
    1,
    "test",
    "questions: expected string array",
  );
  expect(retry.input).toContain("questions: expected string array");
});

test("Discovery retrieval metadata reflects the actual supplied-only adapter", async () => {
  const request = discovery();
  const data = await generateMock(request);
  if (!("findings" in data)) throw Error("Expected findings");
  for (const retrievalNote of [
    null,
    { sources: ["Supplied brief"] },
    "Claimed external retrieval",
  ]) {
    fakeWriter(JSON.stringify({ ...data, retrievalNote }));
    const result = await generateWriter(request);
    if (!("findings" in result)) throw Error("Expected findings");
    expect(result.retrievalNote).toBe(
      "Only supplied Input Pack documents were analyzed. No external connector was searched.",
    );
    expect(result.findings).toEqual(data.findings);
  }
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
test("a socket drop during structured-output correction still recovers", async () => {
  const request = preparation("rtb");
  const valid = await modelContent(request);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 2)
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("closed"), { code: "EPIPE" }),
      });
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: calls === 1 ? "invalid JSON" : valid },
        },
      ],
    });
  };
  expect((await generateAgentResponse(request)).provider).toBe("writer");
  expect(calls).toBe(3);
});

test("transport recovery is not multiplied by a later structured-output repair", async () => {
  const request = preparation("rtb");
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls !== 2)
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("closed"), { code: "UND_ERR_SOCKET" }),
      });
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: "invalid JSON" } },
      ],
    });
  };
  await expect(generateAgentResponse(request)).rejects.toMatchObject({
    code: "writer_connection_error",
  });
  expect(calls).toBe(3);
});

test("a Writer connection failure is retried once independently of output repair", async () => {
  const request = preparation("rtb");
  const content = await modelContent(request);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content } }],
    });
  };
  expect((await generateAgentResponse(request)).provider).toBe("writer");
  expect(calls).toBe(2);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("fetch failed");
  };
  await expect(generateAgentResponse(request)).rejects.toMatchObject({
    code: "writer_connection_error",
  });
  expect(calls).toBe(2);
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
