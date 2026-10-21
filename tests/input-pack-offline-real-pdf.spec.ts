import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { requestSchema, type AgentRequest } from "../lib/ai/schemas";
import { parseIMCBrief } from "../lib/imc-parser";

const pdf = path.join(
  __dirname,
  "fixtures/client-input-pack/Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);

test("real two-campaign PDF requires scope, runs mock V0, preserves versions and hands off only selected context", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true" || !existsSync(pdf),
    "Requires Discovery mode and the supplied local PDF fixture.",
  );
  const status = await request.get("/api/ai/agent");
  expect(await status.json()).toMatchObject({ mode: "mock", provider: "mock" });
  const expected = JSON.parse(
    readFileSync(
      path.join(
        __dirname,
        "fixtures/client-input-pack/imagine_that_expected_input_pack.json",
      ),
      "utf8",
    ),
  ) as {
    campaigns: { expected_fields: { field: string; contains: string }[] }[];
  };
  const sourceValue = (campaign: number, field: string) =>
    expected.campaigns[campaign].expected_fields.find(
      (item) => item.field === field,
    )!.contains;

  const blockedExternal: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      blockedExternal.push(url.host);
      await route.abort();
    } else await route.continue();
  });
  const calls: AgentRequest[] = [];
  page.on("request", (value) => {
    if (value.url().includes("/api/ai/agent") && value.method() === "POST")
      calls.push(requestSchema.parse(value.postDataJSON()));
  });

  await page.goto("/");
  await page.getByLabel("Import file for IMC brief").setInputFiles(pdf);
  const draft = page.getByRole("textbox", { name: "IMC output brief" });
  await expect(draft).toHaveValue(/## Source page 12/, { timeout: 30_000 });
  const scope = page.getByRole("combobox", {
    name: "Campaign in this document",
  });
  await expect(scope.locator("option")).toHaveCount(3);
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(page.locator(".studio-brief-step [role=alert]")).toContainText(
    "Select one campaign",
  );
  expect(calls).toHaveLength(0);

  await scope.selectOption(
    (await scope
      .locator("option")
      .filter({ hasText: /Movers - Campaign Extensions Refresh Brief/ })
      .getAttribute("value"))!,
  );
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  const rtb = page.getByRole("article", { name: "RTB / JTBD" });
  const research = page.getByRole("article", {
    name: "Data Analysis & Synthesis",
  });
  const sparks = page.getByRole("article", { name: "Evidence-led Sparks" });
  await expect(rtb.locator(".studio-agent-status")).toContainText("V0");
  await expect(research.locator(".studio-agent-status")).toContainText("V0");
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  expect(calls.map((call) => call.agentType)).toEqual([
    "rtb",
    "research",
    "sparks",
  ]);
  for (const call of calls) {
    if (!("parsedIMC" in call.context)) continue;
    expect(call.context.parsedIMC.sourceText).toContain("## Source page 7");
    expect(call.context.parsedIMC.sourceText).not.toContain(
      "Xfinity Pro is an HSD bolt-on",
    );
    const fields = parseIMCBrief(call.context.parsedIMC.sourceText).fields;
    expect(fields.campaign.sourceValue).toBe(
      "Movers - Campaign Extensions Refresh Brief",
    );
    expect(fields.objective.sourceValue).toContain(
      sourceValue(0, "business_objective_customer"),
    );
    expect(fields.objective.sourceValue).toContain(
      sourceValue(0, "business_objective_prospect"),
    );
    expect(fields.objective.sourceValue).toContain(
      sourceValue(0, "communication_objective"),
    );
    expect(fields.audience.sourceValue).toContain(sourceValue(0, "audience"));
    expect(fields.reason_to_believe.sourceValue).toContain(
      sourceValue(0, "rtb_1"),
    );
    expect(fields.reason_to_believe.sourceValue).toContain(
      sourceValue(0, "rtb_2"),
    );
    expect(fields.reason_to_believe.sourceValue).not.toContain(
      "What if your WiFi bill could hit snooze",
    );
    expect(fields.constraints.sourceValue).toContain(
      sourceValue(0, "creative_constraint"),
    );
    expect(fields.channels.sourceValue).toContain(sourceValue(0, "channel"));
  }
  const pack = page.getByRole("region", { name: "Dynamic Input Pack" });
  await page.getByText("View full selected context and source status").click();
  await expect(pack).toContainText("Prospect & TOT only");
  await expect(pack).not.toContainText("Xfinity Pro is an HSD bolt-on");
  await rtb.getByRole("checkbox").check();
  await sparks.locator(".spark-choice").first().getByRole("checkbox").check();
  await sparks.locator(".spark-choice").nth(1).getByRole("checkbox").check();
  const firstTitle = await sparks
    .locator(".spark-choice")
    .first()
    .locator(".spark-title")
    .innerText();
  const secondTitle = await sparks
    .locator(".spark-choice")
    .nth(1)
    .locator(".spark-title")
    .innerText();
  await sparks
    .locator(".spark-choice")
    .first()
    .getByRole("button", { name: `Keep ${firstTitle}` })
    .click();
  await sparks
    .locator(".spark-choice")
    .nth(1)
    .getByRole("button", { name: `Improve ${secondTitle}` })
    .click();
  await expect(sparks.locator(".studio-agent-status")).toContainText("V1");
  await expect(
    sparks.locator(".spark-choice").first().locator(".spark-title"),
  ).toHaveText(firstTitle);
  await expect(
    sparks.locator(".spark-choice").nth(1).getByRole("checkbox"),
  ).toBeChecked();
  await sparks
    .locator(".studio-version-row select")
    .selectOption({ label: "V0" });
  await sparks.getByRole("button", { name: "Set as current" }).click();
  await expect(
    sparks.locator(".spark-choice").nth(1).locator(".spark-title"),
  ).toHaveText(secondTitle);
  await research
    .locator(".studio-data-choice")
    .first()
    .getByRole("checkbox")
    .check();
  await expect(pack).toContainText("Demo pack ready");
  await rtb
    .getByRole("textbox", { name: "Steer this agent" })
    .fill(
      "Keep the existing-customer transfer need distinct from the prospect-only guarantee.",
    );
  await rtb.getByRole("button", { name: /Steer → save V1/ }).click();
  await expect(rtb.locator(".studio-agent-status")).toContainText("V1");
  const steered = calls.filter((call) => call.agentType === "rtb").at(-1);
  expect(steered?.guidance).toContain("existing-customer transfer need");
  await rtb.locator(".studio-version-row select").selectOption({ label: "V0" });
  await rtb.getByRole("button", { name: "Set as current" }).click();
  await expect(rtb.locator(".studio-agent-status")).toContainText("V0");
  await page.reload();
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await expect(
    sparks.locator(".spark-choice").first().getByRole("checkbox"),
  ).toBeChecked();
  await expect(pack).toContainText("Demo pack ready");
  await page.getByRole("button", { name: "Next: Insight Discovery" }).click();
  await page.getByRole("button", { name: /Show full pack/ }).click();
  await expect(page.locator(".v2-kickoff")).toContainText("Selected Sparks");
  await expect(page.locator(".v2-kickoff")).toContainText("Selected research");
  await expect(page.locator(".v2-kickoff")).toContainText(
    "Prospect & TOT only",
  );

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Input Pack" })
    .click();
  await scope.selectOption(
    (await scope
      .locator("option")
      .filter({ hasText: /Xfinity Pro - Campaign Extensions/ })
      .getAttribute("value"))!,
  );
  await expect(
    page.getByRole("button", { name: "Next: Insight Discovery" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Build Input Pack" }).click();
  await expect(sparks.locator(".spark-choice")).toHaveCount(6);
  await expect(pack).toContainText("Xfinity Pro - Campaign Extensions");
  await expect(pack).not.toContainText("Prospect & TOT only");
  const proCalls = calls.filter(
    (call) =>
      "parsedIMC" in call.context &&
      call.context.parsedIMC.sourceText.includes("## Source page 11"),
  );
  expect(proCalls.map((call) => call.agentType)).toEqual([
    "rtb",
    "research",
    "sparks",
  ]);
  for (const call of proCalls) {
    if (!("parsedIMC" in call.context)) continue;
    const fields = parseIMCBrief(call.context.parsedIMC.sourceText).fields;
    expect(fields.campaign.sourceValue).toBe(
      "Xfinity Pro - Campaign Extensions",
    );
    expect(fields.objective.sourceValue).toContain(
      sourceValue(1, "business_objective"),
    );
    expect(fields.objective.sourceValue).toContain(
      sourceValue(1, "communication_objective"),
    );
    expect(fields.audience.sourceValue).toContain(sourceValue(1, "audience"));
    expect(fields.reason_to_believe.sourceValue).toContain(
      sourceValue(1, "rtb_1"),
    );
    expect(fields.reason_to_believe.sourceValue).toContain(
      sourceValue(1, "rtb_2"),
    );
    expect(fields.reason_to_believe.sourceValue).not.toContain(
      "Prospect & TOT only",
    );
    expect(fields.constraints.sourceValue).toContain(
      sourceValue(1, "creative_constraint"),
    );
    expect(fields.channels.sourceValue).toContain(sourceValue(1, "channels"));
  }
  expect(
    blockedExternal.every(
      (host) => host === "fonts.googleapis.com" || host === "fonts.gstatic.com",
    ),
  ).toBe(true);
});

test("each supplied campaign text builds its own mock pack when pasted", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "true" || !existsSync(pdf),
    "Requires Discovery mode and the supplied local fixture kit.",
  );
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "mock",
    provider: "mock",
  });
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) await route.abort();
    else await route.continue();
  });
  for (const [filename, own, foreign] of [
    [
      "movers_source_text.txt",
      "Prospect & TOT only",
      "Xfinity Pro is an HSD bolt-on",
    ],
    [
      "xfinity_pro_source_text.txt",
      "additional $15 a month",
      "Prospect & TOT only",
    ],
  ]) {
    const source = readFileSync(
      path.join(__dirname, "fixtures/client-input-pack", filename),
      "utf8",
    );
    const calls: AgentRequest[] = [];
    const listener = (value: import("@playwright/test").Request) => {
      if (value.url().includes("/api/ai/agent") && value.method() === "POST")
        calls.push(requestSchema.parse(value.postDataJSON()));
    };
    await page.goto("/");
    page.on("request", listener);
    await page.getByRole("textbox", { name: "IMC output brief" }).fill(source);
    await expect(
      page.getByRole("combobox", { name: "Campaign in this document" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Build Input Pack" }).click();
    await expect(
      page
        .getByRole("article", { name: "Evidence-led Sparks" })
        .locator(".spark-choice"),
    ).toHaveCount(6);
    expect(calls.map((call) => call.agentType)).toEqual([
      "rtb",
      "research",
      "sparks",
    ]);
    for (const call of calls) {
      if (!("parsedIMC" in call.context)) continue;
      expect(call.context.parsedIMC.sourceText).toContain(own);
      expect(call.context.parsedIMC.sourceText).not.toContain(foreign);
    }
    page.off("request", listener);
  }
});
