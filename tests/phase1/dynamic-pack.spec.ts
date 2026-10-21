import { test, expect } from "@playwright/test";
import {
  componentHarness,
  nodes,
  text,
} from "../helpers/phase1-component-harness";
import {
  phase1Fixture,
  phase1LongFraming,
} from "../fixtures/phase1-input-pack";
import {
  studioPack,
  studioResearchChoices,
  emptyStudio,
  applyStudioSource,
} from "../../lib/discovery-studio";
import { dynamicPackPresentation } from "../../lib/input-pack-presentation";

for (const campaign of [
  "movers_source_text.txt",
  "xfinity_pro_source_text.txt",
]) {
  test(`seven selected context fields preserve exact ${campaign} values without generation or state mutation`, () => {
    expect(process.env.AI_MODE).toBe("mock");
    expect(process.env.OPENAI_API_KEY).toBe("");
    expect(process.env.XC_OFFLINE_TEST).toBe("1");
    const { session } = phase1Fixture(campaign);
    session.selectedResearchIds = studioResearchChoices(session).map(
      (item) => item.id,
    );
    const before = structuredClone(session);
    const pack = studioPack(session);
    const view = dynamicPackPresentation(pack);
    const app = componentHarness(session, async () => {
      throw Error("Unexpected generation");
    });
    const details = nodes(
      app.tree,
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
    const values = nodes(details, (node) => node.type === "dd");
    expect(text(values[0])).toContain(pack.campaignName);
    for (const part of view.objectiveParts) {
      expect(text(values[1])).toContain(part.label);
      expect(text(values[1])).toContain(part.text.replace(/\s+/g, " "));
    }
    if (!view.objectiveParts.length)
      expect(text(values[1])).toContain(view.objective);
    expect(text(values[2])).toContain(view.audience);
    expect(
      nodes(
        values[3],
        (node) => node.props.className === "studio-jtbd-value",
      )[0].props.children,
    ).toBe(phase1LongFraming);
    expect(text(values[3])).toContain(view.strategicContext);
    expect(text(values[3])).toContain(
      pack.selectedPreparationVersions!.reasonToBelieve!,
    );
    for (const claim of view.rtbs) expect(text(values[4])).toContain(claim);
    if (campaign.startsWith("movers")) {
      expect(view.rtbs).toHaveLength(2);
      expect(view.objectiveParts.map((part) => part.label)).toEqual([
        "Customer",
        "Prospect",
        "Overall Objective",
      ]);
      const normalize = (value: string) =>
        value
          .replace(/\s+/g, "")
          .replace(/Customer:|Prospect:|OverallObjective:/g, "");
      expect(
        normalize(view.objectiveParts.map((part) => part.text).join(" ")),
      ).toBe(normalize(view.objective));
      expect(text(values[4])).toContain("Prospect & TOT only");
      expect(text(values[4])).toContain("5 Years. Guaranteed.");
      for (const phrase of [
        "Customer:",
        "Prospect:",
        "Target existing customers and prospects",
        "entertainment/streaming",
      ])
        expect(view.objective).toContain(phrase);
    }
    expect(text(values[5])).not.toContain(view.objective);
    expect(text(values[5])).toContain("Brief-based synthesis");
    expect(text(values[5])).toContain("not independent research");
    for (const item of pack.selectedResearch!) {
      expect(text(values[5])).toContain(item.source);
      expect(text(values[5])).toContain(item.versionId);
    }
    for (const spark of pack.selectedSparks!) {
      for (const value of [
        spark.title,
        spark.idea || spark.text,
        spark.excerpt || spark.campaignGrounding,
        spark.rationale,
        spark.hypothesis || spark.hypothesisToValidate,
        spark.versionId,
      ])
        if (value) expect(text(values[6])).toContain(value);
    }
    expect(text(details)).not.toMatch(
      /Original JTBD|Original RTB|Selected XC RTB Adaptation|AI-Proposed JTBD|Proposed XC Framing|Not explicitly supplied in the brief\.|What should the Round Table investigate/,
    );
    const tiles = nodes(
      app.tree,
      (node) => node.props.className === "studio-pack-tiles",
    )[0];
    const counts = nodes(tiles, (node) => node.type === "strong").map(text);
    expect(counts).toEqual([
      "Selected",
      `${view.rtbs.length} available`,
      `${pack.selectedResearch!.length} selected`,
      `${pack.selectedSparks!.length} selected`,
    ]);
    app.render();
    expect(app.session).toEqual(before);
    expect(studioPack(app.session)).toEqual(pack);
  });
}

test("objective duplication is suppressed by content rather than category alone; unrelated research survives", () => {
  const pack = studioPack(phase1Fixture().session);
  pack.selectedResearch = [
    {
      id: "objective",
      versionId: "research-v1",
      version: 2,
      category: "OBJECTIVES",
      text: pack.objective,
      source: "Supplied IMC brief",
      status: "ai_synthesis",
    },
    {
      id: "separate",
      versionId: "research-v1",
      version: 2,
      category: "OBJECTIVES",
      text: "Separate supplied observation, not the campaign objective.",
      source: "Uploaded research fixture",
      status: "supplied",
    },
  ];
  const before = structuredClone(pack);
  const view = dynamicPackPresentation(pack);
  expect(view.research.map((item) => item.repeatsObjective)).toEqual([
    true,
    false,
  ]);
  expect(view.research[1].text).toBe(pack.selectedResearch[1].text);
  expect(pack).toEqual(before);
});

test("empty, unrun and failed packs remain honest; campaign switching never changes stored selections", () => {
  const movers = phase1Fixture();
  const app = componentHarness(emptyStudio(), async () => {
    throw Error("Unexpected generation");
  });
  for (const state of [
    emptyStudio(),
    applyStudioSource(emptyStudio(), movers.source),
  ]) {
    app.replace(state);
    const panel = nodes(
      app.tree,
      (node) => node.props["aria-label"] === "Dynamic Input Pack",
    )[0];
    expect(text(panel)).toContain("Generate a JTBD to continue.");
    expect(text(panel)).toContain("No data points selected.");
    expect(text(panel)).toContain("No Sparks selected");
    expect(nodes(panel, (node) => node.type === "dt")).toHaveLength(7);
  }
  const failed = structuredClone(movers.session);
  failed.preparation.outputs[0].status = "failed";
  failed.preparation.outputs[0].error = "Offline generation failure";
  app.replace(failed);
  expect(
    text(
      nodes(
        app.tree,
        (node) => node.props.className === "studio-jtbd-value",
      )[0],
    ),
  ).toBe(phase1LongFraming);
  expect(app.session).toEqual(failed);
  const pro = phase1Fixture("xfinity_pro_source_text.txt").session;
  app.replace(pro);
  const details = nodes(
    app.tree,
    (node) => node.props.className === "studio-pack-summary",
  )[0];
  expect(text(details)).toContain(studioPack(pro).campaignName);
  expect(text(details)).not.toContain(studioPack(movers.session).campaignName);
  expect(app.session).toEqual(pro);
  app.replace(movers.session);
  expect(app.session).toEqual(movers.session);
});
