import { test, expect, type Page } from "@playwright/test";
import { selectedFoundation } from "../lib/ai/context";
import { parseIMCBrief } from "../lib/imc-parser";
import {
  candidateUnavailable,
  restoreInputPack,
  snapshotInputPack,
  sparkReasoning,
  sparkSourceMatches,
} from "../lib/input-pack";
import { compileInputPack, currentPreparation } from "../lib/preparation";
import type { StrategySession } from "../lib/types";

const session = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );
const pack = (page: Page) =>
  page.getByRole("region", { name: "Dynamic XC Input Pack", exact: true });
const tray = (page: Page) =>
  page.getByRole("region", { name: "Selected Sparks tray", exact: true });
const agent = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true });
async function prepare(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(pack(page).getByRole("checkbox")).toHaveCount(6);
  await expect(pack(page).locator(".pack-checks")).toContainText(
    "3 / 3 preparation outputs match the brief",
  );
}

test("trace, selection tray and preview preserve source and send the exact preview to all five discovery lenses", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests: unknown[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai/agent") && r.method() === "POST") {
      const body = r.postDataJSON();
      if (body.agentType === "discovery")
        requests.push(body.context.foundation);
    }
  });
  await prepare(page);
  const before = await session(page);
  const first = currentPreparation(before.preparation, "sparks")!.sparks[0];
  await pack(page)
    .getByRole("button", { name: `Trace this idea: ${first.title}` })
    .click();
  const trace = page.getByRole("dialog");
  await expect(trace).toContainText(first.text);
  await expect(
    trace.getByRole("region", { name: "Source trace" }),
  ).toContainText(before.preparation.parsedIMC!.fields.audience.sourceValue);
  await expect(trace).toContainText("A text match does not verify");
  await trace.getByRole("button", { name: "Add to pack" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    pack(page).getByRole("button", { name: `Trace this idea: ${first.title}` }),
  ).toBeFocused();
  await expect(pack(page).getByRole("checkbox").first()).toBeChecked();
  await expect(
    agent(page, "Strategic Sparks Agent").getByRole("checkbox").first(),
  ).toBeChecked();
  await tray(page)
    .getByRole("button", { name: `Remove ${first.title} from pack` })
    .click();
  await expect(pack(page).getByRole("checkbox").first()).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeDisabled();
  await pack(page).getByRole("checkbox").nth(1).check();
  await pack(page).getByRole("checkbox").nth(3).check();
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Explore the question before choosing a provider.");
  await tray(page)
    .getByRole("button", { name: "Preview shared input" })
    .click();
  const preview = page.getByRole("dialog", {
    name: "What the five discovery lenses receive",
  });
  await preview.getByText("Exact shared input · JSON", { exact: true }).click();
  const sent = JSON.parse(
    (await preview.getByTestId("shared-input-json").textContent())!,
  );
  expect(sent).toEqual(
    selectedFoundation(compileInputPack((await session(page)).preparation)),
  );
  expect(sent.selectedSparks).toHaveLength(2);
  expect(
    sent.selectedSparks.some((s: { id: string }) => s.id === first.id),
  ).toBe(false);
  expect(sent.requirements.fields.exclusions.status).toBe(
    "Intentionally excluded",
  );
  expect(sent.requirements.fields.originalRTB.sourceValue).toBe(
    before.preparation.parsedIMC!.fields.reason_to_believe.sourceValue,
  );
  await preview.getByRole("button", { name: "Mark pack reviewed" }).click();
  await expect(pack(page)).toContainText("Matches your reviewed pack");
  expect((await session(page)).approved).toBeNull();
  await page.getByRole("button", { name: "Start Insight Discovery" }).click();
  await expect(
    page.locator(".lens-tabs button small", { hasText: "complete" }),
  ).toHaveCount(5);
  expect(requests).toHaveLength(5);
  for (const request of requests) expect(request).toEqual(sent);
  expect(errors).toEqual([]);
});

test("saved A/B directions survive reload and restore exact inputs without losing newer versions", async ({
  page,
}) => {
  await prepare(page);
  await pack(page).getByRole("checkbox").first().check();
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Direction A: everyday recognition.");
  await pack(page).getByRole("button", { name: "Save Direction A" }).click();
  const a = (await session(page)).preparation.packCandidates!.A!;
  const research = agent(page, "Data & Research Agent");
  await research
    .getByLabel("Guide Data & Research Agent", { exact: false })
    .fill("Investigate how people choose providers.");
  await research.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(research.locator(".card-top")).toContainText("V2 · Current");
  await pack(page).getByRole("checkbox").first().uncheck();
  await pack(page).getByRole("checkbox").nth(3).check();
  await page
    .getByLabel("Research emphasis / additional direction", { exact: false })
    .fill("Direction B: the decision question.");
  await pack(page).locator(".review-upstream > summary").click();
  await page
    .getByLabel("Audience exclusions review note", { exact: true })
    .fill("Confirm this deliberate exclusion with the owner.");
  await pack(page).getByRole("button", { name: "Save Direction B" }).click();
  const b = (await session(page)).preparation.packCandidates!.B!;
  await page.reload();
  await pack(page).getByRole("button", { name: "Compare directions" }).click();
  const compare = page.getByRole("dialog", { name: "Compare directions" });
  await expect(compare).toContainText("Research: V1 → V2.");
  await expect(compare).toContainText("Additional direction changed.");
  await compare.getByRole("button", { name: "Use Direction A" }).click();
  let restored = (await session(page)).preparation;
  expect(selectedFoundation(compileInputPack(restored))).toEqual(
    selectedFoundation(a.pack),
  );
  expect(restored.parsedIMC).toEqual(a.pack.parsedIMC);
  expect(
    restored.outputs.find((o) => o.agentId === "research")!.versions,
  ).toHaveLength(2);
  await pack(page).getByRole("button", { name: "Compare directions" }).click();
  await compare.getByRole("button", { name: "Use Direction B" }).click();
  restored = (await session(page)).preparation;
  expect(selectedFoundation(compileInputPack(restored))).toEqual(
    selectedFoundation(b.pack),
  );
  expect((await session(page)).approved).toBeNull();
});

test("Spark replacement explains cleared selections, and saved directions cannot cross IMC sources", async ({
  page,
}) => {
  await prepare(page);
  await pack(page).getByRole("checkbox").first().check();
  await pack(page).getByRole("button", { name: "Save Direction A" }).click();
  const saved = (await session(page)).preparation.packCandidates!.A!;
  await tray(page)
    .getByRole("button", { name: "Preview shared input" })
    .click();
  await page.getByRole("button", { name: "Mark pack reviewed" }).click();
  const sparks = agent(page, "Strategic Sparks Agent");
  await sparks.getByRole("button", { name: "Regenerate this agent" }).click();
  await expect(sparks.locator(".card-top")).toContainText("V2 · Current");
  await expect(pack(page)).toContainText("Previous selections were cleared.");
  await expect(pack(page)).toContainText("Sparks: V1 → V2.");
  await expect(
    page.getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeDisabled();
  await pack(page).getByRole("button", { name: "Compare directions" }).click();
  await page.getByRole("button", { name: "Use Direction A" }).click();
  await expect(pack(page).getByRole("checkbox").first()).toBeChecked();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill(
      "Campaign: A different campaign\nAudience: Students\nReason to believe: Intentionally excluded.",
    );
  await expect(
    page.getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(pack(page).locator(".pack-checks")).toContainText(
    "3 / 3 preparation outputs match the brief",
  );
  await pack(page).getByRole("button", { name: "Compare directions" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Saved with a different IMC brief",
  );
  await expect(
    page.getByRole("button", { name: "Use Direction A" }),
  ).toBeDisabled();
  const current = (await session(page)).preparation;
  expect(candidateUnavailable(current, saved)).toContain("different IMC");
  expect(restoreInputPack(current, saved)).toBe(current);
});

test("mobile layout keeps tray actions reachable and legacy Sparks show honest missing rationale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  // Emulate a saved session from before titles, rationale, review and A/B snapshots existed.
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!);
    const output = s.preparation.outputs.find(
      (o: { agentId: string }) => o.agentId === "sparks",
    );
    const spark = output.versions.find(
      (v: { id: string }) => v.id === output.currentVersionId,
    ).sparks[0];
    delete spark.title;
    delete spark.rationale;
    delete spark.campaignGrounding;
    delete spark.hypothesisToValidate;
    delete s.preparation.reviewedPack;
    delete s.preparation.packCandidates;
    sessionStorage.setItem("xc-strategy-session-v1", JSON.stringify(s));
  });
  await page.reload();
  await pack(page).scrollIntoViewIfNeeded();
  await expect(tray(page)).toBeInViewport();
  const bounds = await tray(page).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await pack(page)
    .getByRole("button", {
      name: "Trace this idea: Idea starter 1",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No rationale was recorded",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "not verified support for the idea",
  );
  await page.getByRole("button", { name: "Add to pack" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(tray(page)).toContainText("1 selected");
  await expect(
    tray(page).getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeEnabled();
});

test("source trace distinguishes exact excerpts from interpretations and explicit exclusions", () => {
  const parsed = parseIMCBrief(
    "Objective: Encourage thoughtful product consideration.\nAudience: Small business owners with shared responsibilities.\nReason to believe: Intentionally excluded.\nDisclaimers: Not supplied.",
  );
  const rationale =
    "Premise: Consider a shared decision. Grounding: The audience includes “Small business owners with shared responsibilities.” Validate: Ask who participates in the decision.";
  expect(sparkReasoning(rationale)).toEqual({
    premise: "Consider a shared decision.",
    grounding:
      "The audience includes “Small business owners with shared responsibilities.”",
    validate: "Ask who participates in the decision.",
  });
  expect(sparkSourceMatches(rationale, parsed)).toEqual([
    {
      key: "audience",
      label: "Audience",
      excerpt: "Small business owners with shared responsibilities.",
    },
  ]);
  expect(
    sparkSourceMatches(
      "The product is faster. “Intentionally excluded.”",
      parsed,
    ),
  ).toEqual([]);
  expect(sparkReasoning("Old, unstructured rationale.")).toBeNull();
  expect(parsed.fields.reason_to_believe.status).toBe("Intentionally excluded");
  expect(parsed.fields.research.status).toBe("Not supplied");
});

test("a snapshot is independent from later edits", async ({ page }) => {
  await prepare(page);
  await pack(page).getByRole("checkbox").first().check();
  const state = (await session(page)).preparation;
  const snapshot = snapshotInputPack(state);
  const original = structuredClone(snapshot);
  state.upstream!.fields.objective.value = "A later manual clarification";
  currentPreparation(state, "sparks")!.sparks[0].text = "A later edit";
  expect(snapshot).toEqual(original);
});
