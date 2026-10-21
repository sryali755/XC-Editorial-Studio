import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateMock } from "../../lib/ai/mock-provider";
import { requestSchema } from "../../lib/ai/schemas";
import {
  compactParse,
  discoveryStorageKey,
} from "../../lib/discovery-persistence";
import {
  studioPack,
  type DiscoveryStudioSession,
} from "../../lib/discovery-studio";
import type { DiscoveryState } from "../../lib/types";

for (const width of [1440, 768, 390]) {
  test(`refresh restores saved work without generation ${width}`, async ({
    page,
    context,
  }, info) => {
    expect(process.env.AI_MODE).toBe("mock");
    expect(process.env.OPENAI_API_KEY).toBe("");
    expect(process.env.XC_OFFLINE_TEST).toBe("1");
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const origin = new URL(info.project.use.baseURL!).origin;
    const errors: string[] = [],
      denied: string[] = [],
      mockCalls: string[] = [];
    context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (dialog) => dialog.accept());
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin === origin &&
        url.pathname === "/api/ai/agent" &&
        request.method() === "POST"
      ) {
        const input = requestSchema.parse(request.postDataJSON());
        mockCalls.push(input.agentType);
        return route.fulfill({
          json: {
            provider: "mock",
            generatedAt: new Date().toISOString(),
            data: await generateMock(input),
          },
        });
      }
      if (
        url.origin === origin &&
        request.method() === "GET" &&
        (url.pathname === "/" ||
          url.pathname.startsWith("/_next/static/") ||
          url.pathname === "/favicon.ico")
      )
        return route.continue();
      denied.push(`${request.method()} ${url.origin}${url.pathname}`);
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
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue("", { timeout: 30000 });
    await expect(
      page.getByText("Build Input Pack to populate this agent.", {
        exact: false,
      }),
    ).toHaveCount(3);
    expect(mockCalls).toEqual([]);
    const source = readFileSync(
      path.join(
        __dirname,
        "../fixtures/client-input-pack/movers_source_text.txt",
      ),
      "utf8",
    );
    await page.getByLabel("IMC output brief", { exact: true }).fill(source);
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect.poll(() => mockCalls.length).toBe(3);
    await expect(page.locator(".studio-agent-status")).toHaveText([
      /Ready.*V0/,
      /Ready.*V0/,
      /Ready.*V0/,
    ]);
    const packPanel = page.getByRole("region", {
      name: "Dynamic Input Pack",
      exact: true,
    });
    await packPanel.locator(".studio-pack-details > summary").click();
    await expect(
      packPanel.locator(
        ".dynamic-pack-details > section:first-child > .studio-pack-summary > dt",
      ),
    ).toHaveText([
      "Campaign",
      "Campaign Objective",
      "Target Audience",
      "JTBD",
      "Reasons to Believe (RTBs)",
      "Data Points & Research",
      "Sparks",
    ]);
    await expect(
      packPanel.locator('[aria-label="Saved Round Table Insights"]'),
    ).toHaveCount(0);
    await expect(packPanel).not.toContainText(
      "Not explicitly supplied in the brief.",
    );
    await expect(packPanel).not.toContainText("Selected XC RTB adaptation");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await packPanel.screenshot({
      path: info.outputPath("seven-field-dynamic-pack.png"),
    });
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
    await page.locator(".spark-choice input[type=checkbox]").nth(0).check();
    await page.locator(".spark-choice input[type=checkbox]").nth(1).check();
    await expect(packPanel.locator(".studio-pack-tiles strong")).toHaveText([
      "Selected",
      "2 available",
      "1 selected",
      "2 selected",
    ]);
    await expect(packPanel.locator(".studio-pack-research-item")).toContainText(
      "not independent research",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await packPanel.screenshot({
      path: info.outputPath("seven-field-selected-context.png"),
    });
    const nav = (label: string) =>
      page
        .getByRole("navigation", { name: "Workspace" })
        .getByRole("button", { name: label, exact: true });
    await nav("Insight Discovery").click();
    await page
      .getByLabel("What should we investigate?", { exact: true })
      .fill(
        "What barriers may prevent movers from transferring their internet service?",
      );
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    const current = async () => {
      const saved = compactParse(
        (await page.evaluate(() =>
          sessionStorage.getItem("xc-insight-studio-v1"),
        ))!,
      ) as DiscoveryStudioSession;
      const key = discoveryStorageKey(studioPack(saved));
      return compactParse(
        (await page.evaluate((key) => sessionStorage.getItem(key), key))!,
      ) as DiscoveryState;
    };
    await expect
      .poll(
        async () =>
          (await current()).runs.filter((run) => run.status === "complete")
            .length,
      )
      .toBe(5);
    await expect(page.locator(".v2-finding-actions")).toHaveCount(5);
    await expect(
      page.locator('[aria-label="Saved Round Table Insights"]'),
    ).toHaveCount(0);
    for (const actions of await page.locator(".v2-finding-actions").all()) {
      await expect(actions.getByRole("button")).toHaveCount(1);
      await expect(actions).not.toContainText("Discuss");
    }
    await page
      .getByRole("button", {
        name: "Save as a creative consideration",
        exact: true,
      })
      .first()
      .click();
    const savedInsightSection = page.locator(
      '.v2-pack-content [aria-label="Saved Round Table Insights"]',
    );
    await expect(savedInsightSection).toHaveCount(1);
    await expect(
      savedInsightSection.locator(".dynamic-pack-agent-group"),
    ).toHaveCount(1);
    await expect(savedInsightSection).toContainText("1 saved finding");
    await nav("Finalize Strategy").click();
    for (const section of [
      "Supporting Strategy Context",
      "Selected Sparks",
      "Private Notes",
      "Version History",
      "Compare selected findings",
      "Additional Strategy Details",
      "From the IMC brief",
    ]) {
      await expect(
        page.locator(".working-space summary").filter({ hasText: section }),
      ).toHaveCount(0);
    }
    for (const field of [
      "Problem",
      "Insight",
      "Audience",
      "Job to Be Done",
      "Proof / RTB",
      "Strategic Direction",
    ]) {
      await expect(
        page.locator(".working-space").getByText(field, { exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue(
      "",
    );
    const canvas = page.locator(".working-space .ws-thinking");
    await expect(
      canvas.getByRole("heading", { name: "Strategy Canvas", exact: true }),
    ).toBeVisible();
    await expect(canvas.locator(":scope > .ws-hint")).toHaveCount(2);
    const insight = page.getByLabel("Insight", { exact: true });
    const originalInsight = await insight.inputValue();
    await insight.fill("");
    await expect(
      canvas.getByRole("button", {
        name: "Fill missing suggestions",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      canvas.locator(".ws-missing-suggestions, .ws-suggestion-preview"),
    ).toHaveCount(0);
    const headerEdges = await canvas.evaluate((element) =>
      Array.from(
        element.querySelectorAll(
          ":scope > #ws-thinking-title, :scope > .ws-hint",
        ),
        (node) =>
          node.getBoundingClientRect().left +
          parseFloat(getComputedStyle(node).paddingLeft),
      ),
    );
    expect(headerEdges).toHaveLength(3);
    for (const left of headerEdges)
      expect(Math.abs(left - headerEdges[0])).toBeLessThan(1);
    await canvas.screenshot({
      path: info.outputPath("canvas-heading-no-suggestion-button.png"),
    });
    await insight.fill(originalInsight);
    await page
      .getByLabel("Brief line", { exact: true })
      .fill("My exact human-owned current-session strategy.");
    await page
      .getByRole("button", { name: "Save Draft", exact: true })
      .first()
      .click();
    await nav("Insight Discovery").click();
    const beforeConversations = await current();
    for (const name of [
      "Consumer Agent",
      "Culture Agent",
      "Category Agent",
      "Brand Agent",
      "Analogous Solutions Agent",
    ]) {
      const card = page
        .locator(".v2-agent-grid > article")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
      await card
        .getByLabel(`Your message to ${name}`, { exact: true })
        .fill(`What evidence supports this ${name} interpretation?`);
      await card
        .getByRole("button", { name: "Ask this agent", exact: true })
        .click();
      const lensId = name.startsWith("Analogous")
        ? "analogous"
        : name.split(" ")[0].toLowerCase();
      await expect
        .poll(
          async () =>
            (await current()).runs
              .find((run) => run.lensId === lensId)!
              .thread.filter((item) => item.author === "Agent").length,
        )
        .toBe(1);
      const original = structuredClone(
        (await current()).runs.find((run) => run.lensId === lensId)!.thread,
      );
      if (
        (await card
          .locator(".v2-conversation-history")
          .getAttribute("open")) === null
      )
        await card.locator(".v2-conversation-history > summary").click();
      if (
        (await card
          .locator(".v2-conversation-turn")
          .first()
          .getAttribute("open")) === null
      )
        await card.locator(".v2-conversation-turn > summary").first().click();
      await card
        .getByRole("button", { name: "Regenerate response", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await current()).runs
              .find((run) => run.lensId === lensId)!
              .thread.filter((item) => item.author === "Agent").length,
        )
        .toBe(2);
      const after = (await current()).runs.find(
        (run) => run.lensId === lensId,
      )!;
      expect(after.thread.slice(0, 2)).toEqual(original);
      expect(after.thread[3].regeneratesTurnId).toBe(original[0].turnId);
      expect(after.versions).toEqual(
        beforeConversations.runs.find((run) => run.lensId === lensId)!.versions,
      );
      await expect(card.locator(".v2-conversation-turn")).toHaveCount(2);
      if (
        (await card
          .locator(".v2-conversation-turn")
          .first()
          .getAttribute("open")) === null
      )
        await card.locator(".v2-conversation-turn > summary").first().click();
      await expect(
        card.getByText(
          "Regenerated response · earlier replies preserved in Conversations.",
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect((await current()).savedFindingIds).toEqual(
      beforeConversations.savedFindingIds,
    );
    expect((await current()).humanBriefLine).toBe(
      beforeConversations.humanBriefLine,
    );
    await page.screenshot({
      path: info.outputPath("regenerated-conversations.png"),
      fullPage: true,
    });
    for (const label of [
      "Insight Discovery",
      "Finalize Strategy",
      "XC Brief",
      "Input Pack",
    ]) {
      await nav(label).click();
      await expect(
        page.getByRole("button", { name: "Reset Workspace", exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue(source);
    await expect(
      page
        .getByRole("region", { name: "Dynamic Input Pack", exact: true })
        .locator('[aria-label="Saved Round Table Insights"]'),
    ).toHaveCount(1);
    await expect(page.getByText(/Ready · V0/, { exact: true })).toHaveCount(3);
    expect(mockCalls.length).toBe(18);
    const preserved = await current();
    expect(preserved.humanBriefLine).toBe(
      "My exact human-owned current-session strategy.",
    );
    expect(preserved.savedFindingIds).toHaveLength(1);
    expect(preserved.runs.every((run) => run.versions.length === 1)).toBe(true);
    await page.screenshot({
      path: info.outputPath("session-preserved.png"),
      fullPage: true,
    });
    const beforeReload = await current();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue(source, { timeout: 30000 });
    await expect(
      page.locator(".studio-agent-status").filter({ hasText: "Saved results" }),
    ).toHaveCount(3);
    await expect(page.getByText(/Saved workspace restored/)).toBeVisible();
    expect(mockCalls).toHaveLength(18);
    await page.screenshot({
      path: info.outputPath("refresh-saved-input-pack.png"),
      fullPage: true,
    });
    await nav("Insight Discovery").click();
    await expect(
      page.locator(".v2-agent-status").filter({ hasText: "Saved results" }),
    ).toHaveCount(5);
    const restored = await current();
    expect(restored.humanBriefLine).toBe(beforeReload.humanBriefLine);
    expect(restored.savedFindingIds).toEqual(beforeReload.savedFindingIds);
    expect(restored.fieldVersions).toEqual(beforeReload.fieldVersions);
    for (const run of restored.runs) {
      const previous = beforeReload.runs.find(
        (item) => item.lensId === run.lensId,
      )!;
      expect(run.versions).toEqual(previous.versions);
      expect(run.thread).toEqual(previous.thread);
    }
    await page.screenshot({
      path: info.outputPath("refresh-saved-roundtable.png"),
      fullPage: true,
    });
    await nav("Finalize Strategy").click();
    await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue(
      beforeReload.humanBriefLine!,
    );
    expect(mockCalls).toHaveLength(18);
    await nav("Input Pack").click();
    const other = readFileSync(
      path.join(
        __dirname,
        "../fixtures/client-input-pack/xfinity_pro_source_text.txt",
      ),
      "utf8",
    );
    await page.getByLabel("IMC output brief", { exact: true }).fill(other);
    await expect(
      page
        .locator(".studio-agent-status")
        .filter({ hasText: "Awaiting Input Pack Generation" }),
    ).toHaveCount(3);
    expect(mockCalls).toHaveLength(18);
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect.poll(() => mockCalls.length).toBe(21);
    await expect(page.getByText(/Ready · V0/, { exact: true })).toHaveCount(3);
    await expect(
      page.locator(".studio-agent-status").filter({ hasText: "Saved results" }),
    ).toHaveCount(0);
    await nav("Insight Discovery").click();
    await expect(page.locator(".v2-agent-status")).toHaveText(
      Array(5).fill("Awaiting Exploration"),
    );
    await expect(page.locator(".v2-finding")).toHaveCount(0);
    await nav("Finalize Strategy").click();
    await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.locator(".saved-findings .count")).toHaveText("0");
    expect(mockCalls).toHaveLength(21);
    await expect(page.locator(".studio-header-pill")).toHaveCount(0);
    await page.evaluate(async () => {
      localStorage.setItem(
        "xc-saved-project-v1:offline-reset",
        "synthetic saved project",
      );
      localStorage.setItem("unrelated-preference", "keep me");
      localStorage.setItem(
        "OPENAI_API_KEY",
        "synthetic unrelated storage value—not a real credential",
      );
      sessionStorage.setItem(
        "xc-strategy-session-v1",
        "synthetic legacy workspace",
      );
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("xc-insight-workspace", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result,
            tx = database.transaction("entries", "readwrite"),
            entries = tx.objectStore("entries");
          entries.put({
            key: "xc-insight-discovery-v2:old-reset",
            raw: "synthetic findings, approvals and histories",
          });
          entries.put({
            key: "xc-insight-studio-v1",
            raw: sessionStorage.getItem("xc-insight-studio-v1")!,
          });
          entries.put({ key: "unrelated-record", raw: "keep me" });
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => {
            database.close();
            reject(tx.error);
          };
        };
      });
    });
    const readBrowserStorage = () =>
      page.evaluate(() => ({
        session: Object.fromEntries(
          Object.keys(sessionStorage)
            .sort()
            .map((key) => [key, sessionStorage.getItem(key)]),
        ),
        local: Object.fromEntries(
          Object.keys(localStorage)
            .sort()
            .map((key) => [key, localStorage.getItem(key)]),
        ),
      }));
    const beforeCancel = await readBrowserStorage();
    const reset = page.getByRole("button", {
      name: "Reset Workspace",
      exact: true,
    });
    await expect(reset).toBeEnabled();
    await reset.click();
    const dialog = page.getByRole("dialog", {
      name: "Reset this workspace?",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(dialog).toContainText("This cannot be undone");
    expect(await readBrowserStorage()).toEqual(beforeCancel);
    await page.screenshot({
      path: info.outputPath("reset-confirmation.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(await readBrowserStorage()).toEqual(beforeCancel);
    await expect(reset).toBeFocused();
    await reset.click();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await readBrowserStorage()).toEqual(beforeCancel);
    await reset.click();
    await page.evaluate(() =>
      Object.defineProperty(indexedDB, "open", {
        configurable: true,
        value: () => {
          throw new Error("Controlled offline storage failure");
        },
      }),
    );
    await dialog
      .getByRole("button", { name: "Clear Workspace", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "could not be fully cleared",
    );
    expect(await readBrowserStorage()).toEqual(beforeCancel);
    expect(mockCalls).toHaveLength(21);
    await page.evaluate(() => {
      Reflect.deleteProperty(indexedDB, "open");
    });
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      dialog
        .getByRole("button", { name: "Clear Workspace", exact: true })
        .click(),
    ]);
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue("", { timeout: 30000 });
    await expect(
      page.getByText("Build Input Pack to populate this agent.", {
        exact: false,
      }),
    ).toHaveCount(3);
    await expect(page.getByText(/Saved workspace restored/)).toHaveCount(0);
    const afterReset = await readBrowserStorage();
    expect(
      Object.keys(afterReset.session).filter((key) => key.startsWith("xc-")),
    ).toEqual([]);
    expect(
      afterReset.local["xc-saved-project-v1:offline-reset"],
    ).toBeUndefined();
    expect(afterReset.local["unrelated-preference"]).toBe("keep me");
    expect(afterReset.local["OPENAI_API_KEY"]).toBe(
      beforeCancel.local["OPENAI_API_KEY"],
    );
    const indexedKeys = await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open("xc-insight-workspace", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("entries", "readonly"),
              all = tx.objectStore("entries").getAllKeys();
            all.onsuccess = () => resolve(all.result as string[]);
            tx.oncomplete = () => db.close();
          };
        }),
    );
    expect(indexedKeys).toEqual(["unrelated-record"]);
    expect(mockCalls).toHaveLength(21);
    await nav("Insight Discovery").click();
    await expect(page.locator(".v2-agent-status")).toHaveText(
      Array(5).fill("Awaiting Exploration"),
    );
    await expect(page.locator(".v2-finding")).toHaveCount(0);
    await nav("Finalize Strategy").click();
    await expect(page.getByLabel("Brief line", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.locator(".saved-findings .count")).toHaveText("0");
    await nav("Input Pack").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue("");
    expect(mockCalls).toHaveLength(21);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("reset-empty-workspace.png"),
      fullPage: true,
    });
    await page.getByLabel("IMC output brief", { exact: true }).fill(source);
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect.poll(() => mockCalls.length).toBe(24);
    await expect(page.getByText(/Ready · V0/, { exact: true })).toHaveCount(3);
    await nav("Input Pack").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByLabel("IMC output brief", { exact: true }),
    ).toHaveValue(source);
    await expect(
      page.locator(".studio-agent-status").filter({ hasText: "Saved results" }),
    ).toHaveCount(3);
    expect(mockCalls).toHaveLength(24);
    expect(errors).toEqual([]);
    expect(
      denied.filter((url) => !url.includes("fonts.googleapis.com")),
    ).toEqual([]);
    await info.attach("offline-audit", {
      body: JSON.stringify({
        mockCalls,
        realAgentRequests: 0,
        requestsOnRefresh: 0,
        errors,
        denied,
      }),
      contentType: "application/json",
    });
  });
}
