import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { generateAgentResponse } from "../../lib/ai/provider";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import { sparkTerritoryTypes, type AgentRequest } from "../../lib/ai/schemas";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { SPARK_EXCERPT_REPAIR_MARKER } from "../../lib/ai/sparks-prompts-v1";

const fixtures = [
  {
    file: "movers_source_text.txt",
    quote: "Existing customers & prospects who are moving.",
  },
  {
    file: "xfinity_pro_source_text.txt",
    quote: "Choose a device to boost and elevate your most important activity",
  },
];

function modelSet(excerpt: string) {
  return {
    sparks: sparkTerritoryTypes.map((territory_type, index) => ({
      territory_type,
      title: `Offline territory ${index + 1}`,
      territory: `Synthetic premise ${index + 1}`,
      idea: `Synthetic model-selected creative hypothesis ${index + 1}; not a researched customer fact.`,
      excerpt,
      rationale: `Synthetic offline rationale ${index + 1}.`,
      hypothesis: `Does this proposed premise ${index + 1} hold for the supplied audience?`,
    })),
  };
}

function requestFor(source: string) {
  return {
    agentType: "sparks" as const,
    context: {
      parsedIMC: parseIMCBrief(source),
      upstream: extractUpstream(source),
    },
  };
}

test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(Boolean(process.env.OPENAI_API_KEY)).toBe(false);
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

for (const fixture of fixtures)
  for (const layout of ["LF", "CRLF"]) {
    test(`agent repairs slots 1 and 5 itself from real ${fixture.file}, ${layout}, without fallback or lost valid Sparks`, async () => {
      const original = readFileSync(
        path.join(__dirname, "../fixtures/client-input-pack", fixture.file),
        "utf8",
      );
      const source =
        layout === "CRLF" ? original.replace(/\r?\n/g, "\r\n") : original;
      expect(source.includes(fixture.quote)).toBe(true);
      const initial = modelSet(fixture.quote);
      initial.sparks[0].excerpt =
        "This is a fabricated quote absent from the client brief.";
      initial.sparks[4].excerpt =
        "Another unsupported paraphrase, not a source quotation.";
      const chosenByAgent = modelSet(fixture.quote);
      const fake = createOfflineModelClient([
        JSON.stringify(initial),
        JSON.stringify({ sparks: [chosenByAgent.sparks[0]] }),
        JSON.stringify({ sparks: [chosenByAgent.sparks[4]] }),
      ]);
      const request = requestFor(source),
        before = structuredClone(request);
      const result = await generateAgentResponse(request, fake.sdk);
      expect(result.provider).toBe("mock");
      if (!("sparks" in result.data)) throw new Error("Expected Sparks");
      expect(result.data.sparks).toHaveLength(6);
      expect(fake.calls()).toBe(3); // Existing bound: one repair per failed slot, no repeated paid-style loop.
      expect(request).toEqual(before);
      for (const [index, spark] of result.data.sparks.entries()) {
        expect(spark.excerpt).toBe(chosenByAgent.sparks[index].excerpt);
        expect(spark.excerpt_verified).toBe(true);
        expect(source.includes(spark.excerpt!)).toBe(true);
        expect(spark.idea).toBe(chosenByAgent.sparks[index].idea);
        expect(spark.rationale).toBe(chosenByAgent.sparks[index].rationale);
      }
      const prompts = fake.requests();
      expect(prompts[0].instructions).toContain("Evidence first:");
      expect(prompts[0].instructions).toContain(
        "exact character-for-character substring",
      );
      expect(prompts[0].instructions).toContain(
        "Never use a random valid phrase",
      );
      for (const turn of prompts.slice(1)) {
        const input = String(turn.input);
        expect(input).toContain(source);
        expect(input).toContain(
          "AGENT-OWNED SOURCE REPAIR — NOT CREATIVE REGENERATION",
        );
        expect(input).toContain("previous quotation is NOT verified evidence");
        expect(input).toContain("Locate a genuinely relevant passage");
        expect(input).not.toContain(
          "Improve this Spark. Keep the same territory_type",
        );
      }
      expect(String(prompts[1].input)).toContain(initial.sparks[0].excerpt);
      expect(String(prompts[2].input)).toContain(initial.sparks[4].excerpt);
      expect(
        readFileSync(
          path.join(__dirname, "../fixtures/client-input-pack", fixture.file),
          "utf8",
        ),
      ).toBe(original);
    });
  }

test("agent cannot substitute a quote from another campaign; failed repair is still rejected without invented fallback", async () => {
  const source = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/xfinity_pro_source_text.txt",
    ),
    "utf8",
  );
  const wrongQuote = fixtures[0].quote;
  expect(source.includes(wrongQuote)).toBe(false);
  const initial = modelSet(fixtures[1].quote);
  initial.sparks[4].excerpt = wrongQuote;
  const fake = createOfflineModelClient([
    JSON.stringify(initial),
    JSON.stringify({ sparks: [initial.sparks[4]] }),
  ]);
  await expect(
    generateAgentResponse(requestFor(source), fake.sdk),
  ).rejects.toMatchObject({
    status: 422,
    code: "sparks_source_validation_failed",
    retryable: true,
    message: expect.stringContaining("Unverified Spark slots: 5"),
  });
  expect(fake.calls()).toBe(2);
});

test("explicit creative improvement remains separate from internal source repair", () => {
  const source = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/movers_source_text.txt",
    ),
    "utf8",
  );
  const previous = modelSet(fixtures[0].quote);
  const request: AgentRequest = {
    ...requestFor(source),
    agentType: "sparks",
    previousVersion: {
      number: 1,
      text: "Synthetic existing ideas",
      data: {
        sparks: previous.sparks.map((spark, index) => ({
          ...spark,
          id: `spark-${index + 1}`,
          text: spark.idea,
          campaignGrounding: spark.excerpt,
          hypothesisToValidate: spark.hypothesis,
        })),
      },
    },
    sparkRevision: {
      targetId: "spark-1",
      keptIds: ["spark-2", "spark-3", "spark-4", "spark-5", "spark-6"],
      intent: "improve",
    },
  };
  expect(buildAgentPrompt(request).input).toContain(
    "Improve this Spark. Keep the same territory_type",
  );
  expect(
    buildAgentPrompt(
      request,
      1,
      "offline-request",
      `${SPARK_EXCERPT_REPAIR_MARKER} Exact source check failed.`,
    ).input,
  ).toContain("AGENT-OWNED SOURCE REPAIR");
});
