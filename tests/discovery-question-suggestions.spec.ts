import { expect, test, type Page } from "@playwright/test";
import sample from "../lib/samples/kevin-imc.json";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";

test.beforeEach(() =>
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Question suggestions live in the Discovery round table.",
  ),
);

const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace" });

test("each click suggests a new brief question locally, cycles, restores Kevin's own text and is what the agents receive", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const calls: AgentRequest[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/agent") && request.method() === "POST")
      calls.push(requestSchema.parse(request.postDataJSON()));
  });
  await page.goto("/");
  await nav(page)
    .getByRole("button", { name: "Input Pack", exact: true })
    .click();
  await page.getByText("Use a supplied sample brief").click();
  await page
    .getByRole("button", { name: "Load Kevin’s supplied IMC brief" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "IMC output brief", exact: true }),
  ).toHaveValue(sample.text);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(
    page
      .getByRole("article", { name: "Evidence-led Sparks" })
      .locator(".spark-choice"),
  ).toHaveCount(6, { timeout: 60_000 });
  await nav(page)
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();

  const focus = page.getByRole("textbox", {
    name: "What should we investigate?",
  });
  const suggest = page.getByRole("button", {
    name: /^Suggest (a question from the brief|another question)$/,
  });
  const status = page.locator(".v2-suggestions small");
  await expect(focus).toHaveValue("");
  // A single button replaces the old collapsible list of fixed questions.
  await expect(page.getByText(/Use a suggested question/)).toHaveCount(0);
  await expect(page.locator("details.v2-suggestions")).toHaveCount(0);
  await expect(suggest).toHaveText("Suggest a question from the brief");
  const callsBefore = calls.length;

  await suggest.click();
  await expect(focus).not.toHaveValue("");
  await expect(suggest).toHaveText("Suggest another question");
  await expect(status).toHaveText(
    /^Question 1 of \d+ from this brief · edit it freely$/,
  );
  const total = Number(/of (\d+)/.exec(await status.innerText())![1]);
  expect(total).toBeGreaterThanOrEqual(5);
  const seen = [await focus.inputValue()];
  for (let turn = 2; turn <= total; turn++) {
    await suggest.click();
    await expect(focus).not.toHaveValue(seen.at(-1)!);
    await expect(status).toContainText(`Question ${turn} of ${total}`);
    seen.push(await focus.inputValue());
  }
  // Every click in a cycle produced a different, brief-grounded question.
  expect(new Set(seen).size).toBe(total);
  for (const question of seen) expect(question).toMatch(/\?$/);
  expect(seen.join("\n")).toContain("Ecosystem - Campaign Extensions");
  await suggest.click();
  await expect(focus).toHaveValue(seen[0]);
  await expect(status).toContainText(`Question 1 of ${total}`);
  // Suggesting is instant and local: no model call was made.
  expect(calls).toHaveLength(callsBefore);

  // Kevin's own wording is never lost to a suggestion.
  const own = "Kevin's own question about moving-day uncertainty?";
  await focus.fill(own);
  await expect(
    page.getByRole("button", { name: "Restore your question" }),
  ).toHaveCount(0);
  await suggest.click();
  await expect(focus).not.toHaveValue(own);
  await page.getByRole("button", { name: "Restore your question" }).click();
  await expect(focus).toHaveValue(own);
  await expect(
    page.getByRole("button", { name: "Restore your question" }),
  ).toHaveCount(0);

  // The chosen suggestion is exactly what every agent investigates.
  await suggest.click();
  const chosen = await focus.inputValue();
  expect(calls).toHaveLength(callsBefore);
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  await expect
    .poll(() => calls.filter((call) => call.agentType === "discovery").length)
    .toBe(5);
  for (const call of calls.filter((item) => item.agentType === "discovery")) {
    if (call.agentType !== "discovery") continue;
    expect(call.context.question).toBe(chosen);
  }
  await page.locator(".v2-kickoff").screenshot({
    path: test.info().outputPath("suggest-question.png"),
  });
});
