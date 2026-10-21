import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  compactParse,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  studioPack,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import type { DiscoveryState } from "../lib/types";

const pdf = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const titles = [
  "Movers - Campaign Extensions Refresh Brief",
  "Xfinity Pro - Campaign Extensions",
];
const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Workspace" });
const tab = (page: Page, name: string) =>
  navigation(page).getByRole("button", { name, exact: true }).click();
const attempts = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Four-tab UI requires Discovery mode.",
  );
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  attempts.set(page, []);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      if (url.hostname !== "fonts.googleapis.com")
        attempts.get(page)!.push(url.hostname);
      await route.abort();
    } else await route.continue();
  });
});
test.afterEach(async ({ page }) =>
  expect(attempts.get(page) ?? []).toEqual([]),
);
async function current(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  const session = compactParse(raw!) as DiscoveryStudioSession,
    pack = studioPack(session);
  const draft = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    discoveryStorageKey(pack),
  );
  return {
    session,
    pack,
    state: draft ? (compactParse(draft) as DiscoveryState) : undefined,
  };
}
async function choose(page: Page, index: number) {
  await tab(page, "Input Pack");
  const picker = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const id = await picker
    .locator("option")
    .filter({ hasText: titles[index] })
    .getAttribute("value");
  await picker.selectOption(id!);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60000 },
  );
}
async function upload(page: Page, index: number) {
  await page.goto("/");
  await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30000 });
  await choose(page, index);
}
for (const index of [0, 1])
  test(`${titles[index]}: selected V0, side-by-side editing, preservation, approval and campaign isolation`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await upload(page, index);
    await expect(navigation(page).getByRole("button")).toHaveCount(4);
    for (const [i, label] of [
      "Input Pack",
      "Insight Discovery",
      "Finalize Strategy",
      "XC Brief",
    ].entries())
      await expect(
        navigation(page).getByRole("button").nth(i),
      ).toHaveAccessibleName(label);
    await page
      .getByRole("article", { name: "RTB / JTBD", exact: true })
      .getByRole("checkbox")
      .check();
    await page
      .locator(".studio-data-choice")
      .first()
      .getByRole("checkbox")
      .check();
    const sparks = page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice");
    await expect(sparks).toHaveCount(6);
    await sparks.nth(0).getByRole("checkbox").check();
    await sparks.nth(1).getByRole("checkbox").check();
    const selected = await current(page);
    expect(selected.pack.selectedResearch).toHaveLength(1);
    expect(selected.pack.selectedSparks).toHaveLength(2);
    expect(selected.pack.rtbApprovalStatus).toBe("unknown");
    expect(selected.pack.campaignName).toBe(titles[index]);
    const unselectedTitle = await sparks
      .nth(2)
      .locator(".spark-title")
      .textContent();
    await page.screenshot({
      path: info.outputPath("01-input-pack.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Next: Insight Discovery", exact: true })
      .click();
    await expect(page.locator(".v2-agent-grid > article")).toHaveCount(5);
    const question = `What needs evidence in ${titles[index]}?`;
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    for (const status of await page.locator(".v2-agent-status").all())
      await expect(status).toHaveText(/V0 · (Insights Ready)/, {
        timeout: 60000,
      });
    await page.screenshot({
      path: info.outputPath("02-insight-discovery.png"),
      fullPage: true,
    });
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    await consumer
      .getByRole("textbox", { name: "Your message to Consumer Agent" })
      .fill("What evidence is still missing for this audience?");
    await consumer
      .getByRole("button", { name: "Ask this agent", exact: true })
      .click();
    await expect(
      consumer.locator(".v2-conversation .v2-message.agent"),
    ).toHaveCount(1, { timeout: 60000 });
    const before = await current(page);
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    const drawer = page.getByRole("dialog", {
      name: "Working Space",
      exact: true,
    });
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => drawer.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(1000);
    await expect(drawer).not.toHaveAttribute("aria-modal", "true");
    await expect(
      page.getByRole("heading", { name: "Collaborate with your round table" }),
    ).toBeVisible();
    const layout = await page.locator(".discovery-v2").evaluate((el) => {
      const bounds = el.getBoundingClientRect(),
        left = el
          .querySelector(".v2-research-content")!
          .getBoundingClientRect(),
        right = el.querySelector(".v2-working-drawer")!.getBoundingClientRect();
      const body = el.querySelector(".v2-working-body")!;
      return {
        ratio: right.width / bounds.width,
        overlap: left.right > right.left + 1,
        scrolls: body.scrollHeight > body.clientHeight,
        agentWidth: el.querySelector(".v2-agent")!.getBoundingClientRect()
          .width,
      };
    });
    expect(layout.ratio).toBeGreaterThanOrEqual(0.45);
    expect(layout.ratio).toBeLessThanOrEqual(0.55);
    expect(layout.overlap).toBe(false);
    expect(layout.scrolls).toBe(true);
    expect(layout.agentWidth).toBeGreaterThanOrEqual(260);
    const seeded = await current(page);
    expect(seeded.state!.workspaceSuggestionContext!.opened).toBe(true);
    expect(
      Object.keys(seeded.state!.workspaceSuggestionContext!.fields),
    ).toHaveLength(13);
    for (const spark of selected.pack.selectedSparks!)
      expect(seeded.state!.strategicDirection).toContain(spark.idea!);
    // The selected XC framing is an RTB adaptation, so it fills Proof / RTB.
    expect(seeded.state!.workingRTB).toBe(selected.pack.proposedRTB);
    // Source text stays exact; a newly proposed V0 interpretation is separate
    // from evidence and must use the selected campaign, never name metadata.
    const insight = seeded.state!.evidenceInsights ?? "";
    const origin =
      seeded.state!.workspaceSuggestionContext!.fields.evidenceInsights;
    if (origin.kind === "interpretation") {
      expect(origin.label).toContain("Validate with research");
      expect(insight).toContain(
        selected.pack.audience
          .trim()
          .split(/(?<=[.!?])\s+/)[0]
          .replace(/[.!?]$/, ""),
      );
      for (const spark of selected.pack.selectedSparks!)
        if (spark.hypothesis || spark.hypothesisToValidate) {
          expect(insight).toContain(
            (spark.hypothesis || spark.hypothesisToValidate)!.split(/[.!?]/)[0],
          );
          break;
        }
    } else if (insight)
      expect(
        selected.pack.selectedResearch!.some((x) => x.text === insight) ||
          selected.pack.parsedIMC!.sourceText.includes(insight),
      ).toBe(true);
    expect(insight).not.toBe(selected.pack.campaignName);
    expect(
      JSON.stringify(seeded.state!.workspaceSuggestionContext!.fields),
    ).not.toContain(unselectedTitle!);
    const values = {
      problemStatement: `Kevin ${index}: exact problem`,
      evidenceInsights: `Kevin ${index}: tentative insight`,
      strategicDirection: `Kevin ${index}: chosen direction`,
    };
    for (const [key, value] of Object.entries(values))
      await drawer.locator(`#ws-${key}`).fill(value);
    const line = `Kevin ${index}: exact human brief line.`;
    await drawer
      .getByRole("textbox", { name: "Brief line", exact: true })
      .fill(line);
    await drawer
      .getByRole("button", { name: "Save Draft", exact: true })
      .click();
    const saved = await current(page);
    expect(saved.session.approved).toBeNull();
    expect(saved.state!.fieldVersions!.humanBriefLine).toHaveLength(1);
    expect(saved.state!.question).toBe(before.state!.question);
    expect(saved.state!.runs).toEqual(before.state!.runs);
    // Desktop research remains interactive while the nonmodal drawer is open.
    await consumer
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    await expect(drawer.locator(".saved-findings .count")).toHaveText("1");
    expect((await current(page)).state!.humanBriefLine).toBe(line);
    await page.locator(".v2-working-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: info.outputPath("03-discovery-working-space.png"),
      fullPage: false,
    });
    await drawer
      .getByRole("button", { name: "Close Working Space", exact: true })
      .click();
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    await expect(
      drawer.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(line);
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Open Working Space/ }),
    ).toBeFocused();
    await tab(page, "Input Pack");
    await sparks.nth(1).getByRole("checkbox").uncheck();
    await sparks.nth(2).getByRole("checkbox").check();
    await tab(page, "Insight Discovery");
    await expect(page.locator(".v2-stale").first()).toBeVisible();
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    await expect(drawer.locator(".ws-context-changed")).toContainText(
      "Selected Sparks or their versions changed.",
    );
    for (const [key, value] of Object.entries(values))
      await expect(drawer.locator(`#ws-${key}`)).toHaveValue(value);
    await drawer
      .getByRole("button", {
        name: "Continue to Finalize Strategy",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Finalize Strategy", exact: true }),
    ).toBeVisible();
    const canvas = page.getByRole("region", {
      name: "Full-width Working Space",
    });
    const grid = await canvas.locator(".ws-thinking").evaluate((el) => ({
      left: el.getBoundingClientRect().left,
      width: el.getBoundingClientRect().width,
      hintWidth: el.querySelector(".ws-hint")!.getBoundingClientRect().width,
      firstFieldLeft: el.querySelector(".field")!.getBoundingClientRect().left,
    }));
    expect(grid.hintWidth).toBeGreaterThan(grid.width * 0.9);
    expect(Math.abs(grid.firstFieldLeft - grid.left)).toBeLessThanOrEqual(1);
    await expect(
      canvas.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(line);
    expect((await current(page)).state!.fieldVersions).toEqual(
      saved.state!.fieldVersions,
    );
    await page
      .getByRole("button", { name: "Confirm current strategy", exact: true })
      .click();
    const approved = await current(page);
    expect(approved.session.approved?.briefLine).toBe(line);
    expect(approved.session.approved?.discoveryCanvas?.evidenceInsights).toBe(
      values.evidenceInsights,
    );
    await page.screenshot({
      path: info.outputPath("04-finalize-strategy.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Generate XC Brief", exact: true })
      .click();
    await expect(page.locator(".brief-wireframe")).toContainText(line);
    await page.screenshot({
      path: info.outputPath("05-xc-brief.png"),
      fullPage: true,
    });
    await choose(page, 1 - index);
    await tab(page, "Insight Discovery");
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    const other = await current(page);
    expect(other.pack.campaignName).toBe(titles[1 - index]);
    expect(other.session.approved).toBeNull();
    expect(other.state!.humanBriefLine).not.toBe(line);
    expect(other.state!.savedFindingIds).toEqual([]);
    await drawer
      .getByRole("button", { name: "Close Working Space", exact: true })
      .click();
    await choose(page, index);
    await tab(page, "Finalize Strategy");
    await expect(
      canvas.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(line);
    const restored = await current(page);
    expect(restored.state!.fieldVersions).toEqual(saved.state!.fieldVersions);
    expect(restored.session.approved?.briefLine).toBe(line);
  });

test("mobile Working Space is a full-screen keyboard-accessible sheet with independent scrolling", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page, 0);
  await tab(page, "Insight Discovery");
  const open = page.getByRole("button", { name: /^Open Working Space/ });
  await open.click();
  const drawer = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const bounds = await drawer.boundingBox();
  expect(bounds!.x).toBe(0);
  expect(bounds!.width).toBe(390);
  expect(bounds!.height).toBe(844);
  const first = drawer.getByRole("button", {
    name: "Close Working Space",
    exact: true,
  });
  await expect(first).toBeFocused();
  // Optional notes start collapsed and toggle open and closed.
  const notes = drawer.locator(".ws-private-notes");
  await expect(
    notes.getByRole("textbox", { name: "Private notes", exact: true }),
  ).not.toBeVisible();
  await notes.locator("summary").click();
  await expect(
    notes.getByRole("textbox", { name: "Private notes", exact: true }),
  ).toBeVisible();
  await notes.locator("summary").click();
  await expect(
    notes.getByRole("textbox", { name: "Private notes", exact: true }),
  ).not.toBeVisible();
  await notes.locator("summary").click();
  await expect(
    notes.getByRole("textbox", { name: "Private notes", exact: true }),
  ).toBeVisible();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    drawer.getByRole("button", {
      name: "Continue to Finalize Strategy",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  const scroll = await page.locator(".v2-working-body").evaluate((el) => {
    const y = window.scrollY;
    el.scrollTop = 500;
    return { top: el.scrollTop, windowUnchanged: window.scrollY === y };
  });
  expect(scroll.top).toBeGreaterThan(0);
  expect(scroll.windowUnchanged).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(open).toBeFocused();
});
