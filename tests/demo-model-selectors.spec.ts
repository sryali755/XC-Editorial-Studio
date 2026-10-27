import { expect, test } from "@playwright/test";

const modelLabels = ["Palmyra X5", "Astra", "Opus 5.5", "Gemini Flash"];
const agentNames = [
  "Consumer Agent",
  "Culture Agent",
  "Category Agent",
  "Brand Agent",
  "Analogous Solutions Agent",
];

test("Input Pack demo model selector is beside Build Input Pack and is UI-only", async ({
  page,
}) => {
  const apiPosts: string[] = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST") {
      apiPosts.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/");

  const inputTab = page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack", exact: true });
  await inputTab.click();
  const selector = page.getByRole("combobox", {
    name: "AI Model for Input Pack",
  });
  const buildButton = page.getByRole("button", {
    name: "Build Input Pack",
    exact: true,
  });
  await expect(selector).toBeVisible();
  await expect(selector.locator("option")).toHaveText(modelLabels);
  await expect(buildButton).toBeVisible();
  await expect(selector.locator("..")).toHaveClass(/demo-model-selector/);
  await expect(selector.locator("xpath=../..")).toHaveClass(
    /studio-build-controls/,
  );
  await expect(
    page.locator(".studio-build-controls .demo-model-selector"),
  ).toHaveCount(1);
  await expect(selector).toHaveValue("Palmyra X5");
  const desktopAlignment = await page
    .locator(".studio-build-controls")
    .evaluate((element) => {
      const selectorBounds = element
        .querySelector(".demo-model-selector")!
        .getBoundingClientRect();
      const buttonBounds = element
        .querySelector("button")!
        .getBoundingClientRect();
      return {
        direction: getComputedStyle(element).flexDirection,
        topDifference: Math.abs(selectorBounds.top - buttonBounds.top),
      };
    });
  expect(desktopAlignment.direction).toBe("row");
  expect(desktopAlignment.topDifference).toBeLessThan(12);
  await selector.selectOption({ label: "Gemini Flash" });
  await expect(selector).toHaveValue("Gemini Flash");
  expect(apiPosts).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(selector).toBeVisible();
  await expect(buildButton).toBeVisible();
  const mobileControls = await page
    .locator(".studio-build-controls")
    .boundingBox();
  expect(mobileControls).not.toBeNull();
  expect(mobileControls!.x + mobileControls!.width).toBeLessThanOrEqual(390);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await expect(
    page.locator('[aria-label="AI Model for Input Pack"]'),
  ).toHaveValue("Gemini Flash");
});

test("each Insight Discovery agent has an independent UI-only model selector", async ({
  page,
}) => {
  const apiPosts: string[] = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST") {
      apiPosts.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();

  const cards = page.locator(".v2-agent-grid > .v2-agent");
  await expect(cards).toHaveCount(5);
  for (const agentName of agentNames) {
    const card = page.getByRole("article", { name: agentName, exact: true });
    const controls = card.locator(".v2-agent-model-actions");
    const selector = card.getByRole("combobox", {
      name: `AI Model for ${agentName}`,
    });
    await expect(controls).toBeVisible();
    await expect(
      controls.getByRole("button", { name: `Regenerate ${agentName}` }),
    ).toBeVisible();
    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toHaveText(modelLabels);
    await expect(controls.locator("button").locator("..")).toContainText(
      "AI Model",
    );
    await expect(selector).toHaveValue("Palmyra X5");
  }
  await expect(
    page.getByRole("combobox", {
      name: /^AI Model for/,
    }),
  ).toHaveCount(5);

  await page
    .getByRole("combobox", { name: "AI Model for Consumer Agent" })
    .selectOption({ label: "Astra" });
  await page
    .getByRole("combobox", { name: "AI Model for Category Agent" })
    .selectOption({ label: "Opus 5.5" });
  await page
    .getByRole("combobox", { name: "AI Model for Brand Agent" })
    .selectOption({ label: "Gemini Flash" });

  await expect(
    page.getByRole("combobox", { name: "AI Model for Consumer Agent" }),
  ).toHaveValue("Astra");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Culture Agent" }),
  ).toHaveValue("Palmyra X5");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Category Agent" }),
  ).toHaveValue("Opus 5.5");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Brand Agent" }),
  ).toHaveValue("Gemini Flash");
  await expect(
    page.getByRole("combobox", {
      name: "AI Model for Analogous Solutions Agent",
    }),
  ).toHaveValue("Palmyra X5");
  expect(apiPosts).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const agentName of agentNames) {
    const card = page.getByRole("article", { name: agentName, exact: true });
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await expect(
      card.getByRole("combobox", { name: `AI Model for ${agentName}` }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "AI Model for Consumer Agent" }),
  ).toHaveValue("Astra");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Culture Agent" }),
  ).toHaveValue("Palmyra X5");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Category Agent" }),
  ).toHaveValue("Opus 5.5");
  await expect(
    page.getByRole("combobox", { name: "AI Model for Brand Agent" }),
  ).toHaveValue("Gemini Flash");
  await expect(
    page.getByRole("combobox", {
      name: "AI Model for Analogous Solutions Agent",
    }),
  ).toHaveValue("Palmyra X5");
});
