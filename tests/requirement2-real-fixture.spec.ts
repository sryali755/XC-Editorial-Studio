import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

const fixtureDir = path.join(__dirname, "fixtures/client-input-pack");
const pdf = path.join(
  fixtureDir,
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const expectedFile = path.join(
  fixtureDir,
  "imagine_that_expected_input_pack.json",
);
const names = [
  "Consumer Agent",
  "Culture Agent",
  "Category Agent",
  "Brand Agent",
  "Analogous Solutions Agent",
];

type Expected = {
  campaigns: {
    title: string;
    expected_fields: { field: string; contains: string }[];
    must_not_import_from_other_campaign: string[];
  }[];
  shared_brand_guidance: { exact_source_excerpt: string }[];
};

async function savedBrandFinding(page: Page) {
  return page.evaluate(async () => {
    const drafts: string[] = Object.keys(sessionStorage)
      .filter((key) => key.startsWith("xc-insight-discovery-v2:"))
      .flatMap((key) => {
        const raw = sessionStorage.getItem(key);
        return raw ? [raw] : [];
      });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("xc-insight-workspace", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const entries = await new Promise<{ key: string; raw: string }[]>(
        (resolve, reject) => {
          const reading = database
            .transaction("entries", "readonly")
            .objectStore("entries")
            .getAll();
          reading.onsuccess = () => resolve(reading.result);
          reading.onerror = () => reject(reading.error);
        },
      );
      drafts.push(
        ...entries
          .filter((entry) => entry.key.startsWith("xc-insight-discovery-v2:"))
          .map((entry) => entry.raw),
      );
    } finally {
      database.close();
    }
    const newest = drafts
      .map((raw) => JSON.parse(raw))
      .sort((left, right) => right.$savedAt - left.$savedAt)[0];
    const state = newest?.$value;
    const brand = state?.runs?.find(
      (run: { lensId: string }) => run.lensId === "brand",
    );
    return {
      saved: state?.savedFindingIds ?? [],
      finding: brand?.versions?.[0]?.findings?.[0] ?? null,
    };
  });
}

for (const campaignIndex of [0, 1]) {
  test(`actual PDF campaign ${campaignIndex + 1} supplies one shared snapshot to all five Discovery agents`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    test.skip(
      process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
      "Requires the primary Discovery mode.",
    );
    expect(existsSync(pdf), "The approved client PDF fixture is required").toBe(
      true,
    );
    expect(
      existsSync(expectedFile),
      "The approved field expectations are required",
    ).toBe(true);
    const expected = JSON.parse(readFileSync(expectedFile, "utf8")) as Expected;
    const campaign = expected.campaigns[campaignIndex];
    const status = await request.get("/api/ai/agent");
    expect(await status.json()).toMatchObject({
      mode: "mock",
      provider: "mock",
    });

    const blockedExternal: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      ) {
        blockedExternal.push(url.host);
        await route.abort();
      } else await route.continue();
    });
    const calls: AgentRequest[] = [];
    page.on("request", (value) => {
      if (value.url().includes("/api/ai/agent") && value.method() === "POST")
        calls.push(requestSchema.parse(value.postDataJSON()));
    });

    await page.goto("/");
    await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
    await expect(
      page.getByRole("textbox", { name: "IMC output brief" }),
    ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
    const scope = page.getByRole("combobox", {
      name: "Campaign in this document",
    });
    const choice = scope.locator("option").filter({ hasText: campaign.title });
    await scope.selectOption((await choice.getAttribute("value"))!);
    await page.getByRole("button", { name: "Build Input Pack" }).click();

    const rtb = page.getByRole("article", { name: "RTB / JTBD" });
    const research = page.getByRole("article", {
      name: "Data Analysis & Synthesis",
    });
    const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
    await expect(sparks.locator(".spark-choice")).toHaveCount(6);
    await rtb.getByRole("checkbox").check();
    await research
      .locator(".studio-data-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await sparks.locator(".spark-choice").first().getByRole("checkbox").check();

    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    for (const name of names)
      await expect(
        page
          .getByRole("article", { name, exact: true })
          .locator(".v2-agent-status"),
      ).toHaveText("Awaiting Exploration");
    await page.waitForTimeout(500);
    expect(calls.filter((call) => call.agentType === "discovery")).toHaveLength(
      0,
    );

    const question = `What needs evidence before ${campaign.title} can address its campaign objective?`;
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    await expect(page.locator(".discovery-run-status")).toHaveCount(0, {
      timeout: 60_000,
    });
    const discoveryCalls = calls.filter(
      (call): call is Extract<AgentRequest, { agentType: "discovery" }> =>
        call.agentType === "discovery",
    );
    expect(discoveryCalls).toHaveLength(5);
    expect(new Set(discoveryCalls.map((call) => call.context.lens)).size).toBe(
      5,
    );
    const shared = discoveryCalls[0].context.foundation;
    for (const call of discoveryCalls) {
      expect(call.context.question).toBe(question);
      expect(call.context.foundation).toEqual(shared);
      expect(call.context.foundation.campaignContext.campaignName).toBe(
        campaign.title,
      );
    }
    expect(shared.sourceBrief?.replace(/\s*[-–—]\s*/g, " - ")).toContain(
      campaign.title.replace(/\s*[-–—]\s*/g, " - "),
    );
    expect(shared.sourceBrief).toContain(
      campaign.expected_fields.find((field) => field.field === "audience")!
        .contains,
    );
    for (const forbidden of campaign.must_not_import_from_other_campaign)
      expect(JSON.stringify(shared)).not.toContain(forbidden);
    for (const guidance of expected.shared_brand_guidance)
      expect(shared.sourceBrief).toContain(guidance.exact_source_excerpt);
    expect(shared.campaignContext.jobToBeDone).toBeUndefined();
    expect(shared.currentRtb.approvalStatus).toBe("unknown");
    expect(shared.selectedSparks).toHaveLength(1);
    expect(shared.selectedResearch).toHaveLength(1);
    expect(shared.selectedPreparationVersions?.reasonToBelieve).toBeTruthy();
    expect(shared.selectedPreparationVersions?.research).toBeTruthy();
    expect(shared.selectedPreparationVersions?.sparks).toBeTruthy();
    expect(shared.sourceAvailability).toContainEqual(
      expect.objectContaining({ source: "Tableau", status: "not_connected" }),
    );

    const brand = page.getByRole("article", {
      name: "Brand Agent",
      exact: true,
    });
    await expect(brand.locator(".v2-finding").first()).toBeVisible();
    const humanLine = `Kevin's draft for ${campaign.title}.`;
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    const briefLine = page
      .getByRole("dialog", { name: "Working Space" })
      .getByRole("textbox", { name: "Brief line" });
    await briefLine.fill(humanLine);
    await page.getByRole("button", { name: "Close Working Space" }).click();
    await brand
      .locator(".v2-finding")
      .first()
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .click();
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    await expect(briefLine).toHaveValue(humanLine);
    await page.getByRole("button", { name: "Close Working Space" }).click();
    await expect
      .poll(async () => {
        const { finding, saved } = await savedBrandFinding(page);
        return (
          !!finding && saved.includes(`${finding.id}@${finding.runVersion}`)
        );
      })
      .toBe(true);
    const { finding: snapshot } = await savedBrandFinding(page);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.provider).toBe("mock");
    expect(snapshot!.evidence.length).toBeGreaterThan(0);
    expect(snapshot!.whatComplicatesIt).toBeTruthy();
    expect(snapshot!.inputPackVersion).toBeTruthy();
    expect(snapshot!.researchRunId).toBeTruthy();
    await page.reload();
    await expect(
      brand
        .locator(".v2-finding")
        .first()
        .getByRole("button", { name: "Saved to Working Space", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    await expect(briefLine).toHaveValue(humanLine);
    await page.getByRole("button", { name: "Close Working Space" }).click();
    const { finding: restored } = await savedBrandFinding(page);
    expect(restored).toEqual(snapshot);
    expect(
      blockedExternal.every(
        (host) =>
          host === "fonts.googleapis.com" || host === "fonts.gstatic.com",
      ),
    ).toBe(true);
  });
}
