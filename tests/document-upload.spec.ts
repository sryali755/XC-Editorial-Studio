import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  pdfFixture,
  presentationFixture,
  wordFixture,
  wordRtb,
} from "./fixtures/document-uploads";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Document uploads are in the primary Discovery input pack.",
  ),
);
async function openInputs(page: Page) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  return {
    input: page.getByLabel("Import file for IMC brief", { exact: true }),
    draft: page.getByRole("textbox", { name: "IMC output brief", exact: true }),
  };
}
test("brief drop zone can add a file alongside pasted text and remove only that file", async ({
  page,
}) => {
  const { draft } = await openInputs(page);
  await draft.fill("Campaign name: Pasted campaign");
  await page.locator(".file-import-dropzone").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Business objective: Grow awareness"], "added.txt", {
        type: "text/plain",
      }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  });
  await expect(draft).toHaveValue(/Pasted campaign[\s\S]*Grow awareness/);
  await expect(page.locator(".file-import-result")).toContainText("added.txt");
  await page
    .locator(".file-import-result")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(draft).toHaveValue("Campaign name: Pasted campaign");
});
test("Word upload preserves RTB, reads a field/value table and starts V0 only after processing", async ({
  page,
}) => {
  const aiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/agent") && request.method() === "POST")
      aiCalls.push(request.url());
  });
  const { input, draft } = await openInputs(page);
  await input.setInputFiles({
    name: "campaign.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: wordFixture(),
  });
  await expect(draft).toHaveValue(new RegExp(wordRtb));
  expect(await draft.inputValue()).not.toContain("Deleted proof");
  await expect(
    page.getByText("Loaded campaign.docx into the draft.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await page.getByText("View full selected context and source status").click();
  const pack = page.getByRole("region", { name: "Dynamic Input Pack" });
  await expect(pack.locator(".studio-pack-summary")).toContainText(
    "Word source campaign",
  );
  await expect(pack.locator(".studio-pack-summary")).toContainText(wordRtb);
  await expect(pack.locator(".studio-pack-summary")).toContainText(
    "Existing customers considering a change.",
  );
  await expect.poll(() => aiCalls.length).toBe(3);
});
test("PowerPoint follows presentation order and explicitly flags image-only slides in retained text", async ({
  page,
}) => {
  const { input, draft } = await openInputs(page);
  await input.setInputFiles({
    name: "campaign.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: presentationFixture(),
  });
  await expect(draft).toHaveValue(/PowerPoint source campaign/);
  const text = await draft.inputValue();
  expect(text.indexOf("PowerPoint source campaign")).toBeLessThan(
    text.indexOf("## Source slide 2"),
  );
  expect(text).toContain(
    "Exact supplied offer wording; approval not provided.",
  );
  expect(text).toContain("Images on slides 2 were not read");
  await expect(
    page
      .locator(".file-import li")
      .filter({ hasText: "No text was extracted from slides 2" }),
  ).toBeVisible();
});
test("searchable PDF worker loads locally, text is staged, and blank/scanned PDFs do not overwrite it", async ({
  page,
}) => {
  const { input, draft } = await openInputs(page);
  await input.setInputFiles({
    name: "campaign.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture([
      "Campaign: Searchable PDF campaign",
      "Business Objective: Understand audience barriers.",
      "Reason to Believe:",
      "Exact supplied PDF proof.",
    ]),
  });
  await expect(draft).toHaveValue(/Exact supplied PDF proof\./, {
    timeout: 20000,
  });
  const previous = await draft.inputValue();
  expect(previous).toContain("## Source page 1");
  await input.setInputFiles({
    name: "scanned.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture([]),
  });
  await expect(page.locator(".file-import [role=alert]")).toContainText(
    "scanned or image-only",
  );
  await expect(draft).toHaveValue(previous);
});
test("corrupt, unsupported and old binary files give actionable errors without losing the draft", async ({
  page,
}) => {
  const { input, draft } = await openInputs(page);
  await draft.fill("Existing unsaved brief must stay intact.");
  const cases = [
    {
      name: "broken.pdf",
      buffer: Buffer.from("not a PDF"),
      expected: "not a valid PDF",
    },
    {
      name: "broken.docx",
      buffer: Buffer.from("not an Office file"),
      expected: "not a valid Office",
    },
    {
      name: "broken.pptx",
      buffer: Buffer.from([0x50, 0x4b, 0, 0]),
      expected: "corrupted",
    },
    {
      name: "legacy.ppt",
      buffer: Buffer.from("legacy"),
      expected: "Save As .pptx",
    },
    {
      name: "legacy.doc",
      buffer: Buffer.from("legacy"),
      expected: "Save As .docx",
    },
    {
      name: "unsupported.exe",
      buffer: Buffer.from("binary"),
      expected: "Choose a PDF",
    },
  ];
  for (const item of cases) {
    await input.setInputFiles({
      name: item.name,
      mimeType: "application/octet-stream",
      buffer: item.buffer,
    });
    await expect(page.locator(".file-import [role=alert]")).toContainText(
      item.expected,
    );
    await expect(draft).toHaveValue("Existing unsaved brief must stay intact.");
  }
});
test("text imports above the previous file-size and character limits are preserved completely", async ({
  page,
}) => {
  const { input, draft } = await openInputs(page);
  await draft.fill("");
  const source = Buffer.alloc(15 * 1024 * 1024 + 1, "A");
  await input.setInputFiles({
    name: "large.txt",
    mimeType: "text/plain",
    buffer: source,
  });
  await expect(
    page.getByText("Loaded large.txt into the draft.", { exact: false }),
  ).toBeVisible();
  const imported = await draft.evaluate((element) => {
    const value = (element as HTMLTextAreaElement).value;
    return {
      length: value.length,
      startsWithSource: value.startsWith("Source: large.txt\n"),
      endsWithSourceText: value.endsWith("A"),
    };
  });
  expect(imported).toEqual({
    length: "Source: large.txt\n".length + source.length,
    startsWithSource: true,
    endsWithSourceText: true,
  });

  const longBrief = "X".repeat(60_001);
  await input.setInputFiles({
    name: "long.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(longBrief),
  });
  await expect(
    page.getByText("Loaded long.txt into the draft.", { exact: false }),
  ).toBeVisible();
  const longImported = await draft.evaluate(
    (element) => (element as HTMLTextAreaElement).value,
  );
  expect(longImported).toContain(longBrief);
});
test("supporting-document upload stages attributed evidence and requires explicit addition", async ({
  page,
}) => {
  const { input } = await openInputs(page);
  await input.setInputFiles({
    name: "campaign.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Campaign: Main brief\nObjective: Investigate the problem.",
    ),
  });
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await page.getByText(/Add supporting evidence/).click();
  await page.getByLabel("Import file for supporting evidence").setInputFiles({
    name: "research.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: wordFixture(),
  });
  await expect(
    page.getByRole("textbox", { name: "Original evidence text" }),
  ).toHaveValue(new RegExp(wordRtb));
  await expect(
    page.getByRole("textbox", { name: "Source name", exact: true }),
  ).toHaveValue("research.docx");
  await page
    .getByRole("button", { name: "Add supplied evidence", exact: true })
    .click();
  await expect(
    page.getByText("research.docx · manually supplied", { exact: true }),
  ).toBeVisible();
});

// Optional local acceptance against user-supplied sources; no private file is committed.
for (const file of [
  "BLK_FRI.pptx",
  "Black Friday Print_Tactical Brief_102425.docx",
  "Creative Brief Template 101.pdf",
]) {
  test(`local supplied source: ${file}`, async ({ page }) => {
    const directory = process.env.XC_IMPORT_SAMPLE_DIR;
    test.skip(
      !directory,
      "Set XC_IMPORT_SAMPLE_DIR to a local authorized source directory.",
    );
    const { input, draft } = await openInputs(page);
    const outbound: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") outbound.push(request.url());
    });
    await input.setInputFiles(path.join(directory!, file));
    await expect(
      page.locator(".file-import [role=status]").first(),
    ).toContainText(`Loaded ${file}`, { timeout: 20000 });
    expect((await draft.inputValue()).length).toBeGreaterThan(200);
    expect(outbound).toEqual([]);
    if (file === "BLK_FRI.pptx") {
      const text = await draft.inputValue();
      expect(text).toContain("## Source slide 14");
      expect(text).toContain("Black Friday 2025 is a high-stakes");
      expect(text).toContain("Get iPhone 17 Pro on us");
      expect(text).toMatch(/Images on slides .*9.*10/);
      await page.screenshot({
        path: test.info().outputPath("powerpoint-upload-desktop.png"),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath("powerpoint-upload-mobile.png"),
        fullPage: true,
      });
    }
  });
}
