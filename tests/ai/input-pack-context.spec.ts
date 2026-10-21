import { expect, test } from "@playwright/test";
import sample from "../../lib/samples/kevin-imc.json";
import { generateMock } from "../../lib/ai/mock-provider";
import { preparationText } from "../../lib/ai/format";
import type { AgentData } from "../../lib/ai/schemas";
import { sparkSetIssue } from "../../lib/ai/spark-quality";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  studioResearchChoices,
} from "../../lib/discovery-studio";
import { parseIMCBrief } from "../../lib/imc-parser";
import { inputPackVersion } from "../../lib/discovery";
import { discoveryFoundation } from "../../lib/discovery-context";
import { requestSchema } from "../../lib/ai/schemas";
import {
  studioPreparationIssue,
  studioPreparationReady,
} from "../../lib/preparation";
import { extractUpstream } from "../../lib/upstream";
import {
  mobileIMCBrief,
  mobileBusinessObjective,
  mobileReasonToBelieve,
} from "../fixtures/mobile-imc-brief";
import type { PreparationAgentId, PreparationVersion } from "../../lib/types";

function savedVersion(
  id: string,
  data: AgentData,
  sourceBrief: string,
  number = 1,
): PreparationVersion {
  return {
    id,
    number,
    text: preparationText(data),
    guidance:
      number === 1
        ? "Initial preparation from IMC brief"
        : "Steer toward another direction",
    createdAt: "2026-10-17T00:00:00.000Z",
    sourceBrief,
    provider: "mock",
    generatedAt: "2026-10-17T00:00:00.000Z",
    data,
    sparks: "sparks" in data ? data.sparks : [],
    inputContext: {
      sourceBrief,
      selectedContent: { selectedSparks: [] },
      steeringText: number === 1 ? "" : "Steer toward another direction",
    },
  };
}

test("Markdown, page-extracted PDF, CSV and field/value layouts preserve objective and exact RTB", () => {
  const mobile = parseIMCBrief(mobileIMCBrief);
  expect(mobile.fields.objective.sourceValue).toBe(mobileBusinessObjective);
  expect(mobile.fields.reason_to_believe.sourceValue).toBe(
    mobileReasonToBelieve,
  );
  const extractedPdf = parseIMCBrief(sample.text);
  expect(extractedPdf.fields.campaign.sourceValue).toBe(
    "Ecosystem - Campaign Extensions",
  );
  expect(extractedPdf.fields.objective.sourceValue).toContain(
    "Evolve Xfinity to be about more than just WiFi",
  );
  expect(extractedPdf.fields.audience.sourceValue).toContain(
    "Total audience – prospect and customer (GM)",
  );
  expect(extractedPdf.fields.reason_to_believe.sourceValue).toContain(
    "Xfinity products are better together.",
  );
  const layouts = [
    "Campaign,Business objective,Target audience,Reason to believe\nCSV campaign,Increase consideration,Existing customers,Exact CSV proof",
    "| Campaign name | Table campaign |\n| Business objective | Increase consideration |\n| Target audience | Existing customers |\n| Reason to believe | Exact table proof |",
  ];
  for (const [index, source] of layouts.entries()) {
    const parsed = parseIMCBrief(source);
    expect(parsed.fields.objective.sourceValue).toBe("Increase consideration");
    expect(parsed.fields.audience.sourceValue).toBe("Existing customers");
    expect(parsed.fields.reason_to_believe.sourceValue).toBe(
      index === 0 ? "Exact CSV proof" : "Exact table proof",
    );
  }
});

test("only complete current V0 outputs make the pack ready; failures and stale excerpts stay visible", async () => {
  const sourceBrief = mobileIMCBrief;
  const parsedIMC = parseIMCBrief(sourceBrief);
  const upstream = extractUpstream(parsedIMC);
  const agentTypes = ["rtb", "research", "sparks"] as const;
  const ids: PreparationAgentId[] = ["reasonToBelieve", "research", "sparks"];
  const data = await Promise.all(
    agentTypes.map((agentType) =>
      generateMock({ agentType, context: { parsedIMC, upstream } }),
    ),
  );
  const session = applyStudioSource(emptyStudio(), sourceBrief);
  session.preparation.outputs = ids.map((agentId, index) => ({
    agentId,
    status: "mock",
    currentVersionId: `${agentId}-v0`,
    versions: [savedVersion(`${agentId}-v0`, data[index], sourceBrief)],
  }));
  if (!("sparks" in data[2])) throw new Error("Wrong fixture output");
  expect(studioPreparationReady(session.preparation, "mock")).toBe(false);
  session.preparation.selectedSparkIds = [data[2].sparks[0].id];
  expect(
    ids.map((id) => studioPreparationIssue(session.preparation, id)),
  ).toEqual([undefined, undefined, undefined]);
  expect(studioPreparationReady(session.preparation, "mock")).toBe(true);
  expect(studioPreparationReady(session.preparation, "live")).toBe(false);
  session.preparation.selectedSparkIds = [
    "historical-spark-not-in-current-version",
  ];
  expect(studioPreparationReady(session.preparation, "mock")).toBe(false);
  session.preparation.selectedSparkIds = [data[2].sparks[0].id];
  const sparks = session.preparation.outputs[2];
  expect(sparks.versions[0].sparks).toHaveLength(6);
  expect(
    sparkSetIssue(
      {
        sparks: sparks.versions[0].sparks.map((spark) => ({
          ...spark,
          title: spark.title!,
          rationale: spark.rationale!,
          campaignGrounding: spark.campaignGrounding!,
          hypothesisToValidate: spark.hypothesisToValidate!,
        })),
      },
      undefined,
      parsedIMC,
    ),
  ).toBeUndefined();
  sparks.versions[0].sparks[0].excerpt = "An invented source quotation";
  expect(studioPreparationIssue(session.preparation, "sparks")).toContain(
    "exact excerpt",
  );
  expect(studioPreparationReady(session.preparation)).toBe(false);
  sparks.status = "failed";
  sparks.error = "Provider request failed";
  expect(studioPreparationIssue(session.preparation, "sparks")).toBe(
    "Provider request failed",
  );
  expect(sparks.versions).toHaveLength(1);
});

test("selected adaptation and current selected Sparks transfer without RTB analysis or duplicate histories", async () => {
  const sourceBrief = mobileIMCBrief;
  const parsedIMC = parseIMCBrief(sourceBrief);
  const upstream = extractUpstream(parsedIMC);
  const [rtb, sparks] = await Promise.all([
    generateMock({ agentType: "rtb", context: { parsedIMC, upstream } }),
    generateMock({ agentType: "sparks", context: { parsedIMC, upstream } }),
  ]);
  if (!("originalRtb" in rtb) || !("sparks" in sparks))
    throw new Error("Wrong fixture output");
  const session = applyStudioSource(emptyStudio(), sourceBrief);
  const selected = savedVersion(
    "rtb-v0",
    { ...rtb, reviewNotes: ["Review note must not transfer"] },
    sourceBrief,
  );
  const later = savedVersion(
    "rtb-v1",
    { ...rtb, xcAdaptation: "Different proposal" },
    sourceBrief,
    2,
  );
  session.preparation.outputs = [
    {
      agentId: "reasonToBelieve",
      status: "mock",
      currentVersionId: later.id,
      versions: [later, selected],
    },
    {
      agentId: "sparks",
      status: "mock",
      currentVersionId: "sparks-v1",
      versions: [
        savedVersion("sparks-v1", sparks, sourceBrief, 2),
        savedVersion("sparks-v0", sparks, sourceBrief),
      ],
    },
  ];
  session.selectedRtbVersionId = selected.id;
  session.preparation.selectedSparkIds = [sparks.sparks[0].id];
  const pack = studioPack(session);
  expect(pack.proposedRTB).toBe(rtb.xcAdaptation);
  expect(pack.proposedRTB).not.toContain("Review note must not transfer");
  expect(pack.reasonToBelieve).toBe(mobileReasonToBelieve);
  expect(pack.selectedSparks).toHaveLength(1);
  expect(pack.selectedSparks?.[0].versionId).toBe("sparks-v1");
  expect(pack.selectedPreparationVersions?.reasonToBelieve).toBe(selected.id);
  expect(pack.selectedPreparationVersions?.sparks).toBe("sparks-v1");
  expect(pack.originalJTBD).toContain(
    "Encourage existing Xfinity Internet customers",
  );
  const discoveryRequest = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens: "consumer",
      investigationType: "problem",
      question: "What should we investigate?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (discoveryRequest.agentType !== "discovery")
    throw new Error("Wrong request type");
  expect(discoveryRequest.context.foundation.sourceAvailability).toContainEqual(
    expect.objectContaining({ source: "Tableau", status: "not_connected" }),
  );
  expect(
    discoveryRequest.context.foundation.selectedPreparationVersions?.sparks,
  ).toBe("sparks-v1");
  session.preparation.upstream!.fields.originalRTB.value =
    "A reviewed interpretation that is not the original RTB.";
  expect(studioPack(session).reasonToBelieve).toBe(mobileReasonToBelieve);
  expect(studioPack(session).proposedRTB).toBe(rtb.xcAdaptation);
  expect(
    pack.sourceAvailability?.find((item) => item.source === "Tableau")?.status,
  ).toBe("not_connected");
  session.selectedRtbVersionId = "";
  expect(studioPack(session).proposedRTB).toBe("");
  session.selectedRtbVersionId = selected.id;
  selected.data = { ...rtb, originalRtb: "Invented source text" };
  expect(studioPack(session).proposedRTB).toBe("");
});

test("only selected findings from the current valid research version cross the handoff", async () => {
  const sourceBrief = mobileIMCBrief;
  const parsedIMC = parseIMCBrief(sourceBrief);
  const upstream = extractUpstream(parsedIMC);
  const research = await generateMock({
    agentType: "research",
    context: { parsedIMC, upstream },
  });
  const session = applyStudioSource(emptyStudio(), sourceBrief);
  const first = savedVersion("research-v0", research, sourceBrief);
  const second = savedVersion("research-v1", research, sourceBrief, 2);
  session.preparation.outputs = [
    {
      agentId: "research",
      status: "mock",
      currentVersionId: first.id,
      versions: [second, first],
    },
  ];
  const firstChoice = studioResearchChoices(session)[0];
  expect(firstChoice.versionId).toBe(first.id);
  session.selectedResearchIds = [firstChoice.id];
  const firstPackVersion = inputPackVersion(studioPack(session));
  expect(studioPack(session).selectedResearch?.map((item) => item.id)).toEqual([
    firstChoice.id,
  ]);
  session.preparation.outputs[0].currentVersionId = second.id;
  expect(inputPackVersion(studioPack(session))).not.toBe(firstPackVersion);
  expect(studioPack(session).preparationGuidance?.research).toBe(
    "Steer toward another direction",
  );
  expect(
    studioResearchChoices(session).every(
      (item) => item.versionId === second.id,
    ),
  ).toBe(true);
  expect(studioPack(session).selectedResearch).toEqual([]);
  session.preparation.outputs[0].currentVersionId = first.id;
  expect(studioPack(session).selectedResearch?.map((item) => item.id)).toEqual([
    firstChoice.id,
  ]);
  session.preparation.outputs[0].status = "failed";
  session.preparation.outputs[0].error = "Generation failed";
  expect(studioPack(session).selectedResearch).toEqual([]);
});
