import { expect, test } from "@playwright/test";
import OpenAI from "openai";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioPack,
} from "../../lib/discovery-studio";
import { mobileIMCBrief } from "../fixtures/mobile-imc-brief";
import {
  strategySuggestionContext,
  strategySuggestionIssue,
} from "../../lib/ai/strategy-suggestions";
import { requestSchema, outputSchemas } from "../../lib/ai/schemas";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { generateAgentResponse } from "../../lib/ai/provider";
import { generateOpenAI } from "../../lib/ai/openai-provider";

const originalMode = process.env.AI_MODE;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;
test.afterEach(() => {
  if (originalMode === undefined) delete process.env.AI_MODE;
  else process.env.AI_MODE = originalMode;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

function fixture() {
  const pack = studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief));
  pack.selectedSparks = [
    {
      id: "selected-spark",
      version: 1,
      versionId: "v1",
      text: "The Group Chat Never Sleeps",
      title: "The Group Chat Never Sleeps",
      idea: "Explore everyday communication habits.",
    },
  ];
  const discovery = seedStudioDiscovery(pack);
  discovery.savedFindingIds = ["finding-1"];
  discovery.runs[0].versions.push({
    id: "run-1",
    number: 1,
    question: "What gets in the way?",
    investigationType: "problem",
    action: "initial",
    guidance: "",
    createdAt: new Date().toISOString(),
    inputPackVersion: "pack-1",
    sourceCoverage: [],
    provider: "mock",
    findings: [
      {
        id: "finding-1",
        title: "Plan comparison is unresolved",
        whatWeFound:
          "The brief only proposes that consumers may find comparison confusing.",
        evidence: [],
        whyItMayMatter: "Could shape a direction.",
        whatComplicatesIt: "No validated research.",
        questionToExplore: "What creates confusion?",
        evidenceState: "research_gap",
        lensId: "consumer",
        inputPackVersion: "pack-1",
        runVersion: 1,
      },
    ],
  });
  return { pack, discovery };
}

test("current IMC, selected Sparks, and saved findings reach the strategy prompt", () => {
  const { pack, discovery } = fixture();
  const context = strategySuggestionContext(pack, discovery);
  const request = requestSchema.parse({
    agentType: "strategySuggestions",
    context,
  });
  const prompt = buildAgentPrompt(request);
  expect(JSON.parse(prompt.input).sourceBrief).toBe(mobileIMCBrief);
  expect(prompt.input).toContain("The Group Chat Never Sleeps");
  expect(prompt.input).toContain("Plan comparison is unresolved");
  expect(prompt.input).toContain("No validated research.");
  expect(prompt.instructions).toContain(
    "every suggestion must include at least one findingLinks item",
  );
  expect(context.sourceExcerpts.length).toBeGreaterThan(1);
  for (const source of context.sourceExcerpts)
    expect(mobileIMCBrief).toContain(source.excerpt);
});

test("mock generation gives three distinct, source-supported, unapproved directions", async () => {
  process.env.AI_MODE = "mock";
  const { pack, discovery } = fixture();
  const context = strategySuggestionContext(pack, discovery);
  const result = await generateAgentResponse(
    requestSchema.parse({ agentType: "strategySuggestions", context }),
  );
  expect(result.provider).toBe("mock");
  const output = outputSchemas.strategySuggestions.parse(result.data);
  expect(output.suggestions).toHaveLength(3);
  expect(
    output.suggestions.every(
      (option) => option.findingLinks[0]?.findingId === "finding-1",
    ),
  ).toBe(true);
  expect(
    new Set(output.suggestions.map((item) => item.briefLine)),
  ).toHaveProperty("size", 3);
  expect(strategySuggestionIssue(context, output)).toBe("");
  expect(JSON.stringify(output)).toContain("More Life. Less Phone Drama.");
});

test("unsupported excerpts, unselected Sparks, duplicate lines and malformed responses are rejected", () => {
  const { pack, discovery } = fixture();
  const context = strategySuggestionContext(pack, discovery);
  const output = outputSchemas.strategySuggestions.parse({
    suggestions: [0, 1, 2].map((i) => ({
      briefLine: `A distinct strategic direction number ${i}`,
      rationale: "Based on the source objective.",
      evidenceIds: [context.sourceExcerpts[0].id],
      sparkIds: [],
      findingLinks: [
        {
          findingId: "finding-1",
          contribution:
            "The saved comparison gap makes this an unverified question to test.",
        },
      ],
      validationGap: "Validate with intended audience.",
    })),
  });
  expect(strategySuggestionIssue(context, output)).toBe("");
  expect(
    strategySuggestionIssue(context, {
      suggestions: output.suggestions.map((option, index) =>
        index === 0 ? { ...option, findingLinks: [] } : option,
      ),
    }),
  ).toMatch(/does not explain/i);
  expect(
    strategySuggestionIssue(context, {
      suggestions: output.suggestions.map((option, index) =>
        index === 0
          ? {
              ...option,
              findingLinks: [
                {
                  findingId: "not-saved",
                  contribution:
                    "A made-up finding supposedly shaped this strategy.",
                },
              ],
            }
          : option,
      ),
    }),
  ).toMatch(/not saved/i);
  expect(
    strategySuggestionIssue(context, {
      suggestions: output.suggestions.map((item, i) =>
        i === 0 ? { ...item, evidenceIds: ["fabricated"] } : item,
      ),
    }),
  ).toMatch(/unsupported|no valid/i);
  expect(
    strategySuggestionIssue(context, {
      suggestions: output.suggestions.map((item, i) =>
        i === 0 ? { ...item, sparkIds: ["unselected"] } : item,
      ),
    }),
  ).toMatch(/not selected/i);
  expect(
    strategySuggestionIssue(context, {
      suggestions: output.suggestions.map((item, i) =>
        i === 1
          ? { ...item, briefLine: output.suggestions[0].briefLine }
          : item,
      ),
    }),
  ).toMatch(/repeat/i);
  expect(
    outputSchemas.strategySuggestions.safeParse({
      suggestions: [{ briefLine: "Incomplete" }],
    }).success,
  ).toBe(false);
  const noFindings = { ...context, savedFindings: [] };
  expect(
    strategySuggestionIssue(noFindings, {
      suggestions: output.suggestions.map((option) => ({
        ...option,
        findingLinks: [],
      })),
    }),
  ).toBe("");
});

test("live mode without credentials fails rather than returning mock suggestions", async () => {
  process.env.AI_MODE = "live";
  delete process.env.OPENAI_API_KEY;
  const { pack, discovery } = fixture();
  await expect(
    generateAgentResponse(
      requestSchema.parse({
        agentType: "strategySuggestions",
        context: strategySuggestionContext(pack, discovery),
      }),
    ),
  ).rejects.toThrow(/OPENAI_API_KEY/);
});

test("live transport uses the existing model, low effort and strict schema without a paid request", async () => {
  process.env.OPENAI_MODEL = "gpt-5.5";
  const { pack, discovery } = fixture();
  const context = strategySuggestionContext(pack, discovery);
  const output = outputSchemas.strategySuggestions.parse({
    suggestions: [0, 1, 2].map((index) => ({
      briefLine: `Distinct campaign-specific strategy direction ${index} for Xfinity Mobile.`,
      rationale:
        "Use the supplied objective as a starting point, pending human review.",
      evidenceIds: [context.sourceExcerpts[0].id],
      sparkIds: [],
      findingLinks: [
        {
          findingId: "finding-1",
          contribution:
            "The saved comparison gap makes this an unverified question to test.",
        },
      ],
      validationGap: "Validate the audience barrier with research.",
    })),
  });
  let sent: Record<string, unknown> = {};
  const sdk = new OpenAI({
    apiKey: "sk-test-private-sentinel",
    maxRetries: 0,
    fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "resp_suggestions",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_suggestions",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(output),
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
  const result = await generateOpenAI(
    requestSchema.parse({ agentType: "strategySuggestions", context }),
    sdk,
  );
  expect(result).toEqual(output);
  expect(sent.model).toBe("gpt-5.5");
  expect(sent.reasoning).toEqual({ effort: "low" });
  expect(sent.store).toBe(false);
  expect(sent.text).toMatchObject({
    format: { type: "json_schema", strict: true },
  });
  expect(JSON.stringify(sent)).toContain("The Group Chat Never Sleeps");
  expect(JSON.stringify(sent)).not.toContain("sk-test-private-sentinel");
});
