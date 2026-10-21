import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import { inputPackVersion, discoveryFindingRef } from "../../lib/discovery";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { discoveryFoundation } from "../../lib/discovery-context";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  seedStudioDiscovery,
  studioStrategySession,
  packageDiscoveryBrief,
} from "../../lib/discovery-studio";
import { buildStudioBriefInput } from "../../lib/studio-brief-input";
import { buildBriefDocument, sectionContent } from "../../lib/brief-document";
import type { DiscoveryRunVersion } from "../../lib/types";

const scopes = detectIMCCampaignScopes(
  readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  ),
);
function fixture(index = 0) {
  const session = applyStudioSource(emptyStudio(), scopes[index].sourceText);
  const pack = studioPack(session);
  const state = seedStudioDiscovery(pack);
  state.humanBriefLine = `Kevin / ${scopes[index].title} / approved line — preserve exactly.`;
  state.problemStatement = "Kevin's problem, not the campaign objective.";
  state.workingAudience = "Kevin's chosen audience focus.";
  state.humanTension =
    "Kevin's tension: wanting continuity, questioning the transition.";
  state.workingRTB =
    "Kevin's proof selection — proposal, not a new product claim.";
  state.workingJTBD = "Kevin's proposed job, not an original supplied JTBD.";
  state.evidenceInsights =
    "Kevin's interpretation; not independently verified.";
  state.strategicDirection = "Kevin's direction — not a tagline.";
  state.executionConsiderations =
    "2 display assets; desktop + mobile; copy 20 words; no new claims.";
  state.notes = "PRIVATE — never export this.";
  state.wholeBrief = {
    ...state.wholeBrief,
    objective: "Kevin's approved objective.",
    deliverables: "Two OLA placements; 300x250 desktop and 320x50 mobile.",
    timelines: "Deadline unresolved — no date approved.",
  };
  const approve = () =>
    approveDiscoveryCanvas(
      studioStrategySession(session, state),
      pack,
      state,
      state.humanBriefLine!,
      "2026-10-17T15:00:00.000Z",
    ).approved!;
  return { session, pack, state, approve };
}
const section = (
  brief: ReturnType<typeof packageDiscoveryBrief>,
  title: string,
) => brief.sections.find((item) => item.title === title)?.content;

for (const index of [0, 1]) {
  test(`${scopes[index].title}: approved human fields survive packaging and later edits`, () => {
    const { pack, state, approve } = fixture(index);
    const expected = structuredClone(state);
    const approved = approve();
    Object.assign(state, {
      humanBriefLine: "Later draft",
      workingAudience: "Later audience",
      workingRTB: "Later proof",
      humanTension: "Later tension",
    });
    const brief = packageDiscoveryBrief(approved, state);
    expect(section(brief, "Brief")).toBe(expected.humanBriefLine);
    expect(section(brief, "Audience")).toBe(expected.workingAudience);
    expect(section(brief, "Proof / RTB")).toBe(expected.workingRTB);
    expect(section(brief, "Human / Consumer Tension")).toBe(
      expected.humanTension,
    );
    expect(section(brief, "Job to be done")).toBe(expected.workingJTBD);
    expect(section(brief, "Objective")).toBe(expected.wholeBrief!.objective);
    expect(section(brief, "Additional brief instructions")).toBe(
      expected.executionConsiderations,
    );
    expect(section(brief, "Deliverables")).toBe(
      expected.wholeBrief!.deliverables,
    );
    expect(section(brief, "Timelines")).toBe(expected.wholeBrief!.timelines);
    expect(JSON.stringify(brief)).not.toContain(state.notes);
    const input = buildStudioBriefInput(approved, state);
    expect(input.audience).toBe(expected.workingAudience);
    expect(input.originalRTB).toBe(pack.reasonToBelieve);
    expect(input.rtbApprovalStatus).toBe("unknown");
    expect(JSON.stringify(brief)).not.toContain("Later audience");
  });
  test(`${scopes[index].title}: original IMC proof, product, channels, constraints and records remain distinct`, () => {
    const { pack, state, approve } = fixture(index);
    const brief = packageDiscoveryBrief(approve(), state);
    expect(section(brief, "Original upstream RTB")).toBe(pack.reasonToBelieve);
    expect(section(brief, "Original upstream JTBD")).toBe(
      pack.originalJTBD || "Not supplied",
    );
    const source = section(brief, "Original IMC context")!;
    for (const value of [
      pack.campaignName,
      pack.objective,
      pack.audience,
      pack.product,
      pack.channel,
      pack.constraints,
    ])
      if (value) expect(source).toContain(value);
    for (const record of pack.imcRecords ?? [])
      if (
        [
          "deliverable",
          "timing",
          "key_message",
          "source_reference",
          "campaign_background",
          "brand_positioning",
        ].includes(record.group)
      )
        expect(source).toContain(record.text);
    expect(section(brief, "Approval Notes")).toContain("RTB approval: unknown");
    expect(section(brief, "Approval Notes")).toContain(inputPackVersion(pack));
    const other = scopes[1 - index].title;
    expect(brief.campaign).not.toBe(other);
    expect(source).not.toContain(other);
    const document = buildBriefDocument(brief);
    expect(document.approved?.content).toBe(state.humanBriefLine);
    const titles = document.groups.flatMap((g) =>
      g.sections.map((s) => s.title),
    );
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.slice(0, 4)).toEqual([
      "Context",
      "Objective",
      "Audience",
      "Insight / Opportunity",
    ]);
  });
}
test("blank approvals and mismatched Input Pack snapshots cannot be packaged", () => {
  const { pack, state, approve } = fixture();
  const approved = approve();
  expect(() =>
    packageDiscoveryBrief(
      {
        ...approved,
        briefLine: "",
        discoveryCanvas: { ...approved.discoveryCanvas!, briefLine: "" },
      },
      state,
    ),
  ).toThrow();
  const changed = {
    ...approved,
    strategyInputPack: { ...pack, objective: "Wrong snapshot" },
  };
  expect(() => packageDiscoveryBrief(changed, state)).toThrow(
    /snapshot|Input Pack/i,
  );
  expect(() => buildStudioBriefInput(changed, state)).toThrow(
    /snapshot|Input Pack/i,
  );
});
test("selected adaptation is included only when confirmed; original source and human proof stay separate", () => {
  const { pack, state, approve } = fixture();
  pack.proposedRTB = "Selected XC framing from preparation.";
  const approved = approve();
  expect(
    section(
      packageDiscoveryBrief(approved, state),
      "Proposed XC adaptation — not upstream-approved",
    ),
  ).toBe(pack.proposedRTB);
  const excluded = structuredClone(approved);
  excluded.strategyInputPack.proposedRTB = "";
  excluded.discoveryCanvas!.inputPackVersion = inputPackVersion(
    excluded.strategyInputPack,
  );
  expect(JSON.stringify(packageDiscoveryBrief(excluded, state))).not.toContain(
    pack.proposedRTB,
  );
  expect(pack.proposedRTB).toBe("Selected XC framing from preparation.");
});
test("findings retain exact source, mock attribution, limitations and approved selection", () => {
  const { pack, state, approve } = fixture();
  const data = mockDiscovery({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question: "Which barriers need evidence?",
      action: "initial",
      previousFindings: [],
    },
  });
  const version: DiscoveryRunVersion = {
    id: "selected-source-run",
    number: 1,
    question: "Which barriers need evidence?",
    investigationType: "problem",
    action: "initial",
    guidance: "",
    createdAt: "2026-10-17T14:00:00Z",
    inputPackVersion: inputPackVersion(pack),
    inputPackSnapshot: structuredClone(pack),
    sourceCoverage: [],
    provider: "mock",
    findings: data.findings.map((f, i) => ({
      ...f,
      id: `finding-${i}`,
      lensId: "consumer",
      inputPackVersion: inputPackVersion(pack),
      runVersion: 1,
      researchRunId: "selected-source-run",
      provider: "mock",
    })),
  };
  state.runs[0] = {
    ...state.runs[0],
    status: "complete",
    currentVersionId: version.id,
    versions: [version],
  };
  state.savedFindingIds = [discoveryFindingRef(version.findings[0])];
  const approved = approve(),
    before = structuredClone(state);
  const brief = packageDiscoveryBrief(approved, state);
  const findings = section(
    brief,
    "Saved discoveries — worth considering, not verification",
  )!;
  expect(findings).toContain(version.findings[0].title);
  expect(findings).not.toContain(version.findings[1].title);
  expect(findings).toContain("DEMO DATA");
  expect(findings).toContain(version.findings[0].whatComplicatesIt);
  for (const evidence of version.findings[0].evidence) {
    expect(findings).toContain(evidence.excerpt);
    expect(findings).toContain(evidence.locator);
  }
  expect(brief.mock).toBe(true);
  expect(state).toEqual(before);
  state.runs = [];
  expect(() => packageDiscoveryBrief(approved, state)).toThrow(/unavailable/);
});
test("missing values stay empty or Not supplied rather than receiving invented execution", () => {
  const { pack, state, approve } = fixture();
  state.workingJTBD = "";
  state.workingRTB = "";
  state.workingAudience = "";
  state.wholeBrief = {
    context: "",
    objective: "",
    audience: "",
    thoughtStarters: "",
    deliverables: "",
    mandatories: "",
    timelines: "",
  };
  const brief = packageDiscoveryBrief(approve(), state);
  expect(pack.originalJTBD).toBeFalsy();
  expect(section(brief, "Job to be done")).toBe("Not supplied");
  expect(section(brief, "Timelines")).toBe("");
  expect(section(brief, "Deliverables")).toBe("");
  expect(section(brief, "Audience")).toBe("");
  for (const group of buildBriefDocument(brief).groups)
    for (const field of group.sections)
      if (!field.content) expect(sectionContent(field)).toBe("Not supplied.");
  const input = buildStudioBriefInput(approve(), state);
  for (const key of [
    "assets",
    "pages",
    "desktopMobile",
    "formats",
    "copy",
    "cardsModules",
  ] as const)
    expect(input.execution[key]).toBe("");
});
test("mock preparation provenance labels the packaged brief even before Discovery runs", () => {
  const { pack, state, approve } = fixture();
  Object.assign(pack, {
    selectedPreparationProviders: { reasonToBelieve: "mock" },
    proposedRTB: "Demo framing selected by the human.",
  });
  expect(state.runs.every((run) => !run.versions.length)).toBe(true);
  const brief = packageDiscoveryBrief(approve(), state);
  expect(brief.mock).toBe(true);
  expect(buildBriefDocument(brief).status).toContain("INCLUDES DEMO MATERIAL");
});
