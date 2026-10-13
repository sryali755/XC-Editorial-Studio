import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateAgentResponse } from "../lib/ai/provider";
import {
  isPerspectiveRequest,
  type AgentResponse,
  type AgentDataMap,
  type PerspectiveRequest,
} from "../lib/ai/schemas";
import { perspectiveIds } from "../lib/creative-controls";
import { evaluationFoundation } from "./campaign";
import { buildAgentPrompt } from "../lib/ai/prompts";
import { renderEvaluation } from "./review-report";

// Opt-in only. Real provider calls use the existing private server configuration.
loadEnvConfig(process.cwd());
const steering =
  "Make this more playful and less corporate. Use the image of a shared household calendar; keep it concise.";
for (const agentType of perspectiveIds) {
  test(`live creative evaluation: ${agentType}`, async () => {
    test.skip(
      process.env.XC_LIVE_EVAL !== "1",
      "Set XC_LIVE_EVAL=1 to run a paid live evaluation.",
    );
    expect(process.env.AI_MODE).toBe("live");
    const foundation = evaluationFoundation();
    const runs: {
      label: string;
      request: PerspectiveRequest;
      response: AgentResponse<AgentDataMap["humor"]>;
      prompt: ReturnType<typeof buildAgentPrompt>;
    }[] = [];
    const cases = [
      { label: "V0 · balanced", primary: 5, guidance: "" },
      { label: "Restrained", primary: 2, guidance: "" },
      { label: "Adventurous", primary: 8, guidance: "" },
      { label: "Experimental", primary: 10, guidance: "" },
      { label: "Steering only", primary: 5, guidance: steering },
      {
        label: "Controls + steering",
        primary: 8,
        guidance: steering,
      },
      {
        label: "Unchanged configuration",
        primary: 8,
        guidance: steering,
      },
    ];
    const directory = "evaluations/results";
    mkdirSync(directory, { recursive: true });
    for (const [index, configuration] of cases.entries()) {
      const previous = index === 6 ? runs.at(-1) : runs[0];
      const request: PerspectiveRequest = {
        agentType,
        context: foundation,
        personality: { primary: configuration.primary },
        guidance: configuration.guidance,
        versionNumber: index,
        priorCandidates: runs.map((r) => r.response.data.options[0].brief_line),
        previousVersions: runs.map((run) => ({
          number: run.request.versionNumber ?? 0,
          line: run.response.data.options[0].brief_line,
          sliderValue: run.request.personality?.primary ?? 5,
          steering: run.request.guidance ?? "",
        })),
        ...(previous
          ? {
              previousVersion: {
                number: previous.request.versionNumber!,
                text: previous.response.data.options[0].brief_line,
              },
            }
          : {}),
      };
      const response = await generateAgentResponse(request);
      expect(isPerspectiveRequest(request)).toBe(true);
      expect(response.provider).toBe("openai");
      expect(response.generation?.personality).toEqual(request.personality);
      expect(response.generation?.foundation).toEqual(foundation);
      expect("options" in response.data).toBe(true);
      const result = response as AgentResponse<AgentDataMap["humor"]>;
      expect(
        runs.map((r) => r.response.data.options[0].brief_line),
      ).not.toContain(result.data.options[0].brief_line);
      runs.push({
        label: configuration.label,
        request,
        response: result,
        prompt: buildAgentPrompt(request),
      });
      // Save after every call so partial progress survives an API outage.
      writeFileSync(
        `${directory}/${agentType}.json`,
        JSON.stringify(runs, null, 2),
      );
      writeFileSync(
        `${directory}/${agentType}.html`,
        renderEvaluation(agentType, runs),
      );
      console.log(
        `${agentType} ${configuration.label}: ${result.data.options[0].brief_line}`,
      );
    }
  });
}

test("live model-settings capability smoke", async () => {
  test.skip(process.env.XC_LIVE_EVAL !== "1", "Opt-in live provider check.");
  expect(process.env.AI_MODE).toBe("live");
  const response = await generateAgentResponse({
    agentType: "humor",
    context: evaluationFoundation(),
    modelSettings: { reasoningEffort: "low", verbosity: "low" },
  });
  expect(response.provider).toBe("openai");
  expect(response.generation?.modelSettings).toMatchObject({
    reasoningEffort: "low",
    verbosity: "low",
    maxOutputTokens: 5000,
  });
  mkdirSync("evaluations/results", { recursive: true });
  writeFileSync(
    "evaluations/results/model-settings-smoke.json",
    JSON.stringify(response, null, 2),
  );
});
