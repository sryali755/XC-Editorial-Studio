import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  applyStudioSource,
  emptyStudio,
  packageDiscoveryBrief,
  seedStudioDiscovery,
  studioPack,
  studioStorageKey,
  studioStrategySession,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import { approveDiscoveryCanvas } from "../lib/discovery-handoff";
import { briefFilename } from "../lib/brief-document";
import type { DiscoveryState, GeneratedBrief } from "../lib/types";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

const titles = [
  "Movers - Campaign Extensions Refresh Brief",
  "Xfinity Pro - Campaign Extensions",
];
const pdf = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const errors = new WeakMap<Page, string[]>();
const posts = new WeakMap<Page, Record<string, unknown>[]>();
test.beforeEach(async ({ page, request }) => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  errors.set(page, []);
  posts.set(page, []);
  page.on("pageerror", (e) => errors.get(page)!.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/net::ERR_FAILED|Failed to load resource/.test(message.text())
    )
      errors.get(page)!.push(message.text());
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/ai/agent"))
      posts.get(page)!.push(req.postDataJSON());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      if (url.hostname !== "fonts.googleapis.com")
        errors.get(page)!.push(`Unexpected external host: ${url.hostname}`);
      await route.abort();
    } else await route.continue();
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const go = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name, exact: true })
    .click();
async function session(page: Page) {
  return compactParse(
    (await page.evaluate(
      (key) => sessionStorage.getItem(key),
      studioStorageKey,
    ))!,
  ) as DiscoveryStudioSession;
}
async function state(page: Page) {
  return compactParse(
    (await page.evaluate(
      (key) => sessionStorage.getItem(key),
      discoveryStorageKey(studioPack(await session(page))),
    ))!,
  ) as DiscoveryState;
}
async function build(page: Page) {
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60000 },
  );
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(name + "-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(name + "-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function exports(page: Page, brief: GeneratedBrief, info: TestInfo) {
  await page.locator(".brief-export-menu summary").click();
  const count = posts.get(page)!.length;
  for (const extension of ["pdf", "docx"] as const) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: extension === "pdf" ? "Download PDF" : "Download Word",
        exact: true,
      })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      briefFilename(brief.campaign, extension),
    );
    const file = info.outputPath(`campaign-brief.${extension}`);
    await download.saveAs(file);
    const bytes = await readFile(file);
    let text = "";
    if (extension === "pdf") {
      const task = getDocument({ data: new Uint8Array(bytes) }),
        doc = await task.promise;
      for (let number = 1; number <= doc.numPages; number++) {
        const content = await (await doc.getPage(number)).getTextContent();
        const pageHeight = (await doc.getPage(number)).getViewport({
          scale: 1,
        }).height;
        text +=
          content.items
            .flatMap((item) =>
              "str" in item &&
              item.transform[5] > 50 &&
              item.transform[5] < pageHeight - 50
                ? [item.str]
                : [],
            )
            .join(" ") + "\n";
      }
      await task.destroy();
    } else {
      const zip = unzipSync(new Uint8Array(bytes));
      const xml = strFromU8(zip["word/document.xml"]);
      text = await page.evaluate((xml) => {
        const document = new DOMParser().parseFromString(
          xml,
          "application/xml",
        );
        if (document.querySelector("parsererror"))
          throw new Error("Malformed Word export");
        return [...document.getElementsByTagName("w:t")]
          .map((node) => node.textContent)
          .join(" ");
      }, xml);
    }
    expect(text).toContain(brief.campaign);
    const normalized = (value: string) =>
      value.replace(/[\s\u200B\uFEFF]/g, "");
    for (const section of brief.sections)
      expect(normalized(text), `${extension}: ${section.title}`).toContain(
        normalized(section.content || "Not supplied."),
      );
    if (titles.includes(brief.campaign))
      expect(text).not.toContain(titles[1 - titles.indexOf(brief.campaign)]);
    await info.attach(extension, {
      path: file,
      contentType:
        extension === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }
  expect(posts.get(page)!.length).toBe(count);
}

for (const [index, title] of titles.entries())
  test(`continuous real PDF journey and identity through all four tabs/exports: ${title}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
    await expect(
      page.getByRole("textbox", { name: "IMC output brief" }),
    ).toHaveValue(/## Source page 12/, { timeout: 30000 });
    const picker = page.getByRole("combobox", {
      name: "Campaign in this document",
    });
    expect(await picker.inputValue()).toBe("");
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect(page.locator(".studio-brief-step [role=alert]")).toContainText(
      "Select one campaign",
    );
    expect(posts.get(page)).toHaveLength(0);
    const id = await picker
      .locator("option")
      .filter({ hasText: title })
      .getAttribute("value");
    await picker.selectOption(id!);
    await build(page);
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav.getByRole("button")).toHaveCount(4);
    for (const [i, label] of [
      "Input Pack",
      "Insight Discovery",
      "Finalize Strategy",
      "XC Brief",
    ].entries())
      await expect(nav.getByRole("button").nth(i)).toHaveAccessibleName(label);
    await expect(page.getByTestId("campaign-identity")).toContainText(title);
    await page
      .getByText("View full selected context and source status")
      .click();
    await expect(page.locator(".studio-pack-summary")).toContainText(title);
    const original = studioPack(await session(page));
    expect(original.campaignIdentity?.origin).toBe("source");
    expect(original.rtbApprovalStatus).toBe("unknown");
    expect(original.originalJTBD).toBe("");
    expect(
      original.sourceAvailability!.filter((s) => s.status === "not_connected"),
    ).toHaveLength(6);
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
    for (const spark of (await session(page)).preparation.outputs.find(
      (o) => o.agentId === "sparks",
    )!.versions[0].sparks) {
      expect(spark.excerpt_verified).toBe(true);
      expect(original.parsedIMC!.sourceText).toContain(spark.excerpt!);
    }
    await capture(page, info, "01-input-pack");
    await page
      .getByRole("button", { name: "Next: Insight Discovery", exact: true })
      .click();
    const question = `What evidence is still missing for ${title}?`;
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    expect(posts.get(page)).toHaveLength(3);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    for (const status of await page.locator(".v2-agent-status").all())
      await expect(status).toHaveText(/V0 · (Insights Ready)/, {
        timeout: 60000,
      });
    const calls = posts
      .get(page)!
      .filter((r) => r.agentType === "discovery") as {
      context: {
        lens: string;
        question: string;
        foundation: {
          campaignContext: { campaignName: string };
          sourceBrief: string;
        };
      };
    }[];
    expect(calls).toHaveLength(5);
    expect(new Set(calls.map((r) => r.context.lens)).size).toBe(5);
    for (const call of calls) {
      expect(call.context.question).toBe(question);
      expect(call.context.foundation.campaignContext.campaignName).toBe(title);
      expect(call.context.foundation.sourceBrief).toBe(
        original.parsedIMC!.sourceText,
      );
    }
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    await consumer
      .getByRole("textbox", { name: "Your message to Consumer Agent" })
      .fill("Challenge that interpretation. What would disprove it?");
    await consumer
      .getByRole("button", { name: "Ask this agent", exact: true })
      .click();
    await expect(
      consumer.locator(".v2-conversation .v2-message.agent"),
    ).toHaveCount(1, { timeout: 60000 });
    await consumer
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    await capture(page, info, "02-discovery");
    await page.getByRole("button", { name: /^Open Working Space/ }).click();
    const drawer = page.getByRole("dialog", {
      name: "Working Space",
      exact: true,
    });
    await expect(drawer.locator(".ws-campaign")).toHaveText(title);
    const approvedLine = `Kevin QA ${index}: preserve this exact approved human strategy.`;
    const line = drawer.getByRole("textbox", {
      name: "Brief line",
      exact: true,
    });
    await line.fill(approvedLine);
    await drawer
      .getByRole("button", { name: "Save Draft", exact: true })
      .click();
    const first = (await state(page)).fieldVersions!.humanBriefLine![0];
    await line.fill(`Second draft ${index}`);
    await drawer
      .getByRole("button", { name: "Save Draft", exact: true })
      .click();
    await line.locator("..").getByText("History · 2", { exact: true }).click();
    await line
      .locator("..")
      .getByRole("button", {
        name: `Use version ${first.number} of Brief line`,
        exact: true,
      })
      .click();
    await expect(line).toHaveValue(approvedLine);
    await page.screenshot({
      path: info.outputPath("03-working-space-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await page.screenshot({
      path: info.outputPath("03-working-space-mobile.png"),
    });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await go(page, "Finalize Strategy");
    await expect(
      page
        .getByRole("region", { name: "Full-width Working Space" })
        .getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(approvedLine);
    expect(
      Object.keys((await state(page)).workspaceSuggestionContext!.fields),
    ).toHaveLength(13);
    expect((await state(page)).savedFindingIds).toHaveLength(1);
    await page.reload();
    await expect(page.locator(".studio-header")).toContainText(title);
    await expect(
      page.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(approvedLine);
    await page
      .getByRole("button", { name: "Confirm current strategy", exact: true })
      .click();
    await capture(page, info, "04-finalize-strategy");
    await page
      .getByRole("button", { name: "Generate XC Brief", exact: true })
      .click();
    const created = await session(page),
      brief = created.briefs[0];
    expect(brief.campaign).toBe(title);
    expect(created.approved!.strategyInputPack.campaignName).toBe(title);
    await expect(page.locator(".brief-paper")).toContainText(title);
    await expect(page.locator(".brief-paper h1")).toHaveText(approvedLine);
    await capture(page, info, "05-xc-brief");
    await exports(page, brief, info);
    await page.emulateMedia({ media: "print" });
    await expect(nav).not.toBeVisible();
    const printBytes = await page.pdf({
      path: info.outputPath("print.pdf"),
      format: "Letter",
      printBackground: true,
    });
    const printed = getDocument({ data: new Uint8Array(printBytes) }),
      printDocument = await printed.promise;
    const pages: string[] = [];
    for (let i = 1; i <= printDocument.numPages; i++) {
      const content = await (await printDocument.getPage(i)).getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" ")
          .replace(/\s/g, ""),
      );
    }
    const heading = "Saved discoveries — worth considering, not verification";
    const pageWithHeading = pages.findIndex((text) =>
      text.includes(heading.replace(/\s/g, "")),
    );
    expect(pageWithHeading).toBeGreaterThanOrEqual(0);
    expect(pages[pageWithHeading]).toContain(
      brief.sections
        .find((section) => section.title === heading)!
        .content.split("\n")[0]
        .replace(/\s/g, ""),
    );
    await printed.destroy();
  });

test("missing/placeholder identity requires explicit human confirmation and survives approval/export/reload", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const source =
    "Campaign: None\nBusiness objective: Retain customers during a move.\nAudience: Existing customers.\nReason to believe: Supplied proof, not approved.";
  await page.goto("/");
  await page.getByRole("textbox", { name: "IMC output brief" }).fill(source);
  await build(page);
  await go(page, "Finalize Strategy");
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("Kevin's exact human strategy.");
  await expect(
    page.getByRole("button", { name: "Confirm current strategy", exact: true }),
  ).toBeDisabled();
  await go(page, "Input Pack");
  const name = "Kevin’s move review — October 2026";
  await page
    .getByLabel("Campaign name — human confirmation required")
    .fill(name);
  await page
    .getByRole("button", { name: "Confirm campaign name", exact: true })
    .click();
  await expect(page.getByTestId("campaign-identity")).toContainText(
    "Human-confirmed; not source-extracted",
  );
  expect((await session(page)).preparation.sourceSnapshot).toBe(source);
  await page.reload();
  await expect(page.locator(".studio-header")).toContainText(name);
  await go(page, "Finalize Strategy");
  await page
    .getByRole("button", { name: "Confirm current strategy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  const brief = (await session(page)).briefs[0];
  expect(brief.campaign).toBe(name);
  expect(
    brief.sections.find((section) => section.title === "Context")!.content,
  ).toBe(name);
  await exports(page, brief, info);
});

test("pasted supplied titles and multiple campaigns require a deliberate source choice", async ({
  page,
}) => {
  const source =
    "Campaign title: Bright Days — Autumn 2026\nBusiness Objective: Retention.\nAudience: Existing customers.\nReason to believe: Supplied proof.";
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief" })
    .fill(
      source +
        "\n\nCampaign title: New Horizons\nBusiness Objective: Consideration.\nAudience: Prospects.\nReason to believe: Different supplied proof.",
    );
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-brief-step [role=alert]")).toContainText(
    "Select one campaign",
  );
  expect(posts.get(page)).toHaveLength(0);
  const picker = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  await picker.selectOption({ index: 2 });
  await build(page);
  await expect(page.getByTestId("campaign-identity")).toContainText(
    "New Horizons",
  );
  expect(studioPack(await session(page)).parsedIMC!.sourceText).not.toContain(
    "Bright Days",
  );
  await picker.selectOption({ index: 1 });
  await build(page);
  await expect(page.getByTestId("campaign-identity")).toContainText(
    "Bright Days — Autumn 2026",
  );
  await page.reload();
  await expect(page.locator(".studio-header")).toContainText(
    "Bright Days — Autumn 2026",
  );
});

test("pending preparation locks rebuilding while a different campaign draft is staged", async ({
  page,
}) => {
  test.setTimeout(120000);
  let release: (() => void) | undefined;
  const old =
    "Campaign: Bright Days\nBusiness Objective: Retention.\nAudience: Existing customers.\nReason to believe: Supplied original proof.";
  const next =
    "Campaign: New Horizons\nBusiness Objective: Consideration.\nAudience: Prospects.\nReason to believe: Different supplied proof.";
  await page.route("**/api/ai/agent", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().agentType === "rtb" &&
      request.postDataJSON().context.parsedIMC.sourceText === old
    ) {
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response });
    } else await route.fallback();
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "IMC output brief" }).fill(old);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect.poll(() => !!release).toBe(true);
  await go(page, "Insight Discovery");
  await go(page, "Input Pack");
  await page.getByRole("textbox", { name: "IMC output brief" }).fill(next);
  await expect(
    page.getByRole("button", { name: "Build Input Pack", exact: true }),
  ).toBeDisabled();
  expect((await session(page)).preparation.sourceSnapshot).toBe(old);
  const done = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().postDataJSON().agentType === "rtb" &&
      response.request().postDataJSON().context.parsedIMC.sourceText === old,
  );
  release!();
  await done;
  await expect.poll(() => posts.get(page)!.length).toBe(3);
  await expect(
    page.getByRole("button", { name: "Build Input Pack", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(next);
  await build(page);
  expect(studioPack(await session(page)).campaignName).toBe("New Horizons");
  for (const output of (await session(page)).preparation.outputs)
    expect(
      output.versions.find((v) => v.id === output.currentVersionId)
        ?.sourceBrief,
    ).toBe(next);
});

test("an old unnamed saved report is preserved but requires reviewed regeneration before export", async ({
  page,
}) => {
  const saved = applyStudioSource(
    emptyStudio(),
    "Campaign title: Bright Days\nBusiness Objective: Retention.\nAudience: Existing customers.\nReason to believe: Supplied proof.",
  );
  const pack = studioPack(saved),
    draft = seedStudioDiscovery(pack);
  const approved = approveDiscoveryCanvas(
    studioStrategySession(saved, draft),
    pack,
    draft,
    "Kevin's old approved strategy",
  ).approved!;
  const historical = packageDiscoveryBrief(approved, draft);
  historical.campaign = "None";
  saved.approved = approved;
  saved.approvals = [approved];
  saved.approvalSnapshots = { [approved.approvedAt]: draft };
  saved.briefs = [historical];
  saved.screen = "brief";
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    },
    { key: studioStorageKey, value: compactStringify(saved) },
  );
  await page.goto("/");
  await expect(page.locator(".brief-download-error")).toContainText(
    "saved historical brief has unresolved campaign identity",
  );
  await page.locator(".brief-export-menu summary").click();
  for (const name of ["Download PDF", "Download Word", "Print / Save PDF"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  expect((await session(page)).briefs[0]).toEqual(historical);
  await expect(page.locator(".studio-header")).toContainText("Bright Days");
  expect(posts.get(page)).toHaveLength(0);
});

test("rapid selections, duplicate clicks, Talk to All and browser back/forward preserve current campaign state", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief" })
    .fill(mobileIMCBrief);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click({ clickCount: 2 });
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60000 },
  );
  expect(posts.get(page)).toHaveLength(3);
  const sparks = page
    .getByRole("article", { name: "Evidence-led Sparks" })
    .locator(".spark-choice");
  await sparks.nth(0).getByRole("checkbox").check();
  await sparks.nth(1).getByRole("checkbox").check();
  await sparks.nth(0).getByRole("checkbox").uncheck();
  await page
    .locator(".studio-data-choice")
    .nth(0)
    .getByRole("checkbox")
    .check();
  await page
    .locator(".studio-data-choice")
    .nth(1)
    .getByRole("checkbox")
    .check();
  await page
    .locator(".studio-data-choice")
    .nth(0)
    .getByRole("checkbox")
    .uncheck();
  const pack = studioPack(await session(page));
  expect(pack.selectedSparks).toHaveLength(1);
  expect(pack.selectedResearch).toHaveLength(1);
  await go(page, "Insight Discovery");
  const question = "What evidence supports this audience decision?";
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill(question);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click({ clickCount: 2 });
  for (const status of await page.locator(".v2-agent-status").all())
    await expect(status).toHaveText(/V0 · (Insights Ready)/, {
      timeout: 60000,
    });
  expect(
    posts.get(page)!.filter((request) => request.agentType === "discovery"),
  ).toHaveLength(5);
  const nextQuestion =
    "Which supplied assumptions would contrary evidence challenge?";
  await page
    .getByLabel("Talk to all agents", { exact: true })
    .fill(nextQuestion);
  await page
    .getByRole("button", { name: "Send to all & regenerate", exact: true })
    .click();
  for (const status of await page.locator(".v2-agent-status").all())
    await expect(status).toHaveText(/V1 · (Insights Ready)/, {
      timeout: 60000,
    });
  const calls = posts
    .get(page)!
    .filter((request) => request.agentType === "discovery") as {
    context: {
      question: string;
      foundation: {
        campaignContext: { campaignName: string };
        selectedSparks: unknown[];
        selectedResearch: unknown[];
      };
    };
  }[];
  expect(calls).toHaveLength(10);
  for (const request of calls.slice(5)) {
    expect(request.context.question).toBe(nextQuestion);
    expect(request.context.foundation.campaignContext.campaignName).toBe(
      pack.campaignName,
    );
    expect(request.context.foundation.selectedSparks).toHaveLength(1);
    expect(request.context.foundation.selectedResearch).toHaveLength(1);
  }
  await go(page, "Finalize Strategy");
  const line =
    "Kevin: preserve this draft through actual browser history navigation.";
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(line);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.goto("/?qa-history=1");
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(line);
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(line);
  await page.goForward();
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(line);
  expect(studioPack(await session(page))).toEqual(pack);
  expect((await state(page)).question).toBe(nextQuestion);
});
