import { expect, test } from "@playwright/test";
import {
  discoveryLensRoleIssue,
  crossLensIssue,
} from "../../lib/discovery-lens-quality";
import { readStudio, studioStorageKey } from "../../lib/discovery-studio";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

test("live brief completes five distinct Round Table lenses in the browser", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.XC_LIVE_E2E !== "1",
    "Explicit live-test opt-in required.",
  );
  const brief = process.env.XC_LIVE_BRIEF;
  const seed: Record<string, string> | undefined = process.env
    .XC_LIVE_CHECKPOINT
    ? JSON.parse(readFileSync(process.env.XC_LIVE_CHECKPOINT, "utf8")).storage
    : undefined;
  if (seed) {
    expect(
      readStudio({ getItem: (key) => seed[key] ?? null }).session.preparation
        .sourceSnapshot,
    ).toContain(path.basename(brief!));
    await page.addInitScript(
      ({ storage, key }) => {
        if (sessionStorage.getItem(key)) return;
        for (const [name, value] of Object.entries(storage))
          sessionStorage.setItem(name, value);
      },
      { storage: seed, key: studioStorageKey },
    );
  }
  const output =
    process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-roundtable";
  mkdirSync(output, { recursive: true });
  const save = async () => {
    const storage = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(sessionStorage).map((key) => [
          key,
          sessionStorage.getItem(key)!,
        ]),
      ),
    );
    writeFileSync(
      path.join(output, "roundtable-checkpoint.json"),
      JSON.stringify({ storage }),
    );
    return storage;
  };
  expect(brief, "XC_LIVE_BRIEF must identify the test document").toBeTruthy();
  expect(await (await request.get("/api/ai/agent")).json()).toMatchObject({
    mode: "live",
    provider: "writer",
    configured: true,
  });
  page.on("dialog", (dialog) => void dialog.accept());
  const calls: { agent: string; lens?: string; status: number }[] = [];
  page.on("response", (response) => {
    if (
      !response.url().endsWith("/api/ai/agent") ||
      response.request().method() !== "POST"
    )
      return;
    const input = response.request().postDataJSON();
    const call = {
      agent: input.agentType,
      lens: input.context?.lens,
      status: response.status(),
    };
    calls.push(call);
    console.info("[live-roundtable]", JSON.stringify(call));
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  if (!seed) {
    await nav.getByRole("button", { name: "Input Pack", exact: true }).click();
    await page
      .getByLabel("Import file for IMC brief", { exact: true })
      .setInputFiles(brief!);
    await expect(
      page.getByRole("textbox", { name: "IMC output brief", exact: true }),
    ).not.toHaveValue("");
    await page
      .getByRole("button", { name: "Build Input Pack", exact: true })
      .click();
    await expect(page.locator(".studio-agent-status")).toHaveText(
      [/V0/, /V0/, /V0/],
      { timeout: 290_000 },
    );
    await page
      .getByRole("article", { name: "RTB / JTBD", exact: true })
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("article", { name: "Data Analysis & Synthesis", exact: true })
      .locator(".studio-data-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("article", { name: "Evidence-led Sparks", exact: true })
      .locator(".spark-choice")
      .first()
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "Next: Insight Discovery", exact: true })
      .click();
  } else
    await nav
      .getByRole("button", { name: "Insight Discovery", exact: true })
      .click();
  await save();
  if (process.env.XC_LIVE_REUSE_FINDINGS !== "1") {
    await page
      .getByRole("textbox", { name: "What should we investigate?" })
      .fill(
        process.env.XC_LIVE_QUESTION ||
          "What keeps Conductors and Bloomers from upgrading their Gateway, and what proof is missing?",
      );
    await page
      .getByRole("button", { name: "Start Roundtable Discussion", exact: true })
      .click();
  } else
    expect(seed, "Reusing findings requires XC_LIVE_CHECKPOINT").toBeTruthy();
  const names = [
    "Consumer Agent",
    "Culture Agent",
    "Category Agent",
    "Brand Agent",
    "Analogous Solutions Agent",
  ];
  await expect
    .poll(
      async () =>
        Promise.all(
          names.map((name) =>
            page
              .getByRole("article", { name, exact: true })
              .locator(".v2-agent-status")
              .innerText(),
          ),
        ),
      { timeout: 600_000 },
    )
    .toEqual(
      names.map(() => expect.stringMatching(/Insights Ready|Saved results/)),
    );
  const storage = await save();
  const { discovery } = readStudio({ getItem: (key) => storage[key] ?? null });
  const runs = discovery.runs.map((run) => ({
    lens: run.lensId,
    version: run.versions.find(
      (version) => version.id === run.currentVersionId,
    )!,
  }));
  for (const run of runs) {
    expect(run.version?.findings.length).toBeGreaterThan(0);
    for (const finding of run.version.findings)
      expect(discoveryLensRoleIssue(run.lens, finding)).toBe("");
    expect(
      crossLensIssue(
        run.lens,
        run.version.findings,
        runs
          .filter((peer) => peer.lens !== run.lens)
          .flatMap((peer) => peer.version.findings),
      ),
    ).toBe("");
  }
  expect(calls.filter((call) => call.status >= 400)).toEqual([]);
  await page.screenshot({
    path: path.join(output, "roundtable.png"),
    fullPage: true,
  });
  await page.reload();
  await nav
    .getByRole("button", { name: "Insight Discovery", exact: true })
    .click();
  for (const name of names)
    await expect(
      page
        .getByRole("article", { name, exact: true })
        .locator(".v2-agent-status"),
    ).toContainText(/Insights Ready|Saved results/);
  console.info(
    "[live-roundtable] PASS",
    JSON.stringify({ calls: calls.length, lenses: runs.length }),
  );
});
