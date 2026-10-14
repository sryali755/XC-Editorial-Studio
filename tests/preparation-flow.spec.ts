import { test, expect, type Page } from "@playwright/test";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { emptyExecution, prefillExecution } from "../lib/execution";
import {
  compileInputPack,
  demoIMCBrief,
  emptyPreparation,
} from "../lib/preparation";
import type { StrategySession } from "../lib/types";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

const readSession = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );

test("research-only V2, restored versions, selected foundation and human-approved execution remain connected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const research = page.getByRole("article", {
    name: "Data & Research Agent",
    exact: true,
  });
  const sparks = page.getByRole("article", {
    name: "Strategic Sparks Agent",
    exact: true,
  });
  const pack = page.getByRole("region", {
    name: "Dynamic XC Input Pack",
    exact: true,
  });
  await expect(research.locator(".card-top")).toContainText("V1 · Current");
  await expect(sparks.locator(".card-top")).toContainText("V1 · Current");
  await expect(page.locator(".preparation-card")).toHaveCount(3);
  for (const card of await page.locator(".preparation-card").all()) {
    await expect(card.locator(".agent-process")).toContainText("INPUT");
    await expect(card.locator(".agent-process")).toContainText(
      "HOW THIS AGENT THINKS",
    );
    await expect(card.locator(".agent-process")).toContainText("OUTPUT");
  }
  await expect(research.locator(".source-list")).toContainText(
    "Digital campaign performance",
  );
  await expect(research.locator(".source-list small")).toHaveCount(6);
  const initial = await readSession(page);
  await research
    .getByLabel("Guide Data & Research Agent", { exact: false })
    .fill("Focus on social rituals; validate the household insight.");
  await research.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V2 · Current");
  const refined = await readSession(page);
  for (const id of ["reasonToBelieve", "sparks"]) {
    expect(refined.preparation.outputs.find((o) => o.agentId === id)).toEqual(
      initial.preparation.outputs.find((o) => o.agentId === id),
    );
  }
  await expect(
    pack.getByRole("region", {
      name: "Supporting Data & Research",
      exact: true,
    }),
  ).toContainText("Focus on social rituals");
  await research.locator(".prep-history > summary").click();
  await research.getByRole("button", { name: "Make V1 current" }).click();
  await expect(
    pack.getByRole("region", {
      name: "Supporting Data & Research",
      exact: true,
    }),
  ).not.toContainText("Focus on social rituals");
  await research.getByRole("button", { name: "Make V2 current" }).click();
  await sparks.getByRole("checkbox").nth(0).check();
  await expect(pack.getByRole("checkbox").nth(0)).toBeChecked();
  await pack.getByRole("checkbox").nth(2).check();
  await expect(sparks.getByRole("checkbox").nth(2)).toBeChecked();
  await expect(pack.locator(".selection-count")).toContainText(
    "2 / 6 selected",
  );
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Explore a shared social ritual.");
  await page.reload();
  await expect(
    research.getByLabel("Guide Data & Research Agent", { exact: false }),
  ).toHaveValue("Focus on social rituals; validate the household insight.");
  await page.getByRole("button", { name: "Start Insight Discovery" }).click();
  await expect(
    page.locator(".lens-tabs button small", { hasText: "complete" }),
  ).toHaveCount(5);
  const discovery = await readSession(page);
  expect(discovery.discovery.runs).toHaveLength(5);
  expect(
    discovery.discovery.runs.every((run) => run.versions.length === 1),
  ).toBe(true);
  const sparkOutput = discovery.preparation.outputs.find(
    (o) => o.agentId === "sparks",
  )!;
  const currentSparks = sparkOutput.versions.find(
    (v) => v.id === sparkOutput.currentVersionId,
  )!;
  expect(discovery.sharedPack!.sparks).toBe(
    [currentSparks.sparks[0].text, currentSparks.sparks[2].text].join("\n"),
  );
  expect(discovery.sharedPack!.selectedSparks).toHaveLength(2);
  expect(discovery.sharedPack!.research).toContain("REFINEMENT V2");
  expect(discovery.sharedPack!.researchFocus).toBe(
    "Explore a shared social ritual.",
  );
  expect(discovery.approved).toBeNull();
  await expect(
    page.getByRole("button", { name: /Execution direction/ }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Brief line · written by Kevin" })
    .fill("Make dependable connection feel useful in the household ritual.");
  await page
    .getByRole("button", { name: "Approve human-authored strategy" })
    .click();
  await expect(
    page.getByText("APPROVED STRATEGY RECORD", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Give Creative a clear picture of what to create."),
  ).toBeVisible();
  await expect(page.getByLabel("Channels", { exact: false })).toHaveValue(
    "Web, email and paid social",
  );
  await expect(
    page.getByLabel("Messaging direction", { exact: false }),
  ).toContainText("Everyday connection for the moments that matter.");
  await expect(
    page.getByLabel("Required assets", { exact: false }),
  ).toBeEmpty();
  const approved = (await readSession(page)).approved!;
  expect(approved.approvalState).toBe("Approved");
  expect(approved.sourcePerspectives).toHaveLength(0);
  expect(approved.source).toBe("Human-authored in Insight Discovery");
  expect(approved.strategyInputPack).toEqual(discovery.sharedPack);
  await page
    .getByLabel("Required assets", { exact: false })
    .fill("Two campaign email headers");
  await page.getByLabel("Number of assets", { exact: false }).fill("2");
  await page
    .getByLabel("Copy requirements", { exact: false })
    .fill("One headline and CTA per email.");
  await page
    .getByLabel("Creative direction", { exact: true })
    .fill("Explore the approved social ritual.");
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  await expect(page.locator(".brief-paper")).toContainText(
    "Explore the approved social ritual.",
  );
  await expect(page.locator(".brief-paper")).toContainText("REFINEMENT V2");
  await expect(page.locator(".brief-paper")).toContainText("Approval Notes");
  expect(errors).toEqual([]);
});

test("regeneration sends current brief, selected content and steering while preserving version input history", async ({
  page,
}) => {
  const requests: AgentRequest[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/agent") && request.method() === "POST")
      requests.push(requestSchema.parse(request.postDataJSON()));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const research = page.getByRole("article", {
    name: "Data & Research Agent",
    exact: true,
  });
  const sparks = page.getByRole("article", {
    name: "Strategic Sparks Agent",
    exact: true,
  });
  await sparks.getByRole("checkbox").first().check();
  await research
    .getByLabel("Guide Data & Research Agent", { exact: false })
    .fill("Prioritize the selected human tension.");
  await research.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V2 · Current");
  const refinedRequest = requests
    .filter((request) => request.agentType === "research")
    .at(-1)!;
  expect(refinedRequest.guidance).toBe(
    "Prioritize the selected human tension.",
  );
  expect(refinedRequest.context).toHaveProperty(
    "selectedContent.selectedSparks.length",
    1,
  );
  const refinedState = await readSession(page);
  const researchV2 = refinedState.preparation.outputs
    .find((output) => output.agentId === "research")!
    .versions.find((version) => version.number === 2)!;
  expect(researchV2.inputContext).toMatchObject({
    sourceBrief: demoIMCBrief,
    steeringText: "Prioritize the selected human tension.",
  });
  expect(researchV2.inputContext!.selectedContent.selectedSparks).toHaveLength(
    1,
  );

  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(research.locator(".card-top")).toContainText("V3 · Current");
  await expect(research.locator(".version-label").first()).toContainText(
    "Prepared from current IMC brief",
  );
  await expect(research.locator(".version-label").first()).not.toContainText(
    "Initial preparation",
  );

  const replacement = demoIMCBrief.replace(
    "Campaign: Life, connected",
    "Campaign: A genuinely different current brief",
  );
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill(replacement);
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(research.locator(".card-top")).toContainText("V4 · Current");
  const latestRequest = requests
    .filter((request) => request.agentType === "research")
    .at(-1)!;
  if (latestRequest.agentType !== "research")
    throw new Error("Expected a Research request");
  expect(latestRequest.context.parsedIMC.sourceText).toBe(replacement);
  expect(latestRequest.previousVersion).toBeUndefined();
  expect(latestRequest.context).toHaveProperty(
    "selectedContent.selectedSparks.length",
    0,
  );
  const latestState = await readSession(page);
  const researchHistory = latestState.preparation.outputs.find(
    (output) => output.agentId === "research",
  )!.versions;
  expect(researchHistory).toHaveLength(4);
  expect(researchHistory[0].sourceBrief).toBe(replacement);
  expect(
    researchHistory
      .slice(1)
      .every((version) => version.sourceBrief === demoIMCBrief),
  ).toBe(true);
});

test("legacy repeated preparation labels do not describe V5 as initial", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const research = page.getByRole("article", {
    name: "Data & Research Agent",
    exact: true,
  });
  await expect(research.locator(".card-top")).toContainText("V1 · Current");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const session = JSON.parse(
          sessionStorage.getItem("xc-strategy-session-v1")!,
        );
        const output = session.preparation.outputs.find(
          (candidate: { agentId: string }) => candidate.agentId === "research",
        );
        return output?.versions.some(
          (version: { id: string }) => version.id === output.currentVersionId,
        );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const session = JSON.parse(
      sessionStorage.getItem("xc-strategy-session-v1")!,
    );
    const research = session.preparation.outputs.find(
      (output: { agentId: string }) => output.agentId === "research",
    );
    const current = research.versions.find(
      (version: { id: string }) => version.id === research.currentVersionId,
    );
    current.number = 5;
    current.guidance = "Initial preparation from IMC brief";
    sessionStorage.setItem("xc-strategy-session-v1", JSON.stringify(session));
  });
  await page.reload();
  await expect(research.locator(".version-label").first()).toContainText(
    "V5 · Prepared from current IMC brief",
  );
  await expect(research.locator(".version-label").first()).not.toContainText(
    "Initial preparation",
  );
});

test("CSV import preserves source fields and does not block sparse briefs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Import file for IMC output brief").setInputFiles({
    name: "campaign.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'field,value\ncampaign,"Test, campaign"\naudience,Students\nresearch,"First observation\nSecond observation"\npartnerApprovalStatus,Pending\naudienceExclusions,Intentionally excluded.',
    ),
  });
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const pack = page.locator(".dynamic-pack");
  await expect(pack).toContainText("Test, campaign");
  await expect(pack).toContainText("First observation");
  await expect(pack).toContainText("Not supplied");
  await expect(pack).toContainText("Intentionally excluded");
  const state = await readSession(page);
  expect(state.preparation.upstream!.fields.partnerApproval.value).toBe(
    "Pending",
  );
  expect(state.preparation.parsedIMC!.fields.research.value).toBe(
    "First observation\nSecond observation",
  );
  await expect(
    page.getByRole("article", {
      name: "Review & Adapt Upstream RTB",
      exact: true,
    }),
  ).toContainText("Not supplied in upstream brief");
  await pack.getByRole("checkbox").first().check();
  await expect(
    page.getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeEnabled();
});

test("header CSV/camelCase context and inherited execution refresh preserve manual edits", () => {
  const csv = parseIMCBrief(
    "campaign,channels,reasonToBelieve,partnerApprovalStatus\nSpring,Email,Original proof,Pending",
  );
  expect(csv.fields.reason_to_believe.value).toBe("Original proof");
  expect(csv.supplemental.partnerApproval!.value).toBe("Pending");
  const brief =
    "campaign: Spring\nchannels: Web\nbrandMessaging: Exact wording\nmessagingApproval: Pending\nmessageHierarchy: Human first\naudienceExclusions: Intentionally excluded.\npartnerApprovalStatus: Awaiting partner";
  const pack = compileInputPack({
    ...emptyPreparation,
    upstreamDraft: brief,
    sourceSnapshot: brief,
    upstream: extractUpstream(brief),
  });
  expect(pack.upstream!.fields.exclusions.status).toBe(
    "Intentionally excluded",
  );
  const execution = prefillExecution(emptyExecution, pack);
  expect(execution.channels).toBe("Web");
  expect(execution.messaging).toContain("Pending");
  expect(execution.requiredAssets).toBe("");
  const next = prefillExecution(
    { ...execution, messaging: "Kevin's direction" },
    { ...pack, channel: "Email" },
    pack,
  );
  expect(next.channels).toBe("Email");
  expect(next.messaging).toBe("Kevin's direction");
});
