import { expect, test } from "@playwright/test";
import { validateDiscoveryEvidence } from "../lib/ai/discovery-evidence";
import { mockDiscovery } from "../lib/ai/mock-discovery";
import { requestSchema } from "../lib/ai/schemas";
import type { DiscoveryLensId } from "../lib/types";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

test("three quotation failures retry independently to five ready agents without losing findings or selections", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  const names: Record<DiscoveryLensId, string> = {
    consumer: "Consumer Agent",
    culture: "Culture Agent",
    category: "Category Agent",
    brand: "Brand Agent",
    analogous: "Analogous Solutions Agent",
  };
  const failedLenses = ["culture", "category", "analogous"] as const;
  const failNext = new Set<DiscoveryLensId>();
  const calls: DiscoveryLensId[] = [];
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "127.0.0.1"
    ) {
      if (url.hostname !== "fonts.googleapis.com") external.push(url.host);
      return route.abort();
    }
    if (url.pathname !== "/api/ai/agent" || route.request().method() !== "POST")
      return route.continue();
    const input = requestSchema.parse(route.request().postDataJSON());
    if (input.agentType !== "discovery") return route.continue();
    const lens = input.context.lens;
    calls.push(lens);
    expect(input.context.foundation.sourceBrief).toBe(mobileIMCBrief);
    if (failNext.delete(lens)) {
      // Exercise the real validator; only the model/HTTP transport is simulated.
      const bad = mockDiscovery(input);
      bad.findings[0].whyItMayMatter =
        "A hypothesis to validate is “comparison overload”; this is not an observed customer finding.";
      const error = validateDiscoveryEvidence(input, bad);
      expect(error).toContain("whyItMayMatter");
      return route.fulfill({
        status: 422,
        json: {
          error,
          code: "discovery_evidence_validation_failed",
          retryable: true,
        },
      });
    }
    return route.continue();
  });
  const card = (lens: DiscoveryLensId) =>
    page.getByRole("article", { name: names[lens], exact: true });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page
    .getByRole("button", { name: "Build Input Pack", exact: true })
    .click();
  await expect(page.locator(".studio-agent-status")).toHaveText(
    ["Demo · V0", "Demo · V0", "Demo · V0"],
    { timeout: 60_000 },
  );
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What should we investigate?" })
    .fill("Which campaign assumptions need research?");
  expect(calls).toHaveLength(0);
  const start = page.getByRole("button", {
    name: "Start Roundtable Discussion",
    exact: true,
  });
  await start.click();
  const titles = new Map<DiscoveryLensId, string>();
  for (const lens of Object.keys(names) as DiscoveryLensId[]) {
    await expect(card(lens).locator(".v2-agent-status")).toHaveText(
      /V0 · (Insights Ready)/,
      { timeout: 60_000 },
    );
    titles.set(
      lens,
      await card(lens).locator(".v2-finding h4").first().innerText(),
    );
  }
  expect(calls).toHaveLength(5);
  for (const lens of failedLenses) failNext.add(lens);
  await start.click();
  for (const lens of failedLenses) {
    await expect(card(lens).getByRole("alert")).toContainText("whyItMayMatter");
    await expect(card(lens).locator(".v2-finding h4").first()).toHaveText(
      titles.get(lens)!,
    );
  }
  for (const lens of ["consumer", "brand"] as const)
    await expect(card(lens).locator(".v2-agent-status")).toHaveText(
      /V1 · (Insights Ready)/,
    );
  expect(calls).toHaveLength(10);
  await card("consumer")
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .first()
    .click();
  await card("consumer")
    .getByRole("checkbox", { name: "Compare", exact: true })
    .first()
    .check();
  const preserved = await card("consumer")
    .locator(".v2-finding h4")
    .first()
    .innerText();
  for (const lens of failedLenses) {
    const count = calls.length;
    await card(lens)
      .getByRole("button", { name: `Retry ${names[lens]}`, exact: true })
      .click();
    await expect(card(lens).getByRole("alert")).toHaveCount(0);
    await expect(card(lens).locator(".v2-agent-status")).toHaveText(
      /V1 · (Insights Ready)/,
      { timeout: 60_000 },
    );
    expect(calls).toHaveLength(count + 1);
    expect(calls.at(-1)).toBe(lens);
    await expect(
      card("consumer")
        .getByRole("checkbox", { name: "Compare", exact: true })
        .first(),
    ).toBeChecked();
    await expect(card("consumer").locator(".v2-finding h4").first()).toHaveText(
      preserved,
    );
  }
  await card("culture")
    .getByRole("button", { name: "Expand Culture Agent" })
    .click();
  await card("culture")
    .getByText(/Evidence & research log/)
    .click();
  const history = card("culture").getByRole("combobox", {
    name: "Research history for Culture Agent",
  });
  const options = history.locator("option");
  await expect(options).toHaveCount(2);
  const values = await options.evaluateAll((items) =>
    items.map((item) => (item as HTMLOptionElement).value),
  );
  const current = await history.inputValue();
  const earlier = values.find((value) => value !== current)!;
  await history.selectOption(earlier);
  await expect(history).toHaveValue(earlier);
  await history.selectOption(current);
  await page.getByRole("button", { name: "Show all five agents" }).click();
  expect(calls).toHaveLength(13);
  await page.reload();
  for (const lens of Object.keys(names) as DiscoveryLensId[])
    await expect(card(lens).locator(".v2-agent-status")).toHaveText(
      /V1 · (Insights Ready)/,
    );
  await expect(
    card("consumer")
      .getByRole("checkbox", { name: "Compare", exact: true })
      .first(),
  ).toBeChecked();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Working Space" }),
  ).toContainText(preserved);
  expect(calls).toHaveLength(13);
  expect(external).toEqual([]);
});
