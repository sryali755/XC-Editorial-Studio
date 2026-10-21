import { expect, test } from "@playwright/test";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

test.beforeEach(() =>
  test.skip(process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true"),
);

async function openStrategy(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
}

test("suggestions appear only on request, remain editable, and never self-approve", async ({
  page,
}) => {
  await openStrategy(page);
  const panel = page.getByRole("region", { name: "Brief-line suggestions" });
  await expect(panel.locator(".studio-suggestion-card")).toHaveCount(0);
  await panel.getByRole("button", { name: "Suggest brief lines" }).click();
  await expect(panel.locator(".studio-suggestion-card")).toHaveCount(3);
  await expect(panel).toContainText("DEMO SUGGESTIONS · NOT LIVE AI");
  await expect(panel).toContainText("Exact support from the IMC brief");
  await panel
    .getByRole("button", { name: "Use as editable draft" })
    .first()
    .click();
  const line = page
    .getByRole("region", { name: "Full-width Working Space" })
    .getByRole("textbox", { name: "Brief line" });
  await expect(line).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  await line.fill("Kevin's own revised brief line.");
  await expect(line).toHaveValue("Kevin's own revised brief line.");
});

test("failed regeneration preserves the prior suggestions and draft", async ({
  page,
}) => {
  await openStrategy(page);
  const panel = page.getByRole("region", { name: "Brief-line suggestions" });
  await panel.getByRole("button", { name: "Suggest brief lines" }).click();
  await expect(panel.locator(".studio-suggestion-card")).toHaveCount(3);
  const previous = await panel
    .locator(".studio-suggestion-card h4")
    .first()
    .innerText();
  await panel
    .getByRole("button", { name: "Use as editable draft" })
    .first()
    .click();
  await page.route("**/api/ai/agent", async (route) => {
    const body = route.request().postDataJSON();
    if (body.agentType === "strategySuggestions")
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Temporary rate limit; retry shortly.",
          code: "rate_limit",
          retryable: true,
        }),
      });
    else await route.continue();
  });
  await panel.getByRole("button", { name: "Suggest new lines" }).click();
  await expect(panel.getByRole("alert")).toContainText("Temporary rate limit");
  await expect(panel.locator(".studio-suggestion-card h4").first()).toHaveText(
    previous,
  );
  await expect(
    page
      .getByRole("region", { name: "Full-width Working Space" })
      .getByRole("textbox", { name: "Brief line" }),
  ).toHaveValue(previous);
});

test("new suggestion runs keep history and older-input suggestions cannot be chosen", async ({
  page,
}) => {
  await openStrategy(page);
  const panel = page.getByRole("region", { name: "Brief-line suggestions" });
  await panel.getByRole("button", { name: "Suggest brief lines" }).click();
  await expect(panel.locator(".studio-suggestion-card")).toHaveCount(3);
  await panel.getByRole("button", { name: "Suggest new lines" }).click();
  await expect(panel.getByText("Previous suggestion runs · 2")).toBeVisible();
  const workspace = page.getByRole("region", {
    name: "Full-width Working Space",
  });
  await workspace
    .getByRole("textbox", { name: "Problem", exact: true })
    .fill("A new human-defined problem to explore.");
  await expect(panel).toContainText("These suggestions use older inputs");
  await expect(
    panel.getByRole("button", { name: "Use as editable draft" }).first(),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Suggest new lines" }).click();
  await expect(panel.getByText("Previous suggestion runs · 3")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Use as editable draft" }).first(),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Brief-line suggestions" }),
  ).toContainText("Previous suggestion runs · 3");
});

test("saved Discovery findings are visibly traced to every suggested line", async ({
  page,
}) => {
  let suggestionInput: Record<string, unknown> | undefined;
  await page.route("**/api/ai/agent", async (route) => {
    const body = route.request().postDataJSON();
    if (body.agentType === "strategySuggestions")
      suggestionInput = body.context;
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page
    .getByRole("textbox", { name: /What should we investigate/ })
    .fill("What makes mobile choice feel difficult for existing customers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  const consumer = page.getByRole("article", { name: "Consumer Agent" });
  await consumer
    .getByRole("button", { name: "Save to Working Space" })
    .first()
    .click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
  const panel = page.getByRole("region", { name: "Brief-line suggestions" });
  await expect(panel).toContainText("1 saved Discovery finding will be traced");
  await panel.getByRole("button", { name: "Suggest brief lines" }).click();
  const cards = panel.locator(".studio-suggestion-card");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toContainText("How Discovery shaped this line");
    await expect(card).toContainText("Exact support from the IMC brief");
    await expect(card.locator(".studio-suggestion-discovery")).toContainText(
      /Research gap|Interpretation of supplied evidence/,
    );
  }
  expect(suggestionInput).toBeDefined();
  expect((suggestionInput as { sourceBrief: string }).sourceBrief).toBe(
    mobileIMCBrief,
  );
  expect(
    (suggestionInput as { savedFindings: unknown[] }).savedFindings,
  ).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
});
