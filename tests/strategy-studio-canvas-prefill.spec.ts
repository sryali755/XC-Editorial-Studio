import { expect, test, type Page } from "@playwright/test";
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
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

const source = (file: string) =>
  readFileSync(
    path.join(__dirname, "fixtures/client-input-pack", file),
    "utf8",
  );
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "Working Space", exact: true });
async function stored(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  const session = compactParse(raw!) as DiscoveryStudioSession;
  const pack = studioPack(session);
  const key = discoveryStorageKey(pack);
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), key);
  return {
    session,
    pack,
    key,
    state: draft ? (compactParse(draft) as DiscoveryState) : null,
  };
}
async function build(page: Page, text: string) {
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(text);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
}
async function open(page: Page) {
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(panel(page)).toBeVisible();
}
async function close(page: Page) {
  await panel(page)
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
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
      expect(url.hostname, "No external AI request is authorized").not.toMatch(
        /openai|anthropic|gemini|generativelanguage|writer\.com/i,
      );
      return;
    }
    await route.continue();
  });
  await page.goto("/");
});

for (const [name, file, expected, foreign] of [
  [
    "Movers",
    "movers_source_text.txt",
    /moving|move moment/i,
    /Xfinity Pro|work-from-home/,
  ],
  [
    "Xfinity Pro",
    "xfinity_pro_source_text.txt",
    /streaming|gaming|work-from-home/i,
    /I am moving|move moment/,
  ],
] as const) {
  test(`${name}: real source builds editable Insight and JTBD, with empty human line`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await build(page, source(file));
    await open(page);
    const drawer = panel(page);
    await expect(
      drawer.getByRole("textbox", { name: "Problem", exact: true }),
    ).not.toBeEmpty();
    await expect(
      drawer.getByRole("textbox", { name: "Audience", exact: true }),
    ).not.toBeEmpty();
    for (const label of ["Insight", "Job to be done"]) {
      const field = drawer.getByRole("textbox", { name: label, exact: true });
      await expect(field).toHaveValue(expected);
      await expect(field).not.toHaveValue(foreign);
    }
    await expect(drawer.locator(".ws-thinking")).toContainText(
      "Suggested interpretation · Validate with research",
    );
    await expect(drawer.locator(".ws-thinking")).toContainText(
      "not original or approved",
    );
    const line = drawer.getByRole("textbox", {
      name: "Brief line",
      exact: true,
    });
    await expect(line).toHaveValue("");
    await expect(line).toHaveAttribute(
      "placeholder",
      "Write your brief line here...",
    );
    await drawer.locator(".ws-thinking").scrollIntoViewIfNeeded();
    await drawer.screenshot({
      path: info.outputPath(`${name}-strategy-canvas.png`),
    });
    await drawer.locator(".ws-brief-line").scrollIntoViewIfNeeded();
    await drawer.screenshot({
      path: info.outputPath(`${name}-empty-human-line.png`),
    });
    await expect(
      drawer.getByRole("button", { name: "Back to Discovery", exact: true }),
    ).toHaveCount(0);
    expect((await stored(page)).session.approved).toBeNull();
    expect((await stored(page)).pack.originalJTBD).toBe("");
  });
}
test("human edits, deliberate clears, restoration and finalization preserve exact draft and versions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await build(page, source("movers_source_text.txt"));
  await open(page);
  const drawer = panel(page);
  const insight = drawer.getByRole("textbox", { name: "Insight", exact: true });
  const job = drawer.getByRole("textbox", {
    name: "Job to be done",
    exact: true,
  });
  const line = drawer.getByRole("textbox", { name: "Brief line", exact: true });
  await insight.fill("Kevin's exact insight — do not replace.");
  await job.fill("Kevin's exact proposed job — not an original source job.");
  await line.fill("Kevin's exact human-owned line.");
  await drawer.getByRole("button", { name: "Save Draft", exact: true }).click();
  await close(page);
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(insight).toHaveValue("Kevin's exact insight — do not replace.");
  await expect(job).toHaveValue(
    "Kevin's exact proposed job — not an original source job.",
  );
  await expect(line).toHaveValue("Kevin's exact human-owned line.");
  await insight.fill("");
  await job.fill("");
  await drawer.getByRole("button", { name: "Save Draft", exact: true }).click();
  await close(page);
  await page.reload();
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(insight).toHaveValue("");
  await expect(job).toHaveValue("");
  await expect(line).toHaveValue("Kevin's exact human-owned line.");
  for (const [label, expected] of [
    ["Insight", "Kevin's exact insight — do not replace."],
    [
      "Job to be done",
      "Kevin's exact proposed job — not an original source job.",
    ],
  ]) {
    const field = drawer.locator(".field").filter({
      has: page.getByRole("textbox", { name: label, exact: true }),
    });
    await field.locator(".ws-history > summary").click();
    await field
      .getByRole("button", { name: `Use version 1 of ${label}`, exact: true })
      .click();
    await expect(
      drawer.getByRole("textbox", { name: label, exact: true }),
    ).toHaveValue(expected);
  }
  await drawer.getByRole("button", { name: "Save Draft", exact: true }).click();
  await drawer
    .getByRole("button", { name: "Continue to Finalize Strategy", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Insight", exact: true }),
  ).toHaveValue("Kevin's exact insight — do not replace.");
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Kevin's exact human-owned line.");
  expect((await stored(page)).session.approved).toBeNull();
  const saved = (await stored(page)).state!;
  expect(
    saved.fieldVersions!.evidenceInsights.some(
      (version) => version.value === "",
    ),
  ).toBe(true);
  expect(
    saved.fieldVersions!.workingJTBD.some((version) => version.value === ""),
  ).toBe(true);
  // Return to the same campaign after building the other real campaign.
  await build(page, source("xfinity_pro_source_text.txt"));
  await open(page);
  await expect(
    panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("");
  await expect(
    panel(page).getByRole("textbox", { name: "Job to be done", exact: true }),
  ).toHaveValue(/streaming|gaming/);
  await close(page);
  await build(page, source("movers_source_text.txt"));
  await open(page);
  await expect(insight).toHaveValue("Kevin's exact insight — do not replace.");
  await expect(job).toHaveValue(
    "Kevin's exact proposed job — not an original source job.",
  );
  await expect(line).toHaveValue("Kevin's exact human-owned line.");
});
test("supplied original JTBD remains exact and unapproved in source and editable field", async ({
  page,
}) => {
  await build(page, mobileIMCBrief);
  const original = (await stored(page)).pack.originalJTBD!;
  expect(original).toContain("Encourage existing Xfinity Internet customers");
  await open(page);
  await expect(
    panel(page).getByRole("textbox", { name: "Job to be done", exact: true }),
  ).toHaveValue(original);
  await expect(panel(page).locator(".ws-thinking")).toContainText(
    "Original JTBD from the IMC brief · approval not established",
  );
  await expect(
    panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("");
  expect((await stored(page)).pack.originalJTBD).toBe(original);
  expect((await stored(page)).session.approved).toBeNull();
});
test("insufficient source shows explicit Needs validation without storing filler", async ({
  page,
}) => {
  // Build remains the normal mock-only action; sparse context is not invented.
  await build(
    page,
    "Campaign: Sparse source\nBackground: A document without audience needs or campaign objectives.",
  );
  await open(page);
  const drawer = panel(page);
  await expect(
    drawer.getByRole("textbox", { name: "Insight", exact: true }),
  ).toHaveValue("");
  await expect(
    drawer.getByRole("textbox", { name: "Job to be done", exact: true }),
  ).toHaveValue("");
  await expect(drawer.locator(".ws-thinking")).toContainText(
    "Needs validation",
  );
  await drawer.getByRole("button", { name: "Save Draft", exact: true }).click();
  const value = (await stored(page)).state!;
  expect(value.humanBriefLine).toBe("");
  expect(value.evidenceInsights).toBe("");
  expect(value.workingJTBD).toBe("");
});
test("legacy draft hydration preserves an AI-filled line and intentional empty canvas fields", async ({
  page,
}) => {
  await build(page, source("movers_source_text.txt"));
  await open(page);
  await close(page);
  const data = await stored(page);
  const state = data.state!;
  state.workspaceSuggestionsSeeded = undefined;
  state.evidenceInsights = "";
  state.workingJTBD = "";
  state.humanBriefLine =
    "Exact pre-existing AI suggestion — preserve, never silently blank.";
  state.workspaceSuggestionContext!.opened = false;
  state.workspaceSuggestionContext!.fields.humanBriefLine = {
    value: state.humanBriefLine,
    kind: "supplied",
    label: "Legacy AI suggestion · not approved",
  };
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: data.key,
    value: compactStringify(state),
  });
  await page.reload();
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(
    panel(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(state.humanBriefLine);
  await expect(
    panel(page).getByRole("textbox", { name: "Insight", exact: true }),
  ).toHaveValue("");
  await expect(
    panel(page).getByRole("textbox", { name: "Job to be done", exact: true }),
  ).toHaveValue("");
  await expect(panel(page).locator(".ws-brief-line")).toContainText(
    "Legacy AI suggestion · not approved",
  );
});
