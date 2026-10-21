import { expect, test } from "@playwright/test";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery is required.",
  ),
);

async function openBrief(page: import("@playwright/test").Page) {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav
    .getByRole("button", { name: "Finalize Strategy", exact: true })
    .click();
  await openWorkspaceIfClosed(page);
  return page.getByRole("textbox", { name: "Brief line", exact: true });
}

async function openWorkspaceIfClosed(page: import("@playwright/test").Page) {
  const open = page.getByRole("button", { name: "Open Working Space" });
  if (await open.isVisible()) await open.click();
}

test("a full sessionStorage falls back to IndexedDB and restores the newest draft", async ({
  page,
}) => {
  const brief = await openBrief(page);
  await brief.fill("Initial brief line saved in session storage.");
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("xc-insight-"))
        throw new DOMException("Browser storage is full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await brief.fill(
    "Updated brief line saved after the browser quota was reached.",
  );
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await expect(
    page.getByText(/could not be saved in this browser/i),
  ).toHaveCount(0);
  const stale = await page.evaluate(
    () =>
      sessionStorage.getItem(
        Object.keys(sessionStorage).find((key) =>
          key.startsWith("xc-insight-discovery-v2:"),
        )!,
      ) ?? "",
  );
  expect(stale).toContain("Initial brief line");
  expect(stale).not.toContain("Updated brief line");
  await page.reload();
  await openWorkspaceIfClosed(page);
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(
    "Updated brief line saved after the browser quota was reached.",
  );
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
});

test("both storage methods failing leaves the last saved draft intact and shows an error", async ({
  page,
}) => {
  const brief = await openBrief(page);
  await brief.fill("This was saved before storage failed.");
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("xc-insight-"))
        throw new DOMException("Browser storage is full", "QuotaExceededError");
      return original.call(this, key, value);
    };
    IDBFactory.prototype.open = () => {
      throw new DOMException("IndexedDB unavailable", "UnknownError");
    };
  });
  await brief.fill("This could not be saved.");
  await expect(page.locator('.error[role="alert"]')).toContainText(
    "Your investigation could not be saved in this browser",
  );
  await expect(brief).toHaveValue("This could not be saved.");
  await page.reload();
  await openWorkspaceIfClosed(page);
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("This was saved before storage failed.");
});

test("quota fallback preserves research versions and selected findings", async ({
  page,
}) => {
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
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6);
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: /What should we investigate/,
    })
    .fill("What should this campaign validate before strategy?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(consumer.locator(".v2-agent-status")).toHaveText(
    /Insights Ready/,
  );
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await consumer.getByRole("checkbox", { name: "Compare" }).first().check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("xc-insight-"))
        throw new DOMException("Browser storage is full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await consumer
    .getByRole("button", { name: "Get another answer", exact: true })
    .click();
  await expect(consumer.locator(".v2-agent-status")).toHaveText(
    /Insights Ready/,
  );
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await page.reload();
  const restored = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  const expand = restored.getByRole("button", {
    name: "Expand Consumer Agent",
  });
  if (await expand.isVisible()) await expand.click();
  await restored.getByText(/Evidence & research log/).click();
  const history = restored.getByRole("combobox", {
    name: "Research history for Consumer Agent",
  });
  await expect(history.locator("option")).toHaveCount(2);
  await history.selectOption({ index: 1 });
  await expect(
    restored.getByRole("checkbox", { name: "Compare" }).first(),
  ).toBeChecked();
});
