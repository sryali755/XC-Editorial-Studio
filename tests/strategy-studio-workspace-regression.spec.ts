import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  studioPack,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import type { DiscoveryState } from "../lib/types";

const source = (file: string) =>
  readFileSync(
    path.join(__dirname, "fixtures/client-input-pack", file),
    "utf8",
  );
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "Working Space", exact: true });
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name, exact: true });
async function stored(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  const session = compactParse(raw!) as DiscoveryStudioSession;
  const pack = studioPack(session),
    key = discoveryStorageKey(pack);
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), key);
  return {
    session,
    pack,
    key,
    state: draft ? (compactParse(draft) as DiscoveryState) : undefined,
  };
}
async function build(page: Page, file: string) {
  await nav(page, "Input Pack").click();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(source(file));
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
  const sparks = page.getByRole("article", {
    name: "Evidence-led Sparks",
    exact: true,
  });
  await sparks.getByRole("checkbox").nth(0).check();
  await sparks.getByRole("checkbox").nth(1).check();
  await nav(page, "Insight Discovery").click();
}
async function open(page: Page) {
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(panel(page)).toBeVisible();
}
async function close(page: Page) {
  await panel(page)
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
}
async function views(page: Page, info: TestInfo, prefix: string) {
  const drawer = panel(page);
  const sections = drawer.locator(
    ".working-space > :is(.ws-starting-point,.ws-thinking,.ws-brief-line)",
  );
  expect(
    await sections.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector("h3")!.textContent),
    ),
  ).toEqual(["Strategic Starting Point", "Strategy Canvas", "Your Brief Line"]);
  const ys = await sections.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(ys[0]).toBeLessThan(ys[1]);
  expect(ys[1]).toBeLessThan(ys[2]);
  await drawer.locator(".v2-working-body").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(
    drawer.getByRole("heading", {
      name: "Strategic Starting Point",
      exact: true,
    }),
  ).toBeInViewport();
  await drawer.screenshot({
    path: info.outputPath(`${prefix}-starting-point.png`),
  });
  await drawer.locator(".ws-thinking").scrollIntoViewIfNeeded();
  await drawer.screenshot({ path: info.outputPath(`${prefix}-canvas.png`) });
  await drawer.locator(".ws-brief-line").scrollIntoViewIfNeeded();
  await drawer.screenshot({
    path: info.outputPath(`${prefix}-brief-line.png`),
  });
}
test.beforeEach(async ({ page, request }) => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      await route.abort();
      expect(url.hostname, "External AI is not authorized").not.toMatch(
        /openai|anthropic|gemini|writer\.com|generativelanguage/i,
      );
      return;
    }
    await route.continue();
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/");
  // A new browser context, not an old source-scoped draft made to look new.
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) =>
        key.startsWith("xc-insight-discovery-v2:"),
      ),
    ),
  ).toEqual([]);
});

for (const [name, file, own, foreign] of [
  [
    "new-movers",
    "movers_source_text.txt",
    /moving|move moment/i,
    /Xfinity Pro|work-from-home/i,
  ],
  [
    "new-pro",
    "xfinity_pro_source_text.txt",
    /streaming|gaming|work-from-home/i,
    /move moment|I am moving/i,
  ],
] as const) {
  test(`${name}: selected Sparks never fill the human line and current sections render in order`, async ({
    page,
  }, info) => {
    await build(page, file);
    await expect(
      page.getByRole("navigation", { name: "Workspace" }).getByRole("button"),
    ).toHaveCount(4);
    await open(page);
    const data = await stored(page);
    expect(data.pack.selectedSparks).toHaveLength(2);
    expect(data.state!.humanBriefLine).toBe("");
    expect(data.state!.fieldVersions).toBeUndefined();
    const drawer = panel(page);
    for (const label of ["Insight", "Job to be done"]) {
      await expect(
        drawer.getByRole("textbox", { name: label, exact: true }),
      ).toHaveValue(own);
      await expect(
        drawer.getByRole("textbox", { name: label, exact: true }),
      ).not.toHaveValue(foreign);
    }
    await expect(
      drawer.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue("");
    await expect(drawer.locator(".ws-brief-line")).not.toContainText(
      "From the top selected Spark",
    );
    await expect(drawer.locator(".ws-thinking")).toContainText(
      "not original or approved",
    );
    expect(data.pack.originalJTBD).toBe("");
    await views(page, info, name);
    await close(page);
    await page.reload();
    await open(page);
    await expect(
      panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue("");
  });
}
test("four saved findings and zero field histories are independent and human autosave still restores", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await build(page, "movers_source_text.txt");
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill(
      "What needs evidence in the Movers retention and switching decision?",
    );
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(page.locator(".v2-agent-status")).toHaveText(
    Array(5).fill("V0 · Insights Ready"),
    { timeout: 60_000 },
  );
  for (const agent of [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
  ]) {
    const card = page.getByRole("article", { name: agent, exact: true });
    await card
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .click();
  }
  await expect(page.locator(".studio-header-pill")).toHaveText(
    "Working Space · 4 saved findings",
  );
  await expect(
    page.getByRole("button", {
      name: "Open Working Space (4 saved findings)",
      exact: true,
    }),
  ).toBeVisible();
  await open(page);
  const drawer = panel(page);
  await expect(drawer.locator("header")).toContainText(
    "0 fields with saved versions",
  );
  await expect(drawer.locator("header")).toContainText(
    "Save Draft creates field versions; saved findings are counted separately.",
  );
  expect((await stored(page)).state!.savedFindingIds).toHaveLength(4);
  expect((await stored(page)).state!.fieldVersions).toBeUndefined();
  await page.screenshot({
    path: info.outputPath("four-findings-zero-field-versions.png"),
    fullPage: false,
  });
  const human =
    "Keep Xfinity a useful constant while movers choose what changes.";
  await drawer
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(human);
  // No explicit Save Draft: automatic browser persistence still protects writing.
  await expect
    .poll(async () => (await stored(page)).state!.humanBriefLine)
    .toBe(human);
  await close(page);
  await page.reload();
  await open(page);
  await expect(
    panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(human);
  expect((await stored(page)).state!.fieldVersions).toBeUndefined();
  await panel(page).locator(".ws-brief-line").scrollIntoViewIfNeeded();
  await panel(page).screenshot({
    path: info.outputPath("existing-human-autosaved-restored.png"),
  });
  await panel(page)
    .getByRole("button", { name: "Save Draft", exact: true })
    .click();
  expect(
    (await stored(page)).state!.fieldVersions!.humanBriefLine[0].value,
  ).toBe(human);
  expect((await stored(page)).state!.savedFindingIds).toHaveLength(4);
  expect((await stored(page)).session.approved).toBeNull();
});
test("legacy Spark-filled source draft reproduces the caption without hiding or overwriting current sections", async ({
  page,
}, info) => {
  await build(page, "movers_source_text.txt");
  await open(page);
  await close(page);
  const data = await stored(page),
    state = data.state!;
  state.humanBriefLine = data.pack.selectedSparks![0].idea!;
  const text = state.humanBriefLine;
  state.fieldVersions = {};
  state.workspaceSuggestionContext!.originalFields = undefined;
  state.workspaceSuggestionContext!.fields.humanBriefLine = {
    value: text,
    kind: "selected",
    label: "From the top selected Spark · suggestion",
  };
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: data.key,
    value: compactStringify(state),
  });
  await page.reload();
  await open(page);
  const drawer = panel(page);
  await expect(
    drawer.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(text);
  await expect(drawer.locator(".ws-brief-line")).not.toContainText(
    "From the top selected Spark",
  );
  await expect(drawer.locator(".ws-brief-line")).toContainText(
    "Restored earlier draft · edit freely",
  );
  await expect(drawer.locator("#ws-restored-line-note")).toContainText(
    "Existing source-derived line restored from an earlier draft",
  );
  await views(page, info, "legacy-restored");
  await close(page);
  await open(page);
  // The upper sections still exist but are outside the remembered viewport.
  await expect(
    drawer.getByRole("heading", {
      name: "Strategic Starting Point",
      exact: true,
    }),
  ).not.toBeInViewport();
  await expect(
    drawer.getByRole("heading", { name: "Strategy Canvas", exact: true }),
  ).not.toBeInViewport();
  await expect(
    drawer.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(text);
  await drawer.screenshot({
    path: info.outputPath("legacy-remembered-scroll.png"),
  });
  await drawer.locator(".v2-working-body").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(
    drawer.getByRole("heading", {
      name: "Strategic Starting Point",
      exact: true,
    }),
  ).toBeInViewport();
  await drawer.screenshot({
    path: info.outputPath("legacy-restored-top-sections.png"),
  });
  // The old source-derived value remains human-owned during an explicit review.
  await close(page);
  await nav(page, "Finalize Strategy").click();
  const included = page
    .locator('input[type="checkbox"][value^="spark:"]')
    .first();
  await expect(included).toBeChecked();
  await included.uncheck();
  const workspace = page.getByRole("region", {
    name: "Full-width Working Space",
  });
  await expect(
    workspace.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(text);
  expect((await stored(page)).state!.humanBriefLine).toBe(text);
  expect((await stored(page)).state!.fieldVersions).toEqual({});
  // Provenance remains reviewable without putting a large warning above the canvas.
  await nav(page, "Input Pack").click();
  await page
    .getByRole("article", { name: "Evidence-led Sparks", exact: true })
    .getByRole("checkbox")
    .nth(1)
    .uncheck();
  await nav(page, "Insight Discovery").click();
  await open(page);
  const review = panel(page).locator(".ws-context-changed");
  await expect(review).toHaveCount(1);
  await expect(review).not.toBeVisible();
  await expect(
    panel(page).locator(".working-space > .ws-context-changed"),
  ).toHaveCount(0);
  await panel(page)
    .getByText("Starting context & provenance", { exact: true })
    .click();
  await expect(review).toBeVisible();
  await expect(review).not.toHaveAttribute("open");
  await review
    .getByText("Review selection changes · draft preserved", { exact: true })
    .click();
  await expect(review.locator(".ws-selection-diff")).toBeVisible();
  await expect(review).toContainText(
    "Selected Sparks or their versions changed.",
  );
  await expect(
    panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(text);
  expect(
    (await stored(page)).state!.workspaceSuggestionContext!.fields
      .humanBriefLine.label,
  ).toBe("From the top selected Spark · suggestion");
  await panel(page)
    .getByText("Starting context & provenance", { exact: true })
    .click();
  await panel(page)
    .locator(".v2-working-body")
    .evaluate((el) => {
      el.scrollTop = 0;
    });
  await panel(page).screenshot({
    path: info.outputPath("context-changes-not-prominent.png"),
  });
});
