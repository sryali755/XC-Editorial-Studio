import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mockDiscovery } from "../lib/ai/mock-discovery";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

const clientFixture = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const expectedFixture = path.join(
  __dirname,
  "fixtures/client-input-pack/imagine_that_expected_input_pack.json",
);

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery conversation UI requires Discovery mode.",
  ),
);

async function openRoundtable(page: Page) {
  test.setTimeout(120_000);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
  await expect(page.getByText("Use a supplied sample brief")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByText("Use a supplied sample brief").click();
  await page
    .getByRole("button", { name: "Load Kevin’s supplied IMC brief" })
    .click();
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  // These conversation tests need a stable selected pack. A late preparation
  // result legitimately requires earlier-context consent during comparison.
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Why would the intended audience hesitate to switch?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-finding").first()).toBeVisible();
  return consumer;
}

test("the primary card keeps finding-version conversations and drafts separate from its agent thread", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    calls.push(requestSchema.parse(route.request().postDataJSON()));
    await route.continue();
  });
  const consumer = await openRoundtable(page);
  // One finding is shown at a time; Next / Previous page stored findings.
  const card = consumer.locator(".v2-finding");
  const nextFinding = consumer.getByRole("button", { name: "Next finding" });
  const previousFinding = consumer.getByRole("button", {
    name: "Previous finding",
  });
  await expect(card).toHaveCount(1);
  const firstTitle = await card.locator("h4").textContent();
  await card.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  await expect(
    consumer.getByRole("textbox", { name: `Your message about ${firstTitle}` }),
  ).toBeFocused();
  await expect(consumer.locator(".v2-conversation-scope")).toContainText(
    firstTitle!,
  );
  await expect(consumer.locator(".v2-conversation-scope")).toContainText("V0");
  await consumer
    .getByRole("textbox", { name: `Your message about ${firstTitle}` })
    .fill("Question about finding A");
  await nextFinding.click();
  await expect(card.locator("h4")).not.toHaveText(firstTitle!);
  const secondTitle = await card.locator("h4").textContent();
  await card.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  await consumer
    .getByRole("textbox", { name: `Your message about ${secondTitle}` })
    .fill("Unsent question about finding B");
  await previousFinding.click();
  await expect(card.locator("h4")).toHaveText(firstTitle!);
  await card.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  await expect(
    consumer.getByRole("textbox", { name: `Your message about ${firstTitle}` }),
  ).toHaveValue("Question about finding A");
  await consumer.getByRole("button", { name: "Ask this agent" }).click();
  const findingCalls = calls.filter(
    (call) => call.agentType === "discovery" && call.context.selectedFinding,
  );
  expect(findingCalls).toHaveLength(1);
  const request = findingCalls[0];
  if (request.agentType !== "discovery") throw new Error("Wrong request");
  expect(request.context.lens).toBe("consumer");
  expect(request.context.selectedFinding?.title).toBe(firstTitle);
  expect(request.context.selectedFinding?.runVersion).toBe(1);
  expect(request.context.action).toBe("explore_deeper");
  await expect(
    consumer.getByRole("region", {
      name: "Consumer Agent finding conversation V0",
    }),
  ).toContainText("Question about finding A");
  await expect(
    consumer.getByRole("region", {
      name: "Consumer Agent finding conversation V0",
    }),
  ).not.toContainText("Unsent question about finding B");
  await consumer
    .getByRole("button", { name: "Back to agent conversation" })
    .click();
  await expect(
    consumer.getByRole("textbox", { name: "Your message to Consumer Agent" }),
  ).toBeVisible();
  await consumer
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill("Separate agent-level draft");
  await page.reload();
  await expect(
    consumer.getByRole("textbox", { name: "Your message to Consumer Agent" }),
  ).toHaveValue("Separate agent-level draft");
  await nextFinding.click();
  await expect(card.locator("h4")).toHaveText(secondTitle!);
  await card.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  await expect(
    consumer.getByRole("textbox", {
      name: `Your message about ${secondTitle}`,
    }),
  ).toHaveValue("Unsent question about finding B");
  await consumer
    .getByRole("button", { name: "Back to agent conversation" })
    .click();
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await expect(
    consumer.getByRole("heading", { name: "Consumer Agent", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Show all five agents" }).click();
  await expect(
    consumer.getByRole("button", { name: "Expand Consumer Agent" }),
  ).toBeFocused();
});

test("research actions stay secondary and carry structured intent for the active finding", async ({
  page,
}) => {
  const consumer = await openRoundtable(page);
  const first = consumer.locator(".v2-finding").first();
  const title = await first.locator("h4").textContent();
  await first.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  const actions = consumer.locator(".v2-research-actions");
  await expect(
    actions.getByRole("button", { name: "Find contrary evidence" }),
  ).toBeHidden();
  await actions.locator("summary").click();
  const actionRequest = page.waitForRequest((request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/ai/agent"))
      return false;
    const submitted = requestSchema.parse(request.postDataJSON());
    return (
      submitted.agentType === "discovery" &&
      submitted.context.lens === "consumer" &&
      submitted.context.action === "find_contrary"
    );
  });
  await actions.getByRole("button", { name: "Find contrary evidence" }).click();
  const request = requestSchema.parse((await actionRequest).postDataJSON());
  expect(request?.agentType).toBe("discovery");
  if (request?.agentType !== "discovery") throw new Error("Wrong request");
  expect(request.context.action).toBe("find_contrary");
  expect(request.context.selectedFinding?.title).toBe(title);
  expect(request.guidance).toContain("challenges this interpretation");
  await expect(
    consumer.getByRole("region", {
      name: "Consumer Agent finding conversation V0",
    }),
  ).toContainText("External retrieval unavailable · supplied sources only");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("selected cross-lens findings produce an editable Working Space connection", async ({
  page,
}) => {
  await openRoundtable(page);
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  const brand = page.getByRole("article", {
    name: "Brand Agent",
    exact: true,
  });
  await consumer
    .locator(".v2-finding")
    .first()
    .getByRole("checkbox", { name: "Compare" })
    .check();
  await brand
    .locator(".v2-finding")
    .first()
    .getByRole("checkbox", { name: "Compare" })
    .check();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  const drawer = page.getByRole("dialog", { name: "Working Space" });
  await drawer
    .getByRole("button", { name: "Compare findings in Discovery", exact: true })
    .click();
  const comparisonPanel = page.locator(".v2-comparison-panel");
  await expect(comparisonPanel).toContainText("Consumer");
  await expect(comparisonPanel).toContainText("Brand");
  await comparisonPanel
    .getByRole("button", { name: "Compare selected findings" })
    .click();
  const note = comparisonPanel.locator(".ws-connection").first();
  await expect(note).toBeVisible();
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("r3-cross-lens-connection.png"),
  });
  const original = await note
    .getByRole("textbox", { name: "Edit connection note" })
    .inputValue();
  expect(original.length).toBeGreaterThan(0);
  await note
    .getByRole("textbox", { name: "Edit connection note" })
    .fill(`${original} Kevin's question remains open.`);
  await note.getByRole("button", { name: "Save connection note" }).click();
  await expect(note).toContainText("Saved note versions · 1");
  await page.reload();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await drawer
    .getByRole("button", { name: "Compare findings in Discovery", exact: true })
    .click();
  await expect(
    page.locator(".v2-comparison-panel").locator(".ws-connection").first(),
  ).toContainText("Kevin's question remains open.");
  await comparisonPanel
    .getByRole("button", { name: "Reject connection" })
    .click();
  await expect(
    comparisonPanel.getByRole("button", { name: "Reject connection" }),
  ).toHaveCount(0);
  await comparisonPanel.getByText(/Rejected connections · 1/).click();
  await comparisonPanel
    .getByRole("button", { name: "Restore connection" })
    .click();
  await expect(
    comparisonPanel.getByRole("button", { name: "Reject connection" }),
  ).toBeVisible();
});

test("a failed finding turn retries without duplicating Kevin's message", async ({
  page,
}) => {
  let failOnce = true;
  const attempts: Extract<AgentRequest, { agentType: "discovery" }>[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const value = requestSchema.parse(route.request().postDataJSON());
    if (value.agentType === "discovery" && value.context.selectedFinding) {
      attempts.push(value);
      if (failOnce) {
        failOnce = false;
        return route.fulfill({
          status: 500,
          json: {
            error: "Offline injected finding failure.",
            code: "provider_error",
            retryable: false,
          },
        });
      }
    }
    await route.continue();
  });
  const consumer = await openRoundtable(page);
  await consumer
    .locator(".v2-finding")
    .first()
    .getByRole("button", { name: /^Discuss .* V0$/ })
    .click();
  await consumer
    .getByRole("textbox", { name: /Your message about/ })
    .fill("Test the exact claim against supplied audience evidence.");
  await consumer.getByRole("button", { name: "Ask this agent" }).click();
  await expect(consumer.getByRole("alert")).toContainText(
    "Offline injected finding failure",
  );
  const thread = consumer.getByRole("region", {
    name: "Consumer Agent finding conversation V0",
  });
  await expect(thread.locator(".v2-message.human")).toHaveCount(1);
  await expect(thread).toContainText("Failed · retry below");
  await page.screenshot({
    path: test.info().outputPath("r3-finding-failure-retry.png"),
  });
  await consumer
    .getByRole("button", { name: "Retry finding discussion" })
    .click();
  await expect(thread.locator(".v2-message.agent")).toHaveCount(1);
  await expect(thread.locator(".v2-message.human")).toHaveCount(1);
  expect(attempts).toHaveLength(2);
  expect(attempts[1].context.selectedFinding).toEqual(
    attempts[0].context.selectedFinding,
  );
  expect(attempts[1].guidance).toBe(attempts[0].guidance);
});

test("a delayed comparison cannot enter another PDF campaign's Working Space", async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(existsSync(clientFixture), "Approved client PDF must exist").toBe(
    true,
  );
  const expected = JSON.parse(readFileSync(expectedFixture, "utf8")) as {
    campaigns: { title: string }[];
  };
  let release!: () => void;
  let received!: () => void;
  let completed!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    completed = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    const value = requestSchema.parse(route.request().postDataJSON());
    if (value.agentType !== "connections") return route.continue();
    received();
    await pending;
    try {
      await route.continue();
    } catch {
      // The old campaign may abort the request when its view unmounts.
    } finally {
      completed();
    }
  });
  await page.goto("/");
  await page
    .getByLabel("Import file for IMC brief")
    .setInputFiles(clientFixture);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
  const scope = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const choose = async (title: string) =>
    scope.selectOption(
      (await scope
        .locator("option")
        .filter({ hasText: title })
        .getAttribute("value"))!,
    );
  await choose(expected.campaigns[0].title);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("What should we learn about movers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  const brand = page.getByRole("article", {
    name: "Brand Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-finding").first()).toBeVisible();
  await consumer
    .locator(".v2-finding")
    .first()
    .getByRole("checkbox", { name: "Compare" })
    .check();
  await brand
    .locator(".v2-finding")
    .first()
    .getByRole("checkbox", { name: "Compare" })
    .check();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  const drawer = page.getByRole("dialog", { name: "Working Space" });
  await drawer
    .getByRole("button", { name: "Compare findings in Discovery", exact: true })
    .click();
  await page
    .locator(".v2-comparison-panel")
    .getByRole("button", { name: "Compare selected findings" })
    .click();
  await started;
  await drawer.getByRole("button", { name: "Close Working Space" }).click();
  await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
  await choose(expected.campaigns[1].title);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  release();
  await finished;
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(
    page.locator(".v2-comparison-panel").locator(".ws-connection"),
  ).toHaveCount(0);
  await expect(page.locator(".studio-header")).toContainText(
    expected.campaigns[1].title,
  );
});

test("a delayed follow-up stays archived when the investigation question changes", async ({
  page,
}) => {
  const consumer = await openRoundtable(page);
  const originalQuestion = await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .inputValue();
  const before = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage).filter((item) =>
      item.startsWith("xc-insight-discovery-v2:"),
    );
    const candidates = keys.map((key) => {
      const state = JSON.parse(sessionStorage.getItem(key)!).$value;
      const run = state.runs.find(
        (item: { lensId: string }) => item.lensId === "consumer",
      );
      return {
        key,
        currentVersionId: run?.currentVersionId,
        versions: run?.versions.length,
      };
    });
    const selected = candidates.find(
      (candidate) => candidate.currentVersionId && candidate.versions,
    );
    return {
      key: selected?.key,
      currentVersionId: selected?.currentVersionId,
    };
  });
  expect(
    before.currentVersionId,
    "Consumer V0 should be persisted",
  ).toBeTruthy();
  let release!: () => void;
  let markStarted!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (
      request.agentType === "discovery" &&
      request.context.lens === "consumer" &&
      request.context.action === "explore_deeper" &&
      !request.context.selectedFinding
    ) {
      markStarted();
      await pending;
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: mockDiscovery(request),
        },
      });
    }
    await route.continue();
  });
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await consumer
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill("Why?");
  await consumer.getByRole("button", { name: "Ask this agent" }).click();
  await started;
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("What evidence would distinguish the possible mover barriers?");
  release();
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Refresh Required",
  );
  await expect(consumer.locator(".v2-message.agent")).toContainText(
    "Earlier-context response",
  );
  const archived = await page.evaluate((key) => {
    const state = JSON.parse(sessionStorage.getItem(key)!).$value;
    const run = state.runs.find(
      (item: { lensId: string }) => item.lensId === "consumer",
    );
    return {
      currentVersionId: run.currentVersionId,
      oldQuestion: run.versions.find(
        (item: { id: string }) => item.id === run.currentVersionId,
      )?.question,
      followUpQuestion: run.versions.find(
        (item: { action: string }) => item.action === "explore_deeper",
      )?.question,
    };
  }, before.key!);
  await expect(
    page.getByRole("textbox", { name: "What should we investigate?" }),
  ).toHaveValue("What evidence would distinguish the possible mover barriers?");
  expect(archived.currentVersionId).toBe(before.currentVersionId);
  expect(archived.oldQuestion).toBe(originalQuestion);
  expect(archived.followUpQuestion).toBe(originalQuestion);
});

test("Movers and Xfinity Pro restore their own Consumer conversations after campaign switching", async ({
  page,
}) => {
  test.setTimeout(240_000);
  expect(existsSync(clientFixture), "Approved client PDF must exist").toBe(
    true,
  );
  const expected = JSON.parse(readFileSync(expectedFixture, "utf8")) as {
    campaigns: { title: string }[];
  };
  await page.goto("/");
  await page
    .getByLabel("Import file for IMC brief")
    .setInputFiles(clientFixture);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
  const scope = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const nav = page.getByRole("navigation", { name: "Workspace" });
  const chooseAndBuild = async (title: string) => {
    await scope.selectOption(
      (await scope
        .locator("option")
        .filter({ hasText: title })
        .getAttribute("value"))!,
    );
    await page.getByRole("button", { name: "Build Input Pack" }).click();
    await expect(page.locator(".studio-agent-status")).toHaveText(
      ["Demo · V0", "Demo · V0", "Demo · V0"],
      { timeout: 60_000 },
    );
  };
  const startCampaignDiscussion = async (question: string) => {
    await nav
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    await expect(consumer.locator(".v2-finding").first()).toBeVisible({
      timeout: 60_000,
    });
    return consumer;
  };
  const askConsumer = async (
    consumer: ReturnType<typeof page.getByRole>,
    text: string,
  ) => {
    await consumer
      .getByRole("button", { name: "Expand Consumer Agent" })
      .click();
    await consumer
      .getByRole("textbox", { name: "Your message to Consumer Agent" })
      .fill(text);
    await consumer.getByRole("button", { name: "Ask this agent" }).click();
    await expect(consumer.locator(".v2-conversation")).toContainText(text);
  };

  await chooseAndBuild(expected.campaigns[0].title);
  const moversConsumer = await startCampaignDiscussion(
    "What evidence should validate the Movers retention interpretation?",
  );
  const moversTurn = "Movers-only Consumer conversation marker.";
  await askConsumer(moversConsumer, moversTurn);

  await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
  await chooseAndBuild(expected.campaigns[1].title);
  const proConsumer = await startCampaignDiscussion(
    "What evidence should validate the Xfinity Pro work-call interpretation?",
  );
  await expect(
    proConsumer.getByRole("region", {
      name: "Consumer Agent agent conversation",
    }),
  ).toHaveCount(0);
  const proTurn = "Xfinity Pro-only Consumer conversation marker.";
  await askConsumer(proConsumer, proTurn);

  await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
  await chooseAndBuild(expected.campaigns[0].title);
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  const restoredConsumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(
    restoredConsumer.getByRole("region", {
      name: "Consumer Agent agent conversation",
    }),
  ).toContainText(moversTurn);
  await expect(
    restoredConsumer.getByRole("region", {
      name: "Consumer Agent agent conversation",
    }),
  ).not.toContainText(proTurn);
  await expect(
    page.getByRole("textbox", { name: "What should we investigate?" }),
  ).toHaveValue(
    "What evidence should validate the Movers retention interpretation?",
  );
});

for (const campaignIndex of [0, 1]) {
  test(`real PDF campaign ${campaignIndex + 1} keeps the primary finding conversation scoped and visually usable`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    expect(existsSync(clientFixture), "Approved client PDF must exist").toBe(
      true,
    );
    expect(
      existsSync(expectedFixture),
      "Approved expected fixture must exist",
    ).toBe(true);
    const expected = JSON.parse(readFileSync(expectedFixture, "utf8")) as {
      campaigns: {
        title: string;
        must_not_import_from_other_campaign: string[];
      }[];
    };
    const campaign = expected.campaigns[campaignIndex];
    expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
      mode: "mock",
      provider: "mock",
    });
    const blockedExternal: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      ) {
        blockedExternal.push(url.hostname);
        await route.abort();
      } else await route.continue();
    });
    const calls: AgentRequest[] = [];
    page.on("request", (value) => {
      if (value.url().includes("/api/ai/agent") && value.method() === "POST")
        calls.push(requestSchema.parse(value.postDataJSON()));
    });
    await page.goto("/");
    await page
      .getByLabel("Import file for IMC brief")
      .setInputFiles(clientFixture);
    await expect(
      page.getByRole("textbox", { name: "IMC output brief" }),
    ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
    const scope = page.getByRole("combobox", {
      name: "Campaign in this document",
    });
    await scope.selectOption(
      (await scope
        .locator("option")
        .filter({ hasText: campaign.title })
        .getAttribute("value"))!,
    );
    await page.getByRole("button", { name: "Build Input Pack" }).click();
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(`What needs evidence in ${campaign.title}?`);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion" })
      .click();
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    const first = consumer.locator(".v2-finding").first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await page.locator(".v2-agent-grid").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test
        .info()
        .outputPath(`r3-campaign-${campaignIndex + 1}-five-agents.png`),
    });
    const title = await first.locator("h4").textContent();
    await first.getByRole("button", { name: /^Discuss .* V0$/ }).click();
    await consumer
      .getByRole("textbox", { name: `Your message about ${title}` })
      .fill(`Which supplied record supports this in ${campaign.title}?`);
    await consumer.getByRole("button", { name: "Ask this agent" }).click();
    await expect(
      consumer.getByRole("region", {
        name: "Consumer Agent finding conversation V0",
      }),
    ).toContainText("Which supplied record supports this");
    const scoped = calls.filter(
      (call): call is Extract<AgentRequest, { agentType: "discovery" }> =>
        call.agentType === "discovery" && Boolean(call.context.selectedFinding),
    );
    expect(scoped).toHaveLength(1);
    expect(scoped[0].context.foundation.campaignContext.campaignName).toBe(
      campaign.title,
    );
    expect(scoped[0].context.selectedFinding?.title).toBe(title);
    for (const forbidden of campaign.must_not_import_from_other_campaign)
      expect(JSON.stringify(scoped[0].context.foundation)).not.toContain(
        forbidden,
      );
    await consumer.locator(".v2-conversation").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test
        .info()
        .outputPath(
          `r3-campaign-${campaignIndex + 1}-finding-conversation.png`,
        ),
    });
    await first.getByRole("button", { name: "Save to Working Space" }).click();
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    const drawer = page.getByRole("dialog", { name: "Working Space" });
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole("heading", { name: /Saved findings/ })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test
        .info()
        .outputPath(`r3-campaign-${campaignIndex + 1}-working-space.png`),
    });
    await page.getByRole("button", { name: "Close Working Space" }).click();
    if (campaignIndex === 1) {
      await page.setViewportSize({ width: 390, height: 844 });
      await consumer.locator(".v2-agent-volley").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath("r3-narrow-finding-conversation.png"),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    // The existing layout asks for a Google Fonts stylesheet. Interception
    // aborts it before network access; no AI or research host may be requested.
    expect(
      blockedExternal.every((host) => host === "fonts.googleapis.com"),
    ).toBe(true);
  });
}
