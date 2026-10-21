import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  seedStudioDiscovery,
  studioPack,
  studioStorageKey,
  type DiscoveryStudioSession,
} from "../lib/discovery-studio";
import {
  compactParse,
  compactStringify,
  discoveryStorageKey,
} from "../lib/discovery-persistence";
import {
  inputPackVersion,
  discoveryFindingRef,
} from "../lib/discovery";
import {
  strategySuggestionContext,
  strategySuggestionFingerprint,
} from "../lib/ai/strategy-suggestions";
import type {
  DiscoveryFinding,
  DiscoveryRunVersion,
  DiscoveryState,
} from "../lib/types";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";

const externalRequests = new WeakMap<Page, string[]>();
const modelRequests = new WeakMap<Page, number>();
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });

test.beforeEach(async ({ page }) => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  externalRequests.set(page, []);
  modelRequests.set(page, 0);
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(hostname))
      externalRequests.get(page)!.push(hostname);
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/ai/agent"
    )
      modelRequests.set(page, modelRequests.get(page)! + 1);
  });
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(hostname))
      await route.abort();
    else await route.continue();
  });
  await page.route("**/api/ai/agent", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(modelRequests.get(page)).toBe(0);
});

async function seedOfflineWorkspace(page: Page) {
  const session = applyStudioSource(emptyStudio(), mobileIMCBrief);
  session.screen = "strategy";
  const pack = studioPack(session);
  const key = discoveryStorageKey(pack);
  const state = seedStudioDiscovery(pack);
  const versionId = "phase3-consumer-v2";
  const finding: DiscoveryFinding = {
    provider: "mock",
    id: "phase3-consumer-finding-v2",
    researchRunId: versionId,
    title: "A choice needs to feel manageable",
    whatWeFound:
      "The supplied brief suggests that people weigh several decisions at once. This is a strategic interpretation, not verified consumer research.",
    whyItMayMatter:
      "Creative work may help people see one useful next step rather than the whole decision at once.",
    whatComplicatesIt:
      "The brief does not establish how people actually prioritize these choices.",
    questionToExplore: "What would make the next step feel clearer?",
    evidenceState: "evidence_supported",
    lensId: "consumer",
    inputPackVersion: inputPackVersion(pack),
    runVersion: 3,
    evidence: [
      {
        source: "Supplied IMC brief",
        locator: "Campaign objective",
        excerpt: "Support people in making an informed decision.",
        date: "Not supplied",
        audience: "Supplied campaign audience",
        context: "Offline test fixture",
        accessScope: "supplied",
      },
    ],
  };
  const previousVersion: DiscoveryRunVersion = {
    id: versionId,
    number: 3,
    question: "What makes the decision feel difficult?",
    investigationType: "problem",
    action: "initial",
    guidance: "",
    createdAt: "2026-10-18T12:00:00.000Z",
    inputPackVersion: inputPackVersion(pack),
    findings: [finding],
    sourceCoverage: [],
    provider: "mock",
  };
  const currentVersion: DiscoveryRunVersion = {
    ...previousVersion,
    id: "phase3-consumer-v3",
    number: 4,
    action: "explore_deeper",
    createdAt: "2026-10-19T12:00:00.000Z",
    findings: [],
  };
  const consumerRun = state.runs.find((run) => run.lensId === "consumer")!;
  const findingRef = discoveryFindingRef(finding);
  const selectedState: DiscoveryState = {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === "consumer"
        ? {
            ...consumerRun,
            currentVersionId: currentVersion.id,
            versions: [currentVersion, previousVersion],
          }
        : run,
    ),
    savedFindingIds: [findingRef],
  };
  const context = strategySuggestionContext(pack, selectedState);
  const suggestionRun: NonNullable<
    DiscoveryState["strategySuggestionRuns"]
  >[number] = {
    id: "offline-suggestion-fixture",
    createdAt: "2026-10-19T12:30:00.000Z",
    fingerprint: strategySuggestionFingerprint(context),
    inputPackVersion: inputPackVersion(pack),
    provider: "mock",
    context,
    options: [1, 2, 3].map((index) => ({
      briefLine: `Offline suggestion ${index}: make the next choice feel clear.`,
      rationale: "A deterministic UI fixture; no model request was made.",
      evidenceIds: context.sourceExcerpts.slice(0, 1).map((item) => item.id),
      sparkIds: [],
      validationGap: "Validate this direction with relevant evidence.",
      findingLinks: [
        { findingId: findingRef, contribution: "The V2 finding shaped this direction." },
      ],
    })),
  };
  const persistedSession: DiscoveryStudioSession = {
    ...session,
    approved: null,
    approvals: [],
    approvalSnapshots: {},
  };
  await page.addInitScript(
    ({ sessionKey, sessionValue, discoveryKey, discoveryValue }) => {
      sessionStorage.setItem(sessionKey, sessionValue);
      sessionStorage.setItem(discoveryKey, discoveryValue);
    },
    {
      sessionKey: studioStorageKey,
      sessionValue: compactStringify(persistedSession),
      discoveryKey: key,
      discoveryValue: compactStringify({
        ...selectedState,
        strategySuggestionRuns: [suggestionRun],
      }),
    },
  );
}

test("Phase 3 consolidates a human-owned strategy workflow without external requests", async ({
  page,
}, info: TestInfo) => {
  await seedOfflineWorkspace(page);
  await page.goto("/");
  await expect(
    nav(page).getByRole("button", { name: "Finalize Strategy" }),
  ).toHaveAttribute("aria-current", "page");

  await nav(page).getByRole("button", { name: "Insight Discovery" }).click();
  await expect(
    page.getByRole("heading", { name: "Agent Roundtable — Discovery Insights" }),
  ).toBeVisible();
  for (const agent of [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ])
    await expect(page.getByRole("article", { name: agent })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open Working Space/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Working Space" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: info.outputPath("phase3-insight-discovery-desktop.png"),
    fullPage: true,
  });

  await nav(page).getByRole("button", { name: "Finalize Strategy" }).click();
  const workspace = page.locator(".working-space");
  for (const label of [
    "Problem",
    "Insight",
    "Audience",
    "Job to Be Done",
    "Proof / RTB",
    "Strategic Direction",
  ]) {
    const field = workspace.getByRole("textbox", { name: label, exact: true });
    await expect(field).toBeEditable();
  }
  await expect(workspace.getByRole("textbox", { name: "Brief line" })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("heading", { name: "Strategic Starting Point" }),
  ).toHaveCount(0);
  await expect(page.locator("details.studio-suggestions")).toHaveJSProperty(
    "open",
    false,
  );
  const orderIsCorrect = await page.evaluate(() => {
    const selectors = [
      "#ws-thinking-title",
      "#ws-saved-title",
      "#ws-brief-line-title",
      ".studio-suggestions-summary strong",
      ".studio-final-context-heading h2",
    ];
    const elements = selectors.map((selector) =>
      document.querySelector(selector),
    );
    return (
      elements.every(Boolean) &&
      elements.slice(0, -1).every((element, index) => {
        const next = elements[index + 1];
        return (
          !!element &&
          !!next &&
          (element.compareDocumentPosition(next) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
        );
      })
    );
  });
  expect(orderIsCorrect).toBe(true);
  await page.screenshot({
    path: info.outputPath("phase3-finalize-strategy-desktop.png"),
    fullPage: true,
  });

  const problem = workspace.getByRole("textbox", {
    name: "Problem",
    exact: true,
  });
  const briefLine = workspace.getByRole("textbox", { name: "Brief line" });
  await problem.fill("Kevin's revised problem statement.");
  await briefLine.fill("Kevin's own human-authored brief line.");
  await workspace.getByRole("button", { name: "Save Draft" }).click();
  await nav(page).getByRole("button", { name: "Insight Discovery" }).click();
  await nav(page).getByRole("button", { name: "Finalize Strategy" }).click();
  await expect(
    workspace.getByRole("textbox", { name: "Problem", exact: true }),
  ).toHaveValue("Kevin's revised problem statement.");
  await expect(
    workspace.getByRole("textbox", { name: "Brief line" }),
  ).toHaveValue("Kevin's own human-authored brief line.");
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  const sessionRaw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  expect(sessionRaw).toBeTruthy();
  expect((compactParse(sessionRaw!) as DiscoveryStudioSession).approved).toBeNull();

  await expect(
    page.getByRole("heading", {
      name: "Your Selected Creative Considerations",
    }),
  ).toBeVisible();
  const considerations = page.locator(".saved-findings");
  await expect(considerations).toContainText("Consumer");
  await expect(considerations).toContainText("Generation V2");
  await expect(considerations).toContainText(
    "A choice needs to feel manageable",
  );
  await expect(considerations).not.toContainText("phase3-consumer-v3");
  await considerations.locator(".ws-findings details summary").click();
  await expect(considerations).toContainText(
    "Creative work may help people see one useful next step",
  );
  await page.screenshot({
    path: info.outputPath("phase3-selected-creative-considerations.png"),
    fullPage: true,
  });

  const suggestions = page.locator("details.studio-suggestions");
  await suggestions.locator("summary.studio-suggestions-summary").click();
  await expect(
    suggestions.getByText(/Offline suggestion 1:/),
  ).toBeVisible();
  await expect(
    suggestions.getByRole("button", { name: "Use as editable draft" }).first(),
  ).toBeDisabled();
  await expect(briefLine).toHaveValue(
    "Kevin's own human-authored brief line.",
  );
  await page.screenshot({
    path: info.outputPath("phase3-optional-suggestions-expanded.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("phase3-finalize-strategy-tablet.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("phase3-finalize-strategy-mobile.png"),
    fullPage: true,
  });
  await expect(nav(page).getByRole("button")).toHaveCount(4);
  await page.getByRole("button", { name: "Confirm Strategy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeEnabled();
  await problem.fill("A later unconfirmed draft revision.");
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  const approvedSessionRaw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    studioStorageKey,
  );
  const approvedSession = compactParse(
    approvedSessionRaw!,
  ) as DiscoveryStudioSession;
  expect(approvedSession.approvals).toHaveLength(1);
});
