import { expect, test } from "@playwright/test";
import * as React from "react";
import {
  componentHarness,
  nodes,
  text,
  button,
  click,
} from "../helpers/phase1-component-harness";
import {
  phase1Fixture,
  phase1LongFraming,
} from "../fixtures/phase1-input-pack";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PreparationAgentId } from "../../lib/types";

const names = {
  reasonToBelieve: "JTBD & Reason to Believe Agent",
  research: "Data Agent",
  sparks: "Sparks Agent",
};
const identity = (tree: React.ReactNode) =>
  nodes(
    tree,
    (node) =>
      typeof node.type === "function" && node.props.identity !== undefined,
  )[0];
const cards = (tree: React.ReactNode) =>
  nodes(tree, (node) => node.type === "article");
test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

test("A: genuinely new campaign has three honest empty states, upload retained, no sample/confirm UI", async ({}, info) => {
  const { source } = phase1Fixture();
  const state = applyStudioSource(emptyStudio(), source);
  const harness = componentHarness(state, async () => {
    throw new Error("No generation was requested");
  });
  expect(cards(harness.tree)).toHaveLength(3);
  for (const card of cards(harness.tree)) {
    expect(text(card)).toContain("Awaiting Input Pack Generation");
    expect(text(card)).not.toMatch(/not supplied|not connected|Results Ready/i);
  }
  const html = harness.html();
  expect(html).toContain("Upload file for IMC brief");
  expect(html).not.toMatch(
    /Confirm campaign name|Use a supplied sample brief|Load Kevin|fictional test brief/i,
  );
  expect(button(harness.tree, "Build Input Pack").props.disabled).toBeFalsy();
  await info.attach("new-campaign-static-render", {
    body: html,
    contentType: "text/html",
  });
});

test("B/E/F: persisted campaign and exact long selected framing survive rendering without reinitialization", async ({}, info) => {
  const fixture = phase1Fixture(),
    before = structuredClone(fixture.session);
  const harness = componentHarness(fixture.session, async () => {
    throw new Error("No generation was requested");
  });
  for (const card of cards(harness.tree))
    expect(text(card)).toContain("Results Ready");
  const row = nodes(
    harness.tree,
    (node) => node.props.className === "studio-jtbd-value",
  )[0];
  expect(row.props.children).toBe(phase1LongFraming);
  expect(studioPack(harness.session).originalJTBD).toBe("");
  const html = harness.html();
  for (let i = 1; i <= 9; i++) expect(html).toContain(`Paragraph ${i}:`);
  const details = nodes(
    harness.tree,
    (node) => node.props.className === "studio-pack-summary",
  )[0];
  expect(nodes(details, (node) => node.type === "dt").map(text)).toEqual([
    "Campaign",
    "Campaign Objective",
    "Target Audience",
    "JTBD",
    "Reasons to Believe (RTBs)",
    "Data Points & Research",
    "Sparks",
  ]);
  expect(text(details)).not.toMatch(
    /Original JTBD|Selected XC RTB adaptation|Not explicitly supplied in the brief\.|AI-proposed XC framing/,
  );
  expect(text(details)).toContain("Strategic Context");
  harness.render();
  expect(harness.session).toEqual(before);
  await info.attach("existing-pack-static-render", {
    body: html,
    contentType: "text/html",
  });
});

for (const id of Object.keys(names) as PreparationAgentId[])
  test(`D: header regeneration invokes only ${id}, preserves other versions and selections`, async () => {
    const fixture = phase1Fixture(),
      calls: string[] = [];
    const harness = componentHarness(fixture.session, async (request) => {
      calls.push(String(request.agentId));
      return {
        ...structuredClone(fixture.versions[id]),
        id: `${id}-v1`,
        number: 2,
      };
    });
    const before = structuredClone(harness.session);
    click(button(harness.tree, `Regenerate ${names[id]}`));
    harness.render();
    expect(
      text(
        cards(harness.tree).find((card) =>
          String(card.props.className).endsWith(id),
        ),
      ),
    ).toContain("Generating…");
    await harness.settle();
    expect(calls).toEqual([id]);
    expect(
      harness.session.preparation.outputs.find(
        (output) => output.agentId === id,
      )!.versions,
    ).toHaveLength(2);
    for (const output of before.preparation.outputs.filter(
      (output) => output.agentId !== id,
    ))
      expect(
        harness.session.preparation.outputs.find(
          (item) => item.agentId === output.agentId,
        ),
      ).toEqual(output);
    expect(harness.session.selectedRtbVersionId).toBe(
      before.selectedRtbVersionId,
    );
    expect(harness.session.selectedResearchIds).toEqual(
      before.selectedResearchIds,
    );
    expect(harness.session.preparation.selectedSparkIds).toEqual(
      before.preparation.selectedSparkIds,
    );
  });

test("D: compact regenerate-all reuses each existing handler exactly once", async () => {
  const fixture = phase1Fixture(),
    calls: string[] = [];
  const harness = componentHarness(fixture.session, async (request) => {
    const id = request.agentId as PreparationAgentId;
    calls.push(id);
    return {
      ...structuredClone(fixture.versions[id]),
      id: `${id}-next`,
      number: 2,
    };
  });
  click(button(harness.tree, "Regenerate All Agents"));
  await harness.settle();
  expect(calls.sort()).toEqual(Object.keys(names).sort());
  expect(
    harness.session.preparation.outputs.map((output) => output.versions.length),
  ).toEqual([2, 2, 2]);
});

test("C: name edit commits on blur and Build uses current valid name, without rewriting source or campaign selection", async () => {
  const fixture = phase1Fixture(),
    calls: string[] = [];
  const harness = componentHarness(fixture.session, async (request) => {
    calls.push(String(request.agentId));
    return fixture.versions[request.agentId as PreparationAgentId];
  });
  const source = harness.session.preparation.sourceSnapshot,
    selection = harness.session.selectedCampaignScope;
  (identity(harness.tree).props.onChange as (value: string) => void)(
    "Kevin's reviewed Movers display name",
  );
  harness.render();
  (identity(harness.tree).props.onCommit as () => void)();
  harness.render();
  expect(studioPack(harness.session).campaignName).toBe(
    "Kevin's reviewed Movers display name",
  );
  expect(harness.session.preparation.sourceSnapshot).toBe(source);
  expect(harness.session.selectedCampaignScope).toBe(selection);
  expect(harness.html()).toContain("Original naming excerpt");
  click(button(harness.tree, "Build Input Pack"));
  await harness.settle();
  expect(calls).toEqual(["reasonToBelieve", "research", "sparks"]);
  expect(studioPack(harness.session).campaignName).toBe(
    "Kevin's reviewed Movers display name",
  );
});

test("C: first Build atomically applies an edited name before invoking mocked preparation handlers", async () => {
  const fixture = phase1Fixture(),
    calls: string[] = [];
  const initial = emptyStudio();
  initial.preparation.upstreamDraft = fixture.source;
  const harness = componentHarness(initial, async (request) => {
    calls.push(String(request.agentId));
    return fixture.versions[request.agentId as PreparationAgentId];
  });
  (identity(harness.tree).props.onChange as (value: string) => void)(
    "Reviewed display name before Build",
  );
  harness.render();
  click(button(harness.tree, "Build Input Pack"));
  await harness.settle();
  expect(studioPack(harness.session).campaignName).toBe(
    "Reviewed display name before Build",
  );
  expect(calls).toEqual(["reasonToBelieve", "research", "sparks"]);
  expect(harness.session.preparation.sourceSnapshot).toBe(fixture.source);
});

test("Build stages all three agents immediately and preserves the entire workspace when one fails", async () => {
  const fixture = phase1Fixture(),
    calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = structuredClone(fixture.session.preparation.outputs);
  const previousSession = structuredClone(fixture.session);
  const harness = componentHarness(fixture.session, async (request) => {
    const id = request.agentId as PreparationAgentId;
    calls.push(id);
    await gate;
    if (id === "research")
      throw new Error("Offline controlled Data Agent failure");
    return {
      ...structuredClone(fixture.versions[id]),
      id: `${id}-rebuilt`,
      number: 1,
    };
  });
  click(button(harness.tree, "Build Input Pack"));
  expect(calls).toEqual(["reasonToBelieve", "research", "sparks"]);
  expect(harness.session).toEqual(previousSession);
  release();
  await harness.settle();
  for (const output of before) {
    const after = harness.session.preparation.outputs.find(
      (item) => item.agentId === output.agentId,
    )!;
    expect(after.versions).toContainEqual(output.versions[0]);
    expect(after.versions).toHaveLength(1);
    expect(after.status).toBe("mock");
  }
  expect(harness.session).toEqual(previousSession);
  expect(harness.html()).toContain("previous workspace unchanged");
});

test("A/B: a different unrun campaign cannot display earlier errors, findings or foreign history", () => {
  const fixture = phase1Fixture();
  fixture.session.preparationErrors.sparks =
    "Old campaign error that must not leak";
  const source = phase1Fixture("xfinity_pro_source_text.txt").source;
  const next = applyStudioSource(fixture.session, source),
    before = structuredClone(next);
  const harness = componentHarness(next, async () => {
    throw new Error("No generation was requested");
  });
  for (const card of cards(harness.tree)) {
    expect(text(card)).toContain("Awaiting Input Pack Generation");
    expect(text(card)).not.toMatch(
      /Old campaign error|SYNTHETIC TEST PROPOSAL|Preparation history|not supplied|not connected/i,
    );
  }
  expect(harness.session).toEqual(before);
});

test("H: invalid Sparks failure keeps successful agents, versions and selections; targeted retry recovers", async () => {
  const fixture = phase1Fixture();
  let attempts = 0;
  const calls: string[] = [];
  const harness = componentHarness(fixture.session, async (request) => {
    calls.push(String(request.agentId));
    if (++attempts === 1)
      throw new Error(
        "Each Spark must ground itself in an exact excerpt from the current IMC brief.",
      );
    return {
      ...structuredClone(fixture.versions.sparks),
      number: 2,
      id: "recovered-sparks",
    };
  });
  const before = structuredClone(harness.session);
  click(button(harness.tree, "Regenerate Sparks Agent"));
  await harness.settle();
  expect(text(harness.tree)).toContain("Needs Attention — Retry");
  expect(
    harness.session.preparation.outputs.find(
      (item) => item.agentId === "sparks",
    )!.versions,
  ).toEqual(
    before.preparation.outputs.find((item) => item.agentId === "sparks")!
      .versions,
  );
  for (const id of ["reasonToBelieve", "research"])
    expect(
      harness.session.preparation.outputs.find((item) => item.agentId === id),
    ).toEqual(before.preparation.outputs.find((item) => item.agentId === id));
  expect(harness.session.preparation.selectedSparkIds).toEqual(
    before.preparation.selectedSparkIds,
  );
  click(button(harness.tree, "Retry Sparks Agent"));
  await harness.settle();
  expect(calls).toEqual(["sparks", "sparks"]);
  expect(
    harness.session.preparation.outputs.find(
      (item) => item.agentId === "sparks",
    )!.versions,
  ).toHaveLength(2);
});

test("stale preparation completion cannot write into a different campaign", async () => {
  const fixture = phase1Fixture();
  let resolve!: (value: typeof fixture.versions.sparks) => void;
  const deferred = new Promise<typeof fixture.versions.sparks>((done) => {
    resolve = done;
  });
  const harness = componentHarness(fixture.session, () => deferred);
  click(button(harness.tree, "Regenerate Sparks Agent"));
  const other = phase1Fixture("xfinity_pro_source_text.txt").session;
  harness.replace(other);
  resolve(fixture.versions.sparks);
  await harness.settle();
  expect(harness.session).toEqual(other);
});

test("upload callback and multi-campaign selection retain full document and build only the selected campaign", async () => {
  const full = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  );
  const scopes = detectIMCCampaignScopes(full),
    calls: string[] = [];
  const harness = componentHarness(emptyStudio(), async (request) => {
    calls.push(String(request.agentId));
    return phase1Fixture(
      undefined,
      (request.parsedIMC as { sourceText: string }).sourceText,
    ).versions[request.agentId as PreparationAgentId];
  });
  const uploader = nodes(
    harness.tree,
    (node) => node.props.label === "IMC brief",
  )[0];
  (uploader.props.onImport as (text: string, doc: unknown) => void)(full, {
    text: full,
    fileName: "Approved composite client PDF.pdf",
    format: "PDF",
    warnings: [],
  });
  harness.render();
  const select = nodes(
    harness.tree,
    (node) => node.props["aria-label"] === "Campaign in this document",
  )[0];
  (select.props.onChange as (event: unknown) => void)({
    target: { value: scopes[0].id },
  });
  harness.render();
  click(button(harness.tree, "Build Input Pack"));
  await harness.settle();
  expect(harness.session.sourceDocumentText).toBe(full);
  expect(harness.session.selectedCampaignScope).toBe(scopes[0].id);
  expect(harness.session.preparation.sourceSnapshot).toBe(scopes[0].sourceText);
  expect(harness.session.preparation.sourceSnapshot).not.toContain(
    "Choose a device to boost and elevate",
  );
  expect(calls).toEqual(["reasonToBelieve", "research", "sparks"]);
});
