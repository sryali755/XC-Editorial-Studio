import { test, expect, type Page } from "@playwright/test";
import { demoPack, personas } from "../lib/demo";
import { emptyExecution } from "../lib/execution";
import { emptyPreparation } from "../lib/preparation";
import { mockStrategyService } from "../lib/ai/mock-strategy";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";

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
