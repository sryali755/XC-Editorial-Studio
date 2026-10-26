import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  studioStorageKey,
} from "../lib/discovery-studio";
import { compactStringify } from "../lib/discovery-persistence";

function campaignSession(campaign: string) {
  const source = [
    `Campaign: ${campaign}`,
    "Business Objective: Explore a supplied campaign problem.",
    "Target Audience: Existing and prospective customers.",
    "Reason to Believe: Supplied proof requires review.",
  ].join("\n");
  return {
    ...applyStudioSource(emptyStudio(), source),
    screen: "discovery" as const,
  };
}

async function openTeamDiscussion(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery" })
    .click();
  await page.getByRole("tab", { name: /Team Discussion/ }).click();
  return page.getByRole("tabpanel", { name: /Team Discussion/ });
}

test("team discussion prototypes are interactive and isolated from the individual roundtable", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable in the legacy workspace.",
  );

  const aiRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    aiRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/");
  const workspaceNav = page.getByRole("navigation", { name: "Workspace" });
  await expect(workspaceNav.getByRole("button")).toHaveCount(4);
  await workspaceNav.getByRole("button", { name: "Insight Discovery" }).click();

  const individualTab = page.getByRole("tab", {
    name: "Individual Round Table",
  });
  const teamTab = page.getByRole("tab", { name: /Team Discussion/ });
  await expect(individualTab).toHaveAttribute("aria-selected", "true");
  await individualTab.focus();
  await individualTab.press("ArrowRight");
  await expect(teamTab).toBeFocused();
  await expect(teamTab).toHaveAttribute("aria-selected", "true");
  await teamTab.press("ArrowLeft");
  await expect(individualTab).toBeFocused();
  await expect(individualTab).toHaveAttribute("aria-selected", "true");

  const individual = page.getByRole("tabpanel", {
    name: "Individual Round Table",
  });
  const investigation = page.getByRole("textbox", {
    name: "What should we investigate?",
  });
  await expect(investigation).toBeVisible();
  await investigation.fill(
    "Does moving stress change what households prioritize for internet?",
  );
  await page.waitForTimeout(350);
  const productionStorage = await page.evaluate(() =>
    Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index)!;
        return [key, sessionStorage.getItem(key)];
      }),
    ),
  );

  await teamTab.click();
  const teamPanel = page.getByRole("tabpanel", { name: /Team Discussion/ });
  const group = teamPanel.locator('[data-team-prototype="group-chat"]');
  await expect(group).toBeVisible();
  await expect(
    group
      .getByText(
        "For Movers, do we think stress changes what households spend on internet, or mostly what they need from the experience?",
      )
      .first(),
  ).toBeVisible();
  const kevinAvatar = group.locator(
    '[data-message-id="movers-question-stress"] .team-avatar-kevin',
  );
  await expect(kevinAvatar).toHaveAttribute("aria-label", "Kevin Mercer");
  await expect(kevinAvatar).toHaveText("KM");
  await expect(teamPanel.getByRole("note")).toContainText(
    "isolated Movers sample content",
  );
  await expect(
    group.getByText("Consumer Agent", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    group.getByText("Category Agent", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    group.getByText("That distinction makes sense.", { exact: false }),
  ).toBeVisible();
  await expect(
    group.locator(
      '[data-message-id="movers-brand-group"] .team-message-context',
    ),
  ).toHaveText("Replying to Group");
  await expect(
    group.locator(
      '[data-message-id="movers-category-switching"] .team-message-context',
    ),
  ).toHaveText("Replying to Kevin Mercer");
  await expect(
    group.locator(
      '[data-message-id="movers-question-category"] .team-message-context',
    ),
  ).toHaveText("Replying to Consumer Agent · @Category Agent");
  await expect(
    group.locator(
      '[data-message-id="movers-analogous-onboarding"] .team-message-context',
    ),
  ).toHaveText("Replying to Category Agent");
  await expect(
    group.locator(
      '[data-message-id="movers-brand-stress"] .team-message-context',
    ),
  ).toHaveText("Replying to Consumer Agent");
  await expect(
    group.locator(
      '[data-message-id="movers-brand-group"] .team-message-bubble',
    ),
  ).toHaveCSS("background-color", "rgb(251, 244, 229)");
  await expect(
    group.locator(
      '[data-message-id="movers-culture-stress"] .team-message-bubble',
    ),
  ).toHaveCSS("background-color", "rgb(240, 234, 250)");
  const kevinInitial = group.locator(
    '[data-message-id="movers-question-stress"]',
  );
  await expect(kevinInitial.locator(".team-message-context")).toHaveText(
    "Replying to Group",
  );
  await expect(kevinInitial).toHaveCSS("justify-content", "flex-end");
  await expect(
    group.locator('[data-message-id="movers-consumer-stress"]'),
  ).toHaveCSS("justify-content", "flex-start");
  const bubbleWidths = await group
    .locator('[data-message-id="movers-question-stress"]')
    .evaluate((el) => {
      const row = el.getBoundingClientRect();
      const bubble = el
        .querySelector(".team-message-bubble")!
        .getBoundingClientRect();
      return bubble.width / row.width;
    });
  expect(bubbleWidths).toBeLessThanOrEqual(0.7);

  const composer = group.getByRole("textbox", { name: "Message the team" });
  await composer.fill("@Cate");
  await expect(
    group.getByRole("listbox", { name: "Mention an agent" }),
  ).toBeVisible();
  await group.getByRole("option", { name: /Category/ }).click();
  await composer.press("End");
  await composer.type(" how can the category reduce switching friction?");
  await group.getByRole("button", { name: "Send to team" }).click();
  await expect(
    group.locator(".team-message").last().locator(".team-message-context"),
  ).toHaveText("To @Category Agent");
  await expect(group.getByRole("status")).toContainText(
    "Mock agents are considering",
  );
  await expect(
    group.getByText(
      "A useful category question is where comparison or switching creates avoidable effort. The opportunity may be clearer next steps rather than a higher-spend assumption.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 5000 });
  await expect(group.getByRole("status")).toContainText(
    "Mock responses complete",
  );

  const consumerResponse = group
    .locator(".team-message")
    .filter({ hasText: "I’d be careful about calling it a spending driver." });
  await consumerResponse
    .getByRole("button", { name: "Save insight from Consumer Agent" })
    .click();
  await expect(
    consumerResponse.getByRole("button", {
      name: "Unsave insight from Consumer Agent",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await group
    .getByRole("button", { name: "Reply to Consumer Agent" })
    .first()
    .click();
  await expect(group.locator(".team-replying")).toContainText(
    "Replying to Consumer Agent",
  );
  await composer.fill(
    "Could continuity be a reason to prioritize simple setup?",
  );
  await group.getByRole("button", { name: "Send to team" }).click();
  const KevinReply = group.locator(".team-message").filter({
    hasText: "Could continuity be a reason to prioritize simple setup?",
  });
  await expect(KevinReply.locator(".team-message-context")).toHaveText(
    "Replying to Consumer Agent",
  );
  await expect(
    group.getByText(
      /^From the consumer lens, the practical need may be a simpler move-in decision\./,
    ),
  ).toBeVisible({ timeout: 5000 });

  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  const threaded = teamPanel.locator(
    '[data-team-prototype="threaded-discussion"]',
  );
  await expect(threaded).toBeVisible();
  const firstTopic = threaded.locator(".team-topic").first();
  await firstTopic.getByRole("button", { name: /Collapse discussion/ }).click();
  await expect(
    firstTopic.getByText("Consumer Agent", { exact: true }),
  ).toHaveCount(0);
  await firstTopic.getByRole("button", { name: /Expand discussion/ }).click();
  await expect(
    firstTopic.getByText("Consumer Agent", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    threaded
      .getByText("Could continuity be a reason to prioritize simple setup?", {
        exact: true,
      })
      .first(),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  const hybrid = teamPanel.locator('[data-team-prototype="hybrid-roundtable"]');
  await expect(hybrid).toBeVisible();
  await expect(hybrid.locator(".team-agent-identity")).toHaveCount(5);
  const savedPanel = hybrid.locator(".team-saved-panel");
  await expect(
    savedPanel.getByText("I’d be careful about calling it a spending driver.", {
      exact: false,
    }),
  ).toBeVisible();
  await savedPanel
    .getByRole("button", { name: "Unsave insight from Consumer Agent" })
    .click();
  await expect(savedPanel).toContainText("0 saved mock insights");
  await expect(
    hybrid
      .getByRole("button", { name: "Save insight from Consumer Agent" })
      .first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await hybrid
    .locator(".team-hybrid-grid")
    .evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(" ").length,
      right: el.getBoundingClientRect().right,
      viewport: window.innerWidth,
    }));
  expect(mobileLayout.columns).toBe(1);
  expect(mobileLayout.right).toBeLessThanOrEqual(mobileLayout.viewport);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await hybrid.getByLabel("Simulate next response failure").check();
  const hybridComposer = hybrid.getByRole("textbox", {
    name: "Message the team",
  });
  await hybridComposer.fill("Could this be tested with mover interviews?");
  await hybrid.getByRole("button", { name: "Send to team" }).click();
  await expect(hybrid.getByRole("alert")).toContainText(
    "Mock response failed",
    { timeout: 5000 },
  );
  await hybrid.getByRole("button", { name: "Retry mock response" }).click();
  await expect(hybrid.getByRole("status")).toContainText(
    "Mock responses complete",
    { timeout: 5000 },
  );

  await page.getByRole("tab", { name: "Group Chat" }).click();
  const restoredGroup = teamPanel.locator('[data-team-prototype="group-chat"]');
  await expect(
    restoredGroup
      .getByText("Could this be tested with mover interviews?", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    restoredGroup.getByText(
      /^Guided onboarding in other high-friction services offers a pattern to explore/,
    ),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Individual Round Table" }).click();
  await expect(individual).toBeVisible();
  await expect(investigation).toHaveValue(
    "Does moving stress change what households prioritize for internet?",
  );
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

test("Kevin can approve an optional mock deeper look without calling AI or research APIs", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable in the legacy workspace.",
  );
  const apiRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });

  const teamPanel = await openTeamDiscussion(page);
  const group = teamPanel.locator('[data-team-prototype="group-chat"]');
  const offer = group.locator(
    '[data-message-id="movers-consumer-stress"] .team-research-offer',
  );
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Approve deeper look" }).click();
  await expect(offer).toContainText("Approved");
  await expect(
    group.getByText(
      /^Mock follow-up: This prototype cannot access research sources/,
    ),
  ).toBeVisible({ timeout: 5000 });
  await expect(offer).toContainText("No sources were queried");

  await page.getByRole("tab", { name: "Threaded Discussion" }).click();
  const threaded = teamPanel.locator(
    '[data-team-prototype="threaded-discussion"]',
  );
  await expect(
    threaded.locator(
      '[data-message-id="movers-consumer-stress"] .team-research-offer',
    ),
  ).toContainText("Mock follow-up added below");
  expect(apiRequests).toEqual([]);
});

test("Kevin can decline an optional mock deeper look", async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false",
    "Team Discussion is unavailable in the legacy workspace.",
  );
  const apiRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });

  const teamPanel = await openTeamDiscussion(page);
  const offer = teamPanel
    .locator('[data-team-prototype="group-chat"]')
    .locator('[data-message-id="movers-consumer-stress"] .team-research-offer');
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toContainText("no research was started");
  await expect(
    teamPanel.getByText(/^Mock follow-up: This prototype cannot access/),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Hybrid Roundtable" }).click();
  await expect(
    teamPanel.locator(
      '[data-team-prototype="hybrid-roundtable"] .team-research-offer',
    ),
  ).toContainText("Not now — no research was started");
  expect(apiRequests).toEqual([]);
});

test("campaign labels keep the Movers sample honest and prototype state cannot cross campaigns", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/");

  const openCampaign = async (campaign: string) => {
    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, value),
      {
        key: studioStorageKey,
        value: compactStringify(campaignSession(campaign)),
      },
    );
    await page.reload();
    await page.getByRole("tab", { name: /Team Discussion/ }).click();
    const panel = page.getByRole("tabpanel", { name: /Team Discussion/ });
    await expect(panel.getByRole("note")).toContainText(
      `Current workspace: ${campaign}`,
    );
    await expect(panel.getByRole("note")).toContainText(
      "isolated Movers sample content",
    );
    await expect(panel).toContainText("SIMULATED SAMPLE · IN MEMORY");
    return panel;
  };

  const movers = await openCampaign("Movers");
  const privateMessage = "This message belongs only to the Movers prototype.";
  await movers
    .getByRole("textbox", { name: "Message the team" })
    .fill(privateMessage);
  await movers.getByRole("button", { name: "Send to team" }).click();
  await expect(movers.getByText(privateMessage, { exact: true })).toBeVisible();

  for (const campaign of [
    "Helix Gateway",
    "Black Friday",
    "North Star Retention Pilot",
  ]) {
    const panel = await openCampaign(campaign);
    await expect(panel.getByText(privateMessage, { exact: true })).toHaveCount(
      0,
    );
  }
  expect(apiRequests).toEqual([]);
});
