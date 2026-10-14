import { expect, test } from "@playwright/test";
import { selectedFoundation } from "../lib/ai/context";
import { mockConnections, mockDiscovery } from "../lib/ai/mock-discovery";
import { requestSchema } from "../lib/ai/schemas";
import {
  discoveryLenses,
  discoverySourceCoverage,
  emptyDiscoveryState,
  inputPackVersion,
} from "../lib/discovery";
import { demoPack } from "../lib/demo";
import { emptyExecution } from "../lib/execution";
import { emptyPreparation } from "../lib/preparation";
import type { DiscoveryRunVersion, StrategySession } from "../lib/types";

async function openDiscovery(page: import("@playwright/test").Page) {
  const packVersion = inputPackVersion(demoPack);
  const question = "What might explain the campaign problem?";
  const discovery = emptyDiscoveryState();
  discovery.question = question;
  discovery.contextVersion = packVersion;
  discovery.runs = discoveryLenses.map((lens) => {
    const request = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation: selectedFoundation(demoPack),
        lens: lens.id,
        investigationType: "problem",
        question,
        action: "initial",
        previousFindings: [],
      },
      versionNumber: 1,
    });
    if (request.agentType !== "discovery") throw new Error("Invalid fixture");
    const data = mockDiscovery(request);
    const version: DiscoveryRunVersion = {
      id: `${lens.id}-v1`,
      number: 1,
      question,
      investigationType: "problem",
      action: "initial",
      guidance: "",
      createdAt: "2026-10-14T12:00:00.000Z",
      inputPackVersion: packVersion,
      findings: data.findings.map((finding, index) => ({
        ...finding,
        id: `${lens.id}-finding-${index + 1}`,
        lensId: lens.id,
        inputPackVersion: packVersion,
        runVersion: 1,
      })),
      sourceCoverage: discoverySourceCoverage(demoPack),
      provider: "mock",
    };
    return {
      lensId: lens.id,
      status: "complete" as const,
      versions: [version],
      currentVersionId: version.id,
      thread: [],
    };
  });
  const session: StrategySession = {
    step: 1,
    pack: demoPack,
    preparation: emptyPreparation,
    sharedPack: demoPack,
    outputs: [],
    selected: [],
    synthesis: [],
    synthesisResults: [],
    synthesisSources: [],
    finalSourceLines: [],
    finalLine: "",
    finalSource: "",
    approved: null,
    execution: emptyExecution,
    brief: null,
    discovery,
  };
  await page.addInitScript(
    ({ session }) =>
      sessionStorage.setItem("xc-strategy-session-v1", JSON.stringify(session)),
    { session },
  );
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    const data =
      request.agentType === "discovery"
        ? mockDiscovery(request)
        : request.agentType === "connections"
          ? mockConnections(request)
          : null;
    if (!data) return route.abort();
    await route.fulfill({
      json: {
        provider: "mock",
        generatedAt: new Date().toISOString(),
        data,
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Insight Discovery", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".lens-tabs button small", { hasText: "complete" }),
  ).toHaveCount(5);
}

test("discovery preserves lens versions and human work through the downstream handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openDiscovery(page);

  await expect(page.locator(".lens-tabs button")).toHaveCount(5);
  await expect(page.locator(".discovery-card")).toHaveCount(2);
  await page.locator(".source-coverage > summary").click();
  await expect(
    page.locator(".source-status.not_connected").first(),
  ).toBeVisible();
  await expect(page.locator(".source-coverage-grid")).toContainText(
    "No live retrieval was performed",
  );

  const consumerCard = page.locator(".discovery-card").first();
  await consumerCard
    .getByRole("button", { name: "Save to My Thinking" })
    .click();
  await consumerCard.getByLabel("Select to connect").check();
  await expect(page.locator(".saved-findings")).toContainText(
    "The audience definition carries the first unanswered question",
  );

  await page
    .locator(".agent-volley")
    .getByRole("textbox", { name: "Redirect this lens" })
    .fill(
      "Focus on existing customers without treating the segment as proven.",
    );
  await page
    .locator(".agent-volley")
    .getByRole("button", { name: "Explore deeper" })
    .click();
  await expect(page.locator(".version-picker option")).toHaveCount(2);
  await expect(page.locator(".saved-findings")).toContainText(
    "The audience definition carries the first unanswered question",
  );

  await page.getByRole("tab", { name: /Brand complete/ }).click();
  await page
    .locator(".discovery-card")
    .first()
    .getByLabel("Select to connect")
    .check();
  await expect(page.locator(".connect-findings")).toContainText("2 selected");
  await page
    .locator(".connect-findings")
    .getByRole("button", { name: "Connect these findings" })
    .click();
  await expect(page.locator(".connection-note")).toContainText(
    "INTERPRETATION · NOT VALIDATION",
  );

  await page
    .getByRole("textbox", { name: "Working hypothesis" })
    .fill(
      "The barrier may be attention, not demand; this remains a hypothesis.",
    );
  await page
    .getByRole("textbox", { name: "Brief line · written by Kevin" })
    .fill(
      "Show how dependable connection gives busy households room for life.",
    );
  await page
    .getByRole("button", { name: "Approve human-authored strategy" })
    .click();
  await expect(page.getByText("Approved by Kevin")).toBeVisible();
  await expect(page.locator(".approved-banner blockquote")).toContainText(
    "Show how dependable connection gives busy households room for life.",
  );
  await page.getByRole("button", { name: "Return to discovery" }).click();
  await expect(
    page.getByRole("textbox", { name: "Working hypothesis" }),
  ).toHaveValue(
    "The barrier may be attention, not demand; this remains a hypothesis.",
  );
  await expect(page.locator(".connection-note")).toHaveCount(1);
});
