import { test, expect, type Page } from "@playwright/test";
import { currentPreparation } from "../lib/preparation";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";

const state = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );
const card = (page: Page) =>
  page.getByRole("article", { name: "Strategic Sparks Agent", exact: true });
async function prepare(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(card(page).locator(".card-top")).toContainText("V1 · Current");
}

test("Sparks grounding is independently expandable and reaches every perspective only when selected", async ({
  page,
}) => {
  const requests: AgentRequest[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/agent") && request.method() === "POST")
      requests.push(requestSchema.parse(request.postDataJSON()));
  });
  await prepare(page);
  const sparks = card(page);
  await expect(sparks.locator(".spark-title")).toHaveCount(6);
  const first = sparks.locator(".spark-choice").first();
  await first.locator("summary").click();
  await expect(first.locator(".spark-rationale p")).toHaveCount(3);
  await expect(first.locator(".spark-rationale")).toContainText(
    "Campaign grounding",
  );
  await expect(first.locator(".spark-rationale")).toContainText(
    "Hypothesis to validate",
  );
  await expect(first.getByRole("checkbox")).not.toBeChecked();
  await first.getByRole("checkbox").check();
  const pack = page.getByRole("region", {
    name: "Dynamic XC Input Pack",
    exact: true,
  });
  await expect(pack.getByRole("checkbox").first()).toBeChecked();
  const selected = currentPreparation(
    (await state(page)).preparation,
    "sparks",
  )!.sparks[0];
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await expect(page.locator(".agent-card")).toHaveCount(5);
  const perspectives = requests.filter((r) => "campaignContext" in r.context);
  expect(perspectives).toHaveLength(5);
  for (const request of perspectives) {
    if (!("selectedSparks" in request.context))
      throw new Error("Expected foundation");
    expect(request.context.selectedSparks).toHaveLength(1);
    expect(request.context.selectedSparks[0]).toMatchObject(selected);
    expect(request.context.selectedSparks[0].rationale).toBeTruthy();
  }
  expect((await state(page)).approved).toBeNull();
});

test("failed Sparks regeneration preserves selection; retry, restore and manual edit retain honest history", async ({
  page,
}) => {
  await prepare(page);
  const sparks = card(page);
  await sparks.getByRole("checkbox").first().check();
  const before = (await state(page)).preparation;
  const original = currentPreparation(before, "sparks")!;
  await page.route("**/api/ai/agent", (route) =>
    route.request().postDataJSON().agentType === "sparks"
      ? route.fulfill({
          status: 503,
          json: {
            error:
              "Sparks temporarily unavailable. Previous version preserved.",
          },
        })
      : route.continue(),
  );
  await sparks.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(sparks.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  expect(currentPreparation((await state(page)).preparation, "sparks")).toEqual(
    original,
  );
  await expect(sparks.getByRole("checkbox").first()).toBeChecked();
  await page.unroute("**/api/ai/agent");
  await sparks.getByRole("button", { name: "Retry this agent" }).click();
  await expect(sparks.locator(".card-top")).toContainText("V2 · Current");
  const after = (await state(page)).preparation;
  expect(after.selectedSparkIds).toEqual([]);
  expect(currentPreparation(after, "sparks")!.text).not.toBe(original.text);
  for (const id of ["reasonToBelieve", "research"] as const)
    expect(currentPreparation(after, id)).toEqual(
      currentPreparation(before, id),
    );
  await sparks.locator(".prep-history > summary").click();
  await sparks.getByRole("button", { name: "Make V1 current" }).click();
  await expect(sparks.locator(".spark-title").first()).toHaveText(
    original.sparks[0].title!,
  );
  await sparks
    .getByRole("button", { name: "Edit output", exact: true })
    .click();
  await sparks
    .getByLabel("Edit Strategic Sparks Agent output", { exact: false })
    .fill("Explore a new human-written direction.");
  await sparks.getByRole("button", { name: "Save as new version" }).click();
  await expect(sparks.locator(".card-top")).toContainText("V3 · Current");
  const manual = currentPreparation((await state(page)).preparation, "sparks")!;
  expect(manual.provider).toBe("manual");
  expect(manual.promptTemplateVersion).toBeUndefined();
  expect(manual.sparks[0].rationale).toBeUndefined();
  await expect(sparks.locator(".spark-choice .spark-rationale")).toHaveCount(0);
  expect(
    (await state(page)).preparation.outputs.find((o) => o.agentId === "sparks")!
      .versions,
  ).toHaveLength(3);
  await page.reload();
  await expect(sparks.locator(".card-top")).toContainText("V3 · Current");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
