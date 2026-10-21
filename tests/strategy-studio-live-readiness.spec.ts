import { expect, test } from "@playwright/test";
import path from "node:path";
import { detectIMCCampaignScopes } from "../lib/imc-campaign-scope";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

const pdf = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const question = "What evidence is still missing for this campaign?";
for (const campaign of [
  "Movers - Campaign Extensions Refresh Brief",
  "Xfinity Pro - Campaign Extensions",
  "Movers – Campaign Extensions Refresh Brief",
]) {
  test(`offline real-PDF upload, duplicate metadata and eight-agent handoff: ${campaign}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    expect(process.env.AI_MODE).toBe("mock");
    expect(process.env.OPENAI_API_KEY).toBe("");
    expect(process.env.XC_OFFLINE_TEST).toBe("1");
    expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
      mode: "mock",
      provider: "mock",
    });
    const calls: AgentRequest[] = [],
      failures: string[] = [],
      unexpectedExternal: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().endsWith("/api/ai/agent"))
        calls.push(requestSchema.parse(req.postDataJSON()));
    });
    page.on("response", (res) => {
      if (res.url().endsWith("/api/ai/agent") && res.status() >= 400)
        failures.push(`HTTP ${res.status()}`);
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.hostname !== "127.0.0.1"
      ) {
        if (url.hostname !== "fonts.googleapis.com")
          unexpectedExternal.push(url.host);
        await route.abort();
      } else await route.continue();
    });
    await page.goto("/");
    await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
    const draft = page.getByRole("textbox", {
      name: "IMC output brief",
      exact: true,
    });
    await expect(draft).toHaveValue(/## Source page 12/, { timeout: 30000 });
    const sourceTitle = campaign.replace("–", "-");
    const scope = detectIMCCampaignScopes(await draft.inputValue()).find(
      (s) => s.title === sourceTitle,
    )!;
    expect(scope).toBeTruthy();
    const isProposed = campaign.includes("–");
    const source = scope.sourceText.replace(
      new RegExp(sourceTitle.replace(" - ", "\\s*[-–—]\\s*"), "g"),
      campaign,
    );
    const jobs = isProposed
      ? "## Proposed JTBD — internal testing material, NOT approved\nHelp movers transfer service without adding uncertainty."
      : "## Customer JTBD\nTransfer existing service during the move.\n\n## Prospect JTBD\nEstablish service in the new home.";
    const current = `Campaign: ${campaign}\nParent platform: Xfinity. Imagine That.\n\n${source}\n\nCampaign: ${campaign}\n\n${jobs}`;
    await draft.fill(current);
    expect(calls).toHaveLength(0);
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect(page.locator(".studio-agent-status")).toHaveText(
      ["Demo · V0", "Demo · V0", "Demo · V0"],
      { timeout: 60000 },
    );
    const sparks = page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice");
    await expect(sparks).toHaveCount(6);
    if (isProposed) {
      const rtb = page.getByRole("article", {
        name: "RTB / JTBD",
        exact: true,
      });
      await expect(rtb.locator(".studio-source-block").first()).toContainText(
        "Not supplied as a distinct JTBD.",
      );
      await expect(rtb.locator(".studio-source-block").nth(1)).toContainText(
        "SUPPLIED PROPOSED JTBD · NOT APPROVED",
      );
    }
    await sparks.first().getByRole("checkbox").check();
    await page
      .getByRole("article", { name: "RTB / JTBD", exact: true })
      .getByRole("checkbox")
      .check();
    await page
      .locator(".studio-data-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "Next: Insight Discovery", exact: true })
      .click();
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav.getByRole("button")).toHaveCount(4);
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    expect(calls).toHaveLength(3);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    await expect(page.locator(".v2-agent-status")).toHaveCount(5);
    for (const status of await page.locator(".v2-agent-status").all())
      await expect(status).toHaveText(/V0 · (Insights Ready)/, {
        timeout: 60000,
      });
    expect(calls).toHaveLength(8);
    const discovery = calls.filter(
      (call): call is Extract<AgentRequest, { agentType: "discovery" }> =>
        call.agentType === "discovery",
    );
    expect(new Set(discovery.map((r) => r.context.lens)).size).toBe(5);
    for (const call of discovery) {
      expect(call.context.question).toBe(question);
      expect(call.context.foundation.campaignContext.campaignName).toBe(
        campaign,
      );
      expect(call.context.foundation.sourceBrief).toBe(current);
      expect(call.context.foundation.parentPlatform).toMatchObject({
        name: "Imagine That",
        sourceValue: "Xfinity. Imagine That.",
      });
      expect(call.context.foundation.selectedSparks).toHaveLength(1);
      expect(call.context.foundation.currentRtb.proposal).not.toBe("");
      expect(call.context.foundation.currentRtb.approvalStatus).toBe("unknown");
      if (isProposed) {
        expect(
          call.context.foundation.campaignContext.jobToBeDone,
        ).toBeUndefined();
        expect(
          call.context.foundation.jtbdContext!.proposed[0].approvalStatus,
        ).toBe("not_approved");
      } else
        expect(call.context.foundation.jtbdContext!.original).toHaveLength(2);
    }
    expect(failures).toEqual([]);
    await page.reload();
    for (const status of await page.locator(".v2-agent-status").all())
      await expect(status).toHaveText(/V0 · (Insights Ready)/);
    await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
    await nav
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    expect(calls).toHaveLength(8);
    const forged = structuredClone(discovery[0]);
    forged.context.foundation.campaignContext.campaignName =
      "Forged different campaign";
    const rejected = await request.post("/api/ai/agent", { data: forged });
    expect(rejected.status()).toBe(422);
    expect(await rejected.json()).toMatchObject({
      code: "discovery_submission_mismatch",
      retryable: false,
    });
    expect(unexpectedExternal).toEqual([]);
  });
}
