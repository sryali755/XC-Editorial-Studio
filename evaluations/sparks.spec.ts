import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateAgentResponse } from "../lib/ai/provider";
import { buildAgentPrompt } from "../lib/ai/prompts";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { evaluationBrief } from "./campaign";
import type {
  AgentDataMap,
  AgentResponse,
  AgentRequest,
} from "../lib/ai/schemas";

loadEnvConfig(process.cwd());
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
test("live sparks quality and grounding evaluation", async () => {
  test.skip(process.env.XC_LIVE_EVAL !== "1", "Opt-in live API calls.");
  expect(process.env.AI_MODE).toBe("live");
  const baseline = process.env.XC_SPARKS_BASELINE === "1";
  const sparse = evaluationBrief.replace(
    "Reason to believe: Home internet can connect household devices to online activities.",
    "Reason to believe: Intentionally excluded.",
  );
  const business = `Campaign: Shift-ready — fictional business evaluation
Objective: Help independent shop owners explore the supplied business internet offer.
Audience: Independent shop owners coordinating opening tasks, online orders and staff handoffs.
Product: Business internet
Reason to believe: Internet access can connect the shop's devices to online services.
Research: Fictional research excerpt for testing only: one supplied interview describes a handwritten opening checklist beside the till. The participant uses it to remember routine tasks. No prevalence or performance findings are supplied.
Brand guidelines: Plainspoken, respectful of small business owners, no household or family stereotypes.
Constraints: No speed, price, uptime, increased-sales or productivity guarantees. Do not generalize one illustrative interview to all owners.
Exclusions: Price promotion intentionally excluded.
Substantiation: No performance or competitive evidence supplied.`;
  const cases = [
    {
      label: "Initial household exploration",
      source: evaluationBrief,
      guidance: "",
    },
    {
      label: "Fresh alternatives without steering",
      source: evaluationBrief,
      guidance: "",
    },
    {
      label: "Calendar steering with varied territories",
      source: evaluationBrief,
      guidance:
        "Make the sparks more unexpected and grounded in a shared calendar. Give me six different strategic angles, not six calendar metaphors.",
    },
    {
      label: "Excluded RTB and missing research",
      source: sparse,
      guidance: "",
    },
    {
      label: "Business context with qualified evidence",
      source: business,
      guidance: "",
    },
  ];
  const runs: {
    label: string;
    request: AgentRequest;
    response: AgentResponse<AgentDataMap["sparks"]>;
    prompt: ReturnType<typeof buildAgentPrompt>;
  }[] = [];
  for (const [index, c] of (baseline ? cases.slice(0, 1) : cases).entries()) {
    const parsedIMC = parseIMCBrief(c.source);
    const request: AgentRequest = {
      agentType: "sparks",
      context: { parsedIMC, upstream: extractUpstream(c.source) },
      guidance: c.guidance,
      versionNumber: index < 3 ? index + 1 : 1,
      ...(index === 1 || index === 2
        ? {
            previousVersion: {
              number: index,
              text: runs[index - 1].response.data.sparks
                .map((s, i) => `${i + 1}. ${s.text}`)
                .join("\n\n"),
              data: runs[index - 1].response.data,
            },
          }
        : {}),
    };
    const response = await generateAgentResponse(request);
    expect(response.provider).toBe("openai");
    if (!("sparks" in response.data)) throw new Error("Expected Sparks");
    expect(response.data.sparks).toHaveLength(6);
    expect(
      new Set(response.data.sparks.map((s) => s.text.toLowerCase())).size,
    ).toBe(6);
    expect(JSON.stringify(request.context)).toContain("parsedIMC");
    runs.push({
      label: c.label,
      request,
      response: response as AgentResponse<AgentDataMap["sparks"]>,
      prompt: buildAgentPrompt(request),
    });
    const dir = baseline ? "evaluations/baselines" : "evaluations/results";
    const name = baseline ? "sparks-v1" : "sparks";
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(runs, null, 2));
    writeFileSync(
      `${dir}/${name}.html`,
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strategic Sparks review</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#1d2139}h1,h2{color:#6242c7}article{border:1px solid #ddd;border-radius:12px;padding:20px;margin:16px 0}small{color:#62697c}</style><h1>Strategic Sparks review</h1><p>Fictional campaigns. GPT-5.5 suggestions for Kevin's review; no creative approval is implied.</p>${runs.map((r) => `<section><h2>${escape(r.label)}</h2><small>Steering: ${escape(r.request.guidance || "None")}</small>${r.response.data.sparks.map((s) => `<article><h3>${escape(s.title)}</h3><p>${escape(s.text)}</p><small>${escape(s.rationale)}</small></article>`).join("")}</section>`).join("")}</html>`,
    );
    console.log(
      `${c.label}: ${response.data.sparks.map((s) => s.title || s.text).join(" | ")}`,
    );
  }
});
