import { expect, test } from "@playwright/test";
import { requestSchema, type AgentDataMap } from "../lib/ai/schemas";
import { mockDiscovery } from "../lib/ai/mock-discovery";

test("cross-agent duplicate is rejected even after parallel dispatch; independent retry preserves history", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Discovery required.",
  );
  let consumerAnswer: AgentDataMap["discovery"] | undefined;
  let releaseCulture: (() => void) | undefined;
  let culturePeerCount = -1;
  let copies = 0;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType !== "discovery") return route.continue();
    const data = mockDiscovery(request);
    if (request.context.lens === "consumer") consumerAnswer = data;
    if (request.context.lens === "culture" && ++copies === 1) {
      culturePeerCount = request.context.peerFindings?.length ?? 0;
      await new Promise<void>((resolve) => {
        releaseCulture = resolve;
      });
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: consumerAnswer,
        },
      });
    }
    return route.fulfill({
      json: { provider: "mock", generatedAt: new Date().toISOString(), data },
    });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
  await page.getByText("Use a supplied sample brief").click();
  await page
    .getByRole("button", { name: "Load Kevin’s supplied IMC brief" })
    .click();
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  // Freeze the Input Pack before testing an independent lens retry. A late
  // preparation V0 changes the pack fingerprint and correctly marks an older
  // answer as needing refresh, which is a different behavior under test.
  await expect(page.locator(".studio-agent-status")).toHaveText([
    "Demo · V0",
    "Demo · V0",
    "Demo · V0",
  ]);
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "What should we investigate?",
    })
    .fill("Which reassurance is supported for different audiences?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Culture Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Insights Ready",
  );
  await consumer
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .first()
    .click();
  await consumer.getByRole("checkbox", { name: "Compare" }).first().check();
  await expect.poll(() => !!releaseCulture).toBe(true);
  expect(culturePeerCount).toBe(0);
  releaseCulture!();
  await expect(culture.getByRole("alert")).toContainText("overlaps");
  await expect(culture.locator(".v2-finding")).toHaveCount(0);
  await culture
    .getByRole("button", { name: "Retry Culture Agent", exact: true })
    .click();
  await expect(culture.locator(".v2-agent-status")).toContainText(
    /Insights Ready/,
  );
  await expect(
    consumer.getByRole("checkbox", { name: "Compare" }).first(),
  ).toBeChecked();
  await culture.getByRole("button", { name: "Expand Culture Agent" }).click();
  await culture.getByText(/Evidence & research log/).click();
  await expect(
    culture
      .getByRole("combobox", { name: "Research history for Culture Agent" })
      .locator("option"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Show all five agents" }).click();
  await page.reload();
  await expect(
    consumer.getByRole("checkbox", { name: "Compare" }).first(),
  ).toBeChecked();
});
