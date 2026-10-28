import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  emptyStudio,
  studioStorageKey,
} from "../../lib/discovery-studio";
import { compactStringify } from "../../lib/discovery-persistence";

test("Gateway brief question reaches all five live team agents", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.XC_LIVE_E2E !== "1",
    "Explicit live-test opt-in required.",
  );
  const brief = process.env.XC_LIVE_BRIEF;
  expect(brief, "Supply the Gateway IMC DOCX path.").toBeTruthy();
  const source = execFileSync(
    "/usr/bin/textutil",
    ["-convert", "txt", "-stdout", brief!],
    { encoding: "utf8" },
  );
  const session = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), source),
    "Gateway IMC Brief – Revised for Helix Test",
  );
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "live",
    provider: "writer",
    configured: true,
  });
  const calls: { lens: string; status: number }[] = [];
  page.on("response", (response) => {
    if (
      !response.url().endsWith("/api/ai/agent") ||
      response.request().method() !== "POST"
    )
      return;
    const lens = response.request().postDataJSON()?.context?.lens;
    if (!lens) return;
    const call = { lens, status: response.status() };
    calls.push(call);
    console.info("[live-team-discussion]", JSON.stringify(call));
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
  await page.getByRole("tab", { name: /Team Discussion/ }).click();
  const team = page.locator("#team-discussion-panel");
  const group = team.locator('[data-team-prototype="group-chat"]');
  await expect(team.getByText("LIVE BRIEF ANALYSIS")).toBeVisible();
  await expect(team.getByRole("note")).toContainText("Gateway IMC Brief");
  await team.getByRole("button", { name: /^1\./ }).click();
  const question = await group
    .getByRole("textbox", { name: "Message the team" })
    .inputValue();
  console.info("[live-team-discussion] question=", question);
  await group.getByRole("button", { name: "Send to team" }).click();
  await expect
    .poll(
      async () =>
        (await group
          .locator(".team-generation-status")
          .getAttribute("class")) ?? "",
      { timeout: 600_000 },
    )
    .toMatch(/is-(completed|failed)/);
  if (await group.locator(".team-generation-status.is-failed").count()) {
    console.info(
      "[live-team-discussion] first-attempt-error=",
      await group.locator(".team-generation-status").innerText(),
    );
    await group.getByRole("button", { name: "Retry failed agents" }).click();
    await expect(
      group.locator(".team-generation-status.is-completed"),
    ).toBeVisible({ timeout: 600_000 });
  }
  await expect(group.locator(".team-message.is-agent")).toHaveCount(5);
  await expect(
    group.locator(".team-agent-tag", { hasText: "Mock perspective" }),
  ).toHaveCount(0);
  expect(
    new Set(
      calls.filter((call) => call.status === 200).map((call) => call.lens),
    ).size,
  ).toBe(5);
});
