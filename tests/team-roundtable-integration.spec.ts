import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  studioStorageKey,
} from "../lib/discovery-studio";
import { compactStringify } from "../lib/discovery-persistence";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

test("team discussion layouts keep separate conversations and preserve Individual Round Table state", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable when Insight Discovery is disabled.",
  );

  const aiRequests: string[] = [];
  await page.route("**/api/ai/**", async (route) => {
    aiRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();

  const individualTab = page.getByRole("tab", {
    name: "Individual Round Table",
  });
  const teamTab = page.getByRole("tab", { name: /Team Discussion/ });
  const individualPanel = page.locator("#individual-roundtable-panel");
  const teamPanel = page.locator("#team-discussion-panel");
  const question = page.getByRole("textbox", {
    name: "What should we investigate?",
  });

  await expect(individualTab).toHaveAttribute("aria-selected", "true");
  await expect(question).toBeVisible();
  await question.fill(
    "What should movers consider when comparing home internet?",
  );

  await teamTab.click();
  await expect(teamTab).toHaveAttribute("aria-selected", "true");
  await expect(individualPanel).toBeHidden();
  await expect(teamPanel).toBeVisible();
  const productionStorage = await page.evaluate(() =>
    Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index)!;
        return [key, sessionStorage.getItem(key)];
      }),
    ),
  );

  const group = teamPanel.locator('[data-team-prototype="group-chat"]');
  await expect(group).toBeVisible();
  await expect(teamPanel.getByText("NO CONVERSATION YET")).toBeVisible();
  await expect(group.locator("[data-message-id]")).toHaveCount(0);
  await expect(group.locator(".team-empty-conversation")).toBeVisible();

  const composer = group.getByRole("textbox", { name: "Message the team" });
  await composer.fill("Can we compare that with the switching experience?");
  await group.getByRole("button", { name: "Send to team" }).click();
  await expect(
    group.getByText("Can we compare that with the switching experience?", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(group.getByRole("status")).toContainText(
    "Mock responses complete",
    { timeout: 5000 },
  );
  await group
    .getByRole("button", { name: "Save insight from Consumer Agent" })
    .first()
    .click();
  await expect(
    group
      .getByRole("button", { name: "Unsave insight from Consumer Agent" })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  const threaded = teamPanel.locator(
    '[data-team-prototype="threaded-discussion"]',
  );
  await expect(threaded).toBeVisible();
  await expect(threaded.locator("[data-message-id]")).toHaveCount(0);
  await expect(
    threaded.getByRole("button", { name: "Saved insights (0)" }),
  ).toBeVisible();
  await threaded
    .getByRole("textbox", { name: "Message the team" })
    .fill("Threaded-only draft");
  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  const hybrid = teamPanel.locator('[data-team-prototype="hybrid-roundtable"]');
  await expect(hybrid).toBeVisible();
  await expect(hybrid.locator("[data-message-id]")).toHaveCount(0);
  await hybrid
    .getByRole("textbox", { name: "Message the team" })
    .fill("Hybrid-only question");
  await hybrid.getByRole("button", { name: "Send to team" }).click();
  await expect(
    hybrid.getByText("Hybrid-only question", { exact: true }),
  ).toBeVisible();
  await expect(hybrid.getByRole("status")).toContainText(
    "Mock responses complete",
  );

  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  await expect(threaded.locator("[data-message-id]")).toHaveCount(0);
  await expect(
    threaded.getByRole("textbox", { name: "Message the team" }),
  ).toHaveValue("Threaded-only draft");
  await threaded.getByRole("button", { name: "Send to team" }).click();
  await expect(
    threaded.getByText("Threaded-only draft", { exact: true }).first(),
  ).toBeVisible();
  await expect(threaded.getByRole("status")).toContainText(
    "Mock responses complete",
  );

  await page.getByRole("tab", { name: "Group Chat" }).click();
  await expect(
    group.getByText("Can we compare that with the switching experience?", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    group.getByText("Threaded-only draft", { exact: true }),
  ).toHaveCount(0);
  await expect(
    group.getByText("Hybrid-only question", { exact: true }),
  ).toHaveCount(0);
  await expect(
    group.getByRole("button", { name: "Saved insights (1)" }),
  ).toBeVisible();

  await individualTab.click();
  await expect(individualPanel).toBeVisible();
  await expect(question).toHaveValue(
    "What should movers consider when comparing home internet?",
  );
  await expect(teamPanel).toBeHidden();
  await teamTab.click();
  await expect(group).toBeVisible();
  await expect(
    teamPanel
      .getByRole("button", { name: "Unsave insight from Consumer Agent" })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    teamPanel
      .getByText("Can we compare that with the switching experience?", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.fromEntries(
        Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index)!;
          return [key, sessionStorage.getItem(key)];
        }),
      ),
    ),
  ).toEqual(productionStorage);
  expect(aiRequests).toEqual([]);
});

test("team discussion uses active Input Pack context without saving mock data", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable when Insight Discovery is disabled.",
  );

  const inputSession = applyStudioSource(emptyStudio(), mobileIMCBrief);
  const inputPack = studioPack(inputSession);
  const aiRequests: string[] = [];
  await page.route("**/api/ai/**", async (route) => {
    aiRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  await expect(
    navigation.getByRole("button", { name: "Input Pack", exact: true }),
  ).toBeEnabled();
  await page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: studioStorageKey, value: compactStringify(inputSession) },
  );
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("tab", { name: /Team Discussion/ }).click();

  const teamPanel = page.locator("#team-discussion-panel");
  const group = teamPanel.locator('[data-team-prototype="group-chat"]');
  await expect(teamPanel.getByText("NO CONVERSATION YET")).toBeVisible();
  await expect(teamPanel.getByRole("note")).toContainText(
    inputPack.campaignName,
  );
  await expect(teamPanel.getByRole("note")).toContainText(inputPack.objective);
  await expect(teamPanel.getByRole("note")).toContainText(inputPack.audience);
  if (inputPack.channel)
    await expect(teamPanel.getByRole("note")).toContainText(inputPack.channel);
  if (inputPack.constraints)
    await expect(teamPanel.getByRole("note")).toContainText(
      inputPack.constraints.slice(0, 260).trimEnd(),
    );
  await expect(group.locator("[data-message-id]")).toHaveCount(0);
  await teamPanel
    .getByRole("button", { name: "Load sample conversation" })
    .click();
  await expect(
    teamPanel.getByText("MOCK RESPONSES · INPUT-PACK CONTEXT"),
  ).toBeVisible();
  await expect(
    group.locator('[data-message-id="campaign-question-context"]'),
  ).toBeVisible();
  await expect(
    group.locator('[data-message-id="campaign-consumer-context"]'),
  ).toContainText(inputPack.audience);

  const storedSessionBefore = await page.evaluate((key) => {
    return window.sessionStorage.getItem(key);
  }, studioStorageKey);
  const composer = group.getByRole("textbox", { name: "Message the team" });
  await composer.fill("What should we validate for this audience?");
  await group.getByRole("button", { name: "Send to team" }).click();
  await expect(
    group.getByText("Mock perspective", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    group
      .locator(".team-message-text")
      .filter({ hasText: "The Input Pack names" })
      .first(),
  ).toContainText(inputPack.audience.slice(0, 35));
  await expect(
    group
      .locator(".team-message-text")
      .filter({ hasText: "Mock perspective for" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  await expect(
    teamPanel.locator(
      '[data-team-prototype="threaded-discussion"] [data-message-id]',
    ),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Group Chat" }).click();
  await expect(
    group.locator('[data-message-id="campaign-question-context"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      studioStorageKey,
    ),
  ).toBe(storedSessionBefore);
  expect(aiRequests).toEqual([]);
});

test("workspace reset clears the experimental Team Discussion conversation", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable when Insight Discovery is disabled.",
  );

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();

  const teamTab = page.getByRole("tab", { name: /Team Discussion/ });
  await teamTab.click();
  const teamPanel = page.locator("#team-discussion-panel");
  await expect(teamPanel.locator("[data-message-id]")).toHaveCount(0);
  await teamPanel
    .getByRole("button", { name: "Load sample conversation" })
    .click();
  await expect(teamPanel.locator("[data-message-id]").first()).toBeVisible();

  await page
    .getByRole("button", { name: "Reset Workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reset this workspace?",
    exact: true,
  });
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    dialog
      .getByRole("button", { name: "Clear Workspace", exact: true })
      .click(),
  ]);

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("tab", { name: /Team Discussion/ }).click();

  await expect(
    page.locator('[data-team-prototype="group-chat"] .team-empty-conversation'),
  ).toBeVisible();
  await expect(
    page.locator("#team-discussion-panel [data-message-id]"),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  await expect(
    page.locator(
      '[data-team-prototype="threaded-discussion"] .team-empty-conversation',
    ),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  await expect(
    page.locator(
      '[data-team-prototype="hybrid-roundtable"] .team-empty-conversation',
    ),
  ).toBeVisible();
});
