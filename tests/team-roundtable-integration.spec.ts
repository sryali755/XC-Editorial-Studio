import { expect, test } from "@playwright/test";

test("team discussion is isolated and switching views preserves Individual Round Table state", async ({
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
  await expect(teamPanel.getByText("MOCK DATA · ISOLATED")).toBeVisible();
  await expect(group.getByText("Mock perspective").first()).toBeVisible();
  await expect(
    group.getByText(
      "For Movers, do we think stress changes what households spend on internet, or mostly what they need from the experience?",
      { exact: true },
    ),
  ).toBeVisible();

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
  const consumerMessage = group.locator(
    '[data-message-id="movers-consumer-stress"]',
  );
  await consumerMessage
    .getByRole("button", { name: "Save insight from Consumer Agent" })
    .click();
  await expect(
    consumerMessage.getByRole("button", {
      name: "Unsave insight from Consumer Agent",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  const threaded = teamPanel.locator(
    '[data-team-prototype="threaded-discussion"]',
  );
  await expect(threaded).toBeVisible();
  await expect(
    threaded
      .locator(".team-message-text")
      .getByText("Can we compare that with the switching experience?", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  await expect(
    teamPanel.locator('[data-team-prototype="hybrid-roundtable"]'),
  ).toBeVisible();

  await individualTab.click();
  await expect(individualPanel).toBeVisible();
  await expect(question).toHaveValue(
    "What should movers consider when comparing home internet?",
  );
  await expect(teamPanel).toBeHidden();
  await teamTab.click();
  await expect(
    teamPanel
      .locator('[data-message-id="movers-consumer-stress"]')
      .getByRole("button", {
        name: "Unsave insight from Consumer Agent",
      })
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
  await expect(
    teamPanel.getByText("For Movers, do we think stress changes", {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset Workspace", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Reset this workspace?",
    exact: true,
  });
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    dialog.getByRole("button", { name: "Clear Workspace", exact: true }).click(),
  ]);

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("tab", { name: /Team Discussion/ }).click();

  await expect(
    page.locator("#team-discussion-panel .team-empty-conversation"),
  ).toBeVisible();
  await expect(
    page.locator("#team-discussion-panel [data-message-id]"),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  await expect(
    page.locator("#team-discussion-panel .team-empty-conversation"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  await expect(
    page.locator("#team-discussion-panel .team-empty-conversation"),
  ).toBeVisible();
});
