import { test, expect, type Page } from "@playwright/test";
import { demoPack, personas } from "../lib/demo";
import { emptyExecution } from "../lib/execution";
import { emptyPreparation } from "../lib/preparation";
import { mockStrategyService } from "../lib/ai/mock-strategy";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";
import {
  defaultPersonality,
  creativeControls,
  isPerspective,
} from "../lib/creative-controls";

const storageKey = "xc-strategy-session-v1";
const state = (page: Page): Promise<StrategySession> =>
  page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), storageKey);

async function openRoundTable(page: Page, failFirst = false) {
  const session: StrategySession = {
    step: 1,
    pack: demoPack,
    preparation: emptyPreparation,
    sharedPack: demoPack,
    outputs: await mockStrategyService.generatePerspectives(demoPack),
    selected: [],
    synthesis: [],
    synthesisResults: [],
    synthesisSources: [],
    finalSourceLines: [],
    finalLine: "",
    finalSource: "",
    approved: null,
    execution: emptyExecution,
    brief: null,
  };
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem(key))
        sessionStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session },
  );
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    calls.push(request);
    if (failFirst && calls.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: "This perspective is temporarily unavailable." },
      });
    await route.fulfill({
      json: {
        provider: "openai",
        model: "test-model",
        generatedAt: new Date().toISOString(),
        ...(isPerspective(request.agentType) &&
        "campaignContext" in request.context
          ? {
              generation: {
                agentId: request.agentType,
                inputPackVersion: "pack-test-snapshot",
                foundation: request.context,
                personality:
                  "personality" in request
                    ? (request.personality ?? defaultPersonality())
                    : defaultPersonality(),
                steeringText: request.guidance ?? "",
                modelSettings: {
                  reasoningEffort: "medium",
                  maxOutputTokens: 2500,
                },
                promptTemplateVersion: "xc-roundtable-2.1",
                requestId: `test-${calls.length}`,
              },
            }
          : {}),
        data: {
          briefLines: [
            {
              id: `${request.agentType}-${calls.length}`,
              line: `A fresh ${request.agentType} direction, attempt ${calls.length}.`,
              rationale: "A distinct alternative using the shared foundation.",
            },
          ],
          perspectiveSummary: "A proposed direction for human review.",
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".agent-card")).toHaveCount(5);
  return calls;
}

test("all five agents generate without guidance and retain independent histories", async ({
  page,
}) => {
  const calls = await openRoundTable(page);
  for (const persona of personas) {
    const before = await state(page);
    const previous = before.outputs.find((o) => o.agentId === persona.id)!;
    const card = page.getByRole("article", { name: persona.name, exact: true });
    await expect(card.getByLabel(`Refinement for ${persona.name}`)).toBeEmpty();
    const generate = card.getByRole("button", {
      name: "Generate another version",
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(card.locator(".current-output")).toContainText("V1 · Current");
    const after = await state(page);
    const updated = after.outputs.find((o) => o.agentId === persona.id)!;
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]).toEqual(previous.versions[0]);
    expect(after.outputs.filter((o) => o.agentId !== persona.id)).toEqual(
      before.outputs.filter((o) => o.agentId !== persona.id),
    );
    expect(calls.at(-1)).toMatchObject({
      agentType: persona.id,
      guidance: "",
      versionNumber: 1,
      previousVersion: { number: 0, text: previous.versions[0].text },
    });
    expect(after.approved).toBeNull();
  }
  expect(calls).toHaveLength(5);
  await page.reload();
  for (const persona of personas)
    await expect(
      page
        .getByRole("article", { name: persona.name, exact: true })
        .locator(".current-output"),
    ).toContainText("V1 · Current");
});

test("a failed regeneration preserves the candidate and retries from the restored version", async ({
  page,
}) => {
  const calls = await openRoundTable(page, true);
  const card = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const before = await state(page);
  await card.getByRole("button", { name: "Generate another version" }).click();
  await expect(card.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  expect((await state(page)).outputs[0].versions).toEqual(
    before.outputs[0].versions,
  );
  await card.getByRole("button", { name: "Retry this perspective" }).click();
  await expect(card.locator(".current-output")).toContainText("V1 · Current");
  await expect(card.getByRole("alert")).toHaveCount(0);
  await card.locator(".history > summary").click();
  await card.getByRole("button", { name: "Restore V0" }).click();
  await card
    .getByLabel("Refinement for Humorous / Witty")
    .fill("  Keep it playful.  ");
  await card.getByRole("button", { name: "Generate another version" }).click();
  await expect(card.locator(".current-output")).toContainText("V2 · Current");
  expect(calls.at(-1)).toMatchObject({
    guidance: "Keep it playful.",
    versionNumber: 2,
    previousVersion: { number: 0, text: before.outputs[0].versions[0].text },
  });
  await expect(card.locator(".history-version")).toHaveCount(3);
});

test("creative controls are independent, persist and version together with steering", async ({
  page,
}) => {
  const calls = await openRoundTable(page);
  for (const persona of personas) {
    const card = page.getByRole("article", { name: persona.name, exact: true });
    await expect(card.getByRole("slider")).toHaveCount(2);
    await expect(card.getByRole("slider", { name: "Temperature" })).toHaveCount(
      0,
    );
    await expect(card.locator(".version-settings")).toHaveCount(0);
    for (const label of [
      "Model",
      "Model settings",
      "Prompt template",
      "Input pack",
      "No additional steering",
    ])
      await expect(card.getByText(label, { exact: true })).toHaveCount(0);
    const id = persona.id as keyof typeof creativeControls;
    await expect(
      card.getByRole("slider", { name: creativeControls[id].primary.label }),
    ).toHaveValue("5");
    await expect(
      card.getByRole("slider", { name: creativeControls[id].secondary.label }),
    ).toHaveValue("5");
  }
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Cultural / Social",
    exact: true,
  });
  const wit = humor.getByRole("slider", { name: "Wit & Humor" });
  await wit.focus();
  await wit.press("ArrowRight");
  await wit.press("ArrowRight");
  await wit.press("ArrowRight");
  await expect(wit).toHaveValue("8");
  await expect(
    culture.getByRole("slider", { name: "Cultural Relevance" }),
  ).toHaveValue("5");
  const feedback = humor.getByLabel("Refinement for Humorous / Witty");
  await feedback.fill("Make this more playful and less corporate.");
  expect(calls).toHaveLength(0);
  await humor.getByRole("button", { name: "Generate another version" }).click();
  await expect(humor.locator(".current-output")).toContainText("V1 · Current");
  const saved = (await state(page)).outputs[0].versions[0];
  expect(calls.at(-1)).not.toHaveProperty("modelSettings");
  expect(saved.generation).toMatchObject({
    personality: { primary: 8, secondary: 5 },
    steeringText: "Make this more playful and less corporate.",
    inputPackVersion: "pack-test-snapshot",
  });
  const before = await state(page);
  await humor.getByRole("button", { name: "Generate another version" }).click();
  await expect(humor.locator(".current-output")).toContainText("V2 · Current");
  const after = await state(page);
  expect(after.outputs[0].versions[0].text).not.toBe(saved.text);
  expect(after.outputs[0].versions[0].generation?.personality).toEqual(
    saved.generation?.personality,
  );
  expect(after.outputs[0].versions[1]).toEqual(saved);
  expect(after.outputs.slice(1)).toEqual(before.outputs.slice(1));
  await humor.locator(".history > summary").click();
  await humor.getByRole("button", { name: "Restore V1", exact: true }).click();
  await wit.press("Home");
  await expect(wit).toHaveValue("1");
  await expect(humor.locator(".version-settings")).toHaveCount(0);
  expect(
    (await state(page)).outputs[0].versions.find((v) => v.id === saved.id)
      ?.generation?.personality.primary,
  ).toBe(8);
  await humor
    .locator(".current-output")
    .getByRole("button", { name: "Select this version" })
    .click();
  expect((await state(page)).selected[0].text).toBe(saved.text);
  await wit.fill("8");
  await expect(wit).toHaveValue("8");
  expect((await state(page)).outputs[0].versions).toHaveLength(3);
  await page.reload();
  await expect(wit).toHaveValue("8");
  await expect(feedback).toHaveValue(
    "Make this more playful and less corporate.",
  );
});

test("personality changes never change synthesis weights and controls fit a mobile card", async ({
  page,
}, testInfo) => {
  const calls = await openRoundTable(page);
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Cultural / Social",
    exact: true,
  });
  for (const card of [humor, culture])
    await card
      .locator(".current-output")
      .getByRole("button", { name: "Select this version" })
      .click();
  await page.getByRole("button", { name: /Combine selected/i }).click();
  const weights = page.locator(".weight input");
  await weights.first().fill("75");
  await humor.getByRole("slider", { name: "Wit & Humor" }).fill("10");
  await expect(weights.first()).toHaveValue("75");
  await expect(weights.nth(1)).toHaveValue("50");
  expect(calls).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await humor.scrollIntoViewIfNeeded();
  const overflow = await humor.evaluate(
    (card) => card.scrollWidth > card.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("creative-controls-mobile.png"),
    fullPage: true,
  });
});

test("a pending generation locks only its own controls and preserves edits to other agents", async ({
  page,
}) => {
  const calls = await openRoundTable(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    await gate;
    await route.fallback();
  });
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Cultural / Social",
    exact: true,
  });
  await humor.getByRole("button", { name: "Generate another version" }).click();
  await expect(humor).toHaveAttribute("aria-busy", "true");
  await expect(
    humor.getByRole("slider", { name: "Wit & Humor" }),
  ).toBeDisabled();
  await expect(
    humor.getByLabel("Refinement for Humorous / Witty"),
  ).toBeDisabled();
  const otherSlider = culture.getByRole("slider", {
    name: "Cultural Relevance",
  });
  await expect(otherSlider).toBeEnabled();
  await otherSlider.fill("8");
  release();
  await expect(humor.locator(".current-output")).toContainText("V1 · Current");
  expect(calls).toHaveLength(1);
  expect(
    (await state(page)).outputs[0].versions[0].generation?.personality.primary,
  ).toBe(5);
  await expect(otherSlider).toHaveValue("8");
  await expect(
    humor.getByRole("slider", { name: "Wit & Humor" }),
  ).toBeEnabled();
});
