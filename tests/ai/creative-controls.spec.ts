import { test, expect } from "@playwright/test";
import OpenAI from "openai";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import {
  currentPersonality,
  defaultPersonality,
  perspectiveIds,
  creativeControls,
} from "../../lib/creative-controls";
import {
  generateOpenAI,
  resetOpenAIClientForTests,
} from "../../lib/ai/openai-provider";
import { generateAgentResponse } from "../../lib/ai/provider";
import {
  perspectiveOutputIssue,
  perspectiveQualityReview,
} from "../../lib/ai/perspective-quality";
import {
  modelCapabilities,
  validatedModelSettings,
} from "../../lib/ai/capabilities";
import {
  requestSchema,
  sparkTerritoryTypes,
  type AgentDataMap,
  type AgentRequest,
  type AgentResponse,
} from "../../lib/ai/schemas";
import {
  ROUND_TABLE_INTENSITY_BANDS,
  ROUND_TABLE_PERSONAS,
  ROUND_TABLE_PROMPT_VERSIONS,
  ROUND_TABLE_SHARED_CORE,
} from "../../lib/roundtable-prompts";
import {
  evaluationFoundation,
  evaluationPack,
} from "../../evaluations/campaign";
import { mobileIMCBrief } from "../fixtures/mobile-imc-brief";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import { selectedFoundation } from "../../lib/ai/context";
import type { StrategyInputPack } from "../../lib/types";
import { demoExecution } from "../../lib/demo";
import { renderBrief } from "../../lib/ai/format";

const originalEnvironment = {
  AI_MODE: process.env.AI_MODE,
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function mobilePack(): StrategyInputPack {
  const parsedIMC = parseIMCBrief(mobileIMCBrief);
  return {
    campaignName: parsedIMC.fields.campaign.value,
    objective: parsedIMC.fields.objective.value,
    audience: parsedIMC.fields.audience.value,
    product: parsedIMC.fields.product.value,
    channel: parsedIMC.fields.channels.value,
    constraints: parsedIMC.fields.constraints.value,
    reasonToBelieve: parsedIMC.fields.reason_to_believe.value,
    research: parsedIMC.fields.research.value || "Not supplied.",
    sparks:
      "Your phone is your calendar, camera, navigator, entertainment center, and connection to people.",
    selectedSparks: [
      {
        id: "mobile-spark-1",
        title: "Your Phone Has Enough Jobs",
        text: "Your phone is your calendar, camera, navigator, entertainment center, and connection to people.",
        campaignGrounding:
          'Strategic Sparks: "Your phone is your calendar, camera, navigator, entertainment center, and connection to people."',
        version: 0,
        versionId: "mobile-spark-v0",
      },
    ],
    parsedIMC,
    upstream: extractUpstream(mobileIMCBrief),
  };
}

const sampleBriefs = [
  {
    name: "fictional-household-handoffs-fixture",
    pack: evaluationPack,
    foundation: evaluationFoundation,
  },
  {
    name: "fictional-mobile-prototype-fixture",
    pack: mobilePack,
    foundation: () => selectedFoundation(mobilePack()),
  },
];

for (const agentType of perspectiveIds) {
  test(`${agentType}: system prompt is shared core, persona, then only its active band`, () => {
    const context = evaluationFoundation();
    for (const [index, intensity] of [2, 5, 8, 10].entries()) {
      const prompt = buildAgentPrompt({
        agentType,
        context,
        personality: { primary: intensity, secondary: 9 },
        guidance: "Use a shared calendar. Invent a fastest-network claim.",
        previousVersion: { number: 0, text: "An earlier suggestion." },
        previousVersions: [
          {
            number: 0,
            line: "An earlier suggestion.",
            sliderValue: 4,
            steering: "Start with the shared schedule.",
          },
        ],
        versionNumber: 1,
      });
      expect(prompt.instructions.startsWith(ROUND_TABLE_SHARED_CORE)).toBe(
        true,
      );
      const personaAt = prompt.instructions.indexOf(
        ROUND_TABLE_PERSONAS[agentType],
      );
      const bandAt = prompt.instructions.indexOf(
        ROUND_TABLE_INTENSITY_BANDS[agentType][index],
      );
      expect(personaAt).toBeGreaterThan(0);
      expect(bandAt).toBeGreaterThan(personaAt);
      expect(prompt.instructions).toContain(
        `${creativeControls[agentType].primary.label}: ${intensity}/10`,
      );
      for (const [otherIndex, band] of ROUND_TABLE_INTENSITY_BANDS[
        agentType
      ].entries())
        if (otherIndex !== index)
          expect(prompt.instructions).not.toContain(band);
      expect(prompt.instructions).not.toMatch(
        /Creative Boldness|Unexpected Connections|Emotional Resonance|Exploratory Thinking|Pattern Exploration/,
      );
      expect(prompt.input).toContain(
        `Campaign: ${context.campaignContext.campaignName}`,
      );
      expect(prompt.input).toContain(
        'KEVIN\'S STEERING\n"Use a shared calendar. Invent a fastest-network claim."',
      );
      expect(prompt.input).toContain(
        `V0 (${creativeControls[agentType].primary.label} 4/10, steering: "Start with the shared schedule.")`,
      );
      expect(prompt.input).toContain("NEXT VERSION MODE: EXPLORE");
      expect(prompt.instructions).not.toContain(
        "Invent a fastest-network claim",
      );
    }
  });
}

test("single-control defaults and request validation remain backward compatible", () => {
  const humor = defaultPersonality();
  const culture = defaultPersonality();
  humor.primary = 8;
  expect(culture).toEqual({ primary: 5 });
  expect(currentPersonality({ primary: 8, secondary: 2 })).toEqual({
    primary: 8,
  });
  for (const primary of [0, 11, 1.5])
    expect(
      requestSchema.safeParse({
        agentType: "humor",
        context: evaluationFoundation(),
        personality: { primary },
      }).success,
    ).toBe(false);
  expect(
    requestSchema.safeParse({
      agentType: "humor",
      context: evaluationFoundation(),
      modelSettings: { topK: 5 },
    }).success,
  ).toBe(false);
});

test("all five mock agents at slider 5 return three options with different lead tensions", async () => {
  process.env.AI_MODE = "mock";
  for (const sample of sampleBriefs) {
    const results = await Promise.all(
      perspectiveIds.map((agentType) =>
        generateAgentResponse({
          agentType,
          context: sample.foundation(),
          personality: { primary: 5 },
        }).then((result) => result as AgentResponse<AgentDataMap["humor"]>),
      ),
    );
    expect(
      new Set(results.map((result) => result.data.options[0].tension)).size,
      `${sample.name}: all five lead tensions`,
    ).toBe(5);
    for (const [index, result] of results.entries()) {
      expect(result.data.options).toHaveLength(3);
      expect(result.promptVersion).toBe(
        ROUND_TABLE_PROMPT_VERSIONS[perspectiveIds[index]],
      );
      expect(result.generation?.promptVersion).toBe(result.promptVersion);
    }
  }
});

test("Humorous & Witty changes clearly across slider 2, 5 and 8", async () => {
  process.env.AI_MODE = "mock";
  for (const sample of sampleBriefs) {
    const results = await Promise.all(
      [2, 5, 8].map((primary) =>
        generateAgentResponse({
          agentType: "humor",
          context: sample.foundation(),
          personality: { primary },
        }).then((result) => result as AgentResponse<AgentDataMap["humor"]>),
      ),
    );
    expect(
      new Set(results.map((result) => result.data.options[0].brief_line)).size,
      sample.name,
    ).toBe(3);
    expect(results[0].data.options[0].brief_line).toContain("straight-faced");
    expect(results[1].data.options[0].brief_line).toContain("double-booked");
    expect(results[2].data.options[0].brief_line).toContain("traffic control");
  }
});

test("unsupported Xfinity Shield steering is flagged without inventing features", async () => {
  process.env.AI_MODE = "mock";
  for (const sample of sampleBriefs) {
    const result = (await generateAgentResponse({
      agentType: "humor",
      context: sample.foundation(),
      personality: { primary: 5 },
      guidance: "Relate it to Xfinity Shield.",
    })) as AgentResponse<AgentDataMap["humor"]>;
    expect(result.data.steering_note).toContain(
      "Xfinity Shield is not supplied",
    );
    expect(
      result.data.options.map((option) => option.brief_line).join(" "),
      sample.name,
    ).not.toMatch(/Shield|protect|block|secure|security/i);
  }
});

test("both sample briefs regenerate V1 and V2 without replacing selectable V0", async () => {
  process.env.AI_MODE = "mock";
  for (const sample of sampleBriefs) {
    const context = sample.foundation();
    const versions = [];
    for (const number of [0, 1, 2]) {
      const prior = versions[number - 1];
      const response = (await generateAgentResponse({
        agentType: "humor",
        context,
        personality: { primary: 5 },
        versionNumber: number,
        refinementMode: "explore",
        priorCandidates: versions.map((version) => version.text),
        previousVersions: versions.map((version) => ({
          number: version.number,
          line: version.text,
          sliderValue: 5,
          steering: "",
        })),
        ...(prior
          ? { previousVersion: { number: prior.number, text: prior.text } }
          : {}),
      })) as AgentResponse<AgentDataMap["humor"]>;
      versions.push({
        id: `${sample.name}-v${number}`,
        number,
        text: response.data.options[0].brief_line,
        promptVersion: response.promptVersion,
      });
    }
    const [v0, v1, v2] = versions;
    expect([v0.number, v1.number, v2.number]).toEqual([0, 1, 2]);
    expect(new Set([v0.text, v1.text, v2.text]).size, sample.name).toBe(3);
    const history = [v2, v1, v0];
    expect(history.find((version) => version.id === v0.id)).toEqual(v0);
    expect(
      history.every((version) => version.promptVersion?.endsWith("v1.2")),
    ).toBe(true);
  }
});

test("v1.2 starts each lens with its source material and names absent sections", () => {
  const foundation = selectedFoundation(mobilePack());
  const expected = {
    humor: ["Audience insights:", "Consumers rely on their smartphones"],
    culture: ["Research observations about social and shared behaviors:"],
    audience: [
      "Target audience:",
      "Consumer tension:",
      "People want mobile connectivity",
    ],
    market: [
      "Category observations: Not supplied in this brief",
      "Competitive intelligence: Not supplied in this brief",
    ],
    brand: [
      "Brand guidelines:",
      "Historical campaign patterns: Not supplied in this brief",
    ],
  } as const;
  for (const agentType of perspectiveIds) {
    const input = buildAgentPrompt({ agentType, context: foundation }).input;
    expect(input.startsWith("YOUR STARTING MATERIAL\n")).toBe(true);
    expect(input.indexOf("FULL CAMPAIGN CONTEXT")).toBeGreaterThan(0);
    for (const value of expected[agentType]) expect(input).toContain(value);
    expect(input).toContain("XC INPUT PACK\nCampaign:");
    expect(input).toContain("Consumer tension from brief:");
  }
});

test("v1.2 routes all six typed Sparks by lens and leaves legacy Sparks as context", () => {
  const pack = mobilePack();
  pack.selectedSparks = sparkTerritoryTypes.map((territory_type, index) => ({
    id: `spark-${index}`,
    title: `Territory ${index}`,
    text: `Distinct idea ${index} from the brief.`,
    territory_type,
    territory: `Territory label ${index}`,
    excerpt: "Consumers rely on their smartphones throughout the day",
    version: 0,
    versionId: "v0",
  }));
  pack.selectedSparks.push({
    id: "legacy",
    title: "Older Spark",
    text: "Older idea without a territory type.",
    version: 0,
    versionId: "legacy",
  });
  const expected: Record<(typeof sparkTerritoryTypes)[number], string[]> = {
    human_truth: ["audience"],
    social_cultural: ["culture"],
    category_convention: ["market"],
    product_truth: ["brand"],
    moment: ["audience", "humor"],
    wildcard: ["humor"],
  };
  for (const agentType of perspectiveIds) {
    const input = buildAgentPrompt({
      agentType,
      context: selectedFoundation(pack),
    }).input;
    for (const [index, type] of sparkTerritoryTypes.entries()) {
      const marker = expected[type].includes(agentType)
        ? type === "moment" && agentType === "humor"
          ? "FOR YOUR LENS (secondary)"
          : "FOR YOUR LENS"
        : "CONTEXT";
      expect(input).toContain(`[${marker}] Territory ${index} (${type})`);
    }
    expect(input).toContain("[CONTEXT] Older Spark (legacy type unknown)");
  }
});

test("v1.2 gives only the matching lens the lead option when one Spark is selected", () => {
  const pack = mobilePack();
  pack.selectedSparks![0].territory_type = "human_truth";
  const context = selectedFoundation(pack);
  const audience = buildAgentPrompt({ agentType: "audience", context });
  const witty = buildAgentPrompt({ agentType: "humor", context });
  expect(audience.input).toContain(
    "[FOR YOUR LENS] Your Phone Has Enough Jobs",
  );
  expect(witty.input).toContain("[CONTEXT] Your Phone Has Enough Jobs");
  expect(audience.instructions).toContain("use it for your first option");
  expect(witty.instructions).toContain(
    "keep your first option grounded in YOUR PRIMARY SOURCES",
  );
  expect(witty.instructions).toContain(
    "Never restate the brief's own consumer tension",
  );
});

test("selected perspective versions flow through weighted synthesis and final brief on both samples", async () => {
  process.env.AI_MODE = "mock";
  for (const sample of sampleBriefs) {
    const pack = sample.pack();
    const foundation = selectedFoundation(pack);
    const generated = await Promise.all(
      (["humor", "culture"] as const).map(
        (agentType) =>
          generateAgentResponse({
            agentType,
            context: foundation,
            personality: { primary: 5 },
          }) as Promise<AgentResponse<AgentDataMap["humor"]>>,
      ),
    );
    const lines = generated.map((response, index) => ({
      id: `${sample.name}-${index}`,
      agentId: index === 0 ? "humor" : "culture",
      personaName: index === 0 ? "Humorous / Witty" : "Cultural / Social",
      version: 0,
      text: response.data.options[0].brief_line,
    }));
    const weights = { [lines[0].id]: 60, [lines[1].id]: 40 };
    const synthesis = (await generateAgentResponse({
      agentType: "synthesis",
      context: { foundation, lines, weights },
    })) as AgentResponse<AgentDataMap["synthesis"]>;
    const approvedLine = synthesis.data.synthesizedLines[0].line;
    const payload = {
      strategyInputPack: pack,
      approvedBriefLine: {
        approvalState: "Approved",
        sourcePerspectives: lines,
        briefLine: approvedLine,
        strategyInputPack: pack,
        approvedAt: "2026-10-13T12:00:00.000Z",
        approvedBy: "Kevin",
        source: "Weighted synthesis test",
      },
      executionDirection: demoExecution,
    } as const;
    const final = await generateAgentResponse({
      agentType: "finalBrief",
      context: {
        foundation,
        approvedStrategy: {
          approvalState: "Approved",
          briefLine: approvedLine,
          approvedBy: "Kevin",
          approvedAt: payload.approvedBriefLine.approvedAt,
          source: payload.approvedBriefLine.source,
        },
        executionDirection: demoExecution,
      },
    });
    const brief = renderBrief(
      final as AgentResponse<AgentDataMap["finalBrief"]>,
      payload,
    );
    expect(brief.sections).toContainEqual({
      title: "Approved Brief Line",
      content: approvedLine,
    });
  }
});

test("sample top lines avoid Spark echo, banned openers, and audience-role subjects", async () => {
  process.env.AI_MODE = "mock";
  const normalizeWords = (value: string) =>
    value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const sample of sampleBriefs) {
    const foundation = sample.foundation();
    const results = await Promise.all(
      perspectiveIds.map((agentType) =>
        generateAgentResponse({
          agentType,
          context: foundation,
          personality: { primary: 5 },
        }).then((result) => result as AgentResponse<AgentDataMap["humor"]>),
      ),
    );
    const lines = results.map((result) => result.data.options[0].brief_line);
    console.info(`[roundtable-lines] ${sample.name}: ${lines.join(" | ")}`);
    const spark = foundation.selectedSparks[0];
    const phrases: string[] = [];
    const sparkWords = normalizeWords(spark.text);
    for (let index = 0; index <= sparkWords.length - 3; index++)
      phrases.push(sparkWords.slice(index, index + 3).join(" "));
    if (spark.title) phrases.push(normalizeWords(spark.title).join(" "));
    const echoCount = lines.filter((line) => {
      const normalized = ` ${normalizeWords(line).join(" ")} `;
      return phrases.some((phrase) => normalized.includes(` ${phrase} `));
    }).length;
    expect(echoCount, sample.name).toBeLessThanOrEqual(1);
    for (const line of lines) {
      expect(line).not.toMatch(
        /^(?:[“"'‘’]\s*)?(?:make|give|show|help|let|reveal|position|turn)\b/i,
      );
      expect(line).not.toMatch(
        /^(?:the\s+)?(?:household\s+wi-?fi\s+person|phone\s+manager)\b/i,
      );
    }
  }
});

test("exact-evidence validation rejects unsupported excerpts", () => {
  const context = evaluationFoundation();
  const data: AgentDataMap["humor"] = {
    options: [0, 1, 2].map((index) => ({
      brief_line: `A distinct brief line for option ${index + 1}.`,
      tension: `A distinct tension for option ${index + 1}.`,
      evidence: [
        index === 2
          ? "This quotation was never in the brief."
          : context.campaignContext.objective,
      ],
      territory: "A grounded creative territory.",
      why_on_strategy: "It supports the supplied objective.",
      assumptions: [],
    })),
    steering_note: "",
    change_note: "",
  };
  expect(perspectiveOutputIssue(data, context)).toContain(
    "not an exact excerpt",
  );
});

test("quality review finds banned openers and three-word selected-Spark echoes", () => {
  const context = evaluationFoundation();
  const data = validPerspectiveData();
  data.options[0].brief_line = "Make household handoffs easier to recognize.";
  data.options[1].brief_line =
    "Explore household handoffs as the center of the day.";
  expect(perspectiveQualityReview(data, context).retryChecks).toEqual([
    "banned_openers",
    "spark_echo",
  ]);
});

function validPerspectiveData(): AgentDataMap["humor"] {
  const context = evaluationFoundation();
  return {
    options: [0, 1, 2].map((index) => ({
      brief_line: `A distinct creative direction for option ${index + 1}.`,
      tension: `A distinct supported tension for option ${index + 1}.`,
      evidence: [context.campaignContext.objective],
      territory: "Explore a specific campaign idea.",
      why_on_strategy: "It connects to the objective.",
      assumptions: [],
    })),
    steering_note: "",
    change_note: "",
  };
}

function responseFor(outputText: string) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: outputText,
              annotations: [],
            },
          ],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function openAIStub(outputText: string) {
  return new OpenAI({
    apiKey: "test-sentinel",
    maxRetries: 0,
    fetch: async () => responseFor(outputText),
  });
}

test("malformed and schema-invalid model responses report distinct validation failures", async () => {
  process.env.OPENAI_MODEL = "gpt-5.5";
  const request: AgentRequest = {
    agentType: "humor",
    context: evaluationFoundation(),
  };
  await expect(
    generateOpenAI(request, openAIStub("{bad")),
  ).rejects.toMatchObject({ code: "model_output_invalid_json" });
  await expect(
    generateOpenAI(request, openAIStub(JSON.stringify({ options: [] }))),
  ).rejects.toMatchObject({ code: "model_output_schema_invalid" });
});

test("live perspective generation retries malformed structured output exactly once", async () => {
  process.env.AI_MODE = "live";
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-private-sentinel";
  process.env.OPENAI_MODEL = "gpt-5.5";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return responseFor(
      calls === 1 ? "{bad" : JSON.stringify(validPerspectiveData()),
    );
  };
  try {
    const result = (await generateAgentResponse({
      agentType: "humor",
      context: evaluationFoundation(),
      personality: { primary: 5 },
    })) as AgentResponse<AgentDataMap["humor"]>;
    expect(calls).toBe(2);
    expect(result.data.options).toHaveLength(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Step 3b retries once, logs the fired check, and accepts the corrected result", async () => {
  process.env.AI_MODE = "live";
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-private-sentinel";
  process.env.OPENAI_MODEL = "gpt-5.5";
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const logs: string[] = [];
  let calls = 0;
  const invalid = validPerspectiveData();
  invalid.options[0].brief_line =
    "Make this specific campaign tension impossible to overlook.";
  globalThis.fetch = async () => {
    calls++;
    return responseFor(
      JSON.stringify(calls === 1 ? invalid : validPerspectiveData()),
    );
  };
  console.info = (...args: unknown[]) => logs.push(args.join(" "));
  resetOpenAIClientForTests();
  try {
    const result = (await generateAgentResponse({
      agentType: "humor",
      context: evaluationFoundation(),
      personality: { primary: 5 },
    })) as AgentResponse<AgentDataMap["humor"]>;
    expect(calls).toBe(2);
    expect(result.data.options[0].brief_line).not.toMatch(
      /^(?:make|give|show|help|let|reveal|position|turn)\b/i,
    );
    expect(logs.join("\n")).toContain(
      "check=banned_openers retried=true passed=true",
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    resetOpenAIClientForTests();
  }
});

test("capability checks keep the slider out of model sampling parameters", async () => {
  process.env.OPENAI_MODEL = "gpt-5.5";
  let calls = 0;
  let sent: Record<string, unknown> = {};
  const sdk = new OpenAI({
    apiKey: "test-sentinel",
    maxRetries: 0,
    fetch: async (_url, init) => {
      calls++;
      sent = JSON.parse(String(init?.body));
      return responseFor(JSON.stringify(validPerspectiveData()));
    },
  });
  const request: AgentRequest = {
    agentType: "humor",
    context: evaluationFoundation(),
    personality: { primary: 10 },
    guidance: "A playful calendar.",
  };
  for (const modelSettings of [{ temperature: 1 }, { topP: 0.8 }]) {
    await expect(
      generateOpenAI({ ...request, modelSettings }, sdk),
    ).rejects.toThrow("not enabled");
  }
  expect(calls).toBe(0);
  await generateOpenAI(request, sdk);
  expect(calls).toBe(1);
  expect(sent.reasoning).toEqual({ effort: "low" });
  await generateOpenAI({ ...request, versionNumber: 1 }, sdk);
  expect(calls).toBe(2);
  expect(sent.reasoning).toEqual({ effort: "low" });
  await generateOpenAI(
    {
      ...request,
      modelSettings: { reasoningEffort: "low", verbosity: "low" },
    },
    sdk,
  );
  expect(calls).toBe(3);
  expect(sent).not.toHaveProperty("temperature");
  expect(sent).not.toHaveProperty("top_p");
  expect(sent.reasoning).toEqual({ effort: "low" });
  expect(sent.max_output_tokens).toBe(5000);
  expect(sent.text).toMatchObject({
    verbosity: "low",
    format: { type: "json_schema", strict: true },
  });
  expect(sent.instructions).toContain("Wit & Humor: 10/10");
  expect(String(sent.input)).toContain(
    'KEVIN\'S STEERING\n"A playful calendar."',
  );
  expect(modelCapabilities("writer", "unregistered")).toBeUndefined();
  expect(() => validatedModelSettings("openai", "unregistered")).toThrow(
    "no verified",
  );
  expect(() =>
    validatedModelSettings("openai", "gpt-5.5", { temperature: 3 }),
  ).toThrow("Invalid");
});
