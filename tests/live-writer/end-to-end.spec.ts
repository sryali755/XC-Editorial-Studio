import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { compactParse } from "../../lib/discovery-persistence";
import { studioStorageKey as sessionKey, type DiscoveryStudioSession } from "../../lib/discovery-studio";

const output = process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-journey";
const briefPath = process.env.XC_LIVE_BRIEF || "";
const lenses = ["Consumer Agent", "Culture Agent", "Category Agent", "Brand Agent", "Analogous Solutions Agent"];
const plain = (text: string) => text.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();

test("live DOCX to confirmed XC Brief, PDF and Word", async ({ page, request }) => {
  test.skip(process.env.XC_LIVE_E2E !== "1", "Explicit live-test opt-in required.");
  expect(briefPath, "XC_LIVE_BRIEF must identify the test DOCX").toBeTruthy();
  mkdirSync(output, { recursive: true });
  const checkpoint = path.join(output, "checkpoint.json");
  const completed = new Set<string>();
  if (process.env.XC_LIVE_RESUME === "1" && existsSync(checkpoint)) {
    const previous = JSON.parse(readFileSync(checkpoint, "utf8"));
    previous.completed.forEach((value: string) => {
      if (!process.env.XC_LIVE_RESTART_AT || value < process.env.XC_LIVE_RESTART_AT) completed.add(value);
    });
    await page.addInitScript((storage) => {
      if (sessionStorage.getItem("xc-insight-studio-v1")) return;
      for (const [key, value] of Object.entries(storage)) sessionStorage.setItem(key, String(value));
    }, previous.storage);
  }
  const status = await (await request.get("/api/ai/agent")).json();
  expect(status).toMatchObject({ mode: "live", provider: "writer", configured: true });
  console.info("[live] provider verified", status.model);
  const api: { agent: string; lens?: string; action?: string; status: number; code?: string; error?: string }[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => void dialog.accept());
  page.on("request", req => {
    if (req.url().endsWith("/api/ai/agent") && req.method() === "POST") {
      const input = req.postDataJSON();
      console.info("[live] REQUEST", input.agentType, input.context?.lens || "");
    }
  });
  page.on("response", async response => {
    if (!response.url().endsWith("/api/ai/agent") || response.request().method() !== "POST") return;
    const input = response.request().postDataJSON();
    const body = await response.json().catch(() => ({}));
    const summary = { agent: input.agentType, lens: input.context?.lens, action: input.context?.action, status: response.status(), code: body.code, error: body.error };
    api.push(summary);
    writeFileSync(path.join(output, "api-summary.json"), JSON.stringify(api, null, 2));
    if (!response.ok()) writeFileSync(path.join(output, "last-failed-request.json"), JSON.stringify(input, null, 2));
    console.info("[live] agent", JSON.stringify(summary));
  });
  const nav = () => page.getByRole("navigation", { name: "Workspace" });
  const go = async (name: string) => nav().getByRole("button", { name, exact: true }).click();
  const save = async () => {
    const storage = await page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])));
    writeFileSync(checkpoint, JSON.stringify({ completed: [...completed], storage }, null, 2));
  };
  const state = async () => {
    const raw = await page.evaluate(key => sessionStorage.getItem(key), sessionKey);
    expect(raw).toBeTruthy();
    return compactParse(raw!) as DiscoveryStudioSession;
  };
  const waitForCalls = async (before: number, count: number) => {
    await expect.poll(() => api.length, { timeout: 330_000, intervals: [1000] }).toBeGreaterThanOrEqual(before + count);
    await page.waitForTimeout(300);
    const errors = api.slice(before).filter(item => item.status >= 400);
    if (errors.length) {
      await save();
      throw new Error("Live generation failed: " + JSON.stringify(errors));
    }
  };
  const step = async (name: string, run: () => Promise<void>) => {
    if (completed.has(name)) return;
    console.info("[live] START", name);
    try {
      await run();
      completed.add(name);
      await save();
      await page.screenshot({ path: path.join(output, name + ".png"), fullPage: false });
      console.info("[live] PASS", name);
    } catch (error) {
      await save();
      throw error;
    }
  };

  await page.goto("/");
  await step("01-upload-and-preparation", async () => {
    await go("Input Pack");
    await page.getByLabel("Import file for IMC brief", { exact: true }).setInputFiles(briefPath);
    const imported = page.getByRole("textbox", { name: "IMC output brief", exact: true });
    await expect(imported).toHaveValue(new RegExp(path.basename(briefPath).replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
    const importedSource = await imported.inputValue();
    const before = api.length;
    await page.getByRole("button", { name: "Build Input Pack", exact: true }).click();
    await waitForCalls(before, 3);
    await expect(page.locator(".studio-agent-status")).toHaveText([/V0/, /V0/, /V0/]);
    await expect(page.getByRole("article", { name: "Evidence-led Sparks", exact: true }).locator(".spark-choice")).toHaveCount(6);
    const current = await state();
    expect(current.preparation.sourceSnapshot).toBe(importedSource);
    expect(current.preparation.outputs.every(item => item.versions[0]?.provider === "writer")).toBe(true);
  });
  await step("02-select-and-open-roundtable", async () => {
    await go("Input Pack");
    await page.getByRole("article", { name: "RTB / JTBD", exact: true }).getByRole("checkbox").check();
    const research = page.getByRole("article", { name: "Data Analysis & Synthesis", exact: true });
    await research.locator(".studio-data-choice").first().getByRole("checkbox").check();
    await page.getByRole("article", { name: "Evidence-led Sparks", exact: true }).locator(".spark-choice").first().getByRole("checkbox").check();
    await page.getByRole("button", { name: "Next: Insight Discovery", exact: true }).click();
  });
  await step("03-roundtable-five-agents", async () => {
    await go("Insight Discovery");
    const focus = page.getByRole("textbox", { name: "What should we investigate?" });
    if (!(await focus.inputValue())) await focus.fill(process.env.XC_LIVE_QUESTION || "What supplied audience barrier or evidence gap could change the campaign strategy?");
    const before = api.length;
    const incomplete = [];
    for (const name of lenses) {
      const agent = page.getByRole("article", { name, exact: true });
      if (!/Insights Ready|Saved results/.test(await agent.locator(".v2-agent-status").innerText())) incomplete.push(name);
    }
    if (incomplete.length === lenses.length) {
      await page.getByRole("button", { name: "Start Roundtable Discussion", exact: true }).click();
    } else {
      for (const name of incomplete) await page.getByRole("button", { name: "Regenerate " + name, exact: true }).click();
    }
    if (incomplete.length) await waitForCalls(before, incomplete.length);
    for (const name of lenses) {
      const agent = page.getByRole("article", { name, exact: true });
      await expect(agent.locator(".v2-agent-status")).toContainText(/Insights Ready|Saved results/);
      await expect(agent.locator(".v2-finding")).toHaveCount(1);
    }
  });
  await step("04-follow-up-and-save-findings", async () => {
    await go("Insight Discovery");
    const consumer = page.getByRole("article", { name: "Consumer Agent", exact: true });
    if (await consumer.locator(".v2-message.agent").count() === 0) {
      const before = api.length;
      await consumer.getByRole("textbox", { name: "Your message to Consumer Agent", exact: true }).fill("Which part is supported by the supplied brief, and which part remains a hypothesis to validate?");
      await consumer.getByRole("button", { name: "Ask this agent", exact: true }).click();
      await waitForCalls(before, 1);
    }
    await expect(consumer.locator(".v2-agent-status")).toContainText(/Insights Ready|Saved results/);
    expect(await consumer.locator(".v2-message.agent").count()).toBeGreaterThan(0);
    for (const name of ["Consumer Agent", "Brand Agent"]) {
      const card = page.getByRole("article", { name, exact: true }).locator(".v2-finding");
      const saveFinding = card.getByRole("button", { name: "Save as a creative consideration", exact: true });
      if (await saveFinding.count()) await saveFinding.click();
      await card.getByRole("checkbox", { name: "Compare", exact: true }).check();
    }
  });
  await step("05-compare-saved-findings", async () => {
    await go("Insight Discovery");
    const comparison = page.locator(".v2-comparison-panel");
    if (await comparison.getAttribute("open") === null) await comparison.locator(":scope > summary").click();
    const before = api.length;
    await page.getByRole("button", { name: "Compare selected findings", exact: true }).click();
    await waitForCalls(before, 1);
    await expect(page.locator(".ws-connection").first()).toBeVisible();
  });
  await step("06-live-strategy-suggestions", async () => {
    await go("Finalize Strategy");
    const line = page.getByRole("textbox", { name: "Brief line", exact: true });
    if (await line.inputValue()) await line.fill("");
    await page.locator(".studio-suggestions-summary").click();
    const before = api.length;
    await page.getByRole("button", { name: /^(Explore Suggestions|Suggest new lines|Retry suggestions)$/ }).click();
    await waitForCalls(before, 1);
    await expect(page.locator(".studio-suggestion-card")).toHaveCount(3);
    await page.getByRole("button", { name: "Use as editable draft", exact: true }).first().click();
    await expect(page.getByRole("textbox", { name: "Brief line", exact: true })).not.toHaveValue("");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  });
  await step("07-reload-and-confirm-test-strategy", async () => {
    await go("Finalize Strategy");
    const line = await page.getByRole("textbox", { name: "Brief line", exact: true }).inputValue();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Brief line", exact: true })).toHaveValue(line);
    const confirm = page.getByRole("button", { name: "Confirm Strategy", exact: true });
    await confirm.click();
    await expect(page.getByRole("button", { name: "Generate XC Brief", exact: true })).toBeEnabled();
  });
  await step("08-final-brief", async () => {
    await go("Finalize Strategy");
    const before = api.length;
    await page.getByRole("button", { name: "Generate XC Brief", exact: true }).click();
    await expect(page.locator(".brief-paper")).toBeVisible();
    expect(api.length).toBe(before);
    const current = await state();
    expect(current.briefs.length).toBeGreaterThan(0);
    expect(current.approvals.length).toBeGreaterThan(0);
    const brief = current.briefs[0];
    expect(brief.sections.find(section => section.title === "Brief")?.content).toBe(current.approved?.briefLine);
    expect(brief.sections.find(section => section.title === "Original upstream RTB")?.content).toBe(current.approved?.strategyInputPack.reasonToBelieve);
    expect(current.briefInputs?.[brief.id]?.sourceBrief).toBe(current.preparation.sourceSnapshot);
  });
  await step("09-pdf-and-word-exports", async () => {
    await go("XC Brief");
    const current = await state();
    const brief = current.briefs[0];
    const before = api.length;
    await page.locator(".brief-export-menu summary").click();
    const downloadPDF = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const pdf = await downloadPDF;
    const pdfPath = path.join(output, "Gateway-live-test.pdf");
    await pdf.saveAs(pdfPath);
    const loading = getDocument({ data: new Uint8Array(readFileSync(pdfPath)) });
    const doc = await loading.promise;
    let pdfText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const text = await page.getTextContent();
      const height = page.getViewport({ scale: 1 }).height;
      pdfText += text.items.flatMap(item =>
        "str" in item && item.transform[5] > 50 && item.transform[5] < height - 50 ? [item.str] : [],
      ).join(" ") + "\n";
    }
    const pages = doc.numPages;
    await loading.destroy();
    const downloadWord = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Word", exact: true }).click();
    const word = await downloadWord;
    const wordPath = path.join(output, "Gateway-live-test.docx");
    await word.saveAs(wordPath);
    const parts = unzipSync(new Uint8Array(readFileSync(wordPath)));
    const xml = strFromU8(parts["word/document.xml"]);
    const wordText = await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, "application/xml");
      if (document.querySelector("parsererror")) throw Error("Invalid Word XML");
      return Array.from(document.getElementsByTagName("w:t"), element => element.textContent).join(" ");
    }, xml);
    for (const section of brief.sections) {
      const content = section.content || "Not supplied.";
      expect(plain(pdfText).replace(/\s/g, "")).toContain(plain(content).replace(/\s/g, ""));
      expect(plain(wordText)).toContain(plain(content));
    }
    expect(api.length).toBe(before);
    writeFileSync(path.join(output, "export-verification.json"), JSON.stringify({ pages, pdfBytes: readFileSync(pdfPath).length, wordBytes: readFileSync(wordPath).length, sections: brief.sections.length }, null, 2));
  });
  expect(pageErrors).toEqual([]);
  console.info("[live] COMPLETE", JSON.stringify({ steps: [...completed], apiRequests: api.length }));
});
