import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readStudio } from "../../lib/discovery-studio";

test("live brief build preserves the original source and verifies every Spark", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.XC_LIVE_E2E !== "1",
    "Explicit live-test opt-in required.",
  );
  const brief = process.env.XC_LIVE_BRIEF;
  expect(brief).toBeTruthy();
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "live",
    provider: "writer",
    configured: true,
  });
  page.on("dialog", (dialog) => void dialog.accept());
  const calls: {
    agent: string;
    status: number;
    code?: string;
    error?: string;
  }[] = [];
  page.on("response", async (response) => {
    if (
      !response.url().endsWith("/api/ai/agent") ||
      response.request().method() !== "POST"
    )
      return;
    const body = await response.json();
    const call = {
      agent: response.request().postDataJSON().agentType,
      status: response.status(),
      code: body.code,
      error: body.error,
    };
    calls.push(call);
    console.info("[live-input-pack]", JSON.stringify(call));
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page
    .getByLabel("Import file for IMC brief", { exact: true })
    .setInputFiles(brief!);
  const imported = page.getByRole("textbox", {
    name: "IMC output brief",
    exact: true,
  });
  await expect(imported).not.toHaveValue("");
  const source = await imported.inputValue();
  const campaignScope = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const multipleCampaigns = (await campaignScope.count()) > 0;
  if (multipleCampaigns) {
    const requestedScope = process.env.XC_LIVE_CAMPAIGN_SCOPE?.trim();
    expect(
      requestedScope,
      "This document contains multiple campaigns. Set XC_LIVE_CAMPAIGN_SCOPE to the campaign to test.",
    ).toBeTruthy();
    const matches = (
      await campaignScope.locator("option").allTextContents()
    ).filter((label) =>
      label.toLowerCase().includes(requestedScope!.toLowerCase()),
    );
    expect(
      matches,
      "Campaign scope must identify exactly one option",
    ).toHaveLength(1);
    await campaignScope.selectOption({ label: matches[0] });
  }
  const campaignName = page.getByRole("textbox", {
    name: "Campaign name",
    exact: true,
  });
  if (!(await campaignName.inputValue()).trim()) {
    const suppliedName = process.env.XC_LIVE_CAMPAIGN_NAME?.trim();
    expect(
      suppliedName,
      "This brief has no unambiguous campaign name. Set XC_LIVE_CAMPAIGN_NAME to an explicitly chosen test name.",
    ).toBeTruthy();
    await campaignName.fill(suppliedName!);
  }
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect.poll(() => calls.length, { timeout: 290_000 }).toBe(3);
  expect(calls.filter((call) => call.status >= 400)).toEqual([]);
  await expect(page.locator(".studio-agent-status")).toHaveText([
    /V0/,
    /V0/,
    /V0/,
  ]);
  const output =
    process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-input-pack";
  mkdirSync(output, { recursive: true });
  const storage = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(sessionStorage).map((key) => [
        key,
        sessionStorage.getItem(key)!,
      ]),
    ),
  );
  writeFileSync(
    path.join(output, "input-pack-checkpoint.json"),
    JSON.stringify({ storage, calls }),
  );
  const { session } = readStudio({ getItem: (key) => storage[key] ?? null });
  if (multipleCampaigns) {
    expect(session.sourceDocumentText).toBe(source);
    expect(session.selectedCampaignScope).toBeTruthy();
    expect(session.preparation.sourceSnapshot).toContain(
      process.env.XC_LIVE_CAMPAIGN_SCOPE!,
    );
  } else expect(session.preparation.sourceSnapshot).toBe(source);
  const sparks = session.preparation.outputs.find(
    (output) => output.agentId === "sparks",
  )!.versions[0].sparks;
  expect(sparks).toHaveLength(6);
  for (const spark of sparks) {
    expect(spark.excerpt_verified).toBe(true);
    expect(session.preparation.sourceSnapshot.includes(spark.excerpt!)).toBe(
      true,
    );
  }
  await page.screenshot({
    path: path.join(output, "input-pack.png"),
    fullPage: true,
  });
  console.info(
    "[live-input-pack] PASS",
    JSON.stringify({ agents: 3, verifiedSparks: 6 }),
  );
});
