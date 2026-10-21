import { expect, test, type Page } from "@playwright/test";
import sample from "../lib/samples/kevin-imc.json";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Discovery rev-two acceptance requires Discovery enabled.",
  ),
);
const names = [
  "Consumer Agent",
  "Culture Agent",
  "Category Agent",
  "Brand Agent",
  "Analogous Solutions Agent",
];
const focusBox = (page: Page) =>
  page.getByRole("textbox", {
    name: "What should we investigate?",
  });
const agent = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
async function supplyRealBrief(page: Page) {
  await page.goto("/");
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page.getByText("Use a supplied sample brief").click();
  await page
    .getByRole("button", { name: "Load Kevin’s supplied IMC brief" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "IMC output brief", exact: true }),
  ).toHaveValue(sample.text);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(
    page.getByRole("article", { name: "RTB / JTBD" }).getByRole("checkbox"),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("article", { name: "Data Analysis & Synthesis" })
      .locator(".studio-data-choice")
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6);
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
}

test("saved hypothesis mode returns to problem exploration without losing findings or the archived focus", async ({
  page,
}) => {
  await supplyRealBrief(page);
  await focusBox(page).fill("Existing problem focus");
  const consumer = agent(page, "Consumer Agent");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Insights Ready",
  );
  await consumer
    .locator(".v2-finding")
    .first()
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  const before = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(
      (key) =>
        key.startsWith("xc-insight-discovery-v2:") &&
        JSON.parse(sessionStorage.getItem(key)!).$value.runs.some(
          (run: { versions: unknown[] }) => run.versions.length,
        ),
    )!;
    const stored = JSON.parse(sessionStorage.getItem(key)!);
    const state = stored.$value;
    state.investigationType = "hypothesis";
    state.question = "Archived hypothesis focus";
    state.focusByMode = {
      problem: "Existing problem focus",
      hypothesis: "Archived hypothesis focus",
    };
    sessionStorage.setItem(key, JSON.stringify(stored));
    return { key, runs: state.runs, saved: state.savedFindingIds };
  });
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "How should the agents investigate?" }),
  ).toHaveCount(0);
  await expect(focusBox(page)).toHaveValue("Existing problem focus");
  await expect(
    consumer.getByRole("button", {
      name: "Saved to Working Space",
      exact: true,
    }),
  ).toBeVisible();
  await focusBox(page).fill("A new problem focus");
  const after = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).$value,
    before.key,
  );
  expect(after.investigationType).toBe("problem");
  expect(after.focusByMode.hypothesis).toBe("Archived hypothesis focus");
  expect(after.runs).toEqual(before.runs);
  expect(after.savedFindingIds).toEqual(before.saved);
});

test("five agents are visible together; human problem focus is required and sent with the complete real IMC", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    calls.push(requestSchema.parse(route.request().postDataJSON()));
    await route.continue();
  });
  await supplyRealBrief(page);
  await expect(
    page.getByRole("heading", { name: "Collaborate with your round table" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(focusBox(page)).toHaveValue("");
  await expect(focusBox(page)).toHaveAttribute("required", "");
  await expect(
    page.getByRole("button", {
      name: "Start Roundtable Discussion",
      exact: true,
    }),
  ).toBeDisabled();
  const positions: { x: number; y: number; width: number; height: number }[] =
    [];
  for (const name of names) {
    const card = agent(page, name);
    await expect(card).toBeVisible();
    await expect(card.locator(".v2-agent-status")).toHaveText(
      "Awaiting Exploration",
    );
    // How this agent thinks is always visible, not behind an accordion.
    await expect(
      card.getByRole("region", { name: "How this agent thinks" }),
    ).toBeVisible();
    await expect(card.locator(".v2-rubric summary")).toHaveCount(0);
    // One concise summary and focus line replace intro, Goal, Output and
    // the methodology steps.
    await expect(card.locator(".v2-rubric p")).toHaveCount(2);
    await expect(card.locator(".v2-rubric")).toContainText("Focus:");
    await expect(card.locator(".v2-rubric li")).toHaveCount(0);
    await expect(card).not.toContainText("Goal:");
    await expect(card).not.toContainText("Output:");
    await expect(
      card.getByRole("textbox", { name: `Your message to ${name}` }),
    ).toBeVisible();
    positions.push((await card.boundingBox())!);
  }
  expect(new Set(positions.map((box) => Math.round(box.y))).size).toBe(1);
  expect(
    positions.every((box, i) => i === 0 || box.x > positions[i - 1].x),
  ).toBe(true);
  await expect(
    page.getByRole("combobox", { name: "Route finding to another lens" }),
  ).toHaveCount(0);
  const mode = page.getByRole("combobox", {
    name: "How should the agents investigate?",
  });
  await focusBox(page).fill("Why might people see Xfinity only as WiFi?");
  await expect(mode).toHaveCount(0);
  await expect(focusBox(page)).toHaveValue(
    "Why might people see Xfinity only as WiFi?",
  );
  await expect(page.locator("#investigation-mode-help")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  for (const name of names)
    await expect(
      agent(page, name).locator(".v2-finding").first(),
    ).toBeVisible();
  const discoveryCalls = calls.filter((call) => call.agentType === "discovery");
  expect(discoveryCalls).toHaveLength(5);
  for (const call of discoveryCalls) {
    expect(call.agentType).toBe("discovery");
    if (call.agentType !== "discovery")
      throw new Error("Unexpected creative generation");
    expect(call.context.foundation.sourceBrief).toBe(sample.text);
    expect(call.context.question).toBe(
      "Why might people see Xfinity only as WiFi?",
    );
    expect(call.context.investigationType).toBe("problem");
    expect(call.context.foundation.currentRtb.approvalStatus).toBe("unknown");
  }
  await page
    .getByRole("heading", { name: "Collaborate with your round table" })
    .evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.screenshot({
    path: test.info().outputPath("rev-two-five-agents.png"),
  });
  await agent(page, "Culture Agent")
    .getByRole("button", { name: "Expand Culture Agent" })
    .click();
  await expect(page.locator(".v2-agent")).toHaveCount(1);
  await expect(agent(page, "Culture Agent")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("rev-two-focused-agent.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Show all five agents" }).click();
  await expect(page.locator(".v2-agent")).toHaveCount(5);
});

test("direct conversations, exact-version comparison and set-aside restoration survive the Working space drawer", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    calls.push(requestSchema.parse(route.request().postDataJSON()));
    await route.continue();
  });
  await supplyRealBrief(page);
  await focusBox(page).fill(
    "What do we still need to learn about ecosystem consideration?",
  );
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const consumer = agent(page, "Consumer Agent"),
    brand = agent(page, "Brand Agent");
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Insights Ready",
  );
  const finding = consumer.locator(".v2-finding").first();
  await finding
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  await finding.getByRole("checkbox", { name: "Compare" }).check();
  await brand
    .locator(".v2-finding")
    .first()
    .getByRole("checkbox", { name: "Compare" })
    .check();
  await consumer
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill(
      "Separate prospects from existing customers without inventing survey data.",
    );
  await consumer
    .getByRole("button", { name: "Ask this agent", exact: true })
    .click();
  await expect(
    consumer.getByRole("region", { name: "Consumer Agent agent conversation" }),
  ).toContainText("Separate prospects from existing customers");
  await expect(
    consumer
      .getByRole("region", { name: "Consumer Agent agent conversation" })
      .locator(".v2-message.agent"),
  ).toContainText("Research gap: no supporting source excerpt was supplied.");
  await expect(
    consumer.getByRole("region", { name: "Consumer Agent agent conversation" }),
  ).not.toContainText("findings returned in V");
  expect(
    calls.filter(
      (call) =>
        call.agentType === "discovery" && call.context.lens !== "consumer",
    ),
  ).toHaveLength(4);
  await consumer
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill("Unsent question preserved while reviewing notes.");
  const openSpace = page.getByRole("button", { name: /Open Working Space/ });
  await openSpace.click();
  const drawer = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Close Working Space" }),
  ).toBeFocused();
  await drawer
    .getByRole("button", { name: "Compare findings in Discovery", exact: true })
    .click();
  const comparisonPanel = page.locator(".v2-comparison-panel");
  await expect(
    comparisonPanel.getByRole("button", { name: /^Unselect / }),
  ).toHaveCount(2);
  await expect(
    drawer.getByRole("button", { name: "Approve human-authored strategy" }),
  ).toHaveCount(0);
  // Private notes live in the collapsed optional group.
  await drawer
    .getByText("Additional Strategy Details", {
      exact: true,
    })
    .click();
  await page.locator(".ws-private-notes > summary").click();
  await drawer
    .getByRole("textbox", { name: "Private notes", exact: true })
    .fill("Keep this as my own working interpretation.");
  const earlierContextConsent = comparisonPanel.getByRole("checkbox", {
    name: /Compare these exact earlier Input Pack or investigation versions/,
  });
  if (await earlierContextConsent.isVisible()) {
    await expect(
      comparisonPanel.getByRole("button", {
        name: "Compare selected findings",
        exact: true,
      }),
    ).toBeDisabled();
    await earlierContextConsent.check();
  }
  await comparisonPanel
    .getByRole("button", { name: "Compare selected findings", exact: true })
    .click();
  await expect(
    comparisonPanel.getByRole("textbox", { name: "Edit connection note" }),
  ).toHaveCount(1);
  const comparison = calls.at(-1)!;
  expect(comparison.agentType).toBe("connections");
  if (comparison.agentType !== "connections") throw new Error("Wrong request");
  expect(
    new Set(comparison.context.findings.map((item) => item.lensId)),
  ).toEqual(new Set(["consumer", "brand"]));
  expect(
    comparison.context.findings.every((item) => item.runVersion === 1),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("rev-two-working-space.png"),
  });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(openSpace).toBeFocused();
  await expect(
    consumer.getByRole("textbox", { name: "Your message to Consumer Agent" }),
  ).toHaveValue("Unsent question preserved while reviewing notes.");
  await openSpace.click();
  await drawer
    .getByRole("button", { name: /Remove .* from Working space/ })
    .first()
    .click();
  await drawer.getByText(/Previously saved findings/).click();
  await drawer
    .getByRole("button", { name: "Restore to Working Space" })
    .click();
  await drawer.getByRole("button", { name: "Close Working Space" }).click();
  await expect(consumer.locator(".v2-finding").first()).toBeVisible();
  await page.reload();
  await expect(
    consumer.getByRole("textbox", { name: "Your message to Consumer Agent" }),
  ).toHaveValue("Unsent question preserved while reviewing notes.");
  await page.setViewportSize({ width: 390, height: 844 });
  await openSpace.click();
  await drawer
    .getByText("Additional Strategy Details", {
      exact: true,
    })
    .click();
  await page.locator(".ws-private-notes > summary").click();
  await expect(
    drawer.getByRole("textbox", { name: "Private notes", exact: true }),
  ).toHaveValue("Keep this as my own working interpretation.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("rev-two-mobile-drawer.png"),
  });
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("rev-two-mobile-agents.png"),
    fullPage: true,
  });
});
