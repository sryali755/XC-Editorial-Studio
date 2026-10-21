import { expect, test, type Page } from "@playwright/test";
import { mockConnections, mockDiscovery } from "../lib/ai/mock-discovery";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";

const flagEnabled = process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "true";
const readSession = (page: Page): Promise<StrategySession> =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!),
  );

async function prepareInputPack(page: Page) {
  await page.goto(flagEnabled ? "/creative" : "/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const pack = page.getByRole("region", {
    name: "Dynamic XC Input Pack",
    exact: true,
  });
  await expect(pack.getByRole("checkbox")).toHaveCount(6);
  await expect(pack.locator(".pack-checks")).toContainText(
    "3 / 3 preparation outputs match the brief",
  );
  await pack.getByRole("checkbox").first().check();
}

test("flag off leaves the restored Round Table entry surface unchanged", async ({
  page,
}) => {
  test.skip(flagEnabled, "Run this assertion in the flag-off browser suite.");
  await prepareInputPack(page);
  await expect(
    page.getByRole("button", { name: "Generate Strategic Perspectives" }),
  ).toBeVisible();
  await expect(page.locator(".insight-discovery-entry")).toHaveCount(0);
});

test("flagged Discovery uses the current pack, preserves versions, and hands off only human-approved strategy", async ({
  page,
}) => {
  test.setTimeout(90_000);
  test.skip(!flagEnabled, "Run this assertion in the flag-on browser suite.");
  await prepareInputPack(page);

  const calls: Extract<AgentRequest, { agentType: "discovery" }>[] = [];
  let categoryAttempts = 0;
  await page.route("**/api/ai/agent", async (route) => {
    const parsed = requestSchema.parse(route.request().postDataJSON());
    if (parsed.agentType === "discovery") {
      calls.push(parsed);
      if (parsed.context.lens === "category" && categoryAttempts++ === 1) {
        return route.fulfill({
          status: 503,
          json: { error: "Category source temporarily unavailable." },
        });
      }
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: mockDiscovery(parsed),
        },
      });
    }
    if (parsed.agentType === "connections") {
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: mockConnections(parsed),
        },
      });
    }
    return route.continue();
  });

  const entry = page.locator(".insight-discovery-entry");
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Start Insight Discovery" }).click();
  const dialog = page.getByRole("dialog", { name: "Insight Discovery" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Consumer complete/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Category complete/ }),
  ).toBeVisible({ timeout: 20_000 });
  expect(calls.map((request) => request.context.lens).sort()).toEqual([
    "analogous",
    "brand",
    "category",
    "consumer",
    "culture",
  ]);
  for (const call of calls) {
    expect(call.context.foundation).toEqual(calls[0].context.foundation);
    expect(call.context.foundation.selectedSparks).toHaveLength(1);
  }
  await expect(dialog.locator(".discovery-demo-notice")).toContainText(
    "DEMO DATA",
  );

  await page.getByRole("tab", { name: /Category complete/ }).click();
  await dialog
    .locator(".discovery-card")
    .first()
    .getByRole("button", { name: "Explore deeper" })
    .click();
  await expect(dialog.locator(".lens-error")).toContainText(
    "Category source temporarily unavailable",
  );
  await dialog.getByRole("button", { name: "Retry this lens" }).click();
  await expect(
    page.getByRole("tab", { name: /Category complete/ }),
  ).toBeVisible();
  await expect(dialog.locator(".version-picker option")).toHaveCount(2);
  const updatedCategory = calls.at(-1)!;
  expect(updatedCategory.context.lens).toBe("category");
  expect(updatedCategory.context.action).toBe("explore_deeper");
  expect(updatedCategory.context.selectedFinding).toEqual(
    calls.at(-2)?.context.selectedFinding,
  );

  await page.getByRole("tab", { name: /Consumer complete/ }).click();
  const consumerCard = dialog.locator(".discovery-card").first();
  const consumerFindingTitle = (
    await consumerCard.locator("h3").textContent()
  )?.trim();
  expect(consumerFindingTitle).toBeTruthy();
  await consumerCard
    .getByRole("button", { name: "Save to My Thinking" })
    .click();
  await consumerCard.getByLabel("Select to connect").check();
  await expect(dialog.locator(".saved-findings")).toContainText(
    consumerFindingTitle!,
  );

  await page.getByRole("tab", { name: /Brand complete/ }).click();
  await dialog
    .locator(".discovery-card")
    .first()
    .getByLabel("Select to connect")
    .check();
  await dialog
    .locator(".connect-findings")
    .getByRole("button", { name: "Connect these findings" })
    .click();
  await expect(dialog.locator(".connection-note")).toContainText(
    "INTERPRETATION · NOT VALIDATION",
  );

  await dialog
    .getByRole("textbox", { name: "Problem statement · human authored" })
    .fill("Households may not see how connectivity helps everyday life.");
  await dialog
    .getByRole("textbox", { name: "Evidence / insights · human synthesis" })
    .fill("The supplied brief names work, entertainment, and everyday life.");
  await dialog
    .getByRole("textbox", { name: "Working hypothesis" })
    .fill(
      "The barrier may be attention, not demand; this remains a hypothesis.",
    );
  await dialog
    .getByRole("textbox", { name: "Strategic direction · human authored" })
    .fill("Make dependable connection feel useful in the moments that matter.");
  await dialog
    .getByRole("textbox", { name: "Brief line · written by Kevin" })
    .fill(
      "Show how dependable connection gives busy households room for life.",
    );
  await expect(dialog.locator(".discovery-demo-notice")).toContainText(
    "not live research",
  );
  const originalPackVersion = await dialog
    .locator(".pack-version")
    .textContent();

  await page.evaluate(() => {
    const key = "xc-strategy-session-v1";
    const current = JSON.parse(sessionStorage.getItem(key)!);
    current.preparation.upstream.fields.constraints.value +=
      " Updated input-pack constraint for stale-finding validation.";
    sessionStorage.setItem(key, JSON.stringify(current));
  });
  await dialog.getByRole("button", { name: "Close Insight Discovery" }).click();
  await expect(page.locator(".insight-discovery-entry")).toBeVisible();
  await page
    .locator(".insight-discovery-entry")
    .getByRole("button", { name: "Start Insight Discovery" })
    .click();
  const reopened = page.getByRole("dialog", { name: "Insight Discovery" });
  await expect(reopened.locator(".pack-version")).not.toHaveText(
    originalPackVersion ?? "",
  );
  await expect(reopened.locator(".stale-flag").first()).toContainText(
    "Needs refresh",
  );
  await expect(
    reopened.getByRole("textbox", { name: "Working hypothesis" }),
  ).toHaveValue(
    "The barrier may be attention, not demand; this remains a hypothesis.",
  );
  await expect(reopened.locator(".connection-note")).toHaveCount(1);
  await reopened.getByRole("button", { name: "Refresh all lenses" }).click();
  await expect(reopened.locator(".discovery-run-status")).toHaveCount(0);
  await expect(reopened.locator(".stale-flag")).toHaveCount(0);
  await reopened
    .getByRole("button", { name: "Approve human-authored strategy" })
    .click();
  await expect(page.locator(".approved-banner")).toContainText(
    "Human-authored in Insight Discovery",
  );
  await expect(page.locator(".approved-banner blockquote")).toContainText(
    "Show how dependable connection gives busy households room for life.",
  );
  const handedOff = await readSession(page);
  expect(handedOff.approved?.sourcePerspectives).toEqual([]);
  expect(
    handedOff.discovery?.runs.every((run) => run.versions.length >= 1),
  ).toBe(true);
});
