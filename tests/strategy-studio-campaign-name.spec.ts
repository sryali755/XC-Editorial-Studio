import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  compactParse,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  studioPack,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import { briefFilename } from "../lib/brief-document";
import type { DiscoveryState } from "../lib/types";

const title = "Black Friday Toolkit";
const revised = "Black Friday Toolkit — Retail Review";
const humanLine =
  "Make Xfinity Mobile feel like a considered choice without treating an offer as proof of premium quality.";
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
const identity = (page: Page) =>
  page.getByRole("region", { name: "Campaign Identity", exact: true });
async function session(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  if (!raw) throw new Error("Session is not persisted");
  return compactParse(raw) as DiscoveryStudioSession;
}
async function discovery(page: Page) {
  const key = discoveryStorageKey(studioPack(await session(page)));
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), key);
  if (!raw) throw new Error("Discovery is not persisted");
  return compactParse(raw) as DiscoveryState;
}
async function build(page: Page) {
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
}
async function go(page: Page, tab: string, name: string) {
  await nav(page).getByRole("button", { name: tab, exact: true }).click();
  await expect(page.locator(".studio-header")).toContainText(name);
}
async function confirmAndPackage(page: Page, name: string) {
  await go(page, "Finalize Strategy", name);
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(humanLine);
  await page
    .getByRole("button", { name: "Confirm current strategy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  await expect(page.locator(".brief-wireframe > header > span")).toHaveText(
    `XC CREATIVE BRIEF · ${name.toUpperCase()}`,
  );
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
    )
      return route.abort();
    return route.continue();
  });
});

test("actual Black Friday Toolkit: confirm, all five agents, rename preservation, four tabs and PDF/DOCX", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const directory = process.env.XC_IMPORT_SAMPLE_DIR;
  test.skip(
    !directory,
    "Set XC_IMPORT_SAMPLE_DIR to the authorized local source directory to test the actual Black Friday PPTX.",
  );
  const calls: AgentRequest[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/ai/agent"))
      calls.push(requestSchema.parse(r.postDataJSON()));
  });
  await page.goto("/");
  await expect(nav(page).getByRole("button")).toHaveCount(4);
  await page
    .getByLabel("Import file for IMC brief")
    .setInputFiles(path.join(directory!, "BLK_FRI.pptx"));
  const draft = page.getByRole("textbox", {
    name: "IMC output brief",
    exact: true,
  });
  await expect(draft).toHaveValue(/## Source slide 14/, { timeout: 30_000 });
  const originalText = await draft.inputValue();
  await expect(identity(page)).toContainText(title);
  await expect(identity(page)).toContainText("imc:slide:1");
  await expect(identity(page).locator("input")).toHaveValue(title);
  await expect(
    identity(page).getByRole("button", { name: "Confirm campaign name" }),
  ).toBeDisabled();
  expect(calls).toHaveLength(0);
  await build(page);
  await expect(identity(page)).toContainText("Unresolved");
  await identity(page)
    .getByRole("button", { name: "Confirm campaign name" })
    .click();
  await expect(identity(page)).toContainText(
    "Human-confirmed; not source-extracted",
  );
  await expect(page.locator(".studio-header")).toContainText(title);
  await identity(page).screenshot({
    path: info.outputPath("after-black-friday-campaign-identity.png"),
  });
  const pack = studioPack(await session(page));
  expect(pack.parsedIMC!.sourceText).toBe(originalText);
  expect(pack.parsedIMC!.fields.campaign.status).toBe("Not supplied");
  expect(pack.campaignIdentity!.sourceCandidate!.excerpt).toBe(
    "Black Friday\nToolkit",
  );
  await page
    .getByRole("article", { name: "Evidence-led Sparks", exact: true })
    .getByRole("checkbox")
    .first()
    .check();
  await page
    .locator(".studio-data-choice")
    .first()
    .getByRole("checkbox")
    .check();
  await page.screenshot({
    path: info.outputPath("after-tab1-input-pack.png"),
    fullPage: true,
  });
  await go(page, "Insight Discovery", title);
  await expect(page.locator(".v2-pack-strip")).toContainText(title);
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("What evidence is missing for this campaign?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  for (const status of await page.locator(".v2-agent-status").all())
    await expect(status).toHaveText(/V0 · (Insights Ready)/, {
      timeout: 60_000,
    });
  expect(calls).toHaveLength(8);
  const five = calls.filter((r) => r.agentType === "discovery");
  expect(five).toHaveLength(5);
  for (const r of five) {
    if (r.agentType !== "discovery") throw new Error("Wrong agent");
    expect(r.context.foundation.campaignContext.campaignName).toBe(title);
    expect(r.context.foundation.campaignIdentity!.id).toBe(
      pack.campaignIdentity!.id,
    );
    expect(r.context.foundation.sourceBrief).toBe(originalText);
  }
  await page
    .getByRole("article", { name: "Consumer Agent", exact: true })
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  const drawer = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await expect(drawer).toContainText(title);
  await drawer
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(humanLine);
  await drawer.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("after-tab2-discovery-working-space.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close Working Space", exact: true })
    .click();
  await confirmAndPackage(page, title);
  await expect.poll(async () => (await session(page)).briefs.length).toBe(1);
  const beforeSession = await session(page),
    beforeState = await discovery(page);
  const oldApproval = structuredClone(beforeSession.approved),
    oldBrief = structuredClone(beforeSession.briefs[0]);
  await go(page, "Input Pack", title);
  await identity(page).locator("input").fill(revised);
  await identity(page)
    .getByRole("button", { name: "Confirm campaign name" })
    .click();
  await expect
    .poll(async () => studioPack(await session(page)).campaignName)
    .toBe(revised);
  const renamedSession = await session(page);
  expect(renamedSession.preparation).toEqual(beforeSession.preparation);
  expect(renamedSession.selectedResearchIds).toEqual(
    beforeSession.selectedResearchIds,
  );
  expect(renamedSession.selectedRtbVersionId).toBe(
    beforeSession.selectedRtbVersionId,
  );
  expect(renamedSession.approvals).toEqual(beforeSession.approvals);
  expect(renamedSession.briefs).toEqual(beforeSession.briefs);
  expect(studioPack(renamedSession).campaignIdentity!.id).toBe(
    pack.campaignIdentity!.id,
  );
  expect(calls).toHaveLength(8);
  await go(page, "Insight Discovery", revised);
  for (const status of await page.locator(".v2-agent-status").all())
    await expect(status).toHaveText(/V0 · (Insights Ready)/);
  const afterState = await discovery(page);
  expect(afterState.runs).toEqual(beforeState.runs);
  expect(afterState.savedFindingIds).toEqual(beforeState.savedFindingIds);
  expect(afterState.fieldVersions).toEqual(beforeState.fieldVersions);
  expect(afterState.humanBriefLine).toBe(humanLine);
  await go(page, "XC Brief", revised);
  await expect(
    page.getByText("This saved brief retains its original campaign name.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".brief-wireframe > header > span")).toHaveText(
    `XC CREATIVE BRIEF · ${title.toUpperCase()}`,
  );
  await go(page, "Finalize Strategy", revised);
  await expect(
    page.getByRole("button", { name: "Generate XC Brief", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(humanLine);
  await page.screenshot({
    path: info.outputPath("after-tab3-finalize-strategy.png"),
    fullPage: true,
  });
  await confirmAndPackage(page, revised);
  await expect.poll(async () => (await session(page)).briefs.length).toBe(2);
  const approvedSession = await session(page);
  expect(approvedSession.approvals.at(-1)).toEqual(oldApproval);
  expect(approvedSession.briefs.at(-1)).toEqual(oldBrief);
  expect(
    approvedSession.approved!.strategyInputPack.campaignIdentity!.displayName,
  ).toBe(revised);
  expect(approvedSession.briefs[0].campaignIdentity!.id).toBe(
    pack.campaignIdentity!.id,
  );
  await page.screenshot({
    path: info.outputPath("after-tab4-xc-brief.png"),
    fullPage: true,
  });
  await page.locator(".brief-export-menu > summary").click();
  for (const [label, extension] of [
    ["Download PDF", "pdf"],
    ["Download Word", "docx"],
  ] as const) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      briefFilename(revised, extension),
    );
    const file = info.outputPath(download.suggestedFilename());
    await download.saveAs(file);
    const bytes = new Uint8Array(await readFile(file));
    let text = "";
    if (extension === "pdf") {
      const loading = getDocument({ data: bytes, useSystemFonts: true });
      const pdf = await loading.promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        text +=
          (await page.getTextContent()).items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ") + "\n";
      }
      expect((await pdf.getMetadata()).info).toHaveProperty(
        "Title",
        `${revised} — Xfinity Creative Brief`,
      );
      await loading.destroy();
    } else {
      const parts = unzipSync(bytes);
      text = [
        ...strFromU8(parts["word/document.xml"]).matchAll(
          /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,
        ),
      ]
        .map((m) =>
          m[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'"),
        )
        .join(" ");
      expect(strFromU8(parts["docProps/core.xml"])).toContain(revised);
    }
    const normalized = text.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ");
    expect(normalized).toContain(revised);
    expect(normalized).toContain(humanLine);
    expect(normalized).toContain("BLK_FRI.pptx");
    expect(normalized).toContain("imc:slide:1");
    expect(normalized).not.toMatch(/Campaign:\s*(?:None|undefined|null)/);
  }
  expect(calls).toHaveLength(8);
  await page.reload();
  await expect(page.locator(".studio-header")).toContainText(revised);
  await expect(page.locator(".brief-wireframe > header > span")).toHaveText(
    `XC CREATIVE BRIEF · ${revised.toUpperCase()}`,
  );
  await go(page, "Insight Discovery", revised);
  expect((await discovery(page)).humanBriefLine).toBe(humanLine);
  expect(calls).toHaveLength(8);
});

test("missing name can be entered and confirmed without using the source filename", async ({
  page,
}) => {
  await page.goto("/");
  const source =
    "Source: This Is Not A Campaign Name.txt\nCampaign: None\nBusiness Objective: Investigate the supplied issue.\nAudience: Existing customers.\nReason to Believe: Supplied proof awaiting approval.";
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(source);
  await build(page);
  await expect(identity(page)).toContainText("No unambiguous name detected");
  await expect(identity(page).locator("input")).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(
    identity(page).getByRole("button", { name: "Confirm campaign name" }),
  ).toBeVisible();
  await identity(page).locator("input").fill("Kevin’s campaign review");
  await identity(page)
    .getByRole("button", { name: "Confirm campaign name" })
    .click();
  await page.reload();
  await expect(page.locator(".studio-header")).toContainText(
    "Kevin’s campaign review",
  );
  expect((await session(page)).preparation.sourceSnapshot).toBe(source);
});

test("multi-campaign PDF requires selection and retains independent confirmed names on return", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page
    .getByLabel("Import file for IMC brief")
    .setInputFiles(
      path.join(
        __dirname,
        "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
      ),
    );
  await expect(
    page.getByRole("textbox", { name: "IMC output brief", exact: true }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
  const choice = page.getByRole("combobox", {
    name: "Campaign in this document",
    exact: true,
  });
  await expect(choice).toHaveValue("");
  await expect(
    identity(page).getByRole("button", { name: "Confirm campaign name" }),
  ).toBeDisabled();
  const values = await choice.locator("option").evaluateAll((items) =>
    items
      .map((item) => ({
        value: (item as HTMLOptionElement).value,
        text: item.textContent || "",
      }))
      .filter((item) => item.value),
  );
  expect(values).toHaveLength(2);
  const names: string[] = [];
  for (const option of values) {
    await choice.selectOption(option.value);
    await build(page);
    const pack = studioPack(await session(page));
    names.push(pack.campaignName);
    expect(pack.campaignIdentity!.sourceName).toBe(pack.campaignName);
    await expect(identity(page)).toContainText(pack.campaignName);
    if (names.length === 1) {
      await identity(page)
        .locator("input")
        .fill(`${pack.campaignName} — display correction`);
      await identity(page)
        .getByRole("button", { name: "Confirm campaign name" })
        .click();
    } else expect(pack.campaignName).not.toContain("display correction");
  }
  expect(names[0]).toContain("Movers");
  expect(names[1]).toContain("Xfinity Pro");
  await choice.selectOption(values[0].value);
  await build(page);
  await expect(page.locator(".studio-header")).toContainText(
    `${names[0]} — display correction`,
  );
  expect(studioPack(await session(page)).campaignIdentity!.sourceName).toBe(
    names[0],
  );
});
