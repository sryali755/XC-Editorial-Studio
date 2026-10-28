import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { requestSchema } from "../lib/ai/schemas";

const fixtureDir = path.join(__dirname, "fixtures/client-input-pack");
const pdf = path.join(
  fixtureDir,
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);
const expectedFile = path.join(
  fixtureDir,
  "imagine_that_expected_input_pack.json",
);
const names = [
  "Consumer Agent",
  "Culture Agent",
  "Category Agent",
  "Brand Agent",
  "Analogous Solutions Agent",
];
const scenarios = [
  {
    question:
      "What makes prospects choose Xfinity instead of another provider during a move?",
    sourcePage: 7,
    findings: [
      {
        title:
          "Prospect messaging proposes an in-home upgrade, not a documented choice motive",
        supported: true,
        secondGap: "Prospect switching barriers remain unmeasured",
      },
      {
        title:
          "A cultural pattern around prospects choosing a provider during a move needs evidence beyond the product brief",
        supported: false,
      },
      {
        title:
          "Competitive jump balls are named but competitor alternatives are not shown",
        supported: true,
      },
      {
        title:
          "The five-year price statement is limited to prospect and TOT contexts",
        supported: true,
      },
      {
        title:
          "No documented analogous case is supplied for prospects choosing a provider during a move",
        supported: false,
      },
    ],
  },
  {
    question:
      "How might gaming and streaming affect Xfinity Pro upgrade consideration, and what remains unproven?",
    sourcePage: 11,
    findings: [
      {
        title:
          "Gaming and streaming are named use cases, not ranked customer priorities",
        supported: true,
        secondGap: "Entertainment upgrade behavior is not measured",
      },
      {
        title:
          "A cultural pattern around Xfinity Pro gaming and streaming needs evidence beyond the product brief",
        supported: false,
      },
      {
        title:
          "The premium category claim lacks a gaming or streaming comparison",
        supported: true,
      },
      {
        title:
          "Extender support is a supplied Pro feature claim, not a measured entertainment outcome",
        supported: true,
      },
      {
        title:
          "No documented analogous case is supplied for Xfinity Pro gaming and streaming",
        supported: false,
      },
    ],
  },
] as const;

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Visual verification requires Discovery mode.",
  ),
);

async function waitForFiveResults(page: Page) {
  for (const name of names) {
    const agent = page.getByRole("article", { name, exact: true });
    await expect(agent.locator(".v2-finding").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(agent.locator(".v2-agent-status")).not.toContainText(
      /Exploring|Needs Attention|Awaiting Exploration/,
    );
  }
}

for (const campaignIndex of [0, 1]) {
  test(`real PDF campaign ${campaignIndex + 1} has readable, complete five-agent UI and scoped visual artifacts`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    expect(existsSync(pdf)).toBe(true);
    expect(existsSync(expectedFile)).toBe(true);
    const expected = JSON.parse(readFileSync(expectedFile, "utf8")) as {
      campaigns: { title: string }[];
    };
    const campaign = expected.campaigns[campaignIndex];
    const scenario = scenarios[campaignIndex];
    const question = scenario.question;
    expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
      mode: "mock",
      provider: "mock",
    });

    const blockedExternal: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      ) {
        blockedExternal.push(url.host);
        if (url.hostname === "fonts.googleapis.com")
          await route.fulfill({
            status: 200,
            contentType: "text/css",
            body: "/* Local empty font stylesheet for offline visual QA. */",
          });
        else await route.abort();
      } else await route.continue();
    });
    const calls: { lens: string; campaign: string; question: string }[] = [];
    const statuses: number[] = [];
    page.on("request", (value) => {
      if (!value.url().includes("/api/ai/agent") || value.method() !== "POST")
        return;
      const parsed = requestSchema.parse(value.postDataJSON());
      if (parsed.agentType !== "discovery") return;
      calls.push({
        lens: parsed.context.lens,
        campaign: parsed.context.foundation.campaignContext.campaignName,
        question: parsed.context.question,
      });
    });
    page.on("response", (value) => {
      if (
        value.url().includes("/api/ai/agent") &&
        value.request().method() === "POST" &&
        value.request().postDataJSON()?.agentType === "discovery"
      )
        statuses.push(value.status());
    });

    await page.goto("/");
    await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
    await expect(
      page.getByRole("textbox", { name: "IMC output brief" }),
    ).toHaveValue(/## Source page 12/, { timeout: 30_000 });
    const scope = page.getByRole("combobox", {
      name: "Campaign in this document",
    });
    await scope.selectOption(
      (await scope
        .locator("option")
        .filter({ hasText: campaign.title })
        .getAttribute("value"))!,
    );
    await page.getByRole("button", { name: "Build Input Pack" }).click();
    const rtb = page.getByRole("article", { name: "RTB / JTBD" });
    const research = page.getByRole("article", {
      name: "Data Analysis & Synthesis",
    });
    const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
    await expect(sparks.locator(".spark-choice")).toHaveCount(6);
    await rtb.getByRole("checkbox").check();
    await research
      .locator(".studio-data-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await sparks.locator(".spark-choice").first().getByRole("checkbox").check();
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Insight Discovery", level: 1 }),
    ).toBeVisible();
    const strip = page.locator(".v2-pack-strip");
    await expect(strip).toContainText("Original JTBD not explicitly supplied");
    await expect(strip).not.toContainText("XC JTBD selected");
    await expect(
      page.getByRole("textbox", { name: "What should we investigate?" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(question);
    await page
      .getByRole("button", { name: "Start Roundtable Discussion" })
      .click();
    await waitForFiveResults(page);
    await expect.poll(() => statuses.length).toBe(5);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(calls).toHaveLength(5);
    expect(new Set(calls.map((call) => call.lens)).size).toBe(5);
    for (const call of calls) {
      expect(call.campaign).toBe(campaign.title);
      expect(call.question).toBe(question);
    }
    await expect(page.locator(".studio-header")).toContainText(campaign.title);
    await expect(
      page.getByRole("textbox", { name: "What should we investigate?" }),
    ).toHaveValue(question);
    for (const [index, expectedFinding] of scenario.findings.entries()) {
      const agent = page.getByRole("article", {
        name: names[index],
        exact: true,
      });
      const first = agent.locator(".v2-finding").first();
      await expect(first.locator("h4")).toHaveText(expectedFinding.title);
      await expect(first.locator(".v2-result-type")).toHaveCount(0);
      await expect(first.locator(".v2-evidence-source")).toContainText(
        expectedFinding.supported
          ? `IMC brief — source page ${scenario.sourcePage}`
          : "Research gap · source needed",
      );
      if ("secondGap" in expectedFinding) {
        // The second finding replaces the first in the same single card.
        await expect(agent.locator(".v2-finding")).toHaveCount(1);
        await agent.getByRole("button", { name: "Next finding" }).click();
        await expect(first.locator("h4")).toHaveText(expectedFinding.secondGap);
        await expect(first.locator(".v2-result-type")).toHaveCount(0);
        await agent.getByRole("button", { name: "Previous finding" }).click();
        await expect(first.locator("h4")).toHaveText(expectedFinding.title);
      }
    }
    const initialCardTitles = await page
      .locator(".v2-agent")
      .evaluateAll((cards) =>
        cards.map((card) => ({
          name: card.getAttribute("aria-label"),
          titles: [...card.querySelectorAll(".v2-finding h4")].map(
            (title) => title.textContent,
          ),
        })),
      );

    await page.setViewportSize({ width: 1280, height: 900 });
    const grid = page.locator(".v2-agent-grid");
    const dimensions = await page.evaluate(() => {
      const first = document.querySelector<HTMLElement>(".v2-finding p");
      const title = document.querySelector<HTMLElement>(".v2-finding h4");
      const cards = [...document.querySelectorAll<HTMLElement>(".v2-agent")];
      return {
        findingBodyPx: first ? parseFloat(getComputedStyle(first).fontSize) : 0,
        findingTitlePx: title
          ? parseFloat(getComputedStyle(title).fontSize)
          : 0,
        cardWidths: cards.map((card) =>
          Math.round(card.getBoundingClientRect().width),
        ),
        gridColumns: getComputedStyle(document.querySelector(".v2-agent-grid")!)
          .gridTemplateColumns,
      };
    });
    expect(dimensions.findingBodyPx).toBeGreaterThanOrEqual(14);
    expect(dimensions.findingTitlePx).toBeGreaterThanOrEqual(15);
    expect(dimensions.cardWidths).toHaveLength(5);
    expect(Math.min(...dimensions.cardWidths)).toBeGreaterThanOrEqual(290);
    const consumer = page.getByRole("article", {
      name: "Consumer Agent",
      exact: true,
    });
    await consumer
      .locator(".v2-finding")
      .first()
      .getByRole("button", { name: "Save to Working Space", exact: true })
      .click();
    await expect(
      consumer
        .locator(".v2-finding")
        .first()
        .getByRole("button", { name: "Saved to Working Space" }),
    ).toBeVisible();
    const adjacency = await consumer.evaluate((element) => {
      const firstResult = element.querySelector(".v2-agent-result");
      return firstResult?.nextElementSibling?.classList.contains(
        "v2-agent-volley",
      );
    });
    expect(adjacency).toBe(true);
    await grid.scrollIntoViewIfNeeded();
    const overviewPath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-1280-overview.png`);
    await page.screenshot({
      path: overviewPath,
      fullPage: true,
      animations: "disabled",
    });

    const brand = page.getByRole("article", {
      name: "Brand Agent",
      exact: true,
    });
    await brand.getByRole("button", { name: "Expand Brand Agent" }).click();
    await expect(
      page.locator(".v2-agent-grid.is-focused .v2-agent"),
    ).toHaveCount(1);
    const firstBrand = brand.locator(".v2-finding").first();
    await firstBrand.locator(".v2-evidence > summary").click();
    await expect(
      firstBrand.locator(".v2-evidence blockquote").first(),
    ).toBeVisible();
    await expect(firstBrand.locator(".v2-citation-status").first()).toHaveText(
      `Source excerpt matched · imc:page:${scenario.sourcePage}`,
    );
    const evidencePath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-expanded-evidence.png`);
    await brand.screenshot({ path: evidencePath, animations: "disabled" });
    const title = await firstBrand.locator("h4").textContent();
    await firstBrand.getByRole("button", { name: /^Discuss .* V0$/ }).click();
    const composer = brand.getByRole("textbox", {
      name: `Your message about ${title}`,
    });
    await expect(composer).toBeFocused();
    await composer.fill("Which supplied excerpt supports this interpretation?");
    await brand.getByRole("button", { name: "Ask this agent" }).click();
    await expect(
      brand.getByRole("region", {
        name: "Brand Agent finding conversation V0",
      }),
    ).toContainText("Which supplied excerpt supports this interpretation?");
    await expect(
      brand
        .getByRole("region", { name: "Brand Agent finding conversation V0" })
        .locator(".v2-message.agent"),
    ).toBeVisible();
    await expect(brand.locator(".v2-agent-status")).not.toContainText(
      "Exploring",
    );
    const conversationPath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-conversation.png`);
    await brand.screenshot({ path: conversationPath, animations: "disabled" });
    await page.getByRole("button", { name: /Open Working Space/ }).click();
    const drawer = page.getByRole("dialog", { name: "Working Space" });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Close Working Space" }),
    ).toBeFocused();
    await expect(drawer.locator(".saved-findings")).toContainText(
      scenario.findings[0].title,
    );
    await drawer.locator(".saved-findings").scrollIntoViewIfNeeded();
    await expect(
      drawer.locator(".saved-findings .ws-tag", {
        hasText: "Agent interpretation · unverified",
      }),
    ).toBeVisible();
    const workingSpacePath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-working-space.png`);
    await page.screenshot({ path: workingSpacePath, animations: "disabled" });
    await drawer.getByRole("button", { name: "Close Working Space" }).click();
    await expect(drawer).toHaveCount(0);
    await expect(
      brand.getByRole("region", {
        name: "Brand Agent finding conversation V0",
      }),
    ).toContainText("Which supplied excerpt supports this interpretation?");
    await page.getByRole("button", { name: "Show all five agents" }).click();
    await page.setViewportSize({ width: 1600, height: 900 });
    const demoPath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-1600-overview.png`);
    await grid.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: demoPath,
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid.locator(".v2-agent")).toHaveCount(5);
    const narrowPath = test
      .info()
      .outputPath(`campaign-${campaignIndex + 1}-390-narrow.png`);
    await consumer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: narrowPath, animations: "disabled" });
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className:
            typeof element.className === "string" ? element.className : "",
          width: Math.round(element.getBoundingClientRect().width),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    }));
    expect(overflow.pageWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    expect(
      blockedExternal.filter(
        (host) => !["fonts.googleapis.com", "fonts.gstatic.com"].includes(host),
      ),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);

    const cards = await page.locator(".v2-agent").evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute("aria-label"),
        titles: [...element.querySelectorAll(".v2-finding h4")].map(
          (title) => title.textContent,
        ),
        citations: [...element.querySelectorAll(".v2-evidence-source")].map(
          (source) => source.textContent,
        ),
      })),
    );
    writeFileSync(
      test
        .info()
        .outputPath(`campaign-${campaignIndex + 1}-visual-manifest.json`),
      JSON.stringify(
        {
          campaign: campaign.title,
          question,
          viewports: ["1280 × 900", "1600 × 900", "390 × 844"],
          completeResponses: statuses,
          blockedWebFontAttempts: blockedExternal,
          pageErrors,
          dimensions,
          initialCardTitles,
          cards,
          screenshots: [
            overviewPath,
            evidencePath,
            conversationPath,
            workingSpacePath,
            demoPath,
            narrowPath,
          ],
        },
        null,
        2,
      ),
    );
  });
}
