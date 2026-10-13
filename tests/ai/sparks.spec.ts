import { test, expect } from "@playwright/test";
import {
  exactGroundingExcerpt,
  sparkSetIssue,
} from "../../lib/ai/spark-quality";
import {
  applySparkRevision,
  sparkRevisionPlan,
} from "../../lib/ai/spark-revision";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { SPARKS_PROMPT_VERSION } from "../../lib/ai/sparks-prompt";
import { sparkTerritoryTypes } from "../../lib/ai/schemas";
import {
  generateAgentResponse,
  sparksValidationError,
} from "../../lib/ai/provider";
import { resetOpenAIClientForTests } from "../../lib/ai/openai-provider";
import { selectedFoundation } from "../../lib/ai/context";
import {
  foundationSchema,
  type AgentDataMap,
  type AgentRequest,
} from "../../lib/ai/schemas";
import {
  compileInputPack,
  demoIMCBrief,
  emptyPreparation,
} from "../../lib/preparation";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import type { PreparationState } from "../../lib/types";

const data = (): AgentDataMap["sparks"] => ({
  sparks: Array.from({ length: 6 }, (_, i) => {
    const idea = `Explore distinct territory ${i}.`;
    const excerpt = "Fictional supplied campaign.";
    const hypothesis = `Would territory ${i} matter to the audience?`;
    return {
      id: `spark-${i}`,
      title: `Direction ${i}`,
      text: idea,
      rationale: `Creative hypothesis ${i}; validate with the audience.`,
      campaignGrounding: excerpt,
      hypothesisToValidate: hypothesis,
      territory_type: sparkTerritoryTypes[i],
      territory: `Territory label ${i}`,
      idea,
      excerpt,
      hypothesis,
      excerpt_verified: true,
    };
  }),
});
const previous = (d = data()) => ({
  number: 1,
  text: d.sparks.map((s, i) => `${i + 1}. ${s.text}`).join("\n\n"),
  data: d,
});

test("targeted revision preserves retained Sparks even if the model rewrites every slot", () => {
  const old = data();
  const changed = {
    sparks: old.sparks.map((spark) => ({
      ...spark,
      text: `New: ${spark.text}`,
      rationale: "Rewritten",
    })),
  };
  const request: AgentRequest = {
    agentType: "sparks",
    context: {
      parsedIMC: parseIMCBrief(demoIMCBrief),
      upstream: extractUpstream(demoIMCBrief),
    },
    previousVersion: previous(old),
    sparkRevision: {
      targetId: old.sparks[1].id,
      keptIds: [old.sparks[0].id],
      intent: "improve",
    },
  };
  const merged = applySparkRevision(request, changed);
  expect(merged.sparks[1]).toEqual(changed.sparks[1]);
  expect(merged.sparks.filter((_, i) => i !== 1)).toEqual(
    old.sparks.filter((_, i) => i !== 1),
  );
  expect(old).toEqual(data());
  const prompt = buildAgentPrompt(request);
  expect(prompt.input).toContain("SPARK TO IMPROVE");
  expect(prompt.input).toContain('"sparks" containing exactly 1 item');
  const singleReplacement = {
    sparks: [
      {
        ...old.sparks[1],
        title: "Sharper direction",
        text: "A sharper version of this same core angle.",
        idea: "A sharper version of this same core angle.",
      },
    ],
  };
  const singleMerged = applySparkRevision(request, singleReplacement);
  expect(singleMerged.sparks[1].title).toBe("Sharper direction");
  expect(singleMerged.sparks[1].territory_type).toBe(
    old.sparks[1].territory_type,
  );
  expect(singleMerged.sparks.filter((_, i) => i !== 1)).toEqual(
    old.sparks.filter((_, i) => i !== 1),
  );
  const replacePrompt = buildAgentPrompt({
    ...request,
    sparkRevision: { ...request.sparkRevision!, intent: "explore" },
    sparkHistory: [
      {
        number: 1,
        sparks: old.sparks.map((spark) => ({
          id: spark.id,
          title: spark.title,
          text: spark.text,
          territory_type: spark.territory_type,
          territory: spark.territory,
          idea: spark.idea,
        })),
      },
    ],
  });
  expect(replacePrompt.input).toContain("SPARK BEING REPLACED");
  expect(replacePrompt.input).toContain("PREVIOUSLY REJECTED SPARKS");
  expect(replacePrompt.input).toContain(
    "different tension and a different excerpt",
  );
  expect(() =>
    sparkRevisionPlan({
      ...request,
      sparkRevision: { ...request.sparkRevision!, targetId: "missing" },
    }),
  ).toThrow("version changed");
  expect(() =>
    sparkRevisionPlan({
      ...request,
      sparkRevision: { ...request.sparkRevision!, targetId: old.sparks[0].id },
    }),
  ).toThrow("Release");
  expect(() =>
    sparkRevisionPlan({ ...request, previousVersion: undefined }),
  ).toThrow("complete saved");
});

test("reject incomplete, duplicate and reordered Sparks while allowing developed alternatives", () => {
  expect(sparkSetIssue(data())).toBeUndefined();
  for (const field of [
    "id",
    "title",
    "text",
    "rationale",
    "campaignGrounding",
    "hypothesisToValidate",
  ] as const) {
    const incomplete = data();
    incomplete.sparks[0][field] = " ";
    expect(sparkSetIssue(incomplete)).toContain("complete");
  }
  const repeated = data();
  repeated.sparks[1].text = repeated.sparks[0].text
    .toUpperCase()
    .replace(".", "!");
  repeated.sparks[1].idea = repeated.sparks[1].text;
  expect(sparkSetIssue(repeated)).toContain("repeated");
  const duplicateId = data();
  duplicateId.sparks[1].id = duplicateId.sparks[0].id;
  expect(sparkSetIssue(duplicateId)).toContain("identifier");
  const duplicateTitle = data();
  duplicateTitle.sparks[1].title = duplicateTitle.sparks[0].title;
  expect(sparkSetIssue(duplicateTitle)).toContain("title");
  expect(
    sparkSetIssue({ sparks: data().sparks.reverse() }, previous()),
  ).toContain("required order");
  expect(sparkSetIssue(data(), { number: 1, text: previous().text })).toContain(
    "previous set",
  );
  const revised = data();
  revised.sparks[0].text = "A developed direction requested by the strategist.";
  revised.sparks[0].idea = revised.sparks[0].text;
  expect(sparkSetIssue(revised, previous())).toBeUndefined();
});

test("accepts a verbatim excerpt of a source field and rejects unsupported grounding", () => {
  const source =
    "Campaign: Fictional supplied campaign.\nObjective: Encourage careful consideration of this fictional offer.";
  const parsed = parseIMCBrief(source);
  const valid = data();
  valid.sparks.forEach((spark) => {
    spark.campaignGrounding =
      'Objective: "careful consideration of this fictional offer"';
    spark.excerpt = "careful consideration of this fictional offer";
  });
  expect(exactGroundingExcerpt(valid.sparks[0].campaignGrounding, source)).toBe(
    "careful consideration of this fictional offer",
  );
  expect(
    exactGroundingExcerpt(
      "FICTIONAL   supplied campaign.",
      "Campaign: Fictional\n supplied campaign.",
    ),
  ).toBe("FICTIONAL   supplied campaign.");
  expect(sparkSetIssue(valid, undefined, parsed)).toBeUndefined();

  valid.sparks[3].campaignGrounding =
    'Objective: "A useful paraphrase that is absent from the brief"';
  valid.sparks[3].excerpt = "A useful paraphrase that is absent from the brief";
  expect(sparkSetIssue(valid, undefined, parsed)).toContain("exact excerpt");
  expect(
    sparksValidationError(
      "Each Spark must ground itself in an exact excerpt from the current IMC brief.",
    ),
  ).toMatchObject({
    status: 422,
    code: "sparks_source_validation_failed",
    retryable: true,
  });
});

function modelSparks(invalidIndex = -1) {
  return {
    sparks: sparkTerritoryTypes.map((territory_type, index) => ({
      territory_type,
      title: `Live Direction ${index + 1}`,
      territory: `Distinct territory ${index + 1}`,
      idea: `Explore a campaign-specific tension numbered ${index + 1}.`,
      excerpt:
        index === invalidIndex
          ? "This quotation is absent from the brief."
          : "Life, connected",
      rationale: `This direction supports a distinct part of the campaign objective ${index + 1}.`,
      hypothesis: `Would audience response ${index + 1} support this direction?`,
    })),
  };
}

function responseFor(outputText: string) {
  return new Response(
    JSON.stringify({
      id: "resp_sparks_test",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: outputText, annotations: [] }],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
}

async function withLiveSparkStub(
  outputs: string[],
  run: (calls: () => number) => Promise<void>,
) {
  const saved = {
    AI_MODE: process.env.AI_MODE,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  };
  const originalFetch = globalThis.fetch;
  let call = 0;
  process.env.AI_MODE = "live";
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-private-sentinel";
  process.env.OPENAI_MODEL = "gpt-5.5";
  globalThis.fetch = async () =>
    responseFor(outputs[call++] ?? outputs.at(-1)!);
  resetOpenAIClientForTests();
  try {
    await run(() => call);
  } finally {
    globalThis.fetch = originalFetch;
    resetOpenAIClientForTests();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("an invalid excerpt retries only that Spark and marks the repaired excerpt verified", async () => {
  const initial = modelSparks(2);
  const repair = { sparks: [{ ...modelSparks().sparks[2] }] };
  await withLiveSparkStub(
    [JSON.stringify(initial), JSON.stringify(repair)],
    async (calls) => {
      const result = await generateAgentResponse({
        agentType: "sparks",
        context: {
          parsedIMC: parseIMCBrief(demoIMCBrief),
          upstream: extractUpstream(demoIMCBrief),
        },
      });
      if (!("sparks" in result.data)) throw new Error("Expected Sparks");
      expect(result.data.sparks).toHaveLength(6);
      expect(result.data.sparks.every((spark) => spark.excerpt_verified)).toBe(
        true,
      );
      expect(result.data.sparks[0].idea).toBe(initial.sparks[0].idea);
      expect(result.data.sparks[2].excerpt).toBe("Life, connected");
      expect(calls()).toBe(2);
    },
  );
});

test("a still-invalid repaired excerpt is returned with a visible verification flag", async () => {
  const initial = modelSparks(3);
  const repair = { sparks: [{ ...modelSparks(3).sparks[3] }] };
  await withLiveSparkStub(
    [JSON.stringify(initial), JSON.stringify(repair)],
    async (calls) => {
      const result = await generateAgentResponse({
        agentType: "sparks",
        context: {
          parsedIMC: parseIMCBrief(demoIMCBrief),
          upstream: extractUpstream(demoIMCBrief),
        },
      });
      if (!("sparks" in result.data)) throw new Error("Expected Sparks");
      expect(result.data.sparks[3].excerpt_verified).toBe(false);
      expect(
        result.data.sparks.filter((spark) => !spark.excerpt_verified),
      ).toHaveLength(1);
      expect(calls()).toBe(2);
    },
  );
});

test("malformed initial Sparks JSON retries once and then returns the valid set", async () => {
  await withLiveSparkStub(
    ["{bad", JSON.stringify(modelSparks())],
    async (calls) => {
      const result = await generateAgentResponse({
        agentType: "sparks",
        context: {
          parsedIMC: parseIMCBrief(demoIMCBrief),
          upstream: extractUpstream(demoIMCBrief),
        },
      });
      if (!("sparks" in result.data)) throw new Error("Expected Sparks");
      expect(result.data.sparks).toHaveLength(6);
      expect(result.data.sparks.every((spark) => spark.excerpt_verified)).toBe(
        true,
      );
      expect(calls()).toBe(2);
    },
  );
});

test("Sparks prompt preserves source statuses, distinguishes premises and handles steering plus prior ideas", () => {
  const request: AgentRequest = {
    agentType: "sparks",
    context: {
      parsedIMC: parseIMCBrief(demoIMCBrief),
      upstream: extractUpstream(demoIMCBrief),
      selectedContent: {
        research: {
          versionId: "research-v1",
          version: 1,
          text: "Existing selected research context.",
        },
        selectedSparks: [],
      },
    },
    guidance: "  Explore a shared calendar.  ",
    versionNumber: 2,
    previousVersion: previous(),
  };
  const prompt = buildAgentPrompt(request, 1, "test-request");
  expect(prompt.input).toContain(demoIMCBrief);
  expect(prompt.input).toContain('KEVIN\'S NOTE\n"Explore a shared calendar."');
  expect(prompt.input).toContain("PREVIOUS SPARKS");
  expect(prompt.input).toContain("VALIDATION RETRY");
  for (const guard of [
    "THE SIX TERRITORIES",
    "one Spark per type",
    "word for word",
    "Never alter the upstream RTB",
    "wildcard Spark must genuinely surprise",
  ])
    expect(prompt.instructions).toContain(guard);
  expect(SPARKS_PROMPT_VERSION).toBe("sparks-v1.2");
});

test("only selected current Sparks and their rationales reach the shared foundation; legacy text still works", () => {
  const state: PreparationState = {
    ...emptyPreparation,
    upstreamDraft: demoIMCBrief,
    sourceSnapshot: demoIMCBrief,
    selectedSparkIds: ["spark-1", "old-id"],
    outputs: [
      {
        agentId: "sparks",
        currentVersionId: "v2",
        versions: [
          {
            id: "v2",
            number: 2,
            text: "Current ideas",
            guidance: "",
            createdAt: "",
            sourceBrief: demoIMCBrief,
            sparks: data().sparks,
          },
          {
            id: "v1",
            number: 1,
            text: "Old idea",
            guidance: "",
            createdAt: "",
            sourceBrief: demoIMCBrief,
            sparks: [
              {
                id: "old-id",
                text: "Unselected old idea",
                rationale: "Old rationale",
              },
            ],
          },
        ],
      },
    ],
  };
  const pack = compileInputPack(state);
  pack.research = "Not supplied.";
  const foundation = selectedFoundation(pack);
  expect(foundation.selectedSparks).toEqual([
    { ...data().sparks[1], versionId: "v2", version: 2 },
  ]);
  expect(foundationSchema.safeParse(foundation).success).toBe(true);
  expect(JSON.stringify(foundation)).not.toContain("Old rationale");
  delete pack.selectedSparks;
  pack.sparks = "A legacy text-only idea.";
  expect(foundationSchema.safeParse(selectedFoundation(pack)).success).toBe(
    true,
  );
  expect(selectedFoundation(pack).selectedSparks[0]).not.toHaveProperty(
    "rationale",
  );
});

test("mock regeneration is complete and fresh while source reparsing preserves excluded RTB", async () => {
  const saved = {
    AI_MODE: process.env.AI_MODE,
    AI_PROVIDER: process.env.AI_PROVIDER,
  };
  process.env.AI_MODE = "mock";
  process.env.AI_PROVIDER = "openai";
  try {
    const source =
      "Campaign: Fictional shop test\nObjective: Explore an offer.\nAudience: Shop owners.\nProduct: Business internet\nReason to believe: Intentionally excluded.\nResearch: Not supplied.";
    const original = parseIMCBrief(source);
    const parsedIMC = {
      ...original,
      fields: {
        ...original.fields,
        reason_to_believe: {
          ...original.fields.reason_to_believe,
          value: "Invented replacement benefit.",
        },
      },
    };
    const upstream = extractUpstream(source);
    upstream.fields.originalRTB.value = "Invented replacement benefit.";
    const request: AgentRequest = {
      agentType: "sparks",
      context: { parsedIMC, upstream },
    };
    const initial = await generateAgentResponse(request);
    if (!("sparks" in initial.data)) throw new Error("Expected Sparks");
    expect(initial.promptTemplateVersion).toBe(SPARKS_PROMPT_VERSION);
    expect(sparkSetIssue(initial.data)).toBeUndefined();
    expect(
      initial.data.sparks.every(
        (spark) =>
          spark.text.includes("Fictional shop test") &&
          spark.campaignGrounding.length > 0 &&
          spark.hypothesisToValidate.length > 0,
      ),
    ).toBe(true);
    expect(initial.data.sparks[4].rationale).toContain(
      "Intentionally excluded",
    );
    expect(JSON.stringify(initial.data)).not.toContain("Invented replacement");
    const next = await generateAgentResponse({
      ...request,
      versionNumber: 2,
      previousVersion: previous(initial.data),
    });
    if (!("sparks" in next.data)) throw new Error("Expected Sparks");
    expect(sparkSetIssue(next.data, previous(initial.data))).toBeUndefined();
    expect(next.data.sparks.map((s) => s.text)).not.toEqual(
      initial.data.sparks.map((s) => s.text),
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
