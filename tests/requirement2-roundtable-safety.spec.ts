import { expect, test } from "@playwright/test";
import path from "node:path";
import { requestSchema } from "../lib/ai/schemas";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

const twoCampaignPdf = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);

test("all five share a question snapshot; an older answer stays in history while human edits survive", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery is required.",
  );
  let releaseConsumer: (() => void) | undefined;
  const calls: { lens: string; question: string; source: string }[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "discovery") {
      calls.push({
        lens: request.context.lens,
        question: request.context.question,
        source: request.context.foundation.sourceBrief ?? "",
      });
      if (request.context.lens === "consumer" && calls.length <= 5)
        await new Promise<void>((resolve) => {
          releaseConsumer = resolve;
        });
    }
    await route.continue();
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await nav.getByRole("button", { name: "Insight Discovery" }).click();
  const focus = page.getByRole("textbox", {
    name: "What should we investigate?",
  });
  await focus.fill("Why might these households hesitate?");
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
  await expect.poll(() => Boolean(releaseConsumer)).toBe(true);
  await expect(consumer.locator(".v2-agent-status")).toContainText("Exploring");
  await expect(culture.locator(".v2-agent-status")).toContainText(
    /Insights Ready/,
  );
  await focus.fill("Which new barriers should we investigate?");
  await nav.getByRole("button", { name: "Finalize Strategy" }).click();
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("Kevin's independently edited strategy draft.");
  await nav.getByRole("button", { name: "Insight Discovery" }).click();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Working Space" }).getByRole("textbox", {
      name: "Brief line",
    }),
  ).toHaveValue("Kevin's independently edited strategy draft.");
  await page.getByRole("button", { name: "Close Working Space" }).click();
  releaseConsumer!();
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Refresh Required",
  );
  await expect(consumer.locator(".v2-finding")).toHaveCount(0);
  await expect(focus).toHaveValue("Which new barriers should we investigate?");
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await consumer.getByText(/Evidence & research log/).click();
  await expect(
    consumer
      .getByRole("combobox", { name: "Research history for Consumer Agent" })
      .locator("option"),
  ).toHaveCount(1);
  expect(calls).toHaveLength(5);
  expect(new Set(calls.map((call) => call.lens)).size).toBe(5);
  expect(calls.every((call) => call.question === calls[0].question)).toBe(true);
  expect(calls.every((call) => call.source === mobileIMCBrief)).toBe(true);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "V1 · Insights Ready",
  );
  await expect(
    consumer
      .getByRole("combobox", { name: "Research history for Consumer Agent" })
      .locator("option"),
  ).toHaveCount(2);
  await expect(focus).toHaveValue("Which new barriers should we investigate?");
  expect(calls).toHaveLength(10);
  expect(
    calls.slice(5).every((call) => call.question === calls[5].question),
  ).toBe(true);
});

test("a delayed answer from another PDF campaign cannot enter the newly selected campaign", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery is required.",
  );
  let releaseOldConsumer: (() => void) | undefined;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (
      request.agentType === "discovery" &&
      request.context.lens === "consumer" &&
      request.context.foundation.campaignContext.campaignName.includes(
        "Movers - Campaign Extensions",
      )
    )
      await new Promise<void>((resolve) => {
        releaseOldConsumer = resolve;
      });
    try {
      await route.continue();
    } catch {
      // Switching campaign aborts the old request; a cancelled route has no
      // result to deliver and must not cause a test-harness rejection.
    }
  });
  await page.goto("/");
  await page
    .getByLabel("Import file for IMC brief")
    .setInputFiles(twoCampaignPdf);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
  const scope = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  await scope.selectOption(
    (await scope
      .locator("option")
      .filter({ hasText: /Movers - Campaign Extensions Refresh Brief/ })
      .getAttribute("value"))!,
  );
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("button", { name: "Insight Discovery" }).click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Which mover barriers need evidence?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect.poll(() => Boolean(releaseOldConsumer)).toBe(true);
  await expect(
    page
      .getByRole("article", { name: "Culture Agent", exact: true })
      .locator(".v2-agent-status"),
  ).toContainText(/Insights Ready/);

  await nav.getByRole("button", { name: "Input Pack" }).click();
  await scope.selectOption(
    (await scope
      .locator("option")
      .filter({ hasText: /Xfinity Pro - Campaign Extensions/ })
      .getAttribute("value"))!,
  );
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await nav.getByRole("button", { name: "Insight Discovery" }).click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-agent-status")).toHaveText(
    "Awaiting Exploration",
  );
  releaseOldConsumer!();
  await page.waitForTimeout(400);
  await expect(consumer.locator(".v2-agent-status")).toHaveText(
    "Awaiting Exploration",
  );
  await page.reload();
  await expect(consumer.locator(".v2-agent-status")).toHaveText(
    "Awaiting Exploration",
  );
  await expect(
    page.getByRole("textbox", { name: "What should we investigate?" }),
  ).not.toHaveValue("Which mover barriers need evidence?");
});
