import { test, expect, type Page } from "@playwright/test";
import { currentPreparation } from "../lib/preparation";
import type { StrategySession } from "../lib/types";

const state = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );
const sparksCard = (page: Page) =>
  page.getByRole("article", { name: "Strategic Sparks Agent", exact: true });
async function prepare(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(sparksCard(page).locator(".card-top")).toContainText(
    "V1 · Current",
  );
  await sparksCard(page).getByRole("checkbox").first().check();
}

test("an individual Spark can be replaced or improved without changing other ideas and selections", async ({
  page,
}) => {
  await prepare(page);
  const card = sparksCard(page);
  const original = currentPreparation(
    (await state(page)).preparation,
    "sparks",
  )!;
  await card
    .getByRole("button", { name: "Keep this Spark", exact: true })
    .first()
    .click();
  await expect(
    card
      .locator(".spark-choice")
      .first()
      .getByRole("button", { name: "Replace", exact: true }),
  ).toBeDisabled();
  await card
    .locator(".spark-choice")
    .nth(1)
    .getByRole("button", { name: "Replace", exact: true })
    .click();
  await expect(card.locator(".card-top")).toContainText("V2 · Current");
  let after = (await state(page)).preparation;
  const replaced = currentPreparation(after, "sparks")!;
  expect(replaced.sparks[1].text).not.toBe(original.sparks[1].text);
  expect(replaced.sparks[1].territory).not.toBe(original.sparks[1].territory);
  expect(replaced.sparks[1].territory_type).toBe(
    original.sparks[1].territory_type,
  );
  expect(replaced.sparks.filter((_, i) => i !== 1)).toEqual(
    original.sparks.filter((_, i) => i !== 1),
  );
  expect(after.selectedSparkIds).toEqual([original.sparks[0].id]);
  await card
    .locator(".spark-choice")
    .nth(2)
    .getByRole("button", { name: "Improve", exact: true })
    .click();
  await expect(card.locator(".card-top")).toContainText("V3 · Current");
  const improved = currentPreparation(
    (await state(page)).preparation,
    "sparks",
  )!;
  expect(improved.guidance).toContain("Improved one Spark");
  expect(improved.sparks.filter((_, i) => i !== 2)).toEqual(
    replaced.sparks.filter((_, i) => i !== 2),
  );
  await card
    .getByRole("button", { name: "Regenerate this agent", exact: true })
    .click();
  await expect(card.locator(".card-top")).toContainText("V4 · Current");
  after = (await state(page)).preparation;
  expect(currentPreparation(after, "sparks")!.sparks[0]).toEqual(
    original.sparks[0],
  );
  expect(after.selectedSparkIds).toEqual([original.sparks[0].id]);
  await page.reload();
  await expect(
    card.getByRole("button", { name: "Kept · Release" }),
  ).toHaveCount(1);
  await page.route("**/api/ai/agent", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary failure" } }),
  );
  await card
    .locator(".spark-choice")
    .nth(1)
    .getByRole("button", { name: "Replace", exact: true })
    .click();
  await expect(card.getByRole("alert")).toContainText("Temporary failure");
  expect(currentPreparation((await state(page)).preparation, "sparks")).toEqual(
    currentPreparation(after, "sparks"),
  );
  await page.unroute("**/api/ai/agent");
  await page.reload();
  const retry = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/ai/agent") &&
      r.postDataJSON().agentType === "sparks",
  );
  await card
    .getByRole("button", { name: "Retry this agent", exact: true })
    .click();
  expect((await retry).postDataJSON().sparkRevision.targetId).toBe(
    currentPreparation(after, "sparks")!.sparks[1].id,
  );
  await expect(card.locator(".card-top")).toContainText("V5 · Current");
});

test("the perspective page waits for the complete batch before showing all five agents", async ({
  page,
}) => {
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    const { agentType } = route.request().postDataJSON();
    if (agentType === "brand") await gate;
    if (agentType === "market")
      return route.fulfill({
        status: 503,
        json: { error: "Market temporarily unavailable" },
      });
    await route.continue();
  });
  await page
    .getByRole("button", {
      name: "Generate Strategic Perspectives",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Generate Strategic Perspectives",
      exact: true,
    }),
  ).toContainText("Generating all five perspectives");
  await expect(
    page.getByRole("heading", { name: "Prepare the Inputs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Humorous / Witty", exact: true }),
  ).toHaveCount(0);
  expect((await state(page)).step).toBe(0);
  try {
    await expect(
      page.getByRole("heading", { name: "Prepare the Inputs", exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", {
      name: "Five perspectives. One shared ambition.",
      exact: true,
    }),
  ).toBeVisible();
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  const brand = page.getByRole("article", {
    name: "Proven-pattern / Brand",
    exact: true,
  });
  await expect(humor.locator(".current-output")).toContainText("V0 · Current");
  await expect(brand.locator(".current-output")).toContainText("V0 · Current");
  await expect(
    page
      .getByRole("article", { name: "Market / Landscape", exact: true })
      .getByRole("alert"),
  ).toContainText("Market temporarily unavailable");
  await expect(page.locator(".agent-card")).toHaveCount(5);
  expect((await state(page)).outputs).toHaveLength(5);
  expect((await state(page)).step).toBe(1);
});

test("refinement intent is sent and shortlisted directions can be compared", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("button", {
      name: "Generate Strategic Perspectives",
      exact: true,
    })
    .click();
  const humor = page.getByRole("article", {
    name: "Humorous / Witty",
    exact: true,
  });
  await expect(humor.locator(".current-output")).toContainText("V0 · Current");
  await humor
    .getByLabel("Next version for Humorous / Witty")
    .selectOption("improve");
  const request = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/ai/agent") &&
      r.postDataJSON().agentType === "humor",
  );
  await humor
    .getByRole("button", { name: "Generate another version", exact: true })
    .click();
  expect((await request).postDataJSON().refinementMode).toBe("improve");
  await expect(humor.locator(".current-output")).toContainText("V1 · Current");
  for (const name of ["Humorous / Witty", "Cultural / Social"])
    await page
      .getByRole("article", { name, exact: true })
      .locator(".current-output")
      .getByRole("button", { name: "Select this version" })
      .click();
  await page
    .getByRole("button", { name: "Compare selected", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Compare your shortlist" });
  await expect(dialog.locator("article")).toHaveCount(2);
  const chosen = await dialog.locator("blockquote").first().textContent();
  await dialog
    .getByRole("button", { name: "Use this direction" })
    .first()
    .click();
  expect((await state(page)).finalLine).toBe(chosen);
  expect((await state(page)).approved).toBeNull();
});

test("named snapshots survive closing the tab and opening them preserves the current draft", async ({
  page,
  context,
}) => {
  await prepare(page);
  const saved = await state(page);
  await page
    .getByRole("button", { name: "Saved projects", exact: true })
    .click();
  await page.getByLabel("Snapshot name").fill("Fall campaign review");
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Snapshot saved",
  );
  await page.close();
  const next = await context.newPage();
  await next.goto("/");
  await next
    .getByRole("button", { name: "Saved projects", exact: true })
    .click();
  await expect(next.getByRole("dialog")).toContainText("Fall campaign review");
  await next
    .getByRole("button", { name: "Open snapshot", exact: true })
    .click();
  expect((await state(next)).preparation).toEqual(saved.preparation);
  await next
    .getByRole("button", { name: "Saved projects", exact: true })
    .click();
  await next
    .getByRole("button", { name: "Open snapshot", exact: true })
    .click();
  await next
    .getByRole("button", { name: "Saved projects", exact: true })
    .click();
  await expect(next.locator(".saved-project-list article")).toHaveCount(2);
});
