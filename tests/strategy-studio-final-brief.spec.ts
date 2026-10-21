import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
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
import type { DiscoveryState, GeneratedBrief } from "../lib/types";
import { briefFilename } from "../lib/brief-document";

const dir = path.join(__dirname, "fixtures/client-input-pack");
const pdf = path.join(
  dir,
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const expected = JSON.parse(
  readFileSync(path.join(dir, "imagine_that_expected_input_pack.json"), "utf8"),
) as {
  campaigns: { title: string; must_not_import_from_other_campaign: string[] }[];
};
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
// Ignore line wrapping and invisible PDF formatting characters, not content.
const normalized = (text: string) =>
  text
    .replace(/[\u200B\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const attempts = new WeakMap<Page, string[]>();
const posts = new WeakMap<Page, number>();
test.beforeEach(async ({ page, request }) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Final Studio brief requires Discovery mode.",
  );
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  attempts.set(page, []);
  posts.set(page, 0);
  page.on("request", (req) => {
    if (req.url().endsWith("/api/ai/agent") && req.method() === "POST")
      posts.set(page, posts.get(page)! + 1);
  });
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
test("R5 print includes the closed source appendix and approved strategy without UI controls", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await upload(page);
  await campaign(page, 0);
  await line(page, "Kevin Movers / print fidelity.");
  await confirmPackage(page);
  const current = (await session(page)).briefs[0];
  await expect(page.locator(".brief-wireframe-appendix")).not.toHaveAttribute(
    "open",
  );
  await page.emulateMedia({ media: "print" });
  await expect(nav(page)).not.toBeVisible();
  await expect(page.locator(".preview-actions")).not.toBeVisible();
  const file = info.outputPath("print-brief.pdf");
  const bytes = await page.pdf({
    path: file,
    format: "Letter",
    printBackground: true,
  });
  const task = getDocument({ data: new Uint8Array(bytes) });
  const document = await task.promise;
  let text = "";
  for (let i = 1; i <= document.numPages; i++) {
    const content = await (await document.getPage(i)).getTextContent();
    text +=
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" ") + "\n";
  }
  await task.destroy();
  for (const section of current.sections)
    // Chrome's print PDF splits ligature glyphs into separate text items.
    expect(normalized(text).replace(/\s/g, "")).toContain(
      normalized(section.content || "Not supplied.").replace(/\s/g, ""),
    );
});
test.afterEach(async ({ page }) => expect(attempts.get(page)).toEqual([]));

async function go(page: Page, name: string) {
  await nav(page).getByRole("button", { name, exact: true }).click();
}
async function session(page: Page) {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  expect(raw).toBeTruthy();
  return compactParse(raw!) as DiscoveryStudioSession;
}
async function state(page: Page) {
  const current = await session(page),
    pack = studioPack(current);
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    discoveryStorageKey(pack),
  );
  expect(raw).toBeTruthy();
  return compactParse(raw!) as DiscoveryState;
}
async function upload(page: Page) {
  await page.goto("/");
  await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
}
async function campaign(page: Page, index: number, build = true) {
  await go(page, "Input Pack");
  const picker = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const value = await picker
    .locator("option")
    .filter({ hasText: expected.campaigns[index].title })
    .getAttribute("value");
  await picker.selectOption(value!);
  if (build) {
    await page.getByRole("button", { name: "Build Input Pack" }).click();
    await expect(page.locator(".studio-agent-status")).toHaveText(
      ["Demo · V0", "Demo · V0", "Demo · V0"],
      { timeout: 60_000 },
    );
  }
  await expect(page.locator(".studio-header")).toContainText(
    expected.campaigns[index].title,
  );
}
async function line(page: Page, text: string) {
  await go(page, "Finalize Strategy");
  const field = page
    .getByRole("region", { name: "Full-width Working Space" })
    .getByRole("textbox", { name: "Brief line", exact: true });
  await field.fill(text);
  await page
    .getByRole("region", { name: "Full-width Working Space" })
    .getByRole("button", { name: "Save Draft", exact: true })
    .click();
}
async function confirmPackage(page: Page) {
  await page
    .getByRole("button", { name: "Confirm current strategy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  await expect(page.locator(".brief-paper")).toBeVisible();
}
async function exportBrief(
  page: Page,
  brief: GeneratedBrief,
  info: TestInfo,
  prefix: string,
) {
  await page.locator(".brief-export-menu summary").click();
  const before = posts.get(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(
    briefFilename(brief.campaign, "pdf"),
  );
  const pdfPath = info.outputPath(prefix + ".pdf");
  await download.saveAs(pdfPath);
  const bytes = await readFile(pdfPath);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const task = getDocument({ data: new Uint8Array(bytes) });
  const document = await task.promise;
  expect(document.numPages).toBeGreaterThan(1);
  let pdfText = "";
  for (let i = 1; i <= document.numPages; i++) {
    const p = await document.getPage(i),
      content = await p.getTextContent();
    expect(content.items.length).toBeGreaterThan(0);
    const all = content.items
      .flatMap((item) => ("str" in item ? [item.str] : []))
      .join(" ");
    expect(all).toContain(`${i} / ${document.numPages}`);
    const height = p.getViewport({ scale: 1 }).height;
    pdfText +=
      content.items
        .flatMap((item) =>
          "str" in item &&
          item.transform[5] > 50 &&
          item.transform[5] < height - 50
            ? [item.str]
            : [],
        )
        .join(" ") + "\n";
  }
  await task.destroy();
  const wordDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  const word = await wordDownload;
  expect(word.suggestedFilename()).toBe(briefFilename(brief.campaign, "docx"));
  const wordPath = info.outputPath(prefix + ".docx");
  await word.saveAs(wordPath);
  const zip = unzipSync(new Uint8Array(await readFile(wordPath)));
  const xml = strFromU8(zip["word/document.xml"]);
  const wordText = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Malformed DOCX");
    return Array.from(
      doc.getElementsByTagName("w:t"),
      (node) => node.textContent ?? "",
    ).join(" ");
  }, xml);
  for (const section of brief.sections) {
    const title = section.title === "Brief" ? "BRIEF" : section.title;
    // PDF character-spacing is emitted as separate glyphs for the lead label.
    expect(pdfText.replace(/\s/g, "")).toContain(title.replace(/\s/g, ""));
    expect(normalized(wordText)).toContain(title);
    expect(normalized(pdfText)).toContain(
      normalized(section.content || "Not supplied."),
    );
    expect(normalized(wordText)).toContain(
      normalized(section.content || "Not supplied."),
    );
  }
  expect(wordText).toContain(brief.campaign);
  expect(pdfText).toContain(brief.campaign);
  expect(wordText).not.toContain("PRIVATE-R5");
  expect(pdfText).not.toContain("PRIVATE-R5");
  expect(posts.get(page)).toBe(before);
  await info.attach(prefix + "-pdf", {
    path: pdfPath,
    contentType: "application/pdf",
  });
  await info.attach(prefix + "-word", {
    path: wordPath,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
for (const index of [0, 1]) {
  test(`R5 real PDF — ${expected.campaigns[index].title}: approval, inclusion, editable strategy, exports and history`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await upload(page);
    await campaign(page, index);
    const sparkRows = page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice");
    await expect(sparkRows).toHaveCount(6);
    await sparkRows.nth(0).getByRole("checkbox").check();
    await sparkRows.nth(1).getByRole("checkbox").check();
    const dataRows = page.locator(".studio-data-choice");
    await dataRows.nth(0).getByRole("checkbox").check();
    await dataRows.nth(1).getByRole("checkbox").check();
    await page
      .getByRole("article", { name: "RTB / JTBD", exact: true })
      .getByRole("checkbox", {
        name: /Include this proposal in the Dynamic Input Pack/,
      })
      .check();
    await go(page, "XC Brief");
    await expect(page.locator(".brief-paper")).toHaveCount(0);
    expect((await session(page)).approved).toBeNull();
    await go(page, "Insight Discovery");
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(`What needs evidence in ${expected.campaigns[index].title}?`);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    for (const agent of ["Consumer Agent", "Brand Agent"]) {
      const card = page.getByRole("article", { name: agent, exact: true });
      await expect(card.locator(".v2-finding").first()).toBeVisible({
        timeout: 60_000,
      });
      await card
        .getByRole("button", { name: "Save to Working Space", exact: true })
        .first()
        .click();
    }
    for (const status of await page.locator(".v2-agent-status").all())
      await expect(status).not.toHaveText("Exploring", { timeout: 60_000 });
    expect((await session(page)).approved).toBeNull();
    const humanLine = `Kevin R5 / ${index}: approved human line — no rewriting.`;
    await line(page, humanLine);
    const values: Record<string, string> = {
      problemStatement: `Kevin ${index}: the problem.`,
      workingAudience: `Kevin ${index}: selected audience focus.`,
      workingJTBD: `Kevin ${index}: proposed job, not original source.`,
      workingRTB: `Kevin ${index}: supporting proof interpretation — unverified.`,
      evidenceInsights: `Kevin ${index}: tentative insight.`,
      strategicDirection: `Kevin ${index}: creative direction.`,
    };
    const workspace = page.getByRole("region", {
      name: "Full-width Working Space",
    });
    for (const [key, value] of Object.entries(values))
      await workspace.locator("#ws-" + key).fill(value);
    await workspace
      .getByText("Additional Strategy Details", {
        exact: true,
      })
      .click();
    await page.locator(".ws-private-notes > summary").click();
    await workspace
      .locator("#ws-openQuestions")
      .fill(`Kevin ${index}: open question.`);
    const instructions =
      "2 display assets; 300x250 desktop, 320x50 mobile; copy <=20 words; no new claims.";
    await workspace.locator("#ws-executionConsiderations").fill(instructions);
    await workspace
      .getByRole("textbox", { name: "Private notes", exact: true })
      .fill("PRIVATE-R5: do not export.");
    await workspace
      .getByText(
        "From the IMC brief · objective, deliverables, mandatories, timelines",
        { exact: true },
      )
      .click();
    await workspace
      .getByRole("textbox", { name: "Deliverables", exact: true })
      .fill("Two display placements; 1 desktop + 1 mobile.");
    await workspace
      .getByRole("textbox", { name: "Timelines", exact: true })
      .fill("");
    const support = await session(page),
      pack = studioPack(support);
    const uncheckedSpark = pack.selectedSparks![1];
    const uncheckedResearch = pack.selectedResearch![1];
    expect(pack.selectedResearch).toHaveLength(2);
    expect(pack.selectedPreparationProviders).toEqual({
      reasonToBelieve: "mock",
      research: "mock",
      sparks: "mock",
    });
    await page
      .locator(".studio-final-context")
      .getByRole("checkbox", {
        name: `${uncheckedResearch.category} · V${uncheckedResearch.version - 1}`,
        exact: true,
      })
      .uncheck();
    await page
      .locator(".studio-final-context")
      .getByRole("checkbox", {
        name: "Spark: " + uncheckedSpark.title,
        exact: true,
      })
      .uncheck();
    const findings = page
      .locator(".studio-final-context")
      .getByRole("checkbox", { name: /^Agent finding:/ });
    await expect(findings).toHaveCount(2);
    const uncheckedFinding = await findings
      .nth(1)
      .evaluate((element) =>
        (element as HTMLInputElement).labels?.[0]?.textContent?.trim(),
      );
    await findings.nth(1).uncheck();
    await page
      .getByRole("button", { name: "Confirm current strategy", exact: true })
      .click();
    const approved = (await session(page)).approved!;
    const stateBefore = await state(page),
      callCount = posts.get(page);
    await page
      .getByRole("button", { name: "Generate XC Brief", exact: true })
      .click();
    await expect(page.locator(".brief-paper h1")).toHaveText(humanLine);
    const created = await session(page),
      brief = created.briefs[0];
    expect(posts.get(page)).toBe(callCount);
    expect(brief.provider).toBe("manual");
    expect(brief.mock).toBe(true);
    expect(approved.strategyInputPack.selectedSparks).toHaveLength(1);
    expect(approved.strategyInputPack.selectedResearch).toHaveLength(1);
    expect(
      brief.sections.find((s) => s.title === "Selected research · AI synthesis")
        ?.content,
    ).toContain(pack.selectedResearch![0].text);
    expect(
      brief.sections.find((s) => s.title === "Selected research · AI synthesis")
        ?.content,
    ).not.toContain(uncheckedResearch.text);
    expect(
      brief.sections.find(
        (s) => s.title === "Proposed XC adaptation — not upstream-approved",
      )?.content,
    ).toBe(pack.proposedRTB);
    const serialized = JSON.stringify(brief.sections);
    expect(serialized).not.toContain(uncheckedSpark.idea!);
    expect(serialized).not.toContain(
      uncheckedFinding!.replace("Agent finding: ", ""),
    );
    expect(serialized).toContain(instructions);
    expect(brief.sections.find((s) => s.title === "Audience")?.content).toBe(
      values.workingAudience,
    );
    expect(brief.sections.find((s) => s.title === "Proof / RTB")?.content).toBe(
      values.workingRTB,
    );
    expect(
      brief.sections.find((s) => s.title === "Original upstream RTB")?.content,
    ).toBe(pack.reasonToBelieve);
    expect(
      brief.sections.find((s) => s.title === "Original upstream JTBD")?.content,
    ).toBe("Not supplied");
    expect(brief.sections.find((s) => s.title === "Timelines")?.content).toBe(
      "",
    );
    expect(created.briefInputs?.[brief.id].confirmedAt).toBe(
      approved.approvedAt,
    );
    expect(created.briefInputs?.[brief.id].selectedAgentFindings).toHaveLength(
      1,
    );
    for (const forbidden of expected.campaigns[index]
      .must_not_import_from_other_campaign)
      expect(serialized).not.toContain(forbidden);
    await page.locator(".brief-wireframe-appendix summary").click();
    await expect(page.locator(".brief-paper")).toContainText(
      "RTB approval: unknown",
    );
    await expect(page.locator(".brief-paper")).toContainText("not_connected");
    await expect(page.locator(".brief-paper")).toContainText("DEMO DATA");
    await exportBrief(page, brief, info, "approved-" + index);
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.r5Printed = "yes";
      };
    });
    await page
      .getByRole("button", { name: "Print / Save PDF", exact: true })
      .click();
    expect(await page.locator("html").getAttribute("data-r5-printed")).toBe(
      "yes",
    );
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".brief-paper")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const brand = await page.locator(".studio-brand").boundingBox();
      const pill = await page.locator(".studio-header-pill").boundingBox();
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(pill!.x);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("brief-" + index + "-" + width + ".png"),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await expect(page.locator(".brief-paper h1")).toHaveText(humanLine);
    expect((await state(page)).fieldVersions).toEqual(
      stateBefore.fieldVersions,
    );
    await line(page, `Kevin R5 / ${index}: second approved version.`);
    await expect(
      page.getByRole("button", { name: "Generate XC Brief", exact: true }),
    ).toBeDisabled();
    await go(page, "XC Brief");
    await expect(page.locator(".brief-paper h1")).toHaveText(humanLine);
    await go(page, "Finalize Strategy");
    await page
      .locator(".studio-final-context")
      .getByRole("checkbox", {
        name: "Spark: " + pack.selectedSparks![0].title,
        exact: true,
      })
      .uncheck();
    await expect(
      page.getByRole("button", { name: "Generate XC Brief", exact: true }),
    ).toBeDisabled();
    await confirmPackage(page);
    const latest = await session(page);
    expect(latest.briefs).toHaveLength(2);
    expect(latest.approvals).toHaveLength(2);
    expect(latest.briefs[1]).toEqual(brief);
    await page
      .getByRole("combobox", { name: "XC Brief version history" })
      .selectOption(brief.id);
    await expect(page.locator(".brief-paper h1")).toHaveText(humanLine);
    await exportBrief(page, brief, info, "restored-" + index);
    await campaign(page, 1 - index);
    expect((await session(page)).approved).toBeNull();
    await go(page, "XC Brief");
    await expect(page.locator(".brief-paper")).toHaveCount(0);
    await line(page, `Other campaign ${1 - index} approved line.`);
    await confirmPackage(page);
    await campaign(page, index);
    await go(page, "XC Brief");
    const restored = await session(page);
    expect(restored.briefs).toEqual(latest.briefs);
    expect(restored.approvals).toEqual(latest.approvals);
    expect((await state(page)).savedFindingIds).toHaveLength(2);
    expect(studioPack(restored).selectedResearch).toHaveLength(2);
    await expect(page.locator(".brief-paper h1")).toHaveText(
      latest.briefs[0].sections.find((s) => s.title === "Brief")!.content,
    );
  });
}
test("R5 packaging failure preserves prior brief and approvals; corrected snapshot retries locally", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await upload(page);
  await campaign(page, 0);
  await line(page, "Kevin R5 / first confirmed version.");
  await confirmPackage(page);
  const before = await session(page),
    approved = before.approved!;
  const corrupted = structuredClone(before);
  delete corrupted.approvalSnapshots[approved.approvedAt];
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), {
    key: studioStorageKey,
    raw: compactStringify(corrupted),
  });
  await page.reload();
  await page.locator(".brief-export-menu summary").click();
  await page
    .getByRole("button", { name: "Update package", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "snapshot is unavailable" }),
  ).toContainText("approved evidence snapshot is unavailable");
  expect((await session(page)).briefs).toEqual(before.briefs);
  expect((await session(page)).approvals).toEqual(before.approvals);
  await go(page, "Finalize Strategy");
  await page
    .getByRole("button", { name: "Confirm current strategy", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  expect((await session(page)).briefs).toHaveLength(2);
  expect((await session(page)).briefs[1]).toEqual(before.briefs[0]);
  await page.locator(".brief-export-menu summary").click();
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      URL.createObjectURL = original;
      throw new Error("Offline injected export failure for " + blob.size);
    };
  });
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  await expect(page.locator(".brief-download-error")).toContainText(
    "Your brief is saved; please try again",
  );
  const retry = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  expect((await retry).suggestedFilename()).toMatch(/\.docx$/);
  expect((await session(page)).briefs[1]).toEqual(before.briefs[0]);
  const includedBefore = (await session(page)).includedContextIds;
  await go(page, "Finalize Strategy");
  await page
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill("A new unapproved draft.");
  await go(page, "XC Brief");
  await page.locator(".brief-export-menu summary").click();
  await page
    .getByRole("button", { name: "Update package", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "strategy changed" }),
  ).toContainText("strategy changed after confirmation");
  expect((await session(page)).briefs).toHaveLength(2);
  expect((await session(page)).includedContextIds).toEqual(includedBefore);
});
test("R5 a delayed export cannot download the old campaign after switching to a new campaign", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await upload(page);
  await campaign(page, 0);
  await line(page, "Kevin Movers / delayed export.");
  await confirmPackage(page);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(/export-brief-word/, async (route) => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  await page.locator(".brief-export-menu summary").click();
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  await ready;
  try {
    await campaign(page, 1);
    await line(page, "Kevin Pro / current campaign.");
    await confirmPackage(page);
    const current = await session(page);
    const unexpected = page
      .waitForEvent("download", { timeout: 2000 })
      .catch(() => null);
    release();
    expect(await unexpected).toBeNull();
    expect((await session(page)).briefs).toEqual(current.briefs);
    await expect(page.locator(".brief-download-error")).toHaveCount(0);
    await page.locator(".brief-export-menu summary").click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download Word", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      briefFilename(current.briefs[0].campaign, "docx"),
    );
  } finally {
    release();
  }
});
