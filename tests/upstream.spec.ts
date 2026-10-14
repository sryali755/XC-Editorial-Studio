import { test, expect } from "@playwright/test";

test("upstream decisions survive refinement, reload, approval, and brief generation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const rtb = page.getByRole("article", {
    name: "Review & Adapt Upstream RTB",
    exact: true,
  });
  const original = await rtb.locator(".original-rtb-card p").innerText();
  await rtb.getByRole("button", { name: "Edit output", exact: true }).click();
  await rtb
    .getByRole("textbox", { name: /Edit Review & Adapt Upstream RTB output/ })
    .fill("XC proposed framing — household reassurance.");
  await rtb.getByRole("button", { name: "Save as new version" }).click();
  await expect(rtb.locator(".original-rtb-card p")).toHaveText(original);
  await page.locator(".review-upstream > summary").click();
  await page
    .getByLabel("Required disclaimers detail", { exact: true })
    .fill("Offer terms apply.");
  await page
    .getByLabel("Required disclaimers status", { exact: true })
    .selectOption("Supplied");
  await page
    .getByLabel("Substantiation / claim evidence status", { exact: true })
    .selectOption("Needs clarification");
  await page
    .getByLabel("Audience exclusions status", { exact: true })
    .selectOption("Intentionally excluded");
  await page
    .getByLabel("Audience exclusions review note", { exact: true })
    .fill("GTM deliberately omitted extra audience targeting.");
  await page
    .getByLabel("Brand messaging detail", { exact: true })
    .fill("Approved message from Brand owner.");
  await page
    .getByLabel("Brand messaging approval status detail", { exact: true })
    .fill("Reported approved by Brand; source verification pending.");
  await page.getByRole("checkbox").first().check();
  await page.reload();
  await expect(
    page.getByLabel("Required disclaimers detail", { exact: true }),
  ).toHaveValue("Offer terms apply.");
  await expect(
    page.getByLabel("Audience exclusions status", { exact: true }),
  ).toHaveValue("Intentionally excluded");
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await page.locator(".summary > summary").click();
  await expect(page.locator(".summary")).toContainText("Offer terms apply.");
  await expect(page.locator(".summary")).toContainText(original);
  await expect(page.locator(".summary")).toContainText(
    "XC proposed framing — household reassurance.",
  );
  await page
    .getByLabel("FINAL BRIEF LINE", { exact: true })
    .fill("A life that feels connected.");
  await page.getByRole("button", { name: "Approve & Continue" }).click();
  await page
    .getByRole("button", { name: "Load sample execution details" })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  const brief = page.locator(".brief-paper");
  await expect(brief).toContainText(original);
  await expect(brief).toContainText(
    "Proposed XC adaptation — not upstream-approved",
  );
  await expect(brief).toContainText("Offer terms apply.");
  await expect(brief).toContainText(
    "Intentionally excluded — GTM deliberately omitted extra audience targeting.",
  );
  await expect(brief).toContainText("Needs clarification");
  await expect(brief).toContainText(
    "Reported approved by Brand; source verification pending.",
  );
  await page.screenshot({
    path: "test-results/upstream-brief.png",
    fullPage: true,
  });
});

test("intentional RTB omission is respected and legacy sessions keep their work", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill(
      "Campaign: Focused campaign\nReason to believe: Intentionally excluded — GTM owner will provide later.\nAudience: Families\nDisclaimers:\nPartner approval: Pending partner review",
    );
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(
    page.getByLabel("Original upstream RTB status", { exact: true }),
  ).toHaveValue("Intentionally excluded");
  await expect(
    page.getByLabel("Required disclaimers detail", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Partner approval status detail", { exact: true }),
  ).toHaveValue("Pending partner review");
  const rtb = page.getByRole("article", {
    name: "Review & Adapt Upstream RTB",
    exact: true,
  });
  await rtb.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(rtb.locator(".prepared-text")).toContainText(
    "No replacement RTB has been generated",
  );
  await page.getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await page.locator(".summary > summary").click();
  await expect(page.locator(".summary-grid")).toContainText(
    "No adaptation carried forward.",
  );
  // Simulate a pre-upgrade persisted session; keep its round-table history intact.
  const before = await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!);
    delete s.preparation.upstream;
    sessionStorage.setItem("xc-strategy-session-v1", JSON.stringify(s));
    return s.outputs[0].versions[0].id;
  });
  await page.reload();
  await expect(
    page.getByRole("article", { name: "Humorous / Witty" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!).outputs[0]
          .versions[0].id,
    ),
  ).toBe(before);
  await page.getByRole("button", { name: /Strategy input pack/ }).click();
  await expect(
    page.getByLabel("Original upstream RTB status", { exact: true }),
  ).toHaveValue("Intentionally excluded");
});
