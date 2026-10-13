import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { demoPack, demoExecution } from "../lib/demo";
import { emptyPreparation, demoIMCBrief } from "../lib/preparation";
import { extractUpstream } from "../lib/upstream";
import { mockBriefService } from "../lib/ai/mock-strategy";
import type { GeneratedBrief } from "../lib/types";

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
async function openBrief(page: Page, long = false) {
  const pack = { ...demoPack, upstream: extractUpstream(demoIMCBrief) };
  const approved = {
    briefLine: "A connection you count on. A life you make your own.",
    strategyInputPack: pack,
    approvedBy: "Kevin" as const,
    approvedAt: "2026-10-07T16:00:00.000Z",
    source: "Brand · V2",
  };
  const brief: GeneratedBrief = await mockBriefService.generateXCBrief({
    strategyInputPack: pack,
    approvedBriefLine: approved,
    executionDirection: demoExecution,
  });
  brief.createdAt = "2026-10-07T16:00:00.000Z";
  if (long) {
    brief.campaign += "\n\n**Brand:** Xfinity";
    const campaignSection = brief.sections.find((s) => s.title === "Campaign")!;
    campaignSection.content += "\n\n**Brand:** Xfinity";
  }
  brief.sections.push(
    {
      title: "Disclaimers",
      content:
        "Offer eligibility: 18+ only. Terms & conditions apply — ‘as supplied’.",
    },
    {
      title: "Legacy context",
      content:
        "Café households: ‘More life.’ — not a verified claim.\nIntentionally excluded.\nNot supplied.",
    },
    {
      title: "Legacy context",
      content: "A second section with the same title must remain visible.",
    },
    {
      title: "Literal text",
      content:
        "<script>alert('example')</script> is plain brief text, not executable markup.",
    },
  );
  if (long)
    brief.sections.push({
      title: "Extended source notes",
      content: Array.from(
        { length: 90 },
        (_, i) =>
          `Evidence note ${i + 1}: Supplied research must remain attached to the creative brief. This is illustrative test evidence, with the original qualification preserved.`,
      ).join("\n\n"),
    });
  let apiCalls = 0;
  await page.route("**/api/ai/agent", (route) => {
    apiCalls++;
    return route.abort();
  });
  await page.addInitScript(
    (session) => {
      if (!sessionStorage.getItem("xc-strategy-session-v1"))
        sessionStorage.setItem(
          "xc-strategy-session-v1",
          JSON.stringify(session),
        );
    },
    {
      step: 3,
      pack,
      preparation: emptyPreparation,
      sharedPack: pack,
      outputs: [],
      selected: [],
      synthesis: [],
      finalLine: approved.briefLine,
      finalSource: approved.source,
      approved,
      execution: demoExecution,
      brief,
    },
  );
  await page.goto("/");
  await expect(page.locator(".brief-paper")).toBeVisible();
  return { brief, apiCalls: () => apiCalls };
}

test("PDF and editable Word downloads preserve the full brief across pages", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const { brief, apiCalls } = await openBrief(page, true);
  await expect(page.locator(".brief-campaign")).toHaveText("Life, connected");
  await expect(page.locator(".brief-paper")).not.toContainText(
    "**Brand:** Xfinity",
  );
  await expect(page.locator(".brief-strategy")).toContainText(
    brief.sections[2].content,
  );
  await expect(page.locator(".brief-paper")).toContainText(
    "<script>alert('example')</script>",
  );
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe(
    "Xfinity-Creative-Brief-Life-connected.pdf",
  );
  const pdfPath = testInfo.outputPath("Xfinity-Creative-Brief.pdf");
  await pdf.saveAs(pdfPath);
  const pdfBytes = await readFile(pdfPath);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  const loadingTask = getDocument({ data: new Uint8Array(pdfBytes) });
  const parsedPdf = await loadingTask.promise;
  expect(parsedPdf.numPages).toBeGreaterThan(3);
  let pdfText = "";
  for (let i = 1; i <= parsedPdf.numPages; i++) {
    const pdfPage = await parsedPdf.getPage(i);
    const content = await pdfPage.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(normalized(pageText)).toContain(`${i} / ${parsedPdf.numPages}`);
    const height = pdfPage.getViewport({ scale: 1 }).height;
    pdfText +=
      content.items
        .filter(
          (item) =>
            "str" in item &&
            item.transform[5] > 50 &&
            item.transform[5] < height - 50,
        )
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ") + "\n";
  }
  await loadingTask.destroy();
  const wordDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  const word = await wordDownload;
  expect(word.suggestedFilename()).toBe(
    "Xfinity-Creative-Brief-Life-connected.docx",
  );
  const wordPath = testInfo.outputPath("Xfinity-Creative-Brief.docx");
  await word.saveAs(wordPath);
  const files = unzipSync(new Uint8Array(await readFile(wordPath)));
  const xml = strFromU8(files["word/document.xml"]);
  const wordText = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.querySelector("parsererror"))
      throw new Error("Invalid Word document XML");
    return Array.from(
      doc.getElementsByTagName("w:t"),
      (node) => node.textContent ?? "",
    ).join(" ");
  }, xml);
  expect(xml).toContain("w:pStyle");
  expect(strFromU8(files["word/styles.xml"])).toContain("6242C7");
  expect(
    Object.keys(files).some((path) => /word\/footer\d+\.xml/.test(path)),
  ).toBe(true);
  for (const section of brief.sections) {
    const expectedContent =
      section.title === "Campaign"
        ? "Life, connected"
        : section.content || "Not supplied.";
    expect(normalized(wordText)).toContain(normalized(expectedContent));
    expect(normalized(pdfText)).toContain(normalized(expectedContent));
  }
  expect(wordText).not.toContain("**Brand:** Xfinity");
  expect(pdfText).not.toContain("**Brand:** Xfinity");
  const stored = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!).brief,
  );
  expect(stored).toEqual(brief);
  expect(apiCalls()).toBe(0);
});

test("export failure is recoverable and the preview fits mobile", async ({
  page,
}, testInfo) => {
  const { brief, apiCalls } = await openBrief(page);
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("Simulated download failure");
    };
  });
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  await expect(page.locator(".brief-download-error")).toContainText(
    "Your brief is saved",
  );
  await expect(
    page.getByRole("button", { name: "Download Word", exact: true }),
  ).toBeEnabled();
  await page.reload();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Word", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".brief-campaign")).toHaveText(brief.campaign);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`brief-preview-${width}.png`),
      fullPage: true,
    });
  }
  expect(apiCalls()).toBe(0);
});
