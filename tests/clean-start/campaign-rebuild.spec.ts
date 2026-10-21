import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateMock } from "../../lib/ai/mock-provider";
import { requestSchema } from "../../lib/ai/schemas";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
  campaignStorageKey,
} from "../../lib/discovery-persistence";
import {
  studioPack,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../../lib/discovery-studio";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import type { DiscoveryState } from "../../lib/types";

test("confirmed builds are atomic, campaign-scoped, recoverable, and reject old asynchronous replies across reload", async ({
  page,
  context,
}, info) => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  const origin = new URL(info.project.use.baseURL!).origin;
  const calls: string[] = [],
    errors: string[] = [];
  let failResearch = false,
    holdReply = false,
    delivered = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === origin &&
      url.pathname === "/api/ai/agent" &&
      request.method() === "POST"
    ) {
      const input = requestSchema.parse(request.postDataJSON());
      calls.push(input.agentType);
      if (failResearch && input.agentType === "research")
        return route.fulfill({
          status: 503,
          json: { error: "Controlled offline Data Agent failure" },
        });
      const response = {
        provider: "mock",
        generatedAt: new Date().toISOString(),
        data: await generateMock(input),
      };
      if (holdReply && input.agentType === "discovery") {
        await gate;
        await route.fulfill({ json: response }).catch(() => {}); // The replaced feature may already have aborted this request.
        delivered = true;
        return;
      }
      return route.fulfill({ json: response });
    }
    if (
      url.origin === origin &&
      request.method() === "GET" &&
      (url.pathname === "/" ||
        url.pathname.startsWith("/_next/static/") ||
        url.pathname === "/favicon.ico")
    )
      return route.continue();
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
  const session = async () =>
    compactParse(
      (await page.evaluate(
        (key) => sessionStorage.getItem(key),
        studioStorageKey,
      ))!,
    ) as DiscoveryStudioSession;
  const state = async () => {
    const key = discoveryStorageKey(studioPack(await session()));
    return compactParse(
      (await page.evaluate((key) => sessionStorage.getItem(key), key))!,
    ) as DiscoveryState;
  };
  const nav = (name: string) =>
    page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name, exact: true });
  const build = async (accept = true) => {
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(
        "All three preparation agents will run again",
      );
      expect(dialog.message()).toContain("confirmations");
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
  };
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const brief = page.getByLabel("IMC output brief", { exact: true });
  await expect(brief).toHaveValue("", { timeout: 30000 });
  const source = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/movers_source_text.txt",
    ),
    "utf8",
  );
  await brief.fill(source);
  await build();
  await expect(page.getByText(/Ready · V0/, { exact: true })).toHaveCount(3);
  await page
    .getByLabel("Include this proposal in the Dynamic Input Pack", {
      exact: false,
    })
    .check();
  await page
    .locator(".studio-data-choice")
    .filter({ hasText: "OBJECTIVES" })
    .getByRole("checkbox")
    .check();
  await page.locator(".spark-choice input[type=checkbox]").first().check();
  await nav("Insight Discovery").click();
  await page
    .getByLabel("What should we investigate?", { exact: true })
    .fill(
      "What barriers may prevent movers from transferring their internet service?",
    );
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).runs.filter((run) => run.status === "complete").length,
    )
    .toBe(5);
  await page
    .getByRole("button", {
      name: "Save as a creative consideration",
      exact: true,
    })
    .first()
    .click();
  await page.getByLabel("Compare", { exact: true }).first().check();
  await nav("Finalize Strategy").click();
  await page
    .getByLabel("Brief line", { exact: true })
    .fill("Exact saved human strategy before rebuilding.");
  await page
    .getByRole("button", { name: "Save Draft", exact: true })
    .first()
    .click();
  await nav("Input Pack").click();
  const oldSession = await session(),
    oldState = await state(),
    oldCalls = calls.length;
  const oldKey = discoveryStorageKey(studioPack(oldSession)),
    base = campaignStorageKey(studioPack(oldSession));
  const otherKey = discoveryStorageKey(
    studioPack(phase1Fixture("xfinity_pro_source_text.txt").session),
  );
  const otherRaw = compactStringify({
    notes: "Unrelated Xfinity Pro draft must remain exact",
  });
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), {
    key: otherKey,
    raw: otherRaw,
  });
  await build(false);
  expect(calls).toHaveLength(oldCalls);
  expect(await session()).toEqual(oldSession);
  expect(await state()).toEqual(oldState);
  failResearch = true;
  await build();
  await expect(
    page.locator(".discovery-inputs p.error[role=alert]"),
  ).toContainText("previous workspace unchanged");
  expect(calls.length - oldCalls).toBe(3);
  expect(await session()).toEqual(oldSession);
  expect(await state()).toEqual(oldState);
  failResearch = false;
  await page.evaluate(() => {
    const globals = window as typeof window & {
      rebuildOpen?: IDBFactory["open"];
    };
    globals.rebuildOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => {
      throw Error("Controlled offline storage failure");
    };
  });
  await build();
  await expect(
    page.locator(".discovery-inputs p.error[role=alert]"),
  ).toContainText("could not be saved atomically");
  expect(await session()).toEqual(oldSession);
  expect(await state()).toEqual(oldState);
  await page.reload(); // Also restores the native IndexedDB function.
  await expect(
    page.getByLabel("IMC output brief", { exact: true }),
  ).toHaveValue(source);
  expect((await state()).humanBriefLine).toBe(oldState.humanBriefLine);
  // Abort after the first put has been queued. IndexedDB must roll back
  // both the replacement session and all cursor deletions, not just fail
  // before the transaction begins.
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let puts = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "entries" && ++puts === 2)
        throw new DOMException(
          "Controlled second-write failure",
          "QuotaExceededError",
        );
      return originalPut.apply(this, args);
    };
  });
  await build();
  await expect(
    page.locator(".discovery-inputs p.error[role=alert]"),
  ).toContainText("could not be saved atomically");
  expect(await session()).toEqual(oldSession);
  expect(await state()).toEqual(oldState);
  await page.reload();
  await expect(
    page.getByLabel("IMC output brief", { exact: true }),
  ).toHaveValue(source);
  expect((await state()).humanBriefLine).toBe(oldState.humanBriefLine);
  await nav("Insight Discovery").click();
  holdReply = true;
  const consumer = page.locator(".v2-agent-grid > article").filter({
    has: page.getByRole("heading", { name: "Consumer Agent", exact: true }),
  });
  await consumer
    .getByLabel("Your message to Consumer Agent", { exact: true })
    .fill("What evidence supports this interpretation?");
  const beforeReply = calls.length;
  await consumer
    .getByRole("button", { name: "Ask this agent", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(beforeReply + 1);
  await nav("Input Pack").click();
  await build();
  await expect
    .poll(async () => (await session()).workspaceBuildId)
    .not.toBe(oldSession.workspaceBuildId);
  const freshSession = await session(),
    freshState = await state();
  expect(freshSession.packHistory).toEqual([]);
  expect(freshSession.approved).toBeNull();
  expect(freshSession.approvals).toEqual([]);
  expect(freshSession.approvalSnapshots).toEqual({});
  expect(freshSession.briefs).toEqual([]);
  expect(
    freshSession.preparation.outputs.every(
      (output) =>
        output.versions.length === 1 && output.versions[0].number === 1,
    ),
  ).toBe(true);
  expect(freshState.humanBriefLine).toBe("");
  expect(freshState.savedFindingIds).toEqual([]);
  expect(freshState.selectedFindingIds).toEqual([]);
  expect(freshState.fieldVersions ?? {}).toEqual({});
  expect(
    freshState.runs.every((run) => !run.versions.length && !run.thread.length),
  ).toBe(true);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), oldKey),
  ).toBeNull();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), otherKey),
  ).toBe(otherRaw);
  release();
  await expect.poll(() => delivered).toBe(true);
  await page.waitForTimeout(100);
  expect(
    (await state()).runs.every(
      (run) => !run.versions.length && !run.thread.length,
    ),
  ).toBe(true);
  holdReply = false;
  const durableKeys = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open("xc-insight-workspace", 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const request = database
            .transaction("entries", "readonly")
            .objectStore("entries")
            .getAllKeys();
          request.onsuccess = () => {
            database.close();
            resolve(request.result as string[]);
          };
        };
      }),
  );
  expect(
    durableKeys.filter(
      (key) => key === base || key.startsWith(`${base}:build:`),
    ),
  ).toEqual([discoveryStorageKey(studioPack(freshSession))]);
  await page.reload();
  await expect(
    page.getByLabel("IMC output brief", { exact: true }),
  ).toHaveValue(source);
  await nav("Finalize Strategy").click();
  await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue("");
  await nav("Input Pack").click();
  await build();
  await expect
    .poll(async () => (await session()).workspaceBuildId)
    .not.toBe(freshSession.workspaceBuildId);
  expect(
    (await session()).preparation.outputs.every(
      (output) => output.versions.length === 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), otherKey),
  ).toBe(otherRaw);
  const beforeQuota = (await session()).workspaceBuildId;
  await page.evaluate(
    ({ base, studioStorageKey }) => {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (
          key === studioStorageKey ||
          key === base ||
          key.startsWith(`${base}:build:`)
        )
          throw new DOMException(
            "Controlled cache quota failure",
            "QuotaExceededError",
          );
        return originalSet.call(this, key, value);
      };
    },
    { base, studioStorageKey },
  );
  await build();
  const durableBuild = () =>
    page.evaluate(
      (key) =>
        new Promise<string | undefined>((resolve, reject) => {
          const opening = indexedDB.open("xc-insight-workspace", 1);
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const database = opening.result;
            const request = database
              .transaction("entries", "readonly")
              .objectStore("entries")
              .get(key);
            request.onsuccess = () => {
              database.close();
              const raw = JSON.parse(request.result.raw);
              resolve(raw.$value.workspaceBuildId);
            };
          };
        }),
      studioStorageKey,
    );
  await expect.poll(durableBuild).not.toBe(beforeQuota);
  const quotaBuild = await durableBuild();
  await expect(
    page.getByRole("button", { name: "Build Input Pack", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByLabel("IMC output brief", { exact: true }),
  ).toHaveValue(source);
  await nav("Finalize Strategy").click();
  expect((await session()).workspaceBuildId).toBe(quotaBuild);
  await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue("");
  await nav("Input Pack").click();
  const panel = page.getByRole("region", {
    name: "Dynamic Input Pack",
    exact: true,
  });
  await panel.locator("summary").click();
  await expect(panel.locator(".studio-pack-summary > dt")).toHaveText([
    "Campaign",
    "Campaign Objective",
    "Target Audience",
    "JTBD",
    "Reasons to Believe (RTBs)",
    "Data Points & Research",
    "Sparks",
  ]);
  await panel.screenshot({
    path: info.outputPath("rebuilt-seven-field-pack.png"),
  });
  expect(errors).toEqual([]);
});
