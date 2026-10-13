import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateAgentResponse } from "../lib/ai/provider";
import {
  sparkTerritoryTypes,
  type AgentDataMap,
  type AgentResponse,
} from "../lib/ai/schemas";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { mobileIMCBrief } from "../tests/fixtures/mobile-imc-brief";
import { evaluationBrief } from "./campaign";

loadEnvConfig(process.cwd());

function context(source: string) {
  return {
    parsedIMC: parseIMCBrief(source),
    upstream: extractUpstream(source),
  };
}

function versionText(data: AgentDataMap["sparks"]) {
  return data.sparks
    .map((spark, index) => `${index + 1}. ${spark.idea || spark.text}`)
    .join("\n\n");
}

function historyEntry(number: number, data: AgentDataMap["sparks"]) {
  return {
    number,
    sparks: data.sparks.map((spark) => ({
      id: spark.id,
      title: spark.title,
      text: spark.text,
      territory_type: spark.territory_type,
      territory: spark.territory,
      idea: spark.idea,
    })),
  };
}

test("live Sparks v1.2 generation and optional one-slot revisions", async () => {
  test.skip(
    process.env.XC_LIVE_EVAL !== "1",
    "Opt-in paid live calls for the two requested sample briefs.",
  );
  expect(process.env.AI_MODE).toBe("live");
  const samples = [
    { name: "fictional-household-handoffs-fixture", source: evaluationBrief },
    { name: "fictional-mobile-prototype-fixture", source: mobileIMCBrief },
  ];
  const artifact: Record<string, unknown> = {};
  let homeInitial: AgentResponse<AgentDataMap["sparks"]> | undefined;
  for (const sample of samples) {
    const response = (await generateAgentResponse({
      agentType: "sparks",
      context: context(sample.source),
      versionNumber: 1,
    })) as AgentResponse<AgentDataMap["sparks"]>;
    expect(response.provider).toBe("openai");
    expect(response.promptVersion).toBe("sparks-v1.2");
    expect(response.data.sparks.map((spark) => spark.territory_type)).toEqual(
      sparkTerritoryTypes,
    );
    expect(
      response.data.sparks.every((spark) => spark.excerpt_verified === true),
    ).toBe(true);
    artifact[sample.name] = response.data.sparks;
    console.log(
      `[sparks-live] ${sample.name}: ${response.data.sparks.map((spark) => `${spark.territory_type}=${spark.title}: ${spark.idea}`).join(" | ")}`,
    );
    if (sample === samples[0]) homeInitial = response;
  }
  if (process.env.XC_SPARKS_INITIAL_ONLY === "1") {
    mkdirSync("evaluations/results", { recursive: true });
    writeFileSync(
      "evaluations/results/sparks-v1.2-two-briefs.json",
      JSON.stringify(artifact, null, 2),
    );
    return;
  }
  if (!homeInitial) throw new Error("Missing home-WiFi initial Sparks run.");
  const v0 = structuredClone(homeInitial.data);
  const improveTarget = homeInitial.data.sparks[1];
  const improved = (await generateAgentResponse({
    agentType: "sparks",
    context: context(evaluationBrief),
    versionNumber: 2,
    guidance:
      "Make the shared behavior more specific and useful to concept from.",
    previousVersion: {
      number: 1,
      text: versionText(homeInitial.data),
      data: homeInitial.data,
    },
    sparkHistory: [historyEntry(1, homeInitial.data)],
    sparkRevision: {
      targetId: improveTarget.id,
      keptIds: homeInitial.data.sparks
        .filter((spark) => spark.id !== improveTarget.id)
        .map((spark) => spark.id),
      intent: "improve",
    },
  })) as AgentResponse<AgentDataMap["sparks"]>;
  expect(improved.data.sparks[1].idea).not.toBe(improveTarget.idea);
  expect(improved.data.sparks[1].territory_type).toBe(
    improveTarget.territory_type,
  );
  expect(improved.data.sparks.filter((_, index) => index !== 1)).toEqual(
    homeInitial.data.sparks.filter((_, index) => index !== 1),
  );
  expect(homeInitial.data).toEqual(v0);

  const replaceTarget = improved.data.sparks[3];
  const replaced = (await generateAgentResponse({
    agentType: "sparks",
    context: context(evaluationBrief),
    versionNumber: 3,
    guidance:
      "Find a less expected way to make the supplied product truth vivid.",
    previousVersion: {
      number: 2,
      text: versionText(improved.data),
      data: improved.data,
    },
    sparkHistory: [
      historyEntry(1, homeInitial.data),
      historyEntry(2, improved.data),
    ],
    sparkRevision: {
      targetId: replaceTarget.id,
      keptIds: improved.data.sparks
        .filter((spark) => spark.id !== replaceTarget.id)
        .map((spark) => spark.id),
      intent: "explore",
    },
  })) as AgentResponse<AgentDataMap["sparks"]>;
  expect(replaced.data.sparks[3].territory_type).toBe(
    replaceTarget.territory_type,
  );
  expect(replaced.data.sparks[3].territory).not.toBe(replaceTarget.territory);
  expect(replaced.data.sparks[3].idea).not.toBe(replaceTarget.idea);
  expect(replaced.data.sparks[3].excerpt).not.toBe(replaceTarget.excerpt);
  expect(replaced.data.sparks.filter((_, index) => index !== 3)).toEqual(
    improved.data.sparks.filter((_, index) => index !== 3),
  );
  expect(
    new Set(replaced.data.sparks.map((spark) => spark.idea || spark.text)).size,
  ).toBe(6);
  artifact.revisions = {
    improvedSpark2: improved.data.sparks[1],
    replacedSpark4: replaced.data.sparks[3],
  };
  mkdirSync("evaluations/results", { recursive: true });
  writeFileSync(
    "evaluations/results/sparks-v1.2-two-briefs.json",
    JSON.stringify(artifact, null, 2),
  );
});
