import { expect, test } from "@playwright/test";
import { requestSchema, type AgentDataMap } from "../lib/ai/schemas";
import { mockDiscovery } from "../lib/ai/mock-discovery";
import { generateMock } from "../lib/ai/mock-provider";
import sample from "../lib/samples/kevin-imc.json";

for (const duplicateCount of [1, 2])
  test(`parallel duplicate gets one correction; ${duplicateCount === 1 ? "automatic recovery" : "bounded failure and manual retry"} preserves history`, async ({
    page,
  }) => {
    test.skip(
      process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
      "Discovery required.",
    );
    let consumerAnswer: AgentDataMap["discovery"] | undefined;
    page.on("dialog", (dialog) => void dialog.accept());
    let releaseCulture: (() => void) | undefined;
    let culturePeerCount = -1;
    let correctionPeerCount = -1;
    let copies = 0;
    await page.route("**/api/ai/agent", async (route) => {
      const request = requestSchema.parse(route.request().postDataJSON());
      if (request.agentType !== "discovery")
        return route.fulfill({
          json: {
            provider: "writer",
            generatedAt: new Date().toISOString(),
            data: await generateMock(request),
          },
        });
      const data = mockDiscovery(request);
      if (request.context.lens === "consumer") consumerAnswer = data;
      if (request.context.lens === "culture") {
        copies++;
        if (copies === 1)
          culturePeerCount = request.context.peerFindings?.length ?? 0;
        if (copies === 2)
          correctionPeerCount = request.context.peerFindings?.length ?? 0;
      }
      if (request.context.lens === "culture" && copies <= duplicateCount) {
        if (copies === 1)
          await new Promise<void>((resolve) => {
            releaseCulture = resolve;
          });
        return route.fulfill({
          json: {
            provider: "writer",
            generatedAt: new Date().toISOString(),
            data: consumerAnswer,
          },
        });
      }
      return route.fulfill({
        json: {
          provider: "writer",
          generatedAt: new Date().toISOString(),
          data,
        },
      });
    });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
    await page
      .getByRole("textbox", { name: "IMC output brief", exact: true })
      .fill(sample.text);
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    // Freeze the Input Pack before testing an independent lens retry. A late
    // preparation V0 changes the pack fingerprint and correctly marks an older
    // answer as needing refresh, which is a different behavior under test.
    await expect(page.locator(".studio-agent-status")).toHaveText([
      /V0/,
      /V0/,
      /V0/,
    ]);
    await nav
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "What should we investigate?",
      })
      .fill("Which reassurance is supported for different audiences?");
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    const culture = page.getByRole("article", {
      name: "Culture Agent",
      exact: true,
    });
    await expect(consumer.locator(".v2-agent-status")).toContainText(
      "Insights Ready",
    );
    await consumer
      .getByRole("button", {
        name: "Save as a creative consideration",
        exact: true,
      })
      .first()
      .click();
    await consumer.getByRole("checkbox", { name: "Compare" }).first().check();
    await expect.poll(() => !!releaseCulture).toBe(true);
    expect(culturePeerCount).toBe(0);
    releaseCulture!();
    if (duplicateCount === 2) {
      await expect(culture.getByRole("alert")).toContainText("overlaps");
      expect(copies).toBe(2);
      await expect(culture.locator(".v2-finding")).toHaveCount(0);
      await culture
        .getByRole("button", { name: "Retry Culture Agent", exact: true })
        .click();
    }
    await expect(culture.locator(".v2-agent-status")).toContainText(
      /Insights Ready/,
    );
    expect(correctionPeerCount).toBeGreaterThan(0);
    expect(copies).toBe(duplicateCount === 1 ? 2 : 3);
    await expect(
      consumer.getByRole("checkbox", { name: "Compare" }).first(),
    ).toBeChecked();
    const history = culture.locator(".v2-generation-history");
    await expect(history.locator("summary")).toHaveText("Generations · 1");
    await history.locator("summary").click();
    await expect(
      culture
        .getByRole("combobox", { name: "View generation for Culture Agent" })
        .locator("option"),
    ).toHaveCount(2);
    await page.reload();
    await expect(
      consumer.getByRole("checkbox", { name: "Compare" }).first(),
    ).toBeChecked();
  });
