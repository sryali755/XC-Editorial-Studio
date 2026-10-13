import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateAgentResponse } from "../lib/ai/provider";
import { selectedFoundation } from "../lib/ai/context";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { perspectiveIds } from "../lib/creative-controls";
import type {
  AgentDataMap,
  AgentResponse,
  Foundation,
} from "../lib/ai/schemas";
import type { StrategyInputPack } from "../lib/types";
import { mobileIMCBrief } from "../tests/fixtures/mobile-imc-brief";
import { evaluationFoundation } from "./campaign";

loadEnvConfig(process.cwd());

function mobileFoundation(
  selectedSparks?: StrategyInputPack["selectedSparks"],
): Foundation {
  const parsedIMC = parseIMCBrief(mobileIMCBrief);
  const pack: StrategyInputPack = {
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
    selectedSparks: selectedSparks ?? [
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
  return selectedFoundation(pack);
}

function normalizedWords(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function echoesSpark(line: string, foundation: Foundation) {
  const normalizedLine = ` ${normalizedWords(line).join(" ")} `;
  return foundation.selectedSparks.some((spark) => {
    const title = normalizedWords(spark.title ?? "").join(" ");
    if (title && normalizedLine.includes(` ${title} `)) return true;
    const source = normalizedWords(spark.text);
    for (let index = 0; index <= source.length - 3; index++)
      if (
        normalizedLine.includes(` ${source.slice(index, index + 3).join(" ")} `)
      )
        return true;
    return false;
  });
}

test("live v1.2 balanced Round Table on both available sample briefs", async () => {
  test.skip(
    process.env.XC_LIVE_EVAL !== "1",
    "Opt-in paid live calls for the two requested sample briefs.",
  );
  expect(process.env.AI_MODE).toBe("live");
  const samples = [
    {
      name: "fictional-household-handoffs-fixture",
      foundation: evaluationFoundation(),
    },
    {
      name: "fictional-mobile-prototype-fixture",
      foundation: mobileFoundation(),
    },
  ];
  const artifact: Record<
    string,
    { agent: string; line: string; tension: string; promptVersion: string }[]
  > = {};
  for (const sample of samples) {
    const responses = await Promise.all(
      perspectiveIds.map(async (agentType) => {
        let response: AgentResponse<AgentDataMap["humor"]>;
        try {
          response = (await generateAgentResponse({
            agentType,
            context: sample.foundation,
            personality: { primary: 5 },
            versionNumber: 0,
          })) as AgentResponse<AgentDataMap["humor"]>;
        } catch (error) {
          console.error(
            `[roundtable-live] ${sample.name} ${agentType} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
        expect(response.provider).toBe("openai");
        expect(response.promptVersion).toMatch(/v1\.2$/);
        expect(response.generation?.modelSettings.reasoningEffort).toBe("low");
        console.log(
          `[roundtable-live-option] ${sample.name} ${agentType}=${response.data.options[0].brief_line}`,
        );
        return { agentType, response };
      }),
    );
    const lines = responses.map(
      ({ response }) => response.data.options[0].brief_line,
    );
    const tensions = responses.map(
      ({ response }) => response.data.options[0].tension,
    );
    expect(new Set(lines).size).toBe(5);
    expect(new Set(tensions).size).toBe(5);
    expect(
      lines.filter((line) => echoesSpark(line, sample.foundation)).length,
    ).toBeLessThanOrEqual(1);
    for (const line of lines) {
      expect(line).not.toMatch(
        /^(?:[“"'‘’]\s*)?(?:make|give|show|help|let|reveal|position|turn)\b/i,
      );
      expect(line).not.toMatch(
        /^(?:the\s+)?(?:household\s+wi-?fi\s+person|phone\s+manager)\b/i,
      );
    }
    artifact[sample.name] = responses.map(({ agentType, response }) => ({
      agent: agentType,
      line: response.data.options[0].brief_line,
      tension: response.data.options[0].tension,
      promptVersion: response.promptVersion ?? "",
    }));
    console.log(
      `[roundtable-live] ${sample.name}: ${artifact[sample.name].map((item) => `${item.agent}=${item.line}`).join(" | ")}`,
    );
  }
  mkdirSync("evaluations/results", { recursive: true });
  writeFileSync(
    "evaluations/results/roundtable-v1.2-two-briefs.json",
    JSON.stringify(artifact, null, 2),
  );
});

test("live v1.2 first options trace to six routed mobile Sparks", async () => {
  test.skip(process.env.XC_LIVE_EVAL !== "1", "Opt-in paid live calls.");
  const artifactPath = "evaluations/results/sparks-v1.2-two-briefs.json";
  test.skip(!existsSync(artifactPath), "Run the live Sparks evaluation first.");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as Record<
    string,
    AgentDataMap["sparks"]["sparks"]
  >;
  const sparks = artifact["fictional-mobile-prototype-fixture"];
  expect(sparks).toHaveLength(6);
  const context = mobileFoundation(
    sparks.map((spark) => ({
      ...spark,
      versionId: "live-sparks-v1",
      version: 1,
    })),
  );
  const primaryType = {
    humor: "wildcard",
    culture: "social_cultural",
    audience: "human_truth",
    market: "category_convention",
    brand: "product_truth",
  } as const;
  const responses = await Promise.all(
    perspectiveIds.map(async (agentType) => {
      const response = (await generateAgentResponse({
        agentType,
        context,
        personality: { primary: 5 },
        versionNumber: 0,
      })) as AgentResponse<AgentDataMap["humor"]>;
      const routed = sparks.find(
        (spark) => spark.territory_type === primaryType[agentType],
      )!;
      const top = response.data.options[0];
      console.log(
        `[roundtable-six-sparks] ${agentType} ${routed.title}: ${top.brief_line} | evidence=${top.evidence.join(" / ")}`,
      );
      expect(top.evidence).toContain(routed.excerpt);
      return top.brief_line;
    }),
  );
  expect(new Set(responses).size).toBe(5);
});
