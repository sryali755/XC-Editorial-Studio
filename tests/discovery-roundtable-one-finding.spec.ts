import { expect, test, type Page } from "@playwright/test";
import sample from "../lib/samples/kevin-imc.json";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { DiscoveryFinding, DiscoveryState } from "../lib/types";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Round Table refinement requires Discovery mode.",
  ),
);

const names = [
  "Consumer Agent",
  "Culture Agent",
  "Category Agent",
  "Brand Agent",
  "Analogous Solutions Agent",
];
const THIRD_TITLE = "Third stored Consumer finding";
const summaries: Record<string, [string, string]> = {
  "Consumer Agent": [
    "Explores people's needs, motivations, barriers, and differences between audiences.",
    "Consumer behavior, unmet needs, and evidence gaps.",
  ],
  "Culture Agent": [
    "Explores cultural patterns, social behaviors, and wider trends that may influence people.",
    "Social context, emerging tensions, and cultural relevance.",
  ],
  "Category Agent": [
    "Examines competitors, alternatives, category conventions, and opportunities to differentiate.",
    "Market dynamics, competitive choices, and category gaps.",
  ],
  "Brand Agent": [
    "Evaluates brand positioning, product claims, and what the available evidence can substantiate.",
    "Brand credibility, supporting proof, and claim limitations.",
  ],
  "Analogous Solutions Agent": [
    "Explores how similar problems have been approached in other industries and contexts.",
    "Comparable approaches, transferable ideas, and evidence gaps.",
  ],
};
const agent = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
const ref = (finding: DiscoveryFinding) =>
  `${finding.id}@${finding.runVersion}`;
const citation = (finding: DiscoveryFinding) =>
  `Source citation · ${
    finding.evidence.length
      ? [...new Set(finding.evidence.map((item) => item.source))].join(", ")
      : "Research gap · source needed"
  }`;

async function storedState(page: Page): Promise<DiscoveryState> {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(
      (item) =>
        item.startsWith("xc-insight-discovery-v2:") &&
        JSON.parse(sessionStorage.getItem(item)!).$value.runs.some(
          (run: { versions: unknown[] }) => run.versions.length,
        ),
    )!;
    return JSON.parse(sessionStorage.getItem(key)!).$value;
  });
}
async function consumerFindings(page: Page) {
  const run = (await storedState(page)).runs.find(
    (item) => item.lensId === "consumer",
  )!;
  return run.versions.find((version) => version.id === run.currentVersionId)!
    .findings;
}

// Records every agent POST and gives the Consumer Agent's first run a third
// stored finding, so paging covers the "1 of 3" case. Everything stays mock.
async function recordCalls(page: Page) {
  const calls: AgentRequest[] = [];
  let extended = false;
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const request = requestSchema.parse(route.request().postDataJSON());
    calls.push(request);
    if (
      extended ||
      request.agentType !== "discovery" ||
      request.context.lens !== "consumer" ||
      request.context.selectedFinding
    )
      return route.continue();
    extended = true;
    const response = await route.fetch();
    const body = await response.json();
    body.data.findings.push({
      title: THIRD_TITLE,
      whatWeFound:
        "No supplied record documents how long households wait between signing a lease and activating home internet.",
      evidence: [],
      whyItMayMatter:
        "Activation timing could shape when reassurance is most useful.",
      whatComplicatesIt:
        "Timing data is not in the Input Pack; this remains a research gap.",
      questionToExplore:
        "Which source records activation timing for households that relocate?",
      evidenceState: "research_gap",
    });
    await route.fulfill({ response, json: body });
  });
  return calls;
}

// Preparation agents finish before Discovery starts, so the Input Pack
// version does not change underneath the round table during a test.
async function inputPackReady(page: Page) {
  await expect(
    page.getByRole("article", { name: "RTB / JTBD" }).getByRole("checkbox"),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(
    page
      .getByRole("article", { name: "Data Analysis & Synthesis" })
      .locator(".studio-data-choice")
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6, { timeout: 60_000 });
}

async function startRoundtable(page: Page) {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1600, height: 900 });
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
  await inputPackReady(page);
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Why would movers hesitate to keep their current provider?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  for (const name of names) {
    await expect(agent(page, name).locator(".v2-finding")).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(agent(page, name).locator(".v2-agent-status")).not.toHaveText(
      /Exploring/,
    );
  }
}

test("five agents explain their thinking and page one stored finding at a time without AI calls", async ({
  page,
}) => {
  const calls = await recordCalls(page);
  await startRoundtable(page);
  await page.locator(".v2-agent-grid").screenshot({
    path: test.info().outputPath("after-1600-five-agents.png"),
  });

  // T1-T4: five partners, always-visible thinking, no repeated headings.
  await expect(page.locator(".v2-agent")).toHaveCount(5);
  await expect(page.getByText(/Agent Insights$/)).toHaveCount(0);
  await expect(page.locator(".v2-method-summary")).toHaveCount(0);
  for (const name of names) {
    const card = agent(page, name);
    const thinking = card.getByRole("region", {
      name: "How this agent thinks",
    });
    await expect(thinking).toBeVisible();
    const [summary, focus] = summaries[name];
    await expect(thinking.locator("p")).toHaveText([
      summary,
      `Focus: ${focus}`,
    ]);
    await expect(thinking.locator("p").first()).toBeVisible();
    // The summary appears once; intro, Goal, Output and method steps are gone.
    await expect(card.getByText(summary, { exact: true })).toHaveCount(1);
    await expect(card.locator("header > p")).toHaveCount(0);
    await expect(card).not.toContainText("Goal:");
    await expect(card).not.toContainText("Output:");
    await expect(card.locator("header ol, header li")).toHaveCount(0);
    await expect(
      card.locator("details.v2-rubric, .v2-rubric summary"),
    ).toHaveCount(0);
    // Name and status share the compact header row.
    const top = card.locator(".v2-agent-top");
    await expect(top.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(top.locator(".v2-agent-status")).toHaveText(
      /^V0 · (Insights Ready)$/,
    );
    await expect(card.locator(".v2-finding")).toHaveCount(1);
    await expect(card.getByRole("heading", { name, exact: true })).toHaveCount(
      1,
    );
  }

  const consumer = agent(page, "Consumer Agent"),
    category = agent(page, "Category Agent");
  const card = consumer.locator(".v2-finding");
  const position = consumer.locator(".v2-finding-position");
  const previous = consumer.getByRole("button", { name: "Previous finding" });
  const next = consumer.getByRole("button", { name: "Next finding" });
  const stored = await consumerFindings(page);
  expect(stored).toHaveLength(3);
  expect(stored[2].title).toBe(THIRD_TITLE);
  const categoryTitle = await category.locator(".v2-finding h4").textContent();
  const callsBefore = calls.length;
  expect(calls.filter((call) => call.agentType === "discovery")).toHaveLength(
    5,
  );

  // T5/T6/T17: Next and Previous replace the single card in place, and the
  // citation shown always belongs to the finding being shown.
  await expect(position).toHaveText("Finding 1 of 3 · V0");
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(card.locator("h4")).toHaveText(stored[0].title);
  await expect(card.locator(".v2-evidence-source")).toHaveText(
    citation(stored[0]),
  );
  await next.click();
  await expect(position).toHaveText("Finding 2 of 3 · V0");
  await expect(card).toHaveCount(1);
  await expect(card.locator("h4")).toHaveText(stored[1].title);
  await expect(card.locator(".v2-evidence-source")).toHaveText(
    citation(stored[1]),
  );
  await next.click();
  await expect(position).toHaveText("Finding 3 of 3 · V0");
  await expect(card.locator("h4")).toHaveText(THIRD_TITLE);
  await expect(next).toBeDisabled();
  await expect(next).toBeFocused(); // aria-disabled keeps keyboard focus.
  await next.click({ force: true }); // Past the end is a no-op.
  await expect(position).toHaveText("Finding 3 of 3 · V0");
  await previous.click();
  await expect(position).toHaveText("Finding 2 of 3 · V0");
  await expect(card.locator("h4")).toHaveText(stored[1].title);
  await consumer.screenshot({
    path: test.info().outputPath("after-1600-consumer-finding-2-of-3.png"),
  });

  // Each agent keeps its own position.
  await expect(category.locator(".v2-finding-position")).toHaveText(
    /^Finding 1 of \d+ · V0$/,
  );
  await expect(category.locator(".v2-finding h4")).toHaveText(categoryTitle!);

  // T9/T10: Save and Compare stay attached to the exact finding ref.
  await card
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  await card.getByRole("checkbox", { name: "Compare" }).check();
  await previous.click();
  await expect(card.locator("h4")).toHaveText(stored[0].title);
  await expect(
    card.getByRole("button", { name: "Save to Working Space", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("checkbox", { name: "Compare" }),
  ).not.toBeChecked();
  await next.click();
  await expect(
    card.getByRole("button", { name: "Saved to Working Space", exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("checkbox", { name: "Compare" })).toBeChecked();
  // Compare is independent of Save.
  await card.getByRole("checkbox", { name: "Compare" }).uncheck();
  await expect(
    card.getByRole("button", { name: "Saved to Working Space", exact: true }),
  ).toBeVisible();
  await card.getByRole("checkbox", { name: "Compare" }).check();
  let state = await storedState(page);
  expect(state.savedFindingIds).toEqual([ref(stored[1])]);
  expect(state.selectedFindingIds).toEqual([ref(stored[1])]);

  // T7/T8: paging spends nothing and changes no stored results.
  expect(calls).toHaveLength(callsBefore);
  expect(await consumerFindings(page)).toEqual(stored);

  // T15: the saved finding (and only it) appears in the right-side drawer.
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  const drawer = page.getByRole("dialog", { name: "Working Space" });
  await expect(drawer.locator(".saved-findings")).toContainText(
    stored[1].title,
  );
  await expect(drawer.locator(".saved-findings")).not.toContainText(
    stored[0].title,
  );
  const [content, pane] = await Promise.all([
    page.locator(".v2-research-content").boundingBox(),
    drawer.boundingBox(),
  ]);
  expect(pane!.x).toBeGreaterThan(content!.x + content!.width - 1);
  await expect(page.locator(".v2-research-content")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("after-1600-working-space-open.png"),
  });
  await drawer.getByRole("button", { name: "Close Working Space" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(position).toHaveText("Finding 2 of 3 · V0");

  // T18: a changed investigation marks the answer stale without resetting or
  // regenerating, and the reading position is kept.
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("A different question that has not been run.");
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Refresh Required",
  );
  await expect(position).toHaveText("Finding 2 of 3 · V0");
  await next.click();
  await expect(card.locator("h4")).toHaveText(THIRD_TITLE);
  expect(calls).toHaveLength(callsBefore);
  state = await storedState(page);
  expect(state.savedFindingIds).toEqual([ref(stored[1])]);
});

test("Discuss follows the shown finding and agent conversations stay separate while paging", async ({
  page,
}) => {
  const calls = await recordCalls(page);
  await startRoundtable(page);
  const consumer = agent(page, "Consumer Agent");
  const card = consumer.locator(".v2-finding");
  const stored = await consumerFindings(page);
  await consumer.getByRole("button", { name: "Next finding" }).click();
  await card.getByRole("button", { name: /^Discuss .* V0$/ }).click();
  const composer = consumer.getByRole("textbox", {
    name: `Your message about ${stored[1].title}`,
  });
  await expect(composer).toBeFocused();
  await composer.fill("Which supplied record supports this finding?");
  await consumer.getByRole("button", { name: "Ask this agent" }).click();
  const thread = consumer.getByRole("region", {
    name: "Consumer Agent finding conversation V0",
  });
  await expect(thread.locator(".v2-message.agent")).toHaveCount(1);
  // The reply creates V1 with finding 2 revised in place; the card stays on it.
  await expect(consumer.locator(".v2-finding-position")).toHaveText(
    "Finding 2 of 3 · V1",
  );
  const scoped = calls.filter(
    (call): call is Extract<AgentRequest, { agentType: "discovery" }> =>
      call.agentType === "discovery" && Boolean(call.context.selectedFinding),
  );
  expect(scoped).toHaveLength(1);
  expect(scoped[0].context.lens).toBe("consumer");
  expect(scoped[0].context.selectedFinding?.title).toBe(stored[1].title);
  const afterAsk = calls.length;

  // Paging away keeps the discussion and its messages attached to finding 2.
  await consumer.getByRole("button", { name: "Previous finding" }).click();
  await expect(card.locator("h4")).toHaveText(stored[0].title);
  await expect(consumer.locator(".v2-conversation-scope")).toContainText(
    stored[1].title,
  );
  await expect(thread).toContainText(
    "Which supplied record supports this finding?",
  );
  await expect(
    agent(page, "Category Agent").getByRole("region", {
      name: /conversation/,
    }),
  ).toHaveCount(0);
  await expect(
    agent(page, "Category Agent").getByRole("heading", {
      name: "Talk to Category Agent",
    }),
  ).toBeVisible();
  expect(calls).toHaveLength(afterAsk);
});

const widths = [
  { label: "desktop-1600", width: 1600, height: 900 },
  { label: "laptop-1280", width: 1280, height: 800 },
  { label: "tablet-820", width: 820, height: 1180 },
  { label: "mobile-390", width: 390, height: 844 },
] as const;

async function actionLayout(page: Page, name: string) {
  return agent(page, name)
    .locator(".v2-research-actions .v2-quick-actions .button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const lineTops = new Set(
          [...range.getClientRects()]
            .filter((rect) => rect.width > 0)
            .map((rect) => Math.round(rect.top)),
        );
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          label: button.textContent!.trim(),
          words: button.textContent!.trim().split(/\s+/).length,
          lines: lineTops.size,
          width: box.width,
          height: box.height,
          left: Math.round(box.left),
          overflows: button.scrollWidth > button.clientWidth + 1,
          wordBreak: style.wordBreak,
          overflowWrap: style.overflowWrap,
        };
      }),
    );
}

test("More research actions open into readable horizontal buttons at every width and keep their behavior", async ({
  page,
}) => {
  const calls = await recordCalls(page);
  await startRoundtable(page);
  const callsBefore = calls.length;
  const scenarios = [
    ...widths.map((item) => ({ ...item, workingSpace: false })),
    {
      label: "desktop-1600-working-space",
      width: 1600,
      height: 900,
      workingSpace: true,
    },
  ];
  for (const scenario of scenarios) {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    if (scenario.workingSpace)
      await page.getByRole("button", { name: /Open Working Space/ }).click();
    for (const name of names) {
      const actions = agent(page, name).locator(".v2-research-actions");
      if (
        !(await actions.evaluate(
          (element) => (element as HTMLDetailsElement).open,
        ))
      )
        await actions.locator("summary").click();
      const layout = await actionLayout(page, name);
      expect(layout.map((item) => item.label)).toEqual([
        "Explore deeper",
        "Find contrary evidence",
        "Separate by audience",
        "Check recency",
        "Compare with Input Pack",
      ]);
      for (const button of layout) {
        const detail = `${scenario.label} ${name} ${JSON.stringify(button)}`;
        // Wrapping is only allowed between words, never letter by letter.
        expect(button.lines, detail).toBeLessThanOrEqual(button.words);
        expect(button.lines, detail).toBeLessThanOrEqual(2);
        expect(button.width, detail).toBeGreaterThanOrEqual(100);
        expect(button.height, detail).toBeGreaterThanOrEqual(36);
        expect(button.overflows, detail).toBe(false);
        expect(button.wordBreak, detail).not.toBe("break-all");
        expect(button.overflowWrap, detail).toBe("normal");
      }
      // Never five squeezed columns: one or two per row.
      expect(new Set(layout.map((item) => item.left)).size).toBeLessThanOrEqual(
        2,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      scenario.label,
    ).toBe(true);
    const consumer = agent(page, "Consumer Agent");
    await consumer.locator(".v2-research-actions").scrollIntoViewIfNeeded();
    await consumer.screenshot({
      path: test.info().outputPath(`after-actions-${scenario.label}.png`),
    });
    if (scenario.workingSpace)
      await page.getByRole("button", { name: "Close Working Space" }).click();
  }
  // The compact drawer covers the cards on mobile; the page must not widen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Working Space" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "mobile-390-working-space",
  ).toBe(true);
  await page.getByRole("button", { name: "Close Working Space" }).click();
  // Opening the panels spent nothing; an action keeps its agent scope.
  expect(calls).toHaveLength(callsBefore);
  await page.setViewportSize({ width: 1600, height: 900 });
  await agent(page, "Consumer Agent")
    .getByRole("button", { name: "Check recency" })
    .click();
  await expect.poll(() => calls.length).toBe(callsBefore + 1);
  const action = calls.at(-1)!;
  if (action.agentType !== "discovery") throw new Error("Wrong request");
  expect(action.context.lens).toBe("consumer");
  expect(action.context.action).toBe("check_recency");
  expect(action.guidance).toContain("Check supplied dates");
  await expect(
    agent(page, "Consumer Agent").getByRole("region", {
      name: "Consumer Agent agent conversation",
    }),
  ).toContainText("Check supplied dates");
});

test("a failed agent retries alone while a research gap stays a completed result", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const calls: AgentRequest[] = [];
  let failBrand = true;
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const request = requestSchema.parse(route.request().postDataJSON());
    calls.push(request);
    if (request.agentType !== "discovery") return route.continue();
    if (request.context.lens === "brand" && failBrand) {
      failBrand = false;
      return route.fulfill({
        status: 422,
        json: {
          error:
            "Finding 3 contains an unsupported customer or source quotation in the finding text. Use an exact source quotation or move a clearly qualified hypothesis to the question.",
          code: "invalid_output",
          retryable: true,
        },
      });
    }
    if (request.context.lens === "analogous") {
      const response = await route.fetch();
      const body = await response.json();
      body.data.findings = body.data.findings.map(
        (finding: Record<string, unknown>) => ({
          ...finding,
          evidence: [],
          evidenceState: "research_gap",
        }),
      );
      return route.fulfill({ response, json: body });
    }
    return route.continue();
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page.getByText("Use a supplied sample brief").click();
  await page
    .getByRole("button", { name: "Load Kevin’s supplied IMC brief" })
    .click();
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await inputPackReady(page);
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Why would movers hesitate to keep their current provider?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const brand = agent(page, "Brand Agent"),
    analogous = agent(page, "Analogous Solutions Agent");
  await expect(brand.locator(".v2-agent-status")).toHaveText(
    "Needs Attention",
    { timeout: 60_000 },
  );
  await expect(brand.getByRole("alert")).toContainText(
    "Finding 3 contains an unsupported customer or source quotation",
  );
  await expect(analogous.locator(".v2-agent-status")).toHaveText(
    "V0 · Insights Ready",
    { timeout: 60_000 },
  );
  await expect(brand).not.toContainText("Write your focus above");
  await expect(analogous.getByRole("alert")).toHaveCount(0);
  await expect(analogous.getByRole("button", { name: /^Retry/ })).toHaveCount(
    0,
  );
  await expect(analogous.locator(".v2-result-type")).toContainText(
    "Research gap · Agent interpretation · unverified",
  );
  await expect(analogous.locator(".v2-evidence-source")).toHaveText(
    "Source citation · Research gap · source needed",
  );
  await page.locator(".v2-agent-grid").screenshot({
    path: test.info().outputPath("after-failed-vs-research-gap.png"),
  });
  await expect
    .poll(() => calls.filter((call) => call.agentType === "discovery").length)
    .toBe(5);
  const callsBefore = calls.length;
  await brand.getByRole("button", { name: "Retry Brand Agent" }).click();
  await expect(brand.locator(".v2-finding")).toHaveCount(1, {
    timeout: 60_000,
  });
  await expect(brand.getByRole("alert")).toHaveCount(0);
  expect(calls).toHaveLength(callsBefore + 1);
  const retry = calls.at(-1)!;
  if (retry.agentType !== "discovery") throw new Error("Wrong request");
  expect(retry.context.lens).toBe("brand");
});
