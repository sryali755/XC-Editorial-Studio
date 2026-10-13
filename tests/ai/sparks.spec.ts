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
import {
  generateAgentResponse,
  sparksValidationError,
} from "../../lib/ai/provider";
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
  sparks: Array.from({ length: 6 }, (_, i) => ({
    id: `spark-${i}`,
    title: `Direction ${i}`,
    text: `Explore distinct territory ${i}.`,
    rationale: `Creative hypothesis ${i}; validate with the audience.`,
    campaignGrounding: "Campaign: Fictional supplied campaign.",
    hypothesisToValidate: `Would territory ${i} matter to the audience?`,
  })),
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
  expect(buildAgentPrompt(request).instructions).toContain(
    "TARGETED SPARK REVISION",
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
  expect(sparkSetIssue(repeated)).toContain("repeated");
  const duplicateId = data();
  duplicateId.sparks[1].id = duplicateId.sparks[0].id;
  expect(sparkSetIssue(duplicateId)).toContain("identifier");
  const duplicateTitle = data();
  duplicateTitle.sparks[1].title = duplicateTitle.sparks[0].title;
  expect(sparkSetIssue(duplicateTitle)).toContain("title");
  expect(
    sparkSetIssue({ sparks: data().sparks.reverse() }, previous()),
  ).toContain("previous set");
  expect(sparkSetIssue(data(), { number: 1, text: previous().text })).toContain(
    "previous set",
  );
  const revised = data();
  revised.sparks[0].text = "A developed direction requested by the strategist.";
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
  });
  expect(exactGroundingExcerpt(valid.sparks[0].campaignGrounding, source)).toBe(
    "careful consideration of this fictional offer",
  );
  expect(sparkSetIssue(valid, undefined, parsed)).toBeUndefined();

  valid.sparks[3].campaignGrounding =
    'Objective: "A useful paraphrase that is absent from the brief"';
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
  const input = JSON.parse(prompt.input);
  expect(input.context.parsedIMC.sourceText).toBe(demoIMCBrief);
  expect(input.context.parsedIMC.fields).toHaveProperty("reason_to_believe");
  expect(input.steeringText).toBe("Explore a shared calendar.");
  expect(input.context.selectedContent.research.text).toBe(
    "Existing selected research context.",
  );
  expect(input.previousVersion).toEqual(previous());
  expect(input.versionNumber).toBe(2);
  for (const guard of [
    "six distinct",
    "Intentionally excluded",
    "never rewrite upstream",
    "Compare the underlying questions",
    "only one device",
    "previous attempt",
    "VERBATIM EXCERPT",
    "each rationale must explicitly acknowledge",
  ])
    expect(prompt.instructions).toContain(guard);
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
