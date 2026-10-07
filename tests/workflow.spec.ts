import { test, expect } from "@playwright/test";
async function prepareSample(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(page.locator(".spark-option")).toHaveCount(6);
  await page.getByRole("checkbox").first().check();
}
test("IMC import, independent preparation histories, selected context and persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Prepare XC Input Pack", exact: true }),
  ).toBeDisabled();
  const importer = page.getByLabel("Import file for IMC output brief");
  await importer.setInputFiles({
    name: "imc.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Campaign: Imported campaign\nProduct: Test product\nAudience: Busy households\nResearch: Supplied audience research.\nReason to believe: Supplied product proof.",
    ),
  });
  await expect(
    page.getByRole("textbox", { name: "IMC output brief", exact: false }),
  ).toContainText("Supplied audience research.");
  await importer.setInputFiles({
    name: "unsupported.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not supported"),
  });
  await expect(page.locator(".file-import").getByRole("alert")).toContainText(
    "Other formats aren’t supported yet",
  );
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const rtb = page.getByRole("article", {
    name: "Review & Adapt Upstream RTB",
    exact: true,
  });
  const research = page.getByRole("article", {
    name: "Data & Research Agent",
    exact: true,
  });
  const sparks = page.getByRole("article", {
    name: "Strategic Sparks Agent",
    exact: true,
  });
  await expect(rtb.locator(".prepared-text")).toContainText(
    "Supplied product proof.",
  );
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  const researchBefore = await research.locator(".prepared-text").innerText();
  await page.getByRole("checkbox").nth(1).check();
  const selectedText = await page
    .locator(".spark-option")
    .nth(1)
    .locator("span")
    .innerText();
  const omittedText = await page
    .locator(".spark-option")
    .nth(2)
    .locator("span")
    .innerText();
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Focus on social context.");
  await rtb
    .getByRole("textbox", { name: /Guide Review & Adapt Upstream RTB/ })
    .fill("Focus on household reassurance.");
  await rtb.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(rtb.locator(".card-top")).toContainText("V1 · Current");
  await expect(research.locator(".prepared-text")).toHaveText(researchBefore);
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  await rtb.locator(".prep-history > summary").click();
  await rtb.getByRole("button", { name: "Make V0 current" }).click();
  await rtb.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(rtb.locator(".card-top")).toContainText("V2 · Current");
  await expect(rtb.locator(".history-version")).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await page.locator(".summary > summary").click();
  await expect(page.locator(".summary-grid")).toContainText(
    selectedText.replace(/^IDEA STARTER 2\s*/, ""),
  );
  await expect(page.locator(".summary-grid")).not.toContainText(
    omittedText.replace(/^IDEA STARTER 3\s*/, ""),
  );
  await expect(page.locator(".summary-grid")).toContainText(
    "Focus on social context.",
  );
  await page.getByRole("button", { name: "Show next agents" }).click();
  await page.getByRole("button", { name: "Show next agents" }).click();
  await expect(
    page.getByRole("article", { name: "Proven-pattern / Brand" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: /Strategy input pack/ }).click();
  await sparks.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(sparks.locator(".card-top")).toContainText("V1 · Current");
  await expect(page.getByRole("checkbox").nth(1)).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill("Campaign: Changed campaign");
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  await expect(
    rtb.getByRole("button", { name: "Regenerate this agent" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(rtb.locator(".card-top")).toContainText("V3 · Current");
  await rtb.locator(".prep-history > summary").click();
  await rtb.getByRole("button", { name: "Make V0 current" }).click();
  await page.getByRole("checkbox").first().check();
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeDisabled();
  await expect(
    page.getByText("A restored output uses an earlier IMC brief.", {
      exact: false,
    }),
  ).toBeVisible();
});
test("independent versions, selection, synthesis, approval, execution and download", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Execution direction", exact: false }),
  ).toBeDisabled();
  await prepareSample(page);
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  const humor = page.getByRole("article", { name: "Humorous / Witty" });
  const culture = page.getByRole("article", { name: "Cultural / Social" });
  await expect(
    humor.locator(".current-output").getByText("V0 · Current"),
  ).toBeVisible();
  const cultureBefore = await culture.locator("blockquote").innerText();
  await humor
    .getByLabel("Refinement for Humorous / Witty")
    .fill("Make it more playful");
  await humor.getByRole("button", { name: "Generate another version" }).click();
  await expect(humor.getByText("V1 · Current").first()).toBeVisible();
  await expect(culture.locator("blockquote")).toHaveText(cultureBefore);
  await humor.locator(".history > summary").click();
  await humor.getByRole("button", { name: "Restore V0" }).click();
  await expect(humor.locator(".current-output")).toContainText("V0 · Current");
  await humor
    .getByLabel("Refinement for Humorous / Witty")
    .fill("Another direction");
  await humor.getByRole("button", { name: "Generate another version" }).click();
  await expect(humor.locator(".current-output")).toContainText("V2 · Current");
  await expect(humor.locator(".history-version")).toHaveCount(3);
  await humor
    .locator(".current-output")
    .getByRole("button", { name: "Select this version" })
    .click();
  await culture
    .locator(".current-output")
    .getByRole("button", { name: "Select this version" })
    .click();
  await page.getByRole("button", { name: "Combine selected" }).click();
  await page
    .getByRole("button", { name: "Generate Combined Brief Line" })
    .click();
  await page
    .locator(".combined")
    .getByRole("button", { name: "Use as final line" })
    .click();
  await expect(
    page.getByRole("button", { name: "Execution direction", exact: false }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel("FINAL BRIEF LINE", { exact: true }),
  ).not.toBeEmpty();
  await page.getByRole("button", { name: "Approve & Continue" }).click();
  await expect(
    page.getByText("Approved by Kevin", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Required assets")
    .fill("Homepage hero and two social tiles");
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  await expect(page.locator(".brief-paper")).toContainText(
    "Homepage hero and two social tiles",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Brief" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "XC-Creative-Brief.txt",
  );
  await page
    .getByRole("button", { name: "Back to Strategy", exact: false })
    .click();
  await page
    .getByLabel("FINAL BRIEF LINE", { exact: true })
    .fill("A new direction requires fresh approval.");
  await expect(
    page.getByRole("button", { name: "Execution direction", exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Creative brief", exact: false }),
  ).toBeDisabled();
});
test("desktop, laptop and mobile layouts stay within viewport", async ({
  page,
}) => {
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A stronger starting point." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/input-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepareSample(page);
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/prepared-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await expect(
    page.getByRole("article", { name: "Humorous / Witty" }),
  ).toBeVisible();
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `test-results/roundtable-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/roundtable-${width}.png`,
      fullPage: true,
    });
  }
});
