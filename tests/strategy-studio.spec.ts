import { expect, test } from "@playwright/test";
import { mobileIMCBrief } from "./fixtures/mobile-imc-brief";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

test.beforeEach(() =>
  test.skip(process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true"),
);

async function prepare(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build your Input Pack", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await expect(page.getByRole("article", { name: "RTB / JTBD" })).toContainText(
    "V0",
  );
  await expect(
    page.getByRole("article", { name: "Data Analysis & Synthesis" }),
  ).toContainText("V0");
  return sparks;
}

test("failed Sparks stay incomplete and retry independently before the selected pack is ready", async ({
  page,
}) => {
  let failSparks = true;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "sparks" && failSparks) {
      failSparks = false;
      await route.fulfill({
        status: 503,
        json: {
          error: "Temporary Sparks failure",
          code: "provider_unavailable",
          retryable: true,
        },
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  const rtb = page.getByRole("article", { name: "RTB / JTBD" });
  const research = page.getByRole("article", {
    name: "Data Analysis & Synthesis",
  });
  const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
  await expect(rtb.locator(".studio-agent-status")).toContainText("V0");
  await expect(research.locator(".studio-agent-status")).toContainText("V0");
  await expect(sparks.locator(".studio-agent-status")).toHaveText("Failed");
  await expect(sparks).toContainText("Temporary Sparks failure");
  await expect(sparks.locator(".spark-choice")).toHaveCount(0);
  const pack = page.getByRole("region", { name: "Dynamic Input Pack" });
  await expect(pack).toContainText("Input Pack incomplete");
  await sparks.getByRole("button", { name: "Retry this agent" }).click();
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await expect(sparks.locator(".studio-agent-status")).toContainText(
    "Demo · V0",
  );
  await sparks.getByRole("checkbox").first().check();
  await expect(pack).toContainText("Demo pack ready");
  await expect(rtb.locator(".studio-agent-status")).toContainText("V0");
  await expect(research.locator(".studio-agent-status")).toContainText("V0");
});

test("compact Sparks can be kept, improved, replaced and restored by version", async ({
  page,
}) => {
  const sparks = await prepare(page);
  const first = sparks.locator(".spark-choice").nth(0);
  const second = sparks.locator(".spark-choice").nth(1);
  const firstTitle = await first.locator(".spark-title").innerText();
  const secondTitle = await second.locator(".spark-title").innerText();
  await first.getByRole("button", { name: `Keep ${firstTitle}` }).click();
  await expect(
    first.getByRole("button", { name: `Release ${firstTitle}` }),
  ).toBeVisible();
  await second.getByRole("checkbox").check();
  await second.getByRole("button", { name: `Improve ${secondTitle}` }).click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V1");
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await expect(first.locator(".spark-title")).toHaveText(firstTitle);
  await expect(second.locator(".spark-title")).not.toHaveText(secondTitle);
  await expect(second.getByRole("checkbox")).toBeChecked();
  const improvedTitle = await second.locator(".spark-title").innerText();
  await second
    .getByRole("button", { name: `Replace ${improvedTitle}` })
    .click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V2");
  await expect(first.locator(".spark-title")).toHaveText(firstTitle);
  await first.getByRole("checkbox").check();
  await second.getByRole("checkbox").check();
  await sparks.getByRole("button", { name: "Combine selected" }).click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V3");
  await expect(first.locator(".spark-title")).toHaveText(firstTitle);
  await sparks.getByRole("button", { name: "Regenerate all 6" }).click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V4");
  await expect(first.locator(".spark-title")).toHaveText(firstTitle);
  await sparks
    .locator(".studio-version-row select")
    .selectOption({ label: "V0" });
  await sparks.getByRole("button", { name: "Set as current" }).click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V0");
  await expect(second.locator(".spark-title")).toHaveText(secondTitle);
  await expect(second.getByRole("checkbox")).toBeChecked();
  await expect(
    first.getByRole("button", { name: `Release ${firstTitle}` }),
  ).toBeVisible();
});

test("prep cards keep long source text inside their columns at desktop widths", async ({
  page,
}) => {
  for (const width of [1600, 3200]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1600) await prepare(page);
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".studio-main-inputs")!;
      const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".discovery-inputs .studio-preparation-grid > .panel",
        ),
      );
      return {
        mainWidth: main.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        panels: panels.map((panel) => ({
          label: panel.getAttribute("aria-label"),
          width: panel.clientWidth,
          contentWidth: panel.scrollWidth,
          right: panel.getBoundingClientRect().right,
          left: panel.getBoundingClientRect().left,
          overflow: Array.from(panel.querySelectorAll<HTMLElement>("*"))
            .filter(
              (child) =>
                child.getBoundingClientRect().right >
                  panel.getBoundingClientRect().right + 1 ||
                child.getBoundingClientRect().left <
                  panel.getBoundingClientRect().left - 1 ||
                child.scrollWidth > child.clientWidth + 1,
            )
            .slice(0, 6)
            .map((child) => ({
              tag: child.tagName,
              className: child.className,
              right: child.getBoundingClientRect().right,
              left: child.getBoundingClientRect().left,
              width: child.clientWidth,
              contentWidth: child.scrollWidth,
            })),
          children: Array.from(
            panel.querySelectorAll<HTMLElement>(
              ".studio-choice, .studio-data-choice, .studio-proposed-framing",
            ),
          ).map((child) => child.getBoundingClientRect().right),
        })),
      };
    });
    expect(layout.mainWidth / layout.viewportWidth).toBeGreaterThan(0.8);
    expect(layout.panels).toHaveLength(3);
    for (const panel of layout.panels) {
      expect(panel.contentWidth, JSON.stringify(panel)).toBeLessThanOrEqual(
        panel.width + 1,
      );
      for (const childRight of panel.children)
        expect(childRight).toBeLessThanOrEqual(panel.right + 1);
    }
  }
});

test("four stages, automatic V0, selected Sparks and research reach an initially empty Round Table", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Workspace" });
  const sparks = await prepare(page);
  await expect(nav.getByRole("button")).toHaveCount(4);
  await sparks.getByRole("checkbox").nth(0).check();
  await sparks.getByRole("checkbox").nth(1).check();
  await page
    .getByRole("article", { name: "RTB / JTBD" })
    .getByRole("checkbox")
    .check();
  const research = page.getByRole("article", {
    name: "Data Analysis & Synthesis",
  });
  await research
    .locator(".studio-data-choice")
    .first()
    .getByRole("checkbox")
    .check();
  await expect(
    page.getByRole("region", { name: "Dynamic Input Pack" }),
  ).toContainText("2 selected");
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await expect(
    page.getByRole("heading", { name: "Collaborate with your round table" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Consumer Agent" }),
  ).toContainText("Write your focus above");
  await page.getByRole("button", { name: /Show full pack/ }).click();
  await expect(page.locator(".v2-kickoff")).toContainText("Selected Sparks");
  await expect(page.locator(".v2-kickoff")).toContainText("Selected research");
  await expect(page.locator(".v2-kickoff")).toContainText(
    "Selected XC RTB adaptation · AI proposal",
  );
  await expect(page.locator(".v2-kickoff")).toContainText("Original JTBD");
  await page
    .getByRole("button", { name: "Suggest a question from the brief" })
    .click();
  await expect(
    page.getByRole("textbox", { name: /What should we investigate/ }),
  ).toHaveValue(/^What barriers could prevent .+\?$/);
  await expect(
    page.getByRole("article", { name: "Consumer Agent" }),
  ).toContainText("Write your focus above");
});

test("human strategy stays unapproved until confirmation; inline workspace versions and XC Brief handoff", async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  const workspace = page.getByRole("region", {
    name: "Full-width Working Space",
  });
  await expect(
    workspace.getByRole("textbox", { name: "Audience", exact: true }),
  ).toHaveValue(/existing Xfinity Internet customers/i);
  // The supplied consumer tension now starts the Insight box.
  await expect(
    workspace.getByRole("textbox", { name: "Insight", exact: true }),
  ).toHaveValue(/People want mobile connectivity/i);
  const line = workspace.getByRole("textbox", { name: "Brief line" });
  const save = workspace.getByRole("button", {
    name: "Save Draft",
    exact: true,
  });
  const lineMeta = workspace.locator(".ws-brief-line .ws-version-controls");
  const first =
    "Help eligible customers see mobile as one less decision to wrestle with.";
  const second = "Help eligible customers make mobile feel simpler to choose.";
  await line.fill(first);
  await save.click();
  await expect(lineMeta).toContainText("Saved V1");
  await expect(lineMeta).toContainText("History · 1");
  await line.fill(second);
  await expect(lineMeta).toContainText("Unsaved changes");
  await save.click();
  await expect(lineMeta).toContainText("Saved V2");
  await lineMeta.getByText("History · 2", { exact: true }).click();
  const useVersion = (number: number) =>
    lineMeta.getByRole("button", {
      name: `Use version ${number} of Brief line`,
      exact: true,
    });
  await useVersion(1).click();
  await expect(line).toHaveValue(first);
  await expect(lineMeta).toContainText("Saved V1");
  await useVersion(2).click();
  await expect(line).toHaveValue(second);
  await expect(lineMeta).toContainText("Saved V2");
  await useVersion(1).click();
  await expect(line).toHaveValue(first);
  // Using a saved version does not duplicate it on the next save.
  await save.click();
  await expect(lineMeta).toContainText("History · 2");
  const audience = workspace.getByRole("textbox", {
    name: "Audience",
    exact: true,
  });
  await audience.fill(
    "Existing Xfinity Internet customers considering mobile.",
  );
  await save.click();
  await expect(
    audience.locator("..").locator(".ws-version-controls"),
  ).toContainText("Saved V2");
  await page.getByRole("button", { name: "Confirm current strategy" }).click();
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeEnabled();
  await line.fill("An unconfirmed revision.");
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Confirm current strategy" }).click();
  await page.getByRole("button", { name: "Generate XC Brief" }).click();
  await expect(
    page.getByRole("button", { name: "XC Brief", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".brief-paper")).toContainText(
    "An unconfirmed revision.",
  );
});

test("Finalize Strategy opens with editable Input Pack starting points that survive reload", async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
  await expect(
    page.getByRole("navigation", { name: "Workspace" }).getByRole("button", {
      name: "Finalize Strategy",
    }),
  ).toHaveAttribute("aria-current", "page");
  const workspace = page.getByRole("region", {
    name: "Full-width Working Space",
  });
  // Every core box starts from this brief's Input Pack, with a source label.
  for (const label of [
    "Problem",
    "Insight",
    "Audience",
    "Job to be done",
    "Proof / RTB",
    "Strategic direction",
  ]) {
    const box = workspace.getByRole("textbox", { name: label, exact: true });
    await expect(box).not.toBeEmpty();
    await expect(box.locator("..").locator(".ws-field-source")).toContainText(
      /^(From |Original |Selected )/,
    );
  }
  await expect(
    workspace.getByRole("textbox", { name: "Brief line", exact: true }),
  ).toHaveValue("");
  await expect(workspace.locator(".ws-starting-summary")).toHaveText(
    "Your phone does a lot.",
  );
  await workspace.locator(".ws-starting-sources > summary").click();
  await expect(workspace.locator(".ws-starting-sources")).toContainText(
    "Your phone does a lot. Your mobile choice should feel simple.",
  );
  await workspace
    .getByText("Additional Strategy Details", {
      exact: true,
    })
    .click();
  await page.locator(".ws-private-notes > summary").click();
  for (const label of ["Open questions", "Notes for Creative"])
    await expect(
      workspace.getByRole("textbox", { name: label, exact: true }),
    ).not.toBeEmpty();
  // Private notes are Kevin's own and start empty with a hint.
  await expect(
    workspace.getByRole("textbox", { name: "Private notes", exact: true }),
  ).toHaveValue("");
  // No retired box or boilerplate wrapper remains.
  for (const label of [
    "Human / Consumer Tension",
    "Working hypothesis",
    "Thought-starters",
    "Context",
  ])
    await expect(
      workspace.getByRole("textbox", { name: label, exact: true }),
    ).toHaveCount(0);
  await expect(workspace.locator("select")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate XC Brief" }),
  ).toBeDisabled();
  const line = workspace.getByRole("textbox", { name: "Brief line" });
  await line.fill("Kevin's revised strategy line.");
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Full-width Working Space" })
      .getByRole("textbox", { name: "Brief line" }),
  ).toHaveValue("Kevin's revised strategy line.");
});

test("five lenses receive the selected pack, save findings and retain research versions", async ({
  page,
}) => {
  const calls: AgentRequest[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    calls.push(requestSchema.parse(route.request().postDataJSON()));
    await route.continue();
  });
  const sparks = await prepare(page);
  await sparks.getByRole("checkbox").first().check();
  await page
    .getByRole("article", { name: "Data Analysis & Synthesis" })
    .locator(".studio-data-choice")
    .first()
    .getByRole("checkbox")
    .check();
  await page
    .getByRole("article", { name: "Data Analysis & Synthesis" })
    .locator(".studio-source-chips")
    .getByRole("checkbox", { name: /Tableau/ })
    .check();
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page
    .getByRole("textbox", { name: /What should we investigate/ })
    .fill("What might make this mobile choice easier for existing customers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  const discoveryCalls = calls.filter((call) => call.agentType === "discovery");
  expect(discoveryCalls).toHaveLength(5);
  expect(new Set(discoveryCalls.map((call) => call.context.lens)).size).toBe(5);
  for (const call of discoveryCalls) {
    expect(call.context.foundation.sourceBrief).toBe(mobileIMCBrief);
    expect(call.context.foundation.selectedSparks).toHaveLength(1);
    expect(call.context.foundation.selectedResearch).toHaveLength(1);
    expect(call.context.foundation.selectedResearchSources).toContain(
      "Tableau",
    );
  }
  const consumer = page.getByRole("article", { name: "Consumer Agent" });
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    /Insights Ready/,
  );
  const investigatedFocus = consumer.locator(".v2-used-focus");
  await expect(investigatedFocus.locator("p")).toBeHidden();
  await investigatedFocus.getByText("Investigated focus").click();
  await expect(investigatedFocus.locator("p")).toHaveText(
    "What might make this mobile choice easier for existing customers?",
  );
  await investigatedFocus.getByText("Investigated focus").click();
  await expect(investigatedFocus.locator("p")).toBeHidden();
  await consumer
    .getByRole("button", { name: "Save to Working Space" })
    .first()
    .click();
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await consumer.getByRole("button", { name: "Get another answer" }).click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  await consumer.getByText(/Evidence & research log/).click();
  await expect(
    consumer
      .getByRole("combobox", { name: "Research history for Consumer Agent" })
      .locator("option"),
  ).toHaveCount(2);
  await page
    .getByRole("textbox", { name: /What should we investigate/ })
    .fill("Which product claims still need proof?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  await expect(page.locator(".discovery-run-status")).toHaveCount(0);
  await expect(consumer.locator(".v2-agent-status")).toContainText("V2");
  await expect(
    consumer
      .getByRole("combobox", { name: "Research history for Consumer Agent" })
      .locator("option"),
  ).toHaveCount(3);
  await page.getByText("Roundtable discussion history").click();
  await expect(
    page.getByRole("button", {
      name: "What might make this mobile choice easier for existing customers?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open Working Space/ }).click();
  await expect(page.locator(".saved-findings")).toContainText("Saved findings");
  await expect(page.locator(".saved-findings li")).toHaveCount(1);
});

test("brief inclusion controls omit excluded Sparks without deleting Input Pack selections", async ({
  page,
}) => {
  const sparks = await prepare(page);
  const cards = sparks.locator(".spark-choice");
  const includedTitle = await cards.nth(0).locator(".spark-title").innerText();
  const excludedTitle = await cards.nth(1).locator(".spark-title").innerText();
  await cards.nth(0).getByRole("checkbox").check();
  await cards.nth(1).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Next: Finalize Strategy" }).click();
  await page
    .getByRole("textbox", { name: "Brief line" })
    .fill("A human line for the selected mobile context.");
  await page
    .getByRole("checkbox", { name: `Spark: ${excludedTitle}` })
    .uncheck();
  await page.getByRole("button", { name: "Confirm current strategy" }).click();
  await page.getByRole("button", { name: "Generate XC Brief" }).click();
  await expect(page.locator(".brief-paper")).toContainText(includedTitle);
  await expect(page.locator(".brief-paper")).not.toContainText(excludedTitle);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Dynamic Input Pack" }),
  ).toContainText("2 selected");
});

test("campaign changes preserve each campaign's Spark selection and human draft", async ({
  page,
}) => {
  const sparks = await prepare(page);
  await sparks.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Open Working Space" }).click();
  await page
    .getByRole("textbox", { name: "Brief line" })
    .fill("Mobile campaign human draft.");
  await page.getByRole("button", { name: "Close Working Space" }).click();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack" })
    .click();
  await page.getByText("Use a supplied sample brief").click();
  await page.getByRole("button", { name: "Use fictional test brief" }).click();
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(
    page.getByRole("region", { name: "Dynamic Input Pack" }),
  ).toContainText("Life, connected");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: true })
    .fill(mobileIMCBrief);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(
    page.getByRole("region", { name: "Dynamic Input Pack" }),
  ).toContainText("1 selected");
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: "Open Working Space" }).click();
  await expect(page.getByRole("textbox", { name: "Brief line" })).toHaveValue(
    "Mobile campaign human draft.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Open Working Space" }).click();
  await expect(page.getByRole("textbox", { name: "Brief line" })).toHaveValue(
    "Mobile campaign human draft.",
  );
});

test("a failed lens retries independently without erasing successful agents", async ({
  page,
}) => {
  const lenses: string[] = [];
  let failCulture = true;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType === "discovery") {
      lenses.push(request.context.lens);
      if (request.context.lens === "culture" && failCulture) {
        failCulture = false;
        await route.fulfill({
          status: 503,
          json: {
            error: "Temporary provider outage",
            code: "provider_error",
            retryable: true,
          },
        });
        return;
      }
    }
    await route.continue();
  });
  await prepare(page);
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page
    .getByRole("textbox", { name: /What should we investigate/ })
    .fill("What are the mobile choice barriers?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion" })
    .click();
  const culture = page.getByRole("article", { name: "Culture Agent" });
  const consumer = page.getByRole("article", { name: "Consumer Agent" });
  await expect(culture).toContainText("Temporary provider outage");
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    /Insights Ready/,
  );
  await culture.getByRole("button", { name: "Retry Culture Agent" }).click();
  await expect(culture.locator(".v2-agent-status")).toContainText(
    /Insights Ready/,
  );
  expect(lenses.filter((lens) => lens === "culture")).toHaveLength(2);
  expect(lenses.filter((lens) => lens === "consumer")).toHaveLength(1);
});
