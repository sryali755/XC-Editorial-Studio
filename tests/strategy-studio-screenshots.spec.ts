import { expect, test } from "@playwright/test";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

test("capture the four-stage mock walkthrough", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true" ||
      process.env.XC_CAPTURE_SCREENSHOTS !== "1",
  );
  const capture = async (name: string) =>
    page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await sparks.getByRole("checkbox").first().check();
  await capture("01-input-pack.png");
  await sparks.screenshot({
    path: testInfo.outputPath("02-selectable-sparks.png"),
  });
  await page
    .locator(".studio-source-chips")
    .getByRole("checkbox", { name: /Tableau/ })
    .check();
  await page
    .locator(".studio-source-chips")
    .screenshot({ path: testInfo.outputPath("03-research-sources.png") });
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await capture("04-discovery-before-run.png");
  const investigation =
    "What makes the mobile choice easier for existing customers?";
  const question = page.getByRole("textbox", {
    name: /What should we investigate/,
  });
  await question.fill(investigation);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  await expect(question).toHaveValue(investigation);
  for (const name of [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ]) {
    const agent = page.getByRole("article", { name, exact: true });
    await expect(agent.locator(".v2-agent-status")).toContainText(
      /V0 · (Insights Ready)/,
    );
    await expect(agent.locator(".v2-finding").first()).toBeVisible();
  }
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  await capture("05-discovery-after-run.png");
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await capture("06-working-space.png");
  await page.getByRole("button", { name: "Close Working Space" }).click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
  await page
    .getByRole("textbox", { name: "Brief line" })
    .fill("Make the mobile choice feel simpler for eligible customers.");
  await capture("07-finalized-strategy-inline.png");
  await page.getByRole("button", { name: "Confirm current strategy" }).click();
  await page.getByRole("button", { name: "Generate XC Brief" }).click();
  await capture("08-xc-brief.png");
});
