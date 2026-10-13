import { test, expect } from "@playwright/test";
import OpenAI from "openai";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import {
  defaultPersonality,
  perspectiveIds,
  creativeControls,
} from "../../lib/creative-controls";
import { generateOpenAI } from "../../lib/ai/openai-provider";
import { generateAgentResponse } from "../../lib/ai/provider";
import {
  modelCapabilities,
  validatedModelSettings,
} from "../../lib/ai/capabilities";
import { requestSchema, type AgentRequest } from "../../lib/ai/schemas";
import { evaluationFoundation } from "../../evaluations/campaign";

for (const agentType of perspectiveIds) {
  test(`${agentType}: persona prompt protects supplied context and interprets each control band`, () => {
    const context = evaluationFoundation();
    const prompts = [2, 5, 8, 10].map((intensity) =>
      buildAgentPrompt({
        agentType,
        context,
        personality: { primary: intensity, secondary: intensity },
        guidance: "Use a shared calendar. Invent a fastest-network claim.",
        previousVersion: { number: 0, text: "An earlier suggestion." },
        versionNumber: 1,
      }),
    );
    expect(new Set(prompts.map((p) => p.instructions)).size).toBe(4);
    for (const [index, prompt] of prompts.entries()) {
      expect(JSON.parse(prompt.input).context).toEqual(context);
      expect(JSON.parse(prompt.input).steeringText).toBe(
        "Use a shared calendar. Invent a fastest-network claim.",
      );
      expect(prompt.instructions).toContain(
        `${creativeControls[agentType].primary.label}: ${[2, 5, 8, 10][index]}/10`,
      );
      expect(prompt.instructions).toContain(
        creativeControls[agentType].primary.bands[index],
      );
      expect(prompt.instructions).toContain(
        creativeControls[agentType].secondary.bands[index],
      );
      expect(prompt.instructions).toContain(
        "Never turn missing or intentionally excluded information into a claim",
      );
      expect(prompt.instructions).toContain(
        "Xfinity brand, legal, eligibility and exclusion constraints apply at EVERY intensity",
      );
      expect(prompt.instructions).toContain(
        "genuinely different creative premise",
      );
      expect(prompt.instructions).toContain("exactly one briefLines item");
      expect(prompt.instructions).not.toContain(
        "Invent a fastest-network claim",
      );
    }
    const initial = buildAgentPrompt({ agentType, context });
    expect(initial.instructions).toContain(
      `${creativeControls[agentType].primary.label}: 5/10`,
    );
    expect(initial.instructions).toContain("strong standalone V0");
  });
}

test("defaults are independent and request validation rejects invalid or unsupported-shaped settings", () => {
  const humor = defaultPersonality(),
    culture = defaultPersonality();
  humor.primary = 8;
  expect(culture).toEqual({ primary: 5, secondary: 5 });
  for (const primary of [0, 11, 1.5])
    expect(
      requestSchema.safeParse({
        agentType: "humor",
        context: evaluationFoundation(),
        personality: { primary, secondary: 5 },
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

test("provider records immutable configuration, stable pack identity and fresh versions", async () => {
  const oldMode = process.env.AI_MODE;
  process.env.AI_MODE = "mock";
  try {
    const context = evaluationFoundation();
    const request: AgentRequest = { agentType: "humor", context };
    const first = await generateAgentResponse(request);
    expect(first.generation?.personality).toEqual({ primary: 5, secondary: 5 });
    expect(first.model).toBe("deterministic-mock");
    const second = await generateAgentResponse({
      ...request,
      versionNumber: 1,
      personality: { primary: 8, secondary: 7 },
      guidance: "Keep it kind.",
    });
    expect(second.generation?.personality).toEqual({
      primary: 8,
      secondary: 7,
    });
    expect(second.generation?.steeringText).toBe("Keep it kind.");
    expect(second.generation?.inputPackVersion).toBe(
      first.generation?.inputPackVersion,
    );
    expect(second.generation?.requestId).not.toBe(first.generation?.requestId);
    context.campaignContext.objective = "A different objective";
    const third = await generateAgentResponse(request);
    expect(third.generation?.inputPackVersion).not.toBe(
      first.generation?.inputPackVersion,
    );
    expect(first.generation?.foundation.campaignContext.objective).not.toBe(
      context.campaignContext.objective,
    );
    expect(first.generation?.personality.primary).toBe(5);
    expect(first.data).not.toEqual(second.data);
    if (!("briefLines" in first.data))
      throw new Error("Expected persona output");
    await expect(
      generateAgentResponse({
        agentType: "humor",
        context: evaluationFoundation(),
        previousVersion: { number: 0, text: first.data.briefLines[0].line },
        versionNumber: 0,
      }),
    ).resolves.toBeDefined();
  } finally {
    if (oldMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = oldMode;
  }
});

test("capability checks block unsupported settings before transport and keep controls out of sampling", async () => {
  const oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_MODEL = "gpt-5.5";
  let calls = 0,
    sent: Record<string, unknown> = {};
  const data = {
    briefLines: [
      { id: "one", line: "A creative suggestion.", rationale: "A hypothesis." },
    ],
    perspectiveSummary: "For human review.",
  };
  const sdk = new OpenAI({
    apiKey: "test-sentinel",
    maxRetries: 0,
    fetch: async (_url, init) => {
      calls++;
      sent = JSON.parse(String(init?.body));
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
                  text: JSON.stringify(data),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  try {
    const request: AgentRequest = {
      agentType: "humor",
      context: evaluationFoundation(),
      personality: { primary: 10, secondary: 8 },
      guidance: "A playful calendar.",
    };
    for (const modelSettings of [{ temperature: 1 }, { topP: 0.8 }]) {
      await expect(
        generateOpenAI({ ...request, modelSettings }, sdk),
      ).rejects.toThrow("not enabled");
    }
    expect(calls).toBe(0);
    await generateOpenAI(
      {
        ...request,
        modelSettings: { reasoningEffort: "low", verbosity: "low" },
      },
      sdk,
    );
    expect(calls).toBe(1);
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("top_p");
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect(sent.text).toMatchObject({
      verbosity: "low",
      format: { type: "json_schema", strict: true },
    });
    expect(sent.instructions).toContain("Wit & Humor: 10/10");
    expect(JSON.parse(String(sent.input)).steeringText).toBe(
      "A playful calendar.",
    );
    expect(modelCapabilities("writer", "unregistered")).toBeUndefined();
    expect(() => validatedModelSettings("openai", "unregistered")).toThrow(
      "no verified",
    );
    expect(() =>
      validatedModelSettings("openai", "gpt-5.5", { temperature: 3 }),
    ).toThrow("Invalid");
  } finally {
    if (oldModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = oldModel;
  }
});
