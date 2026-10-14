import { expect, test, type Page } from "@playwright/test";
import { mockDiscovery, mockConnections } from "../lib/ai/mock-discovery";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import type { StrategySession } from "../lib/types";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Discovery-only acceptance tests; legacy regression coverage runs in both modes.",
  ),
);

type DiscoveryRequest = Extract<AgentRequest, { agentType: "discovery" }>;
async function openDiscovery(
  page: Page,
  fail?: (request: DiscoveryRequest) => boolean,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample IMC brief" }).click();
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  const pack = page.getByRole("region", {
    name: "Dynamic XC Input Pack",
    exact: true,
  });
  await expect(pack.getByRole("checkbox")).toHaveCount(6);
  await pack.getByRole("checkbox").first().check();
  const calls: DiscoveryRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "discovery") {
      calls.push(request);
      if (fail?.(request))
        return route.fulfill({
          status: 500,
          json: {
            error: "Provider rejected this scoped request.",
            code: "provider_error",
            retryable: false,
          },
        });
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: mockDiscovery(request),
        },
      });
    }
    if (request.agentType === "connections")
      return route.fulfill({
        json: {
          provider: "mock",
          generatedAt: new Date().toISOString(),
          data: mockConnections(request),
        },
      });
    return route.continue();
  });
  await page.getByRole("button", { name: "Start Insight Discovery" }).click();
  const dialog = page.getByRole("dialog", { name: "Insight Discovery" });
  await expect(dialog.locator(".discovery-run-status")).toHaveCount(0);
  await expect(
    dialog.getByRole("tab", { name: /Consumer complete/ }),
  ).toBeVisible();
  return { dialog, calls };
}

test("unsent messages, route choice and whole-canvas drafts survive lens switches and reopening", async ({
  page,
}) => {
  const { dialog } = await openDiscovery(page);
  await dialog
    .getByRole("textbox", { name: "Redirect this lens" })
    .fill("Unsent Consumer question");
  const card = dialog.locator(".discovery-card").first();
  await card
    .getByRole("textbox", { name: "Question this finding" })
    .fill("Unsent finding question");
  await card.locator(".route-finding select").selectOption("brand");
  await dialog
    .getByRole("textbox", { name: "Connection guidance" })
    .fill("Unsent connection question");
  const consumer = dialog.getByRole("tab", { name: /Consumer complete/ });
  await consumer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("tab", { name: /Culture complete/ }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog
    .getByRole("textbox", { name: "Redirect this lens" })
    .fill("Unsent Culture question");
  await consumer.click();
  await expect(
    dialog.getByRole("textbox", { name: "Redirect this lens" }),
  ).toHaveValue("Unsent Consumer question");
  await dialog.getByRole("button", { name: "Open strategy canvas" }).click();
  await expect(dialog.locator(".discoveries-column")).not.toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Private working notes" })
    .fill("Private writing draft");
  await dialog
    .getByRole("button", { name: "Return to Discovery", exact: true })
    .click();
  await expect(
    card.getByRole("textbox", { name: "Question this finding" }),
  ).toHaveValue("Unsent finding question");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Insight Discovery" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Start Insight Discovery" }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Redirect this lens" }),
  ).toHaveValue("Unsent Consumer question");
  await expect(
    card.getByRole("textbox", { name: "Question this finding" }),
  ).toHaveValue("Unsent finding question");
  await expect(card.locator(".route-finding select")).toHaveValue("brand");
  await expect(
    dialog.getByRole("textbox", { name: "Connection guidance" }),
  ).toHaveValue("Unsent connection question");
  await expect(
    dialog.getByRole("textbox", { name: "Private working notes" }),
  ).toHaveValue("Private writing draft");
  await dialog.getByRole("tab", { name: /Culture complete/ }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Redirect this lens" }),
  ).toHaveValue("Unsent Culture question");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Open strategy canvas" }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Private working notes" }),
  ).toHaveValue("Private writing draft");
});

test("failed finding retry retains its exact action, draft, saved version and separate thread", async ({
  page,
}) => {
  let failOnce = true;
  const { dialog, calls } = await openDiscovery(page, (request) => {
    if (request.context.action === "explore_deeper" && failOnce) {
      failOnce = false;
      return true;
    }
    return false;
  });
  const card = dialog.locator(".discovery-card").first();
  await card.getByRole("button", { name: "Save to My Thinking" }).click();
  await card
    .getByRole("textbox", { name: "Question this finding" })
    .fill("Narrow this to the supplied audience");
  await card.getByRole("button", { name: "Send volley" }).click();
  await expect(dialog.locator(".lens-error")).toContainText(
    "Provider rejected this scoped request",
  );
  await expect(
    card.getByRole("textbox", { name: "Question this finding" }),
  ).toHaveValue("Narrow this to the supplied audience");
  const original = calls.at(-1)!;
  await dialog.getByRole("button", { name: "Retry this lens" }).click();
  await expect(dialog.locator(".lens-error")).toHaveCount(0);
  const retry = calls.at(-1)!;
  expect(retry.context.action).toBe(original.context.action);
  expect(retry.context.selectedFinding).toEqual(
    original.context.selectedFinding,
  );
  expect(retry.guidance).toBe(original.guidance);
  await dialog.locator(".agent-thread summary").click();
  await expect(dialog.locator(".agent-thread")).not.toContainText(
    original.guidance!,
  );
  await expect(dialog.locator(".finding-thread").first()).toContainText(
    original.guidance!,
  );
  const saved = dialog.locator(".saved-discovery-reference").first();
  await saved.locator("summary").click();
  await expect(saved).toContainText("V1");
  await expect(saved).toContainText("DEMO DATA");
  await saved
    .getByRole("button", { name: "Inspect exact finding version" })
    .click();
  await expect(dialog.locator(".version-picker select")).toHaveValue(
    original.context.selectedFinding!.researchRunId!,
  );
  await card.getByRole("button", { name: "Set aside", exact: true }).click();
  await expect(dialog.locator(".aside-findings")).toContainText(
    "Set aside findings · 1",
  );
  await dialog.locator(".aside-findings > summary").click();
  await dialog.getByRole("button", { name: "Restore finding" }).click();
  await expect(dialog.locator(".aside-findings")).toHaveCount(0);
  await expect(dialog.locator(".discovery-card")).toHaveCount(2);
});

test("canvas stays editable while research is pending; cancellation preserves history and explicit approval reaches XC Brief", async ({
  page,
}) => {
  const { dialog } = await openDiscovery(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "discovery") {
      await pending;
      return route
        .fulfill({
          json: {
            provider: "mock",
            generatedAt: new Date().toISOString(),
            data: mockDiscovery(request),
          },
        })
        .catch(() => {});
    }
    return route.fallback();
  });
  const card = dialog.locator(".discovery-card").first();
  await card
    .getByRole("button", { name: "Explore deeper", exact: true })
    .click();
  await expect(dialog.locator(".discovery-run-status")).toContainText(
    "1 of 5 lenses working",
  );
  await dialog.getByRole("button", { name: "Open strategy canvas" }).click();
  await dialog
    .getByRole("textbox", { name: "Problem statement · human authored" })
    .fill("Approved human problem");
  await dialog
    .getByRole("textbox", { name: "Evidence / insights · human synthesis" })
    .fill("Approved human interpretation, not independent proof");
  await dialog
    .getByRole("textbox", { name: "Working hypothesis" })
    .fill("Approved hypothesis to validate");
  await dialog
    .getByRole("textbox", { name: "Strategic direction · human authored" })
    .fill("Approved human strategic direction");
  await dialog
    .getByRole("textbox", { name: "Brief line · written by Kevin" })
    .fill("Make the human value of everyday connection clear.");
  await dialog
    .getByRole("textbox", { name: "Private working notes" })
    .fill("Private text excluded from final brief");
  await dialog
    .getByRole("button", { name: "Return to Discovery", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancel this lens" }).click();
  await expect(
    dialog.getByRole("tab", { name: /Consumer cancelled/ }),
  ).toBeVisible();
  await expect(dialog.locator(".discovery-card")).toHaveCount(2);
  release();
  await dialog
    .getByRole("button", { name: "Approve human-authored strategy" })
    .click();
  await expect(page.locator(".approved-banner")).toContainText(
    "Human-authored in Insight Discovery",
  );
  await page
    .getByRole("button", { name: "Load sample execution details" })
    .click();
  await page
    .getByRole("button", { name: "Generate XC Brief", exact: true })
    .click();
  const paper = page.locator(".brief-paper");
  await expect(paper).toContainText("Approved human problem");
  await expect(paper).toContainText(
    "Approved human interpretation, not independent proof",
  );
  await expect(paper).toContainText("Approved hypothesis to validate");
  await expect(paper).toContainText("Approved human strategic direction");
  await expect(paper).not.toContainText(
    "Private text excluded from final brief",
  );
  await page
    .getByRole("button", { name: "Return to Insight Discovery", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Private working notes" }),
  ).toHaveValue("Private text excluded from final brief");
  await dialog
    .getByRole("textbox", { name: "Problem statement · human authored" })
    .fill("New unapproved draft");
  const session = await page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem("xc-strategy-session-v1")!,
      ) as StrategySession,
  );
  expect(session.approved?.discoveryCanvas?.problem).toBe(
    "Approved human problem",
  );
  expect(JSON.stringify(session.brief)).not.toContain("New unapproved draft");
});
