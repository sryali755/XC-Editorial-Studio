import { expect, test } from "@playwright/test";
import sample from "../lib/samples/kevin-imc.json";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import { mockDiscovery } from "../lib/ai/mock-discovery";

test("another answer generates independently; failure, retry, saved selections and history are preserved", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true",
    "Primary Discovery is required.",
  );
  const calls: Extract<AgentRequest, { agentType: "discovery" }>[] = [];
  let releaseFailure: (() => void) | undefined;
  let refreshes = 0;
  await page.route("**/api/ai/agent", async (route) => {
    const request = requestSchema.parse(route.request().postDataJSON());
    if (request.agentType !== "discovery") return route.continue();
    calls.push(request);
    if (request.context.action === "another_answer" && ++refreshes === 1) {
      await new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      return route.fulfill({
        status: 503,
        json: {
          error:
            "This new answer could not be generated. Previous answers are preserved.",
          code: "provider_error",
          retryable: true,
        },
      });
    }
    const data = mockDiscovery(request);
    if (request.context.action === "another_answer")
      data.findings[0].title = `Another audience angle ${refreshes}`;
    return route.fulfill({
      json: { provider: "mock", generatedAt: new Date().toISOString(), data },
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
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  const focus = page.getByRole("textbox", {
    name: "What should we investigate?",
  });
  await focus.fill("What could explain the campaign problem?");
  await page
    .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
    .click();
  const consumer = page.getByRole("article", {
    name: "Consumer Agent",
    exact: true,
  });
  await expect(
    consumer.getByRole("region", { name: "Consumer Agent agent conversation" }),
  ).toHaveCount(0);
  await expect(consumer.locator(".v2-agent-status")).toContainText(
    "Insights Ready",
  );
  await expect.poll(() => calls.length).toBe(5);
  await expect(
    page.getByText(/\d+ more findings? from this agent/),
  ).toHaveCount(0);
  const result = consumer.getByRole("region", {
    name: "Consumer Agent perspective",
    exact: true,
  });
  // The card shows one finding at a time; the second is one Next away.
  await expect(consumer.locator(".v2-finding")).toHaveCount(1);
  await expect(result.locator(".v2-finding-position")).toHaveText(
    "Finding 1 of 2 · V0",
  );
  const originalTitle = await result
    .locator(".v2-finding h4")
    .first()
    .textContent();
  await result
    .getByRole("button", { name: "Save to Working Space", exact: true })
    .first()
    .click();
  await result.getByRole("checkbox", { name: "Compare" }).first().check();
  const snapshot = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(
      (key) =>
        key.startsWith("xc-insight-discovery-v2:") &&
        JSON.parse(sessionStorage.getItem(key)!).$value.runs.some(
          (run: { versions: unknown[] }) => run.versions.length,
        ),
    )!;
    return { key, state: JSON.parse(sessionStorage.getItem(key)!).$value };
  });
  await consumer.getByRole("button", { name: "Expand Consumer Agent" }).click();
  await focus.fill("What differs between prospects and existing customers?");
  const steering = consumer.getByRole("textbox", {
    name: "Your message to Consumer Agent",
  });
  await steering.fill(
    "Explore a different audience angle, without inventing survey results.",
  );
  await consumer
    .getByRole("button", { name: "Get another answer", exact: true })
    .click();
  await expect(
    consumer.getByRole("button", {
      name: "Generating another answer…",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(result.locator(".v2-finding h4").first()).toHaveText(
    originalTitle!,
  );
  await expect.poll(() => calls.length).toBe(6);
  expect(calls.at(-1)!.context.question).toBe(
    "What differs between prospects and existing customers?",
  );
  expect(calls.at(-1)!.context.foundation.sourceBrief).toBe(sample.text);
  // The focus changed, so the previous focus's findings remain in history but
  // are not passed as answers to the new question.
  expect(calls.at(-1)!.context.previousFindings).toHaveLength(0);
  await expect(consumer).not.toContainText(
    "Refresh this lens against the current Input Pack.",
  );
  await expect(consumer).not.toContainText("findings returned in V");
  expect(calls.at(-1)!.guidance).toContain("Explore a distinct angle");
  expect(calls.at(-1)!.guidance).toContain(
    "Explore a different audience angle, without inventing survey results.",
  );
  releaseFailure!();
  await expect(consumer.getByRole("alert")).toContainText(
    "Previous answers are preserved",
  );
  await expect(result.locator(".v2-finding h4").first()).toHaveText(
    originalTitle!,
  );
  await expect(
    result.getByRole("checkbox", { name: "Compare" }).first(),
  ).toBeChecked();
  await expect(steering).toHaveValue(
    "Explore a different audience angle, without inventing survey results.",
  );
  const failed = calls.at(-1)!;
  await consumer
    .getByRole("button", { name: "Retry Consumer Agent", exact: true })
    .click();
  await expect(result.locator(".v2-finding h4").first()).toHaveText(
    "Another audience angle 2",
  );
  expect(calls.at(-1)!.guidance).toBe(failed.guidance);
  expect(calls.filter((call) => call.context.lens !== "consumer")).toHaveLength(
    4,
  );
  const restored = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).$value,
    snapshot.key,
  );
  expect(restored.savedFindingIds).toEqual(snapshot.state.savedFindingIds);
  expect(restored.selectedFindingIds).toEqual(
    snapshot.state.selectedFindingIds,
  );
  expect(
    restored.runs.find((run: { lensId: string }) => run.lensId === "consumer")
      .versions,
  ).toHaveLength(2);
  for (const old of snapshot.state.runs.filter(
    (run: { lensId: string }) => run.lensId !== "consumer",
  )) {
    expect(
      restored.runs.find(
        (run: { lensId: string }) => run.lensId === old.lensId,
      ),
    ).toEqual(old);
  }
  const original = snapshot.state.runs.find(
    (run: { lensId: string }) => run.lensId === "consumer",
  ).versions[0];
  await consumer.getByText(/Evidence & research log/).click();
  const history = consumer.getByRole("combobox", {
    name: "Research history for Consumer Agent",
  });
  await expect(history.locator("option")).toHaveCount(2);
  await history.selectOption(original.id);
  await expect(result.locator(".v2-finding h4").first()).toHaveText(
    originalTitle!,
  );
  await expect(consumer.locator(".v2-saved-answer")).toHaveCount(2);
  expect(calls).toHaveLength(7); // Reading saved answers does not generate or spend.
  await consumer
    .getByRole("button", { name: "Get another answer", exact: true })
    .click();
  await expect(result.locator(".v2-finding h4").first()).toHaveText(
    "Another audience angle 3",
  );
  expect(calls).toHaveLength(8);
  await expect(history.locator("option")).toHaveCount(3);
});
