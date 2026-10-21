import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  studioPack,
  studioResearchChoices,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import { saveWorkspaceDraft } from "../lib/workspace-suggestions";
import type { DiscoveryState } from "../lib/types";

const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "Working Space", exact: true });
const field = (page: Page, name: string) =>
  drawer(page).getByRole("textbox", { name, exact: true });
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
  const value = await page.evaluate((key) => sessionStorage.getItem(key), key);
  return { pack, session, key, state: compactParse(value!) as DiscoveryState };
}
async function build(page: Page, file = "movers_source_text.txt") {
  await nav(page, "Input Pack").click();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(
      readFileSync(
        path.join(__dirname, "fixtures/client-input-pack", file),
        "utf8",
      ),
    );
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    Array(3).fill("Demo · V0"),
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
  await expect(drawer(page)).toBeVisible();
}
async function close(page: Page) {
  await drawer(page)
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
}
async function legacy(page: Page) {
  await build(page);
  await open(page);
  await close(page);
  const data = await stored(page),
    state = data.state;
  state.evidenceInsights = "";
  state.workingJTBD = "";
  state.humanBriefLine =
    "Keep the connection steady while movers make a new place their own.";
  state.notes = "Kevin's private note — retain exactly.";
  for (const key of ["evidenceInsights", "workingJTBD"]) {
    state.workspaceSuggestionContext!.fields[key] = {
      value: "",
      kind: "missing",
      label: "Not in the Input Pack · add your own",
    };
    state.workspaceSuggestionContext!.originalFields![key] = {
      ...state.workspaceSuggestionContext!.fields[key],
    };
  }
  state.workspaceSuggestionContext!.opened = false;
  const saved = saveWorkspaceDraft(state);
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: data.key,
    value: compactStringify(saved),
  });
  await page.reload();
  await open(page);
  return saved;
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
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/");
});

for (const [campaign, file, own, foreign] of [
  [
    "Movers",
    "movers_source_text.txt",
    /mov(?:ing|ers?)/i,
    /Xfinity Pro|work-from-home/i,
  ],
  [
    "Pro",
    "xfinity_pro_source_text.txt",
    /work-from-home|streaming|gaming/i,
    /move moment|I am moving/i,
  ],
] as const) {
  test(`${campaign}: new suggestions, optional supporting context and empty human line`, async ({
    page,
  }, info) => {
    await build(page, file);
    await open(page);
    await expect(field(page, "Insight")).toHaveValue(own);
    await expect(field(page, "Job to be done")).toHaveValue(own);
    await expect(field(page, "Insight")).not.toHaveValue(foreign);
    await expect(field(page, "Insight")).toHaveValue(
      /hypothesis|investigate|opportunity/i,
    );
    await expect(field(page, "Job to be done")).toHaveValue(
      /^When .+, I want .+, so I can .+\.$/,
    );
    await expect(field(page, "Brief line")).toHaveValue("");
    await drawer(page).locator(".ws-thinking").scrollIntoViewIfNeeded();
    await drawer(page).screenshot({
      path: info.outputPath(`${campaign}-canvas.png`),
    });
    await expect(
      drawer(page).locator(".ws-thinking .ws-category-reference"),
    ).toHaveCount(0);
    const support = drawer(page).locator(".ws-supporting-context");
    await expect(support).not.toHaveAttribute("open");
    await support
      .getByText("Supporting Strategy Context", { exact: true })
      .click();
    await expect(
      support.getByRole("heading", { name: "Category Truth", exact: true }),
    ).toBeVisible();
    await expect(support).toContainText("Needs validation");
    await support.scrollIntoViewIfNeeded();
    await drawer(page).screenshot({
      path: info.outputPath(`${campaign}-supporting-context.png`),
    });
    await support
      .getByText("Supporting Strategy Context", { exact: true })
      .click();
    await drawer(page).locator(".ws-brief-line").scrollIntoViewIfNeeded();
    await drawer(page).screenshot({
      path: info.outputPath(`${campaign}-empty-line.png`),
    });
    await drawer(page)
      .getByRole("button", { name: "Save Draft", exact: true })
      .click();
    const saved = (await stored(page)).state;
    await close(page);
    await page.reload();
    await open(page);
    expect((await stored(page)).state).toEqual(saved);
    await expect(field(page, "Brief line")).toHaveValue("");
  });
}

test("legacy blanks remain untouched until preview and individual consent, with histories preserved", async ({
  page,
}, info) => {
  const original = await legacy(page);
  await expect(field(page, "Problem")).not.toBeEmpty();
  await expect(field(page, "Audience")).not.toBeEmpty();
  await expect(field(page, "Insight")).toHaveValue("");
  await expect(field(page, "Job to be done")).toHaveValue("");
  await drawer(page).locator(".ws-thinking").scrollIntoViewIfNeeded();
  await drawer(page).screenshot({
    path: info.outputPath("legacy-missing-before.png"),
  });
  const unchanged = (await stored(page)).state;
  await expect(drawer(page).locator(".ws-thinking")).toContainText(
    "No starting suggestion saved",
  );
  await expect(drawer(page).locator(".ws-thinking")).not.toContainText(
    "Not in the Input Pack · add your own",
  );
  const fill = drawer(page).getByRole("button", {
    name: "Fill missing suggestions",
    exact: true,
  });
  await fill.click();
  const preview = drawer(page).getByRole("region", {
    name: "Missing suggestion preview",
  });
  await expect(
    preview.getByRole("checkbox", { name: "Fill Insight", exact: true }),
  ).not.toBeChecked();
  await expect(
    preview.getByRole("checkbox", { name: "Fill Job to be done", exact: true }),
  ).not.toBeChecked();
  await expect(
    preview.getByRole("button", {
      name: "Apply selected suggestions",
      exact: true,
    }),
  ).toBeDisabled();
  expect((await stored(page)).state).toEqual(unchanged);
  await preview.scrollIntoViewIfNeeded();
  await drawer(page).screenshot({
    path: info.outputPath("legacy-preview.png"),
  });
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await stored(page)).state).toEqual(unchanged);
  await fill.click();
  await preview
    .getByRole("checkbox", { name: "Fill Insight", exact: true })
    .check();
  await preview
    .getByRole("button", { name: "Apply selected suggestions", exact: true })
    .click();
  await expect(field(page, "Insight")).not.toBeEmpty();
  await expect(field(page, "Job to be done")).toHaveValue("");
  let value = (await stored(page)).state;
  expect(value.fieldVersions).toEqual(original.fieldVersions);
  expect(value.activeFieldVersionIds).toEqual(original.activeFieldVersionIds);
  expect(value.workspaceSuggestionContext!.originalFields).toEqual(
    original.workspaceSuggestionContext!.originalFields,
  );
  for (const key of [
    "humanBriefLine",
    "notes",
    "problemStatement",
    "workingAudience",
    "workingRTB",
    "strategicDirection",
    "wholeBrief",
    "savedFindingIds",
    "runs",
  ] as const)
    expect(value[key]).toEqual(original[key]);
  await close(page);
  await page.reload();
  await open(page);
  await expect(field(page, "Job to be done")).toHaveValue("");
  await fill.click();
  await expect(
    preview.getByRole("checkbox", { name: "Fill Insight", exact: true }),
  ).toHaveCount(0);
  await preview
    .getByRole("checkbox", { name: "Fill Job to be done", exact: true })
    .check();
  await preview
    .getByRole("button", { name: "Apply selected suggestions", exact: true })
    .click();
  await expect(field(page, "Job to be done")).toHaveValue(
    /^When .+, I want .+, so I can .+\.$/,
  );
  await expect(field(page, "Brief line")).toHaveValue(original.humanBriefLine!);
  await drawer(page).locator(".ws-thinking").scrollIntoViewIfNeeded();
  await drawer(page).screenshot({
    path: info.outputPath("legacy-filled-after.png"),
  });
  await drawer(page).locator(".ws-brief-line").scrollIntoViewIfNeeded();
  await drawer(page).screenshot({
    path: info.outputPath("legacy-human-line-preserved.png"),
  });
  value = (await stored(page)).state;
  expect(value.fieldVersions).toEqual(original.fieldVersions);
  await close(page);
  await nav(page, "Finalize Strategy").click();
  const inline = page.getByRole("region", { name: "Full-width Working Space" });
  await expect(
    inline.getByRole("textbox", { name: "Insight", exact: true }),
  ).toHaveValue(value.evidenceInsights!);
  await expect(
    inline.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(original.humanBriefLine!);
  expect((await stored(page)).session.approved).toBeNull();
});

test("typing after preview invalidates it instead of overwriting the newer edit", async ({
  page,
}) => {
  await legacy(page);
  await drawer(page)
    .getByRole("button", { name: "Fill missing suggestions", exact: true })
    .click();
  const preview = drawer(page).getByRole("region", {
    name: "Missing suggestion preview",
  });
  await preview
    .getByRole("checkbox", { name: "Fill Insight", exact: true })
    .check();
  await field(page, "Insight").fill(
    "Kevin's newer insight must win over an earlier preview.",
  );
  await expect(preview).toContainText("Preview again");
  await expect(
    preview.getByRole("button", {
      name: "Apply selected suggestions",
      exact: true,
    }),
  ).toBeDisabled();
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await close(page);
  await page.reload();
  await open(page);
  await expect(field(page, "Insight")).toHaveValue(
    "Kevin's newer insight must win over an earlier preview.",
  );
  await expect(field(page, "Job to be done")).toHaveValue("");
});

test("selected source-grounded category context remains accessible and persists across reload", async ({
  page,
}, info) => {
  await build(page);
  await open(page);
  await close(page);
  const data = await stored(page);
  const version = data.session.preparation.outputs.find(
    (output) => output.agentId === "research",
  )!.versions[0];
  if (!version.data || !("marketContext" in version.data))
    throw new Error("Expected existing mock research data");
  // Controlled mock fixture: quote only this campaign's supplied source, not
  // fabricated competitor research or a claim that an external service ran.
  const quote = data.pack
    .parsedIMC!.sourceText.split("\n")
    .find((line) => /competitive jump balls/i.test(line))!;
  expect(quote).toBeTruthy();
  version.data.marketContext = [`Supplied IMC context: ${quote.trim()}`];
  const choice = studioResearchChoices(data.session).find(
    (item) => item.category === "MARKET / CATEGORY CONTEXT",
  )!;
  data.session.selectedResearchIds = [choice.id];
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: studioStorageKey,
    value: compactStringify(data.session),
  });
  await page.reload();
  await open(page);
  const support = drawer(page).locator(".ws-supporting-context");
  await support
    .getByText("Supporting Strategy Context", { exact: true })
    .click();
  await expect(support).toContainText(choice.text);
  await expect(support).toContainText("not independently verified");
  await expect(support).not.toContainText("no category evidence selected");
  await support.scrollIntoViewIfNeeded();
  await drawer(page).screenshot({
    path: info.outputPath("selected-category-preserved.png"),
  });
  await drawer(page)
    .getByRole("button", { name: "Save Draft", exact: true })
    .click();
  const selectedBefore = (await stored(page)).pack.selectedResearch;
  await close(page);
  await page.reload();
  await open(page);
  await drawer(page)
    .locator(".ws-supporting-context")
    .getByText("Supporting Strategy Context", { exact: true })
    .click();
  await expect(drawer(page).locator(".ws-supporting-context")).toContainText(
    choice.text,
  );
  expect((await stored(page)).pack.selectedResearch).toEqual(selectedBefore);
  await expect(field(page, "Brief line")).toHaveValue("");
});
