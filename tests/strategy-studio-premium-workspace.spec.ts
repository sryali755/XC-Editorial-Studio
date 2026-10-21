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
import { workspaceHistoryLabels } from "../lib/workspace-presentation";
import type { DiscoveryState } from "../lib/types";
const source = readFileSync(
  path.join(__dirname, "fixtures/client-input-pack/movers_source_text.txt"),
  "utf8",
);
async function data(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  const session = compactParse(raw!) as DiscoveryStudioSession;
  const key = discoveryStorageKey(studioPack(session));
  const value = await page.evaluate((key) => sessionStorage.getItem(key), key);
  return { session, state: compactParse(value!) as DiscoveryState, key };
}
async function prepare(page: Page) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(source);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
  await page
    .getByRole("article", { name: "Evidence-led Sparks", exact: true })
    .getByRole("checkbox")
    .first()
    .check();
  await page
    .getByRole("button", { name: "Next: Insight Discovery", exact: true })
    .click();
}
const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "Working Space", exact: true });
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
    )
      return route.abort();
    await route.continue();
  });
});

test("premium drawer separates AI reference from the single human line, preserves edits, scroll and versions", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await prepare(page);
  await expect(
    page.getByRole("navigation", { name: "Workspace" }).getByRole("button"),
  ).toHaveText(
    [
      "1 · Input Pack",
      "2 · Insight Discovery",
      "3 · Finalize Strategy",
      "4 · XC Brief",
    ],
    { useInnerText: true },
  );
  await expect(page.locator(".v2-agent-status")).toHaveText(
    Array(5).fill("Awaiting Exploration"),
  );
  await page.screenshot({
    path: info.outputPath("01-awaiting-exploration.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("heading", {
      name: "Strategic Starting Point",
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.locator(".ws-starting-summary")).not.toBeEmpty();
  await expect(panel.locator(".ws-selected-sparks")).toContainText(
    "Selected Input Pack · V0",
  );
  await expect(
    panel.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("");
  await expect(
    panel.getByRole("button", { name: "Back to Discovery", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.locator('[aria-labelledby="ws-compare-title"]'),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Starting an investigation uses paid AI requests/),
  ).toHaveCount(0);
  await expect(page.locator(".studio-prototype-note")).toHaveCount(0);
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await expect(page.getByText(/OpenAI|gpt-|token|AI_MODE/)).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("02-discovery-drawer-desktop.png"),
    fullPage: true,
  });
  await panel.screenshot({
    path: info.outputPath("03-working-space-desktop.png"),
  });
  await panel.locator(".ws-thinking").scrollIntoViewIfNeeded();
  await panel.screenshot({ path: info.outputPath("04-strategy-canvas.png") });
  await panel.locator(".ws-brief-line").scrollIntoViewIfNeeded();
  await panel.screenshot({ path: info.outputPath("05-human-owned-line.png") });
  await panel
    .getByRole("button", {
      name: "Use suggestion in my brief line",
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("textbox", { name: "Brief line", exact: true }),
  ).not.toBeEmpty();
  await panel
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("Kevin's preserved human line.");
  await panel.getByRole("button", { name: "Save Draft", exact: true }).click();
  await panel.locator(".ws-private-notes > summary").click();
  await panel
    .getByRole("textbox", { name: "Private notes", exact: true })
    .fill("Private human thought — not for export.");
  await panel.getByRole("button", { name: "Save Draft", exact: true }).click();
  await panel.locator(".v2-working-body").evaluate((el) => {
    el.scrollTop = 400;
  });
  const scroll = await panel
    .locator(".v2-working-body")
    .evaluate((el) => el.scrollTop);
  await panel
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect(
    panel.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Kevin's preserved human line.");
  await expect
    .poll(() =>
      panel.locator(".v2-working-body").evaluate((el) => el.scrollTop),
    )
    .toBe(scroll);
  await panel
    .getByRole("button", { name: "Continue to Finalize Strategy", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Kevin's preserved human line.");
  expect((await data(page)).session.approved).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Kevin's preserved human line.");
  expect((await data(page)).state.notes).toBe(
    "Private human thought — not for export.",
  );
});

test("comparison runs in Discovery, not in the drawer, without rewriting the human draft", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("What evidence is missing for movers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  for (const item of await page.locator(".v2-agent-status").all())
    await expect(item).toHaveText("V0 · Insights Ready", { timeout: 60_000 });
  for (const name of ["Consumer Agent", "Brand Agent"]) {
    const card = page.getByRole("article", { name, exact: true });
    await card
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    await card
      .getByRole("checkbox", { name: "Compare", exact: true })
      .first()
      .check();
  }
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await drawer(page)
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("Keep my line unchanged.");
  await drawer(page)
    .getByRole("button", { name: "Compare findings in Discovery", exact: true })
    .click();
  const comparison = page.locator(".v2-comparison-panel");
  await expect(comparison).toHaveAttribute("open", "");
  await comparison
    .getByRole("button", { name: "Compare selected findings", exact: true })
    .click();
  await expect(
    comparison.getByRole("textbox", {
      name: "Edit connection note",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    drawer(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Keep my line unchanged.");
  expect((await data(page)).state.savedFindingIds).toHaveLength(2);
});

test("all 19 original field histories remain viewable with their exact values", async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  await expect.poll(async () => Boolean((await data(page)).state)).toBe(true);
  await drawer(page)
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
  const stored = await data(page);
  stored.state.fieldVersions = Object.fromEntries(
    Object.keys(workspaceHistoryLabels).map((key, i) => [
      key,
      [
        {
          id: `legacy-${i}`,
          number: 1,
          savedAt: "2026-10-18T12:00:00.000Z",
          value: `Preserved historical text ${i}`,
        },
      ],
    ]),
  );
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: stored.key,
    value: compactStringify(stored.state),
  });
  await page.reload();
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  const history = drawer(page).locator(".ws-version-history");
  await history.locator(":scope > summary").click();
  await expect(history.locator(":scope > details")).toHaveCount(19);
  for (const item of await history.locator(":scope > details").all())
    await item.locator("summary").click();
  for (let i = 0; i < 19; i++)
    await expect(
      history.getByText(`Preserved historical text ${i}`, { exact: true }),
    ).toBeVisible();
});

test("mobile and tablet sheet retains focus, independent scroll and accessible actions", async ({
  page,
}, info) => {
  await prepare(page);
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    const panel = drawer(page);
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(
      panel.getByRole("button", { name: "Close Working Space", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", {
        name: "Continue to Finalize Strategy",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const body = await panel.locator(".v2-working-body").evaluate((el) => ({
      scroll: el.scrollHeight,
      height: el.clientHeight,
      overflow: getComputedStyle(el).overflowY,
    }));
    expect(body.scroll).toBeGreaterThan(body.height);
    expect(body.overflow).toBe("auto");
    await panel.screenshot({
      path: info.outputPath(`working-space-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Open Working Space/ }),
    ).toBeFocused();
  }
});
