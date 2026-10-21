import { expect, test, type Page } from "@playwright/test";
import {
  mobileIMCBrief,
  mobileReasonToBelieve,
} from "./fixtures/mobile-imc-brief";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery acceptance runs with Discovery enabled.",
  ),
);
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
async function supplyBrief(page: Page) {
  await page.goto("/");
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Build your Input Pack" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(page.getByRole("article", { name: "RTB / JTBD" })).toContainText(
    mobileReasonToBelieve,
  );
  await expect(
    page.getByText(/Review structured extraction and exact source records/),
  ).toHaveCount(0);
  await expect(page.getByText(/Input pack history/)).toHaveCount(0);
}

test("the four-tab flow lets a human approve and package before any research", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/agent")) calls.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build your Input Pack", exact: true }),
  ).toBeVisible();
  await expect(nav(page).getByRole("button")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toHaveCount(0);
  await nav(page).getByRole("button", { name: "Finalize Strategy" }).click();
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(
      "Help eligible households evaluate mobile as a manageable household decision.",
    );
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  await supplyBrief(page);
  // Build Input Pack starts three preparation agents. Let them finish so the
  // count below isolates any call made by approving or packaging.
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6, { timeout: 60_000 });
  const preparationCallCount = calls.length;
  await nav(page).getByRole("button", { name: "Finalize Strategy" }).click();
  await page
    .getByText("Additional Strategy Details", {
      exact: true,
    })
    .click();
  await page.locator(".ws-private-notes > summary").click();
  await page
    .getByRole("textbox", { name: "Private notes", exact: true })
    .fill("PRIVATE NOTE MUST NOT BE EXPORTED");
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(
      "Help eligible households evaluate mobile as a manageable household decision.",
    );
  await page
    .getByText(
      "From the IMC brief · objective, deliverables, mandatories, timelines",
      { exact: true },
    )
    .click();
  await page
    .getByRole("textbox", { name: "Deliverables", exact: true })
    .fill("One web landing page.");
  await page.getByRole("button", { name: "Confirm current strategy" }).click();
  await page.getByRole("button", { name: "Generate XC Brief" }).click();
  await expect(page.locator(".brief-paper")).toContainText(
    "Help eligible households evaluate mobile as a manageable household decision.",
  );
  await expect(page.locator(".brief-paper")).toContainText(
    "One web landing page.",
  );
  await expect(page.locator(".brief-paper")).not.toContainText(
    "PRIVATE NOTE MUST NOT BE EXPORTED",
  );
  expect(calls).toHaveLength(preparationCallCount);
  await nav(page).getByRole("button", { name: "Finalize Strategy" }).click();
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("A different unapproved draft.");
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  await nav(page).getByRole("button", { name: "XC Brief" }).click();
  await expect(page.locator(".brief-paper")).not.toContainText(
    "A different unapproved draft.",
  );
  await expect(
    page
      .getByRole("combobox", { name: "XC Brief version history" })
      .locator("option"),
  ).toHaveCount(1);
});

test("five lenses share an unprepared pack, preserve scoped failure history and flag changed evidence", async ({
  page,
}) => {
  const calls: Extract<AgentRequest, { agentType: "discovery" }>[] = [];
  let failContrary = true;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "discovery") {
      calls.push(request);
      if (request.context.action === "explore_deeper" && failContrary) {
        failContrary = false;
        return route.fulfill({
          status: 503,
          json: {
            error: "Temporary provider failure for this finding.",
            code: "provider_error",
            retryable: true,
          },
        });
      }
    }
    await route.continue();
  });
  await supplyBrief(page);
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("What explains uncertainty when households compare mobile plans?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Insights Ready",
  );
  await expect(page.getByText("Investigate a hypothesis")).toHaveCount(0);
  await expect(
    consumer.getByRole("button", { name: "Set aside for later" }),
  ).toHaveCount(0);
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  expect(calls).toHaveLength(5);
  expect(new Set(calls.map((request) => request.context.lens)).size).toBe(5);
  for (const request of calls) {
    expect(request.context.foundation.sourceBrief).toBe(mobileIMCBrief);
    expect(request.context.foundation.currentRtb.original).toBe(
      mobileReasonToBelieve,
    );
    expect(request.context.foundation.selectedSparks).toEqual([]);
  }
  const originalCard = consumer.locator(".v2-finding").first();
  await originalCard
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  await consumer
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill("Find contrary evidence for this finding.");
  await consumer
    .getByRole("button", { name: "Ask this agent", exact: true })
    .click();
  await expect(page.locator(".discovery-v2 [role=alert]")).toContainText(
    "Temporary provider failure",
  );
  const failed = calls.at(-1)!;
  await page
    .getByRole("button", { name: "Retry Consumer Agent", exact: true })
    .click();
  await expect(page.locator(".discovery-v2 [role=alert]")).toHaveCount(0);
  expect(calls.at(-1)!.context.action).toBe(failed.context.action);
  expect(calls.at(-1)!.context.selectedFinding).toEqual(
    failed.context.selectedFinding,
  );
  expect(
    calls.filter((request) => request.context.lens !== "consumer"),
  ).toHaveLength(4);
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page.getByText(/Add supporting evidence/).click();
  await page
    .getByRole("textbox", { name: "Source name", exact: true })
    .fill("Interviews supplied by campaign owner");
  await page
    .getByRole("textbox", { name: "Original evidence text" })
    .fill(
      "Participants described uncertainty before comparing mobile plans. This is supplied qualitative material, not a representative survey.",
    );
  await page
    .getByRole("button", { name: "Add supplied evidence", exact: true })
    .click();
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(page.locator(".saved-findings")).toContainText("Needs refresh");
  await page.getByRole("button", { name: "Close Working Space" }).click();
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await consumer
    .getByRole("button", { name: "Get another answer", exact: true })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  expect(calls.at(-1)!.context.foundation.suppliedEvidence?.[0].source).toBe(
    "Interviews supplied by campaign owner",
  );
  await consumer.getByText(/Evidence & research log/).click();
  await expect(
    consumer
      .getByRole("combobox", { name: "Research history for Consumer Agent" })
      .locator("option"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Show all five agents" }).click();
  for (const name of [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ])
    await expect(
      page.getByRole("article", { name, exact: true }),
    ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("discovery-mobile.png"),
    fullPage: true,
  });
});

test("preparation Sparks use sourced-case research; all agents run and drafts persist across navigation and reload", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    calls.push(requestSchema.parse(route.request().postDataJSON()));
    await route.continue();
  });
  await supplyBrief(page);
  await page
    .getByRole("article", { name: "Evidence-led Sparks" })
    .getByRole("button", { name: "Regenerate → save V1", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6);
  expect(calls.some((call) => call.agentType === "sparks")).toBe(true);
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your message to Consumer Agent" })
    .fill("Focus on eligible existing customers.");
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Which barriers distinguish existing eligible customers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  expect(calls.filter((call) => call.agentType === "discovery")).toHaveLength(
    5,
  );
  await nav(page)
    .getByRole("button", { name: "Finalize Strategy", exact: true })
    .click();
  // The working hypothesis now belongs in Strategic direction.
  await page
    .getByRole("textbox", { name: "Strategic direction", exact: true })
    .fill("Comparison uncertainty may be a barrier; still unvalidated.");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Strategic direction", exact: true }),
  ).toHaveValue("Comparison uncertainty may be a barrier; still unvalidated.");
  await nav(page).getByRole("button", { name: "Insight Discovery" }).click();
  await expect(
    page.getByRole("textbox", { name: "Your message to Consumer Agent" }),
  ).toHaveValue("Focus on eligible existing customers.");
  await page.screenshot({
    path: test.info().outputPath("discovery-desktop.png"),
    fullPage: true,
  });
});
