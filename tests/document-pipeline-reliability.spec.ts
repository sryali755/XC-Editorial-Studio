import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  wordFixture,
  pdfFixture,
  presentationFixture,
  wordRtb,
} from "./fixtures/document-uploads";
import { canonicalCampaign } from "../lib/canonical-campaign";
import { extractUpstream } from "../lib/upstream";

const forbidden = new WeakMap<Page, string[]>();
const localMockApiEnabled = new WeakSet<Page>();
test.beforeEach(async ({ page, baseURL }) => {
  const calls: string[] = [];
  forbidden.set(page, calls);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "fonts.googleapis.com" && url.pathname === "/css2") {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: "/* External font blocked in offline verification. */",
      });
      return;
    }
    if (
      url.origin !== new URL(baseURL!).origin ||
      (url.pathname.startsWith("/api/") &&
        !(localMockApiEnabled.has(page) && url.pathname === "/api/ai/agent"))
    ) {
      calls.push(url.origin + url.pathname);
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByLabel("Import file for IMC brief", { exact: true }),
  ).toBeAttached();
});

test("actual IMC upload completes mock preparation, five-role Discovery, saved findings and human-owned Finalize handoff", async ({
  page,
}, info) => {
  const imcPath = process.env.XC_GATEWAY_IMC_DOCX;
  test.skip(!imcPath, "Supply the approved local IMC DOCX path.");
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  const metadata = await page.request.get("/api/ai/agent");
  expect(await metadata.json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  localMockApiEnabled.add(page);
  const requests: { agentType: string; lens?: string; source: string }[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname !== "/api/ai/agent" ||
      request.method() !== "POST"
    )
      return;
    const body = request.postDataJSON();
    requests.push({
      agentType: body.agentType,
      lens: body.context?.lens,
      source:
        body.context?.foundation?.sourceBrief ??
        body.context?.parsedIMC?.sourceText ??
        "",
    });
  });
  await upload(
    page,
    "Gateway IMC Brief KM.docx",
    readFileSync(imcPath!),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  await page
    .getByRole("textbox", { name: "Campaign name", exact: true })
    .fill("Gateway IMC Brief – Revised for Helix Test");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".spark-choice")).toHaveCount(6, {
    timeout: 30000,
  });
  await expect(page.locator(".studio-agent-status.failed")).toHaveCount(0);
  await expect(page.locator(".studio-agent-status")).toHaveCount(3);
  for (const status of await page.locator(".studio-agent-status").all())
    await expect(status).toContainText("V0");
  await page
    .getByRole("article", { name: "RTB / JTBD", exact: true })
    .getByRole("checkbox")
    .check();
  await page.locator(".spark-choice").first().getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Next: Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?", exact: true })
    .fill(
      "What prevents the supplied audience from understanding the value and limits of this upgrade?",
    );
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  for (const name of [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ]) {
    const agent = page.getByRole("article", { name, exact: true });
    const save = agent
      .getByRole("button", {
        name: "Save as a creative consideration",
        exact: true,
      })
      .first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(
      agent.getByRole("button", {
        name: "Selected as a creative consideration",
        exact: true,
      }),
    ).toBeVisible();
  }
  expect(requests.map((request) => request.agentType).sort()).toEqual(
    ["rtb", "research", "sparks", ...Array(5).fill("discovery")].sort(),
  );
  expect(
    requests
      .filter((request) => request.agentType === "discovery")
      .map((request) => request.lens)
      .sort(),
  ).toEqual(["consumer", "culture", "category", "brand", "analogous"].sort());
  for (const request of requests) {
    expect(request.source).toContain("More built-in security");
    expect(request.source).not.toContain("5G Battery Back-Up");
  }
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Finalize Strategy", exact: true })
    .click();
  const line = page.getByRole("textbox", { name: "Brief line", exact: true });
  await expect(line).toHaveValue("");
  const humanLine =
    "Human test strategy: explain the useful upgrade benefits and their limitations clearly.";
  await line.fill(humanLine);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm Strategy", exact: true })
    .click();
  await expect(
    page.getByText(
      "Confirmed by you for this exact strategy and selected context.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(line).toHaveValue(humanLine);
  await page.screenshot({
    path: info.outputPath("gateway-offline-finalize.png"),
    fullPage: true,
  });
});
test.afterEach(async ({ page }) => expect(forbidden.get(page)).toEqual([]));
async function upload(
  page: Page,
  name: string,
  buffer: Buffer,
  mimeType: string,
) {
  await page
    .getByLabel("Import file for IMC brief", { exact: true })
    .setInputFiles({ name, mimeType, buffer });
  const draft = page.getByRole("textbox", {
    name: "IMC output brief",
    exact: true,
  });
  await expect(draft).toHaveValue(
    new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  return draft.inputValue();
}
test("actual DOCX extraction preserves table cells, heading provenance and original proof", async ({
  page,
}) => {
  const text = await upload(
    page,
    "independent-table.docx",
    wordFixture(),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const model = canonicalCampaign({
    sourceBrief: text,
    requirements: extractUpstream(text),
  });
  expect(model.fields.audiences.values[0].value).toContain(
    "Existing customers",
  );
  expect(model.fields.rtbs.values[0].value).toContain(wordRtb);
  expect(text).not.toContain("Deleted proof must not be imported");
});
test("actual Word non-breaking spaces remain source text and canonical proof stays present", async ({
  page,
}) => {
  const parts = unzipSync(wordFixture());
  parts["word/document.xml"] = strToU8(
    strFromU8(parts["word/document.xml"])
      .replace("Reason to Believe", "Proof / RTBs")
      .replace(wordRtb, "Supplied\u00a0product proof; eligibility applies."),
  );
  const text = await upload(
    page,
    "independent-spacing.docx",
    Buffer.from(zipSync(parts)),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(text).toContain("Supplied\u00a0product proof");
  expect(extractUpstream(text).fields.originalRTB.status).toBe("Supplied");
});
test("actual PDF extraction retains wrapped proof, qualification and source page marker", async ({
  page,
}) => {
  const text = await upload(
    page,
    "independent-wrapped.pdf",
    pdfFixture([
      "Campaign: Repair Access",
      "Business objective: Explain the repair service.",
      "Target audience: Residents considering maintenance.",
      "Proof / RTB:",
      "Scheduled maintenance is included at",
      "participating locations; parts are excluded.",
    ]),
    "application/pdf",
  );
  expect(text).toContain("## Source page 1");
  expect(extractUpstream(text).fields.originalRTB.sourceValue).toMatch(
    /Scheduled maintenance is included at\s+participating locations; parts are excluded/,
  );
});
test("existing PPTX extraction keeps slide order and ignores unreadable image text", async ({
  page,
}) => {
  const text = await upload(
    page,
    "independent-slides.pptx",
    presentationFixture(),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  expect(text).toContain("## Source slide 1");
  expect(text).toContain("## Source slide 2");
  expect(extractUpstream(text).fields.originalRTB.sourceValue).toContain(
    "Exact supplied offer wording",
  );
});
test("the approved Gateway IMC is extracted as input with four RTBs", async ({
  page,
}) => {
  const filename = process.env.XC_GATEWAY_IMC_DOCX;
  test.skip(!filename, "Supply the approved local IMC DOCX fixture.");
  const text = await upload(
    page,
    "approved-imc.docx",
    readFileSync(filename!),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(extractUpstream(text).fields.originalRTB.sourceValue).toContain(
    "More family tools",
  );
  expect(text).not.toContain("5G Battery Back-Up");
  expect(text).not.toContain("BRIEF: Show how the Gateway quietly");
});
test("completed creative reference is extracted separately and never merged with IMC evidence", async ({
  page,
}) => {
  const filename = process.env.XC_GATEWAY_REFERENCE_DOCX;
  test.skip(!filename, "Supply the approved local reference DOCX fixture.");
  const text = await upload(
    page,
    "reference-only.docx",
    readFileSync(filename!),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(extractUpstream(text).fields.originalRTB.sourceValue).toContain(
    "5G Battery Back-Up",
  );
  expect(extractUpstream(text).fields.originalRTB.sourceValue).toContain(
    "compatible Gateway setups",
  );
  expect(text).not.toContain("More family tools");
});
