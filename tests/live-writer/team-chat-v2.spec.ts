import { expect, test, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  emptyStudio,
  studioStorageKey,
} from "../../lib/discovery-studio";
import { compactStringify } from "../../lib/discovery-persistence";

// Live Group Chat (test tab): one answer per agent, agents see earlier
// answers, and Save / Regenerate / agent-to-agent Reply work end to end.
// Run: XC_LIVE_E2E=1 npx playwright test -c playwright.live-writer.config.ts team-chat-v2

async function waitForAgents(panel: Locator) {
  await expect(panel.getByText("Agents are thinking…")).toBeHidden({
    timeout: 900_000,
  });
}

async function retryFailures(panel: Locator) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = panel.getByRole("button", { name: "Retry" });
    if (!(await retry.count())) return;
    await retry.first().click();
    await waitForAgents(panel);
  }
}

test("Group Chat v2 runs live with one answer per agent", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.XC_LIVE_E2E !== "1",
    "Explicit live-test opt-in required.",
  );
  const brief = process.env.XC_LIVE_BRIEF;
  const source = brief
    ? execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", brief], {
        encoding: "utf8",
      })
    : readFileSync(
        "tests/fixtures/client-input-pack/gateway_source_text.txt",
        "utf8",
      );
  const session = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), source),
    "Gateway IMC Brief – Group Chat v2 test",
  );
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "live",
    configured: true,
  });

  const calls: {
    lens: string;
    action: string;
    peers: number;
    status: number;
  }[] = [];
  page.on("response", (response) => {
    if (
      !response.url().endsWith("/api/ai/agent") ||
      response.request().method() !== "POST"
    )
      return;
    const context = response.request().postDataJSON()?.context;
    if (!context?.lens) return;
    const call = {
      lens: context.lens,
      action: context.action,
      peers: context.peerFindings?.length ?? 0,
      status: response.status(),
    };
    calls.push(call);
    console.info("[team-chat-v2]", JSON.stringify(call));
  });

  await page.goto("/");
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: studioStorageKey,
    value: compactStringify(session),
  });
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  await page.getByRole("tab", { name: /Group Chat/ }).click();
  const panel = page.locator("#team-chat-v2-panel");
  await expect(panel.getByText("LIVE", { exact: true })).toBeVisible();

  // 1. One question to the group: five agents, one answer each.
  await panel.getByRole("button", { name: /^4\./ }).click();
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await waitForAgents(panel);
  await retryFailures(panel);
  const cards = panel.getByRole("article");
  await expect(cards).toHaveCount(5);
  for (const card of await cards.all()) {
    await expect(card.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(card.getByText("Answer 1 of 1")).toBeVisible();
  }
  const firstRound = calls.filter((call) => call.status === 200).slice(0, 5);
  expect(new Set(firstRound.map((call) => call.lens)).size).toBe(5);
  // Every agent after the first received the earlier agents' answers.
  expect(firstRound.slice(1).every((call) => call.peers > 0)).toBe(true);
  await page.screenshot({
    path: `${process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-journey"}/team-chat-v2-round1.png`,
    fullPage: true,
  });

  // 2. Save one answer: it joins the shared saved-insight list.
  const consumer = panel.getByRole("article", {
    name: "Consumer Agent answer",
  });
  await consumer.getByRole("button", { name: "Save insight" }).click();
  await expect(consumer.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(
    panel.getByRole("tab", { name: "Group chat · 1" }),
  ).toBeVisible();

  // 3. Regenerate one agent: only that agent's count moves.
  const brand = panel.getByRole("article", { name: "Brand Agent answer" });
  await brand.getByRole("button", { name: "Regenerate" }).click();
  await waitForAgents(panel);
  await retryFailures(panel);
  await expect(brand.getByText("Answer 2 of 2")).toBeVisible();
  await expect(consumer.getByText("Answer 1 of 1")).toBeVisible();
  expect(calls.some((call) => call.action === "another_answer")).toBe(true);

  // 4. Reply to Consumer and ask Category to respond to it.
  await consumer.getByRole("button", { name: "Reply" }).click();
  await panel
    .getByRole("textbox", { name: "Message the team" })
    .fill("@Category what do you think of this answer?");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await waitForAgents(panel);
  await retryFailures(panel);
  const categoryReply = panel
    .getByRole("article", { name: "Category Agent answer" })
    .last();
  await expect(
    categoryReply.getByText("Replying to Consumer Agent"),
  ).toBeVisible();
  expect(
    calls.some(
      (call) => call.lens === "category" && call.action === "ask_another_lens",
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-journey"}/team-chat-v2-final.png`,
    fullPage: true,
  });
});
