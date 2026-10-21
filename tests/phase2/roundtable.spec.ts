import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  phase2Fixture,
  phase2Turn,
  phase2Version,
} from "../fixtures/phase2-roundtable";
import {
  beginDiscoveryRequest,
  completeDiscoveryRequest,
} from "../../lib/discovery-state";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
} from "../../lib/discovery-persistence";
import { studioStorageKey } from "../../lib/discovery-studio";
import { discoveryFindingRef } from "../../lib/discovery";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { requestSchema } from "../../lib/ai/schemas";
import type { DiscoveryState } from "../../lib/types";

test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(Boolean(process.env.OPENAI_API_KEY)).toBe(false);
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

async function openFixture(
  page: Page,
  context: BrowserContext,
  info: TestInfo,
  options: {
    completed?: boolean;
    file?: string;
    conversations?: boolean;
    zero?: boolean;
    one?: boolean;
  } = {},
) {
  const fixture = phase2Fixture(options.file, options.completed ?? true);
  if (options.zero) fixture.state.runs[0].versions[0].findings = [];
  if (options.one)
    fixture.state.runs[0].versions[0].findings =
      fixture.state.runs[0].versions[0].findings.slice(0, 1);
  fixture.state.humanBriefLine = "Exact saved human strategy — never replace";
  fixture.state.notes = "Saved private notes";
  if (options.conversations)
    for (let n = 1; n <= 3; n++) {
      const request = phase2Turn(fixture.pack, fixture.question, n);
      fixture.state = completeDiscoveryRequest(
        beginDiscoveryRequest(
          fixture.state,
          request,
          request.inputPackVersion!,
        ),
        request,
        phase2Version(fixture.pack, "consumer", 6, fixture.question),
      );
    }
  const origin = new URL(info.project.use.baseURL!).origin;
  if (new URL(origin).port === "3000")
    throw new Error(
      "Phase 2 action tests must not run against the live-mode development server.",
    );
  const requests: ReturnType<typeof requestSchema.parse>[] = [],
    denied: string[] = [],
    errors: string[] = [];
  const control: {
    failLens?: string;
    invalid?: boolean;
    gate?: Promise<void>;
  } = {};
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      url.origin === origin &&
      url.pathname === "/api/ai/agent" &&
      req.method() === "POST"
    ) {
      const request = requestSchema.parse(req.postDataJSON());
      requests.push(request);
      if (request.agentType !== "discovery")
        throw new Error("Unexpected AI operation in Phase 2 test");
      if (control.gate) await control.gate;
      if (control.failLens === request.context.lens)
        return route.fulfill({
          status: 503,
          json: {
            error: "Deterministic offline test failure",
            code: "mock_failure",
            retryable: true,
          },
        });
      return route.fulfill({
        status: 200,
        json: {
          provider: "mock",
          generatedAt: "2026-10-19T15:00:00.000Z",
          data: control.invalid ? { findings: [] } : mockDiscovery(request),
        },
      });
    }
    if (
      url.origin === origin &&
      req.method() === "GET" &&
      (url.pathname === "/" ||
        url.pathname.startsWith("/_next/static/") ||
        url.pathname === "/favicon.ico")
    )
      return route.continue();
    denied.push(`${req.method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (
      url.hostname === "localhost" &&
      url.port === new URL(origin).port &&
      url.pathname === "/_next/hmr"
    )
      socket.connectToServer();
    else socket.close();
  });
  const key = discoveryStorageKey(fixture.pack);
  await context.addInitScript(
    ({ studioKey, studioValue, key, value }) => {
      if (!sessionStorage.getItem(studioKey))
        sessionStorage.setItem(studioKey, studioValue);
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    },
    {
      studioKey: studioStorageKey,
      studioValue: compactStringify(fixture.session),
      key,
      value: compactStringify(fixture.state),
    },
  );
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".v2-agent-grid > .v2-agent")).toHaveCount(5, {
    timeout: 30000,
  });
  await expect(
    page.getByRole("heading", { name: "Insight Discovery", exact: true }),
  ).toBeVisible();
  const read = async () =>
    compactParse(
      (await page.evaluate((key) => sessionStorage.getItem(key), key))!,
    ) as DiscoveryState;
  const nav = (name: string) =>
    page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name, exact: true });
  const card = (name = "Consumer Agent") =>
    page
      .locator(".v2-agent-grid > article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  async function screenshot(name: string) {
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      fullPage: true,
    });
    await card().screenshot({ path: info.outputPath(`${name}-consumer.png`) });
  }
  async function safety() {
    expect(errors).toEqual([]);
    expect(
      denied.filter((url) => !url.includes("fonts.googleapis.com")),
    ).toEqual([]);
    await info.attach("offline-network-audit", {
      body: JSON.stringify({
        mockIntercepts: requests.length,
        serverAgentRequests: 0,
        denied,
        errors,
      }),
      contentType: "application/json",
    });
  }
  return { ...fixture, requests, control, read, nav, card, screenshot, safety };
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
]) {
  test(`A: empty Round Table ${viewport.width}`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize(viewport);
    const app = await openFixture(page, context, info, { completed: false });
    await expect(page.locator(".v2-agent-status")).toHaveText(
      Array(5).fill("Awaiting Exploration"),
    );
    await expect(page.locator(".v2-finding")).toHaveCount(0);
    await expect(page.getByLabel("What should we investigate?")).toHaveValue(
      app.question,
    );
    expect(app.requests).toHaveLength(0);
    await app.screenshot(`empty-${viewport.width}`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await app.safety();
  });
  test(`D/E/G/H/I: completed, steering and independent histories ${viewport.width}`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize(viewport);
    const app = await openFixture(page, context, info, { conversations: true });
    const card = app.card();
    await expect(page.locator(".v2-agent-status")).toContainText(
      Array(5).fill("Insights Ready"),
    );
    await expect(page.locator(".v2-agent-top .v2-regenerate")).toHaveCount(5);
    for (const header of await page.locator(".v2-agent-top").all()) {
      const a = await header.locator("h3").boundingBox(),
        b = await header.locator(".v2-regenerate").boundingBox();
      expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1);
    }
    await app.screenshot(`completed-${viewport.width}`);
    await card.locator(".v2-steering > summary").click();
    await card
      .getByLabel("Direction for regenerating Consumer Agent")
      .fill("Challenge the price assumption — unsent steering");
    await card.locator(".v2-generation-history > summary").click();
    const select = card.getByLabel("View generation for Consumer Agent");
    expect(await select.locator("option").allTextContents()).toEqual([
      "Current generation",
      "Generation V4 — Latest — Current",
      "Generation V3",
      "Generation V2",
      "Generation V1",
      "Generation V0",
    ]);
    await select.selectOption("consumer-generation-3");
    await expect(card.locator(".v2-history-view")).toContainText(
      "Viewing Generation V2",
    );
    expect((await app.read()).runs[0].currentVersionId).toBe(
      "consumer-generation-5",
    );
    const next = card.getByRole("button", { name: "Next finding" });
    await next.click();
    await expect(card).toContainText("Finding 2 of 2 · V2");
    await card
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .click();
    const saved = discoveryFindingRef(
      app.state.runs[0].versions[2].findings[1],
    );
    await expect
      .poll(async () => (await app.read()).savedFindingIds)
      .toEqual([saved]);
    await card
      .getByRole("button", { name: "Saved to Working Space", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .click();
    expect((await app.read()).savedFindingIds).toEqual([saved]);
    await card.getByLabel("Compare", { exact: true }).check();
    expect((await app.read()).savedFindingIds).toEqual([saved]);
    await card.locator(".v2-conversation-history > summary").click();
    const turns = card.locator(".v2-conversation-turn");
    await expect(turns).toHaveCount(3);
    await expect(turns.first().locator("summary")).toContainText(
      "Conversation 3 · Synthetic question 3",
    );
    for (const turn of await turns.all()) await turn.locator("summary").click();
    await expect(turns.first()).toContainText("Generation V4");
    await expect(turns.first().locator(".v2-message.human")).toContainText(
      "Synthetic question 3",
    );
    await expect(turns.first().locator(".v2-message.agent")).toContainText(
      "Agent interpretation",
    );
    await app.screenshot(`histories-${viewport.width}`);
    await turns.first().screenshot({
      path: info.outputPath(`conversation-${viewport.width}.png`),
    });
    await card.locator(".v2-generation-history").screenshot({
      path: info.outputPath(`generations-${viewport.width}.png`),
    });
    await card.locator(".v2-generation-history > summary").click();
    await card.locator(".v2-generation-history > summary").click();
    await expect(select).toHaveValue("consumer-generation-3");
    await select.selectOption("consumer-generation-2");
    await expect(card).toContainText("Finding 1 of 2 · V1");
    await select.selectOption("consumer-generation-3");
    await expect(card).toContainText("Finding 2 of 2 · V2");
    await card
      .getByRole("button", {
        name: "Make viewed generation current",
        exact: true,
      })
      .click();
    expect((await app.read()).runs[0].currentVersionId).toBe(
      "consumer-generation-3",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    expect(app.requests).toHaveLength(0);
    await app.safety();
  });
}

test("B/C/F/H/L: regeneration is independent, uses steering and preserves saved V2 and human drafts", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info),
    card = app.card();
  await card.locator(".v2-generation-history > summary").click();
  await card
    .getByLabel("View generation for Consumer Agent")
    .selectOption("consumer-generation-3");
  await card.getByRole("button", { name: "Next finding" }).click();
  await card
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  const saved = structuredClone((await app.read()).savedFindingIds);
  await card.locator(".v2-steering > summary").click();
  await card
    .getByLabel("Direction for regenerating Consumer Agent")
    .fill("Challenge the price assumption");
  let release!: () => void;
  app.control.gate = new Promise((resolve) => {
    release = resolve;
  });
  await card
    .getByRole("button", { name: "Regenerate Consumer Agent", exact: true })
    .click();
  await expect(card.locator(".v2-agent-status")).toContainText("Exploring");
  for (const name of [
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ])
    await expect(
      app
        .card(name)
        .getByRole("button", { name: `Regenerate ${name}`, exact: true }),
    ).toBeEnabled();
  await expect(card.locator(".v2-finding")).toBeVisible();
  expect(app.requests).toHaveLength(1);
  expect(app.requests[0].guidance).toBe("Challenge the price assumption");
  release();
  app.control.gate = undefined;
  await expect
    .poll(async () => (await app.read()).runs[0].versions.length)
    .toBe(6);
  const after = await app.read();
  expect(after.savedFindingIds).toEqual(saved);
  expect(after.humanBriefLine).toBe(app.state.humanBriefLine);
  expect(after.notes).toBe(app.state.notes);
  expect(after.runs.slice(1)).toEqual(app.state.runs.slice(1));
  expect(after.runs[0].thread).toEqual([]);
  expect(after.runs[0].versions.find((v) => v.number === 3)).toEqual(
    app.state.runs[0].versions[2],
  );
  await app.safety();
});
test("E/F/K: Ask is conversational only; histories, selected context and human drafts survive navigation and reload", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info),
    card = app.card();
  for (let n = 1; n <= 3; n++) {
    await card
      .getByLabel("Your message to Consumer Agent", { exact: true })
      .fill(`What evidence supports interpretation ${n}?`);
    await card
      .getByRole("button", { name: "Ask this agent", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await app.read()).runs[0].thread.filter(
            (item) => item.author === "Agent",
          ).length,
      )
      .toBe(n);
  }
  expect(app.requests).toHaveLength(3);
  for (const request of app.requests) {
    expect(request.agentType).toBe("discovery");
    if (request.agentType === "discovery")
      expect(request.context.action).toBe("explore_deeper");
  }
  expect((await app.read()).runs[0].versions).toEqual(
    app.state.runs[0].versions,
  );
  await app.nav("Input Pack").click();
  await expect(page.locator(".studio-jtbd-value")).toHaveText(
    app.pack.proposedRTB!,
  );
  await app.nav("Insight Discovery").click();
  await app.nav("Finalize Strategy").click();
  await app.nav("Insight Discovery").click();
  await page.reload();
  await expect(page.locator(".v2-agent-grid > article")).toHaveCount(5);
  await card.locator(".v2-conversation-history > summary").click();
  await expect(card.locator(".v2-conversation-turn")).toHaveCount(3);
  await expect(card.locator(".v2-conversation-turn").first()).toContainText(
    "What evidence supports interpretation 3?",
  );
  const restored = await app.read();
  expect(restored.humanBriefLine).toBe(app.state.humanBriefLine);
  expect(restored.notes).toBe(app.state.notes);
  expect(restored.runs[0].versions).toEqual(app.state.runs[0].versions);
  expect(app.requests).toHaveLength(3);
  await app.safety();
});
test("L: partial five-agent failure and operation-scoped retries retain valid histories", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info);
  app.control.failLens = "culture";
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(app.card("Culture Agent").getByRole("alert")).toContainText(
    "Deterministic offline test failure",
  );
  await expect
    .poll(
      async () =>
        (await app.read()).runs.filter((run) => run.status === "complete")
          .length,
    )
    .toBe(4);
  expect((await app.read()).runs[1].versions).toEqual(
    app.state.runs[1].versions,
  );
  app.control.failLens = undefined;
  await app
    .card("Culture Agent")
    .getByRole("button", { name: "Retry Culture Agent", exact: true })
    .click();
  await expect
    .poll(async () => (await app.read()).runs[1].versions.length)
    .toBe(2);
  app.control.failLens = "consumer";
  const card = app.card();
  const versions = structuredClone((await app.read()).runs[0].versions);
  await card
    .getByLabel("Your message to Consumer Agent", { exact: true })
    .fill("Can you challenge the evidence?");
  await card
    .getByRole("button", { name: "Ask this agent", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Retry conversation", exact: true }),
  ).toBeVisible();
  expect((await app.read()).runs[0].versions).toEqual(versions);
  app.control.failLens = undefined;
  await card
    .getByRole("button", { name: "Retry conversation", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await app.read()).runs[0].thread.filter(
          (item) => item.author === "Agent",
        ).length,
    )
    .toBe(1);
  expect((await app.read()).runs[0].versions).toEqual(versions);
  await app.safety();
});
for (const count of [0, 1])
  test(`G: ${count} findings render without invalid navigation`, async ({
    page,
    context,
  }, info) => {
    const app = await openFixture(page, context, info, {
      zero: count === 0,
      one: count === 1,
    });
    await expect(app.card().locator(".v2-finding")).toHaveCount(count);
    const next = app
      .card()
      .getByRole("button", { name: "Next finding", exact: true });
    if (count) await expect(next).toBeDisabled();
    else await expect(next).toHaveCount(0);
    if (!count)
      await expect(app.card()).toContainText("No findings in this generation");
    await app.safety();
  });

test("L: invalid partial structured output is not a completed history version", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info),
    card = app.card();
  app.control.invalid = true;
  await card
    .getByRole("button", { name: "Regenerate Consumer Agent", exact: true })
    .click();
  await expect(card.getByRole("alert")).toContainText(
    "invalid structured output",
  );
  expect((await app.read()).runs[0].versions).toEqual(
    app.state.runs[0].versions,
  );
  await expect(card.locator(".v2-agent-status")).toContainText(
    "Needs Attention",
  );
  app.control.invalid = false;
  await card
    .getByRole("button", { name: "Retry Consumer Agent", exact: true })
    .click();
  await expect
    .poll(async () => (await app.read()).runs[0].versions.length)
    .toBe(6);
  await app.safety();
});
test("J: separate Xfinity Pro campaign restores only its own findings and histories", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info, {
    file: "xfinity_pro_source_text.txt",
    conversations: true,
  });
  await expect(page.locator(".v2-agent-grid")).not.toContainText(
    "Mover retention",
  );
  await app.nav("Input Pack").click();
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue(
    app.pack.campaignName,
  );
  await app.nav("Insight Discovery").click();
  expect(
    (await app.read()).runs[0].versions[0].inputPackSnapshot?.campaignName,
  ).toBe(app.pack.campaignName);
  expect(app.requests).toHaveLength(0);
  await app.screenshot("pro-restored");
  await app.safety();
});

test("I/H: compare, save and set aside use distinct exact references; Working Space retains attribution and restores aside findings", async ({
  page,
  context,
}, info) => {
  const app = await openFixture(page, context, info),
    consumer = app.card(),
    culture = app.card("Culture Agent");
  await consumer.getByLabel("Compare", { exact: true }).check();
  await culture.getByLabel("Compare", { exact: true }).check();
  expect((await app.read()).savedFindingIds).toEqual([]);
  expect((await app.read()).selectedFindingIds).toHaveLength(2);
  await consumer
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .click();
  const original = structuredClone((await app.read()).runs),
    ref = discoveryFindingRef(app.state.runs[0].versions[0].findings[0]);
  await consumer.locator(".v2-evidence > summary").click();
  await consumer
    .getByRole("button", { name: "Set aside this finding", exact: true })
    .click();
  expect((await app.read()).asideFindingIds).toEqual([ref]);
  expect((await app.read()).savedFindingIds).toEqual([ref]);
  expect((await app.read()).runs).toEqual(original);
  await page.getByRole("button", { name: /^Open Working Space/ }).click();
  const space = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await expect(space.locator(".ws-findings").first()).toContainText("Consumer");
  await expect(space.locator(".ws-findings").first()).toContainText("V4");
  await space.locator(".ws-findings").first().scrollIntoViewIfNeeded();
  await space
    .locator(".ws-findings")
    .first()
    .screenshot({
      path: info.outputPath("saved-source-attribution.png"),
    });
  await space.getByText("Set aside findings · 1", { exact: true }).click();
  await space
    .getByRole("button", { name: "Restore finding", exact: true })
    .click();
  expect((await app.read()).asideFindingIds).toEqual([]);
  expect((await app.read()).runs).toEqual(original);
  await app.safety();
});
