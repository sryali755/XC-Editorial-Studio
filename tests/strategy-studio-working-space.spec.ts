import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Locator } from "@playwright/test";
import {
  compactParse,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  studioPack,
  seedStudioDiscovery,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import type { DiscoveryState } from "../lib/types";

const fixtureDir = path.join(__dirname, "fixtures/client-input-pack");
const clientPdf = path.join(
  fixtureDir,
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const campaigns = (
  JSON.parse(
    readFileSync(
      path.join(fixtureDir, "imagine_that_expected_input_pack.json"),
      "utf8",
    ),
  ) as {
    campaigns: {
      title: string;
      must_not_import_from_other_campaign: string[];
    }[];
  }
).campaigns;
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
const canvas = (page: Page) =>
  page.getByRole("region", { name: "Strategy Canvas" });
const externalAttempts = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, request }) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Working Space acceptance requires Discovery mode.",
  );
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  const attempts: string[] = [];
  externalAttempts.set(page, attempts);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      if (url.hostname !== "fonts.googleapis.com") attempts.push(url.hostname);
      await route.abort();
    } else await route.continue();
  });
});
test.afterEach(async ({ page }) => {
  expect(externalAttempts.get(page) ?? []).toEqual([]);
});

async function upload(page: Page) {
  await page.goto("/");
  await page.getByLabel("Import file for IMC brief").setInputFiles(clientPdf);
  await expect(
    page.getByRole("textbox", { name: "IMC output brief" }),
  ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
}
async function chooseCampaign(page: Page, index: number) {
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  const picker = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  const value = await picker
    .locator("option")
    .filter({ hasText: campaigns[index].title })
    .getAttribute("value");
  await picker.selectOption(value!);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    [/V0.*Demo/, /V0.*Demo/, /V0.*Demo/],
    { timeout: 60_000 },
  );
  await expect(page.locator(".studio-header")).toContainText(
    campaigns[index].title,
  );
}
async function workspaceState(page: Page, initialSuggestions = false) {
  const rawSession = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  expect(rawSession).toBeTruthy();
  const session = compactParse(rawSession!) as DiscoveryStudioSession;
  const pack = studioPack(session);
  const rawState = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    discoveryStorageKey(pack),
  );
  // Untouched starter fields are recreated from the preserved Input Pack;
  // an edited canvas must always have an independently saved draft.
  if (!rawState && initialSuggestions)
    return { session, pack, state: seedStudioDiscovery(pack) };
  expect(rawState, "Edited campaign canvas should be persisted").toBeTruthy();
  return { session, pack, state: compactParse(rawState!) as DiscoveryState };
}
async function openStrategy(page: Page) {
  await nav(page)
    .getByRole("button", { name: "Finalize Strategy", exact: true })
    .click();
  await expect(canvas(page)).toBeVisible();
}
async function settleResponse(
  page: Page,
  response: import("@playwright/test").Response,
) {
  await response.finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function startDiscovery(page: Page, index: number) {
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill(`What needs evidence in ${campaigns[index].title}?`);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Consumer Agent", exact: true })
      .locator(".v2-finding")
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  for (const status of await page.locator(".v2-agent-status").all())
    await expect(status).not.toHaveText("Exploring", { timeout: 60_000 });
}

test("saved Round Table findings evolve the shared Input Pack and stay versioned in Finalize Strategy", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.on("dialog", (dialog) => dialog.accept());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await upload(page);
  await expect(page.locator(".studio-prototype-note")).toHaveCount(0);
  await expect(
    page.getByText(/Starting an investigation uses paid AI requests/),
  ).toHaveCount(0);
  await expect(page.getByText("Campaign work saved in this tab")).toBeVisible();
  await chooseCampaign(page, 0);
  await startDiscovery(page, 0);

  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  const culture = page.getByRole("article", {
    name: "Culture Agent",
    exact: true,
  });
  const category = page.getByRole("article", {
    name: "Category Agent",
    exact: true,
  });
  const unsavedCategoryTitle = (
    await category.locator(".v2-finding").first().locator("h4").innerText()
  ).trim();
  const consumerV0 = consumer.locator(".v2-finding").first();
  const consumerTitleV0 = (await consumerV0.locator("h4").innerText()).trim();
  await consumerV0.locator(".v2-finding-actions button").click();
  await expect(consumer.locator(".v2-agent-status")).toContainText("V0");

  await consumer
    .getByRole("button", { name: "Regenerate Consumer Agent", exact: true })
    .click();
  await expect(consumer.locator(".v2-agent-status")).toContainText("V1", {
    timeout: 60_000,
  });
  const consumerV1 = consumer.locator(".v2-finding").first();
  const consumerTitleV1 = (await consumerV1.locator("h4").innerText()).trim();
  await consumerV1.locator(".v2-finding-actions button").click();

  const cultureFinding = culture.locator(".v2-finding").first();
  const cultureTitle = (await cultureFinding.locator("h4").innerText()).trim();
  await cultureFinding.locator(".v2-finding-actions button").click();

  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  const inputPackDetails = page.locator(".studio-pack-details");
  await inputPackDetails.locator("summary").first().click();
  await expect(inputPackDetails).toContainText("Saved Round Table Insights");
  const inputPackGroups = inputPackDetails.locator(".dynamic-pack-agent-group");
  await inputPackGroups.nth(0).locator("summary").first().click();
  await inputPackGroups.nth(1).locator("summary").first().click();
  await expect(inputPackGroups.nth(0)).toContainText(consumerTitleV0);
  await expect(inputPackGroups.nth(0)).toContainText(consumerTitleV1);
  await expect(inputPackGroups.nth(1)).toContainText(cultureTitle);

  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("button", { name: "Show full pack" }).click();

  const discoveryPack = page.locator(".v2-pack-content");
  await expect(discoveryPack).toBeVisible();
  await expect(discoveryPack).toContainText("Original Selected Context");
  await expect(discoveryPack).toContainText("Campaign");
  await expect(discoveryPack).toContainText("Campaign Objective");
  await expect(discoveryPack).toContainText("Target Audience");
  await expect(discoveryPack).toContainText("JTBD");
  await expect(discoveryPack).toContainText("Reasons to Believe (RTBs)");
  await expect(discoveryPack).toContainText("Data Points & Research");
  await expect(discoveryPack).toContainText("Sparks");
  await expect(discoveryPack).toContainText("Saved Round Table Insights");
  const discoveryGroups = discoveryPack.locator(".dynamic-pack-agent-group");
  const discoveryConsumerGroup = discoveryGroups.nth(0);
  await discoveryConsumerGroup.locator("summary").first().click();
  await expect(discoveryConsumerGroup.locator("summary").first()).toContainText(
    "2 saved findings",
  );
  await expect(discoveryConsumerGroup).toContainText(consumerTitleV0);
  await expect(discoveryConsumerGroup).toContainText(consumerTitleV1);
  await expect(
    discoveryConsumerGroup.locator(".dynamic-pack-saved-finding"),
  ).toHaveCount(2);
  await expect(
    discoveryConsumerGroup.locator(".dynamic-pack-saved-finding").nth(0),
  ).toContainText("V0");
  await expect(
    discoveryConsumerGroup.locator(".dynamic-pack-saved-finding").nth(1),
  ).toContainText("V1");
  const discoveryCultureGroup = discoveryGroups.nth(1);
  await discoveryCultureGroup.locator("summary").first().click();
  await expect(discoveryCultureGroup.locator("summary").first()).toContainText(
    "1 saved finding",
  );
  await expect(discoveryCultureGroup).toContainText(cultureTitle);
  const discoveryCategoryGroup = discoveryGroups.nth(2);
  await expect(discoveryCategoryGroup.locator("summary").first()).toContainText(
    "0 saved findings",
  );
  await expect(discoveryCategoryGroup).not.toContainText(unsavedCategoryTitle);

  await openStrategy(page);
  const strategyPack = page.locator(".studio-dynamic-pack-reference");
  await expect(strategyPack).toContainText("Dynamic Input Pack");
  await expect(strategyPack).toContainText(
    "Review the campaign context and insights you've selected throughout your strategy development.",
  );
  await strategyPack.locator("summary").first().click();
  await expect(strategyPack).toContainText("Original Selected Context");
  for (const field of [
    "Campaign",
    "Campaign Objective",
    "Target Audience",
    "JTBD",
    "Reasons to Believe (RTBs)",
    "Data Points & Research",
    "Sparks",
  ])
    await expect(strategyPack).toContainText(field);
  await expect(strategyPack).toContainText("Saved Round Table Insights");
  const strategyGroups = strategyPack.locator(".dynamic-pack-agent-group");
  await strategyGroups.nth(0).locator("summary").first().click();
  await strategyGroups.nth(1).locator("summary").first().click();
  await expect(strategyGroups.nth(0)).toContainText(consumerTitleV0);
  await expect(strategyGroups.nth(0)).toContainText(consumerTitleV1);
  await expect(strategyGroups.nth(1)).toContainText(cultureTitle);
  const problem = canvas(page).locator("#ws-problemStatement");
  await problem.fill("Kevin's manual strategy field remains unchanged.");
  await strategyPack.locator("summary").first().click();
  await strategyPack.locator("summary").first().click();
  await expect(problem).toHaveValue(
    "Kevin's manual strategy field remains unchanged.",
  );

  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  const currentCulture = page.getByRole("article", {
    name: "Culture Agent",
    exact: true,
  });
  await currentCulture
    .locator(".v2-finding")
    .first()
    .locator(".v2-finding-actions button")
    .click();
  await openStrategy(page);
  const reopenedPack = page.locator(".studio-dynamic-pack-reference");
  await reopenedPack.locator("summary").first().click();
  const reopenedGroups = reopenedPack.locator(".dynamic-pack-agent-group");
  await reopenedGroups.nth(0).locator("summary").first().click();
  await reopenedGroups.nth(1).locator("summary").first().click();
  await expect(reopenedGroups.nth(0)).toContainText(consumerTitleV0);
  await expect(reopenedGroups.nth(0)).toContainText(consumerTitleV1);
  await expect(reopenedGroups.nth(1).locator("summary")).toContainText(
    "0 saved findings",
  );
  await expect(reopenedGroups.nth(1)).not.toContainText(cultureTitle);
  await expect(reopenedGroups.nth(1)).toContainText(
    "No findings saved from this agent yet.",
  );
  await expect(problem).toHaveValue(
    "Kevin's manual strategy field remains unchanged.",
  );
});

// One Save Draft saves every Working Space field at once.
async function saveField(field: Locator) {
  const page = field.page();
  const drawer = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await ((await drawer.count()) ? drawer : canvas(page))
    .getByRole("button", { name: "Save Draft", exact: true })
    .click();
}

test("a delayed Movers suggestion cannot enter Xfinity Pro's human canvas", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await upload(page);
  await chooseCampaign(page, 0);
  await openStrategy(page);
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().postDataJSON().agentType === "strategySuggestions") {
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      started();
      await pending;
      await route.fulfill({ response: result });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Suggest brief lines", exact: true })
    .click();
  await requestStarted;
  await chooseCampaign(page, 1);
  await openStrategy(page);
  const humanLine = "Kevin's Xfinity Pro strategy remains his own.";
  await canvas(page)
    .getByRole("textbox", { name: "Brief line", exact: true })
    .fill(humanLine);
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/api/ai/agent") &&
      item.request().postDataJSON().agentType === "strategySuggestions",
  );
  release();
  await settleResponse(page, await response);
  const current = await workspaceState(page);
  expect(current.state.humanBriefLine).toBe(humanLine);
  expect(current.state.strategySuggestionRuns ?? []).toEqual([]);
  expect(current.session.approved).toBeNull();
  expect(current.session.briefs).toEqual([]);
  await expect(page.locator(".studio-suggestion-card")).toHaveCount(0);
});

async function exerciseHistory(field: Locator, first: string, second: string) {
  const controls = field.locator("..").locator(".ws-version-controls");
  // Save Draft versions every box at once, so read numbers rather than
  // assuming this field starts at V1.
  const savedNumber = async () =>
    Number(/Saved V(\d+)/.exec(await controls.innerText())?.[1]);
  await field.fill(first);
  await saveField(field);
  await expect(controls).toContainText(/Saved V\d+/);
  const firstNumber = await savedNumber();
  await field.fill(second);
  await saveField(field);
  await expect(controls).toContainText(`Saved V${firstNumber + 1}`);
  // History appears once versions exist; using one restores its exact text.
  await controls.getByText(/^History · \d+$/).click();
  await controls
    .getByRole("button", {
      name: new RegExp(`^Use version ${firstNumber} of `),
    })
    .click();
  await expect(field).toHaveValue(first);
  await expect(controls).toContainText(`Saved V${firstNumber}`);
  await field.fill(second);
  await expect(controls).toContainText("Unsaved changes");
  await saveField(field);
  await expect(controls).toContainText(`Saved V${firstNumber + 2}`);
}

for (const index of [0, 1]) {
  test(`${campaigns[index].title}: human fields, evidence, versions and explicit approval survive navigation and reload`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await upload(page);
    await chooseCampaign(page, index);
    const before = await workspaceState(page, true);
    const sourceRtb = before.pack.reasonToBelieve;
    expect(before.pack.rtbApprovalStatus).toBe("unknown");
    expect(before.state.workingRTB).toBe(sourceRtb);
    expect(before.session.approved).toBeNull();
    await page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await startDiscovery(page, index);
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    const brand = page.getByRole("article", {
      name: "Brand Agent",
      exact: true,
    });
    const consumerTitle = (
      await consumer.locator(".v2-finding h4").first().innerText()
    ).trim();
    const brandTitle = (
      await brand.locator(".v2-finding h4").first().innerText()
    ).trim();
    await consumer
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    await brand
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    // Saving findings must not rewrite the draft. First opening is a separate,
    // explicit initialization from the now-selected Input Pack.
    const afterSavingFindings = await workspaceState(page);
    expect(afterSavingFindings.state.humanBriefLine).toBe(
      before.state.humanBriefLine,
    );
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    const drawer = page.getByRole("dialog", {
      name: "Working Space",
      exact: true,
    });
    await expect(drawer).toContainText(
      "Fields begin with suggested starting content.",
    );
    const saved = drawer.locator(".saved-findings");
    await expect(saved.locator(".ws-findings > li")).toHaveCount(2);
    await expect(saved.getByRole("checkbox").first()).not.toBeChecked();
    const row = saved
      .locator(".ws-findings > li")
      .filter({ hasText: consumerTitle });
    await row.locator("summary").click();
    await expect(row).toContainText("Agent interpretation · unverified");
    await expect(row).toContainText("Source claim, not independently verified");
    const withFinding = await workspaceState(page);
    expect(withFinding.state.humanBriefLine).toBe(
      seedStudioDiscovery(withFinding.pack).humanBriefLine,
    );
    expect(withFinding.state.workspaceSuggestionContext?.opened).toBe(true);
    const finding = withFinding.state.runs
      .find((run) => run.lensId === "consumer")!
      .versions[0].findings.find((item) => item.title === consumerTitle)!;
    for (const evidence of finding.evidence) {
      expect(withFinding.pack.parsedIMC!.sourceText).toContain(
        evidence.excerpt,
      );
      await expect(row).toContainText(evidence.excerpt);
      await expect(row).toContainText(evidence.locator!);
    }
    expect(finding.inputPackVersion).toBe(
      withFinding.state.runs[0].versions[0].inputPackVersion,
    );
    expect(withFinding.state.runs[0].versions[0].question).toContain(
      campaigns[index].title,
    );
    await row
      .getByRole("button", { name: "Show on agent card", exact: true })
      .click();
    await consumer.locator(".v2-used-focus summary").click();
    await expect(consumer.locator(".v2-used-focus")).toContainText(
      withFinding.state.runs[0].versions[0].question,
    );
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    await saved
      .getByRole("button", {
        name: `Remove ${consumerTitle} from Working space`,
        exact: true,
      })
      .click();
    await expect(saved.locator(".ws-findings > li")).toHaveCount(1);
    await expect(saved).toContainText(brandTitle);
    await saved
      .getByText("Previously saved findings · 1", { exact: true })
      .click();
    await saved
      .getByRole("button", { name: "Restore to Working Space", exact: true })
      .click();
    await expect(saved.locator(".ws-findings > li")).toHaveCount(2);
    const values: Record<string, string> = {
      problemStatement: `Kevin ${index}: problem`,
      workingAudience: `Kevin ${index}: audience focus`,
      workingJTBD: `Kevin ${index}: proposed job`,
      workingRTB: `Kevin ${index}: unapproved proof adaptation`,
      evidenceInsights: `Kevin ${index}: tentative insight`,
      strategicDirection: `Kevin ${index}: direction`,
      openQuestions: `What evidence remains unresolved for campaign ${index}?`,
      executionConsiderations: `Kevin ${index}: execution notes`,
    };
    await drawer
      .getByText("Additional Strategy Details", {
        exact: true,
      })
      .click();
    await page.locator(".ws-private-notes > summary").click();
    for (const [key, value] of Object.entries(values)) {
      const field = drawer.locator(`#ws-${key}`);
      await field.fill(value);
      if (key !== "problemStatement") await saveField(field);
    }
    await exerciseHistory(
      drawer.locator("#ws-problemStatement"),
      values.problemStatement,
      `${values.problemStatement} revised`,
    );
    const line = drawer.getByRole("textbox", {
      name: "Brief line",
      exact: true,
    });
    const revisedLine = `Kevin ${index}: revised human brief line.`;
    await exerciseHistory(
      line,
      `Kevin ${index}: first human brief line.`,
      revisedLine,
    );
    await drawer
      .getByRole("textbox", { name: "Private notes", exact: true })
      .fill(`Kevin ${index}: private note`);
    await saveField(
      drawer.getByRole("textbox", { name: "Private notes", exact: true }),
    );
    await drawer
      .getByText(
        "From the IMC brief · objective, deliverables, mandatories, timelines",
        { exact: true },
      )
      .click();
    // Objective is a read-only source fact; the execution fields stay editable.
    await expect(drawer.locator("#ws-whole-objective")).toHaveCount(0);
    await expect(drawer.locator(".ws-readonly").first()).toContainText(
      before.pack.objective.split("\n")[0],
    );
    const wholeValues: Record<string, string> = {};
    for (const key of ["deliverables", "mandatories", "timelines"]) {
      const field = drawer.locator(`#ws-whole-${key}`);
      wholeValues[key] = `Kevin ${index}: ${key}`;
      if (key === "deliverables")
        await exerciseHistory(
          field,
          `${wholeValues[key]} first`,
          wholeValues[key],
        );
      else {
        await field.fill(wholeValues[key]);
        await saveField(field);
      }
    }
    await expect(drawer.locator(".ws-rtb")).toHaveText(sourceRtb);
    await expect(drawer).toContainText("Upstream approval: unknown");
    await drawer.locator("#ws-workingJTBD").fill("");
    await page
      .getByRole("button", { name: "Close Working Space", exact: true })
      .click();
    await openStrategy(page);
    const inline = canvas(page);
    await expect(
      inline.getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(revisedLine);
    await expect(inline.locator("#ws-workingJTBD")).toHaveValue("");
    expect((await inline.boundingBox())!.width).toBeGreaterThan(1000);
    await expect(page.locator(".studio-final-heading-card")).toContainText(
      "Draft strategy · not yet confirmed",
    );
    await expect(
      page.getByRole("button", { name: "Generate XC Brief", exact: true }),
    ).toBeDisabled();
    await nav(page)
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    await openStrategy(page);
    await page.reload();
    await expect(canvas(page)).toBeVisible();
    const restored = await workspaceState(page);
    expect(restored.session.approved).toBeNull();
    expect(restored.state.humanBriefLine).toBe(revisedLine);
    expect(restored.state.problemStatement).toBe(
      `${values.problemStatement} revised`,
    );
    expect(restored.state.workingJTBD).toBe("");
    expect(restored.state.wholeBrief).toEqual(wholeValues);
    // Newest first: re-saved revision, revision, then the first human text.
    expect(
      restored.state
        .fieldVersions!.humanBriefLine.slice(0, 3)
        .map((item) => item.value),
    ).toEqual([
      revisedLine,
      revisedLine,
      `Kevin ${index}: first human brief line.`,
    ]);
    expect(
      restored.state
        .fieldVersions!["wholeBrief.deliverables"].slice(0, 3)
        .map((item) => item.value),
    ).toEqual([
      wholeValues.deliverables,
      wholeValues.deliverables,
      `${wholeValues.deliverables} first`,
    ]);
    expect(restored.state.savedFindingIds).toHaveLength(2);
    expect(restored.pack.reasonToBelieve).toBe(sourceRtb);
    const context = page.locator(".studio-final-context");
    await context
      .getByRole("checkbox", {
        name: `Agent finding: ${consumerTitle}`,
        exact: true,
      })
      .uncheck();
    await context
      .getByRole("button", { name: "Confirm current strategy", exact: true })
      .click();
    await expect(page.locator(".studio-final-heading-card")).toContainText(
      "HUMAN-APPROVED STRATEGY",
    );
    const approved = await workspaceState(page);
    expect(approved.session.screen).toBe("strategy");
    expect(approved.session.briefs).toEqual([]);
    expect(approved.session.approved!.strategyInputPack.reasonToBelieve).toBe(
      sourceRtb,
    );
    expect(approved.session.approved!.strategyInputPack.rtbApprovalStatus).toBe(
      "unknown",
    );
    const snapshot =
      approved.session.approvalSnapshots[approved.session.approved!.approvedAt];
    expect(snapshot.humanBriefLine).toBe(revisedLine);
    expect(snapshot.workingRTB).toBe(values.workingRTB);
    expect(
      snapshot.fieldVersions!.humanBriefLine.slice(0, 3).map((x) => x.value),
    ).toEqual([
      revisedLine,
      revisedLine,
      `Kevin ${index}: first human brief line.`,
    ]);
    expect(snapshot.savedFindingIds).toHaveLength(1);
    expect(
      snapshot.runs
        .flatMap((run) => run.versions.flatMap((version) => version.findings))
        .find((item) =>
          snapshot.savedFindingIds.includes(`${item.id}@${item.runVersion}`),
        )?.title,
    ).toBe(brandTitle);
    await canvas(page)
      .getByRole("textbox", { name: "Brief line", exact: true })
      .fill(`${revisedLine} Later revision.`);
    await expect(
      page.getByRole("button", { name: "Generate XC Brief", exact: true }),
    ).toBeDisabled();
    await context
      .getByRole("button", { name: "Confirm current strategy", exact: true })
      .click();
    const later = await workspaceState(page);
    expect(later.session.approvals).toHaveLength(2);
    expect(later.session.approvals[1]).toEqual(approved.session.approved);
    expect(
      later.session.approvalSnapshots[approved.session.approved!.approvedAt],
    ).toEqual(snapshot);
    await page.getByText("Approval history · 2", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Review this confirmed snapshot",
        exact: true,
      })
      .last()
      .click();
    await expect(
      canvas(page).getByRole("textbox", { name: "Brief line", exact: true }),
    ).toHaveValue(`${revisedLine} Later revision.`);
    await expect(
      page.getByRole("button", { name: "Generate XC Brief", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: test.info().outputPath(`r4-campaign-${index + 1}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const narrowLine = canvas(page).getByRole("textbox", {
      name: "Brief line",
      exact: true,
    });
    await narrowLine.fill(`${revisedLine} Narrow-screen revision.`);
    await saveField(narrowLine);
    await narrowLine.scrollIntoViewIfNeeded();
    await expect(narrowLine).toBeInViewport();
    const bounds = (await narrowLine.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: test.info().outputPath(`r4-campaign-${index + 1}-narrow.png`),
    });
    const narrowSaved = canvas(page)
      .locator(".saved-findings .ws-findings > li")
      .first();
    await narrowSaved.locator("summary").click();
    await expect(narrowSaved).toContainText(
      "Source claim, not independently verified",
    );
    await narrowSaved.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test
        .info()
        .outputPath(`r4-campaign-${index + 1}-narrow-evidence.png`),
    });
  });
}

test("both real campaigns restore their own human drafts, versions and saved support", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await upload(page);
  const originals: Awaited<ReturnType<typeof workspaceState>>[] = [];
  for (const index of [0, 1]) {
    await chooseCampaign(page, index);
    await startDiscovery(page, index);
    await page
      .getByRole("article", { name: "Consumer Agent", exact: true })
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .first()
      .click();
    await openStrategy(page);
    const line = canvas(page).getByRole("textbox", {
      name: "Brief line",
      exact: true,
    });
    if (index === 1) {
      await expect(line).not.toHaveValue("Movers: Kevin's own strategy");
      expect((await workspaceState(page)).state.savedFindingIds).not.toEqual(
        originals[0].state.savedFindingIds,
      );
    }
    await line.fill(
      index === 0
        ? "Movers: Kevin's own strategy"
        : "Xfinity Pro: Kevin's own strategy",
    );
    await saveField(line);
    await canvas(page)
      .locator("#ws-problemStatement")
      .fill(`Human problem for ${campaigns[index].title}`);
    await saveField(canvas(page).locator("#ws-problemStatement"));
    originals.push(await workspaceState(page));
  }
  for (const index of [0, 1, 0]) {
    await chooseCampaign(page, index);
    await openStrategy(page);
    const restored = await workspaceState(page);
    expect(restored.state.humanBriefLine).toBe(
      originals[index].state.humanBriefLine,
    );
    expect(restored.state.problemStatement).toBe(
      originals[index].state.problemStatement,
    );
    expect(restored.state.fieldVersions).toEqual(
      originals[index].state.fieldVersions,
    );
    expect(restored.state.savedFindingIds).toEqual(
      originals[index].state.savedFindingIds,
    );
    expect(restored.state.runs).toEqual(originals[index].state.runs);
    for (const forbidden of campaigns[index]
      .must_not_import_from_other_campaign)
      expect(restored.pack.parsedIMC!.sourceText).not.toContain(forbidden);
    expect(restored.session.approved).toBeNull();
    expect(restored.session.briefs).toEqual([]);
  }
  await page.reload();
  await expect(
    canvas(page).getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue(originals[0].state.humanBriefLine!);
});

test("later Discovery and suggestion results preserve newer human edits and field history", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await upload(page);
  await chooseCampaign(page, 0);
  await startDiscovery(page, 0);
  const before = await workspaceState(page);
  const releases: Record<string, () => void> = {};
  const starts: Record<string, Promise<void>> = {};
  const markStarted: Record<string, () => void> = {};
  for (const kind of ["discovery", "strategySuggestions"])
    starts[kind] = new Promise((resolve) => {
      markStarted[kind] = resolve;
    });
  await page.route("**/api/ai/agent", async (route) => {
    const kind = route.request().postDataJSON().agentType as string;
    if (kind === "discovery" || kind === "strategySuggestions") {
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      const pending = new Promise<void>((resolve) => {
        releases[kind] = resolve;
      });
      markStarted[kind]();
      await pending;
      await route.fulfill({ response: result });
    } else await route.continue();
  });
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await consumer
    .getByRole("button", { name: "Expand Consumer Agent", exact: true })
    .click();
  await consumer
    .getByRole("textbox", {
      name: "Your message to Consumer Agent",
      exact: true,
    })
    .fill("Why?");
  await consumer
    .getByRole("button", { name: "Ask this agent", exact: true })
    .click();
  await starts.discovery;
  await openStrategy(page);
  const line = canvas(page).getByRole("textbox", {
    name: "Brief line",
    exact: true,
  });
  await line.fill("Kevin's earlier saved line");
  await saveField(line);
  await page
    .getByRole("button", { name: "Suggest brief lines", exact: true })
    .click();
  await starts.strategySuggestions;
  await line.fill("Kevin's newer line must win");
  await saveField(line);
  await canvas(page)
    .locator("#ws-problemStatement")
    .fill("Kevin's newer problem must win");
  await saveField(canvas(page).locator("#ws-problemStatement"));
  await canvas(page)
    .getByText("Additional Strategy Details", {
      exact: true,
    })
    .click();
  await page.locator(".ws-private-notes > summary").click();
  await canvas(page)
    .locator("#ws-openQuestions")
    .fill("Which evidence is still missing?");
  for (const kind of ["discovery", "strategySuggestions"]) {
    const response = page.waitForResponse(
      (item) =>
        item.url().endsWith("/api/ai/agent") &&
        item.request().postDataJSON().agentType === kind,
    );
    releases[kind]();
    await settleResponse(page, await response);
  }
  await expect(line).toHaveValue("Kevin's newer line must win");
  const current = await workspaceState(page);
  expect(current.state.problemStatement).toBe("Kevin's newer problem must win");
  expect(current.state.openQuestions).toBe("Which evidence is still missing?");
  expect(current.state.fieldVersions!.humanBriefLine).toHaveLength(2);
  expect(current.state.runs[0].versions).toHaveLength(
    before.state.runs[0].versions.length + 1,
  );
  expect(current.state.strategySuggestionRuns).toHaveLength(1);
  expect(current.session.approved).toBeNull();
  expect(current.session.briefs).toEqual([]);
  await expect(
    page.getByRole("region", { name: "Brief-line suggestions" }),
  ).toContainText("These suggestions use older inputs");
  for (const button of await page
    .getByRole("button", { name: "Use as editable draft", exact: true })
    .all())
    await expect(button).toBeDisabled();
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await consumer
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  const drawer = page.getByRole("dialog", {
    name: "Working Space",
    exact: true,
  });
  await expect(
    drawer.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("Kevin's newer line must win");
  await expect(drawer.locator(".saved-findings")).toContainText("Research gap");
  const afterSave = await workspaceState(page);
  expect(afterSave.state.fieldVersions).toEqual(current.state.fieldVersions);
  expect(afterSave.state.openQuestions).toBe(current.state.openQuestions);
  expect(afterSave.state.savedFindingIds).toHaveLength(1);
  expect(afterSave.session.approved).toBeNull();
});
