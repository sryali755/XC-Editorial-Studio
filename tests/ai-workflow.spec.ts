import { test, expect } from "@playwright/test";
import type { AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

test("the pasted IMC brief reports honest failures and each preparation agent retries independently", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  const failures = {
    rtb: {
      status: 401,
      error: "OpenAI authentication failed. Check the server-side API key.",
      code: "invalid_api_key",
      retryable: false,
    },
    research: {
      status: 429,
      error: "OpenAI credits are exhausted. Add credits before retrying.",
      code: "credit_balance_exhausted",
      retryable: false,
    },
    sparks: {
      status: 429,
      error: "OpenAI temporarily rate-limited this request.",
      code: "slow_down",
      retryable: true,
    },
  } as const;
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const input: AgentRequest = route.request().postDataJSON();
    calls.push(input);
    const attempts = calls.filter(
      (request) => request.agentType === input.agentType,
    ).length;
    if (
      attempts === 1 &&
      (input.agentType === "rtb" ||
        input.agentType === "research" ||
        input.agentType === "sparks")
    ) {
      const failure = failures[input.agentType];
      return route.fulfill({
        status: failure.status,
        json: {
          error: failure.error,
          code: failure.code,
          retryable: failure.retryable,
        },
      });
    }
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, provider: "openai", model: "test-model" },
    });
  });

  const card = (name: string) =>
    page.getByRole("article", { name, exact: true });
  const rtb = card("Review & Adapt Upstream RTB");
  const research = card("Data & Research Agent");
  const sparks = card("Strategic Sparks Agent");
  const state = (): Promise<StrategySession> =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
    );

  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill(mobileIMCBrief);
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();

  await expect(rtb.getByRole("alert")).toContainText("invalid_api_key");
  await expect(research.getByRole("alert")).toContainText(
    "credit_balance_exhausted",
  );
  await expect(sparks.getByRole("alert")).toContainText("slow_down");
  await expect(rtb.locator(".card-top")).toContainText("Failed");
  await expect(research.locator(".card-top")).toContainText("Failed");
  await expect(sparks.locator(".card-top")).toContainText("Failed");
  await expect(page.locator(".dynamic-pack .spark-option")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  expect((await state()).preparation.outputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "failed", versions: [] }),
    ]),
  );

  await sparks.getByRole("button", { name: "Retry this agent" }).click();
  await expect(sparks.locator(".spark-option")).toHaveCount(6);
  await expect(sparks.locator(".spark-title")).toHaveCount(6);
  await sparks.locator(".spark-rationale").first().locator("summary").click();
  await expect(sparks).toContainText("Campaign grounding:");
  await expect(sparks).toContainText("Hypothesis to validate:");
  await expect(sparks).toContainText("More Life. Less Phone Drama.");
  expect(calls.filter((request) => request.agentType === "rtb")).toHaveLength(
    1,
  );
  expect(
    calls.filter((request) => request.agentType === "research"),
  ).toHaveLength(1);

  await research.getByRole("button", { name: "Retry this agent" }).click();
  await rtb.getByRole("button", { name: "Retry this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V1 · Current");
  await expect(rtb.locator(".card-top")).toContainText("V1 · Current");
  const recovered = await state();
  for (const output of recovered.preparation.outputs) {
    expect(output.status).toBe("success");
    expect(output.versions).toHaveLength(1);
    expect(output.versions[0].inputContext?.sourceBrief).toBe(mobileIMCBrief);
  }
  await sparks.getByRole("checkbox").first().check();
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeEnabled();
});

test("partial preparation and perspective errors recover independently; structured responses keep approval explicit", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("api.openai.com")) external.push(request.url());
  });
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const input: AgentRequest = route.request().postDataJSON();
    calls.push(input);
    const attempts = calls.filter(
      (r) => r.agentType === input.agentType,
    ).length;
    if (
      (input.agentType === "research" || input.agentType === "culture") &&
      attempts === 1
    )
      return route.fulfill({
        status: 503,
        json: { error: "This agent is temporarily unavailable. Please retry." },
      });
    // Exercise the browser with live-shaped, validated outputs without spending API credits.
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, provider: "openai", model: "test-model" },
    });
  });
  const state = (): Promise<StrategySession> =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
    );
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const rtb = page.getByRole("article", {
    name: "Review & Adapt Upstream RTB",
    exact: true,
  });
  const research = page.getByRole("article", {
    name: "Data & Research Agent",
    exact: true,
  });
  await expect(rtb.locator(".card-top")).toContainText("V1 · Current");
  await expect(page.locator(".dynamic-pack .spark-option")).toHaveCount(6);
  await expect(research.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  const rtbId = (await state()).preparation.outputs.find(
    (o) => o.agentId === "reasonToBelieve",
  )!.currentVersionId;
  await research.getByRole("button", { name: "Retry this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V1 · Current");
  expect(calls.filter((r) => r.agentType === "rtb")).toHaveLength(1);
  expect(calls.filter((r) => r.agentType === "sparks")).toHaveLength(1);
  expect(
    (await state()).preparation.outputs.find(
      (o) => o.agentId === "reasonToBelieve",
    )!.currentVersionId,
  ).toBe(rtbId);
  await research
    .getByLabel("Guide Data & Research Agent", { exact: false })
    .fill("Prioritize household rituals.");
  await research.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V2 · Current");
  const v2 = (await state()).preparation.outputs.find(
    (o) => o.agentId === "research",
  )!.versions[0];
  expect(v2).toMatchObject({
    provider: "openai",
    model: "test-model",
    guidance: "Prioritize household rituals.",
  });
  expect(v2.data).toHaveProperty("suppliedEvidence");
  await research.locator(".prep-history > summary").click();
  await research.getByRole("button", { name: "Make V1 current" }).click();
  await research.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V3 · Current");
  const regenerated = calls.filter((r) => r.agentType === "research").at(-1)!;
  expect(regenerated.previousVersion!.number).toBe(1);
  expect(regenerated.versionNumber).toBe(3);
  await page.locator(".dynamic-pack").getByRole("checkbox").nth(1).check();
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Respect the selected spark.");
  const callCount = calls.length;
  await page.waitForTimeout(150);
  expect(calls).toHaveLength(callCount);
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Cultural / Social",
    exact: true,
  });
  await expect(humor.locator(".current-output")).toBeVisible();
  await expect(culture.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await culture.getByRole("button", { name: "Retry this perspective" }).click();
  await expect(culture.locator(".current-output")).toBeVisible();
  const perspectives = calls.filter((r) =>
    ["humor", "culture", "audience", "market", "brand"].includes(r.agentType),
  );
  for (const request of perspectives) {
    expect(request.context).toEqual(perspectives[0].context);
    expect(request.context).toHaveProperty("selectedSparks.length", 1);
    expect(request.context).not.toHaveProperty("parsedIMC");
  }
  await humor.getByRole("button", { name: "Select this version" }).click();
  await culture.getByRole("button", { name: "Select this version" }).click();
  await page.getByRole("button", { name: "Combine selected" }).click();
  await page
    .getByRole("button", { name: "Generate Combined Brief Line" })
    .click();
  await page
    .locator(".combined")
    .getByRole("button", { name: "Use as final line" })
    .click();
  expect((await state()).approved).toBeNull();
  expect((await state()).synthesisResults![0].provider).toBe("openai");
  await page.getByRole("button", { name: "Approve & Continue" }).click();
  await page
    .getByRole("button", { name: "Load sample execution details" })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  await expect(page.locator(".brief-paper")).toContainText(
    "AI-ASSISTED BRIEF · FOR REVIEW",
  );
  expect((await state()).brief!.mock).toBe(false);
  expect(external).toEqual([]);
});
