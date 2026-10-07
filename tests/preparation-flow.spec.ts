import { test, expect, type Page } from "@playwright/test";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { emptyExecution, prefillExecution } from "../lib/execution";
import { compileInputPack, emptyPreparation } from "../lib/preparation";
import type { StrategySession } from "../lib/types";

const readSession = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );

test("research-only V2, restored versions, selected foundation and approved execution remain connected", async ({
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
  await page
    .getByRole("button", { name: "Generate Strategic Perspectives" })
    .click();
  await expect(
    page.getByRole("article", { name: "Humorous / Witty" }),
  ).toBeVisible();
  const roundTable = await readSession(page);
  expect(roundTable.outputs).toHaveLength(5);
  const sparkOutput = roundTable.preparation.outputs.find(
    (o) => o.agentId === "sparks",
  )!;
  const currentSparks = sparkOutput.versions.find(
    (v) => v.id === sparkOutput.currentVersionId,
  )!;
  expect(roundTable.sharedPack!.sparks).toBe(
    [currentSparks.sparks[0].text, currentSparks.sparks[2].text].join("\n"),
  );
  expect(roundTable.sharedPack!.selectedSparks).toHaveLength(2);
  expect(roundTable.sharedPack!.research).toContain("REFINEMENT V2");
  expect(roundTable.sharedPack!.researchFocus).toBe(
    "Explore a shared social ritual.",
  );
  expect(roundTable.approved).toBeNull();
  await expect(
    page.getByRole("button", { name: /Execution direction/ }),
  ).toBeDisabled();
  await page
    .getByRole("article", { name: "Humorous / Witty" })
    .getByRole("button", { name: "Select this version" })
    .click();
  await page
    .getByRole("button", { name: "Use as final line", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve & Continue" }).click();
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
  expect(approved.sourcePerspectives).toHaveLength(1);
  expect(approved.strategyInputPack).toEqual(roundTable.sharedPack);
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
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
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
