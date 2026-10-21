import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyStudioSource,
  emptyStudio,
  studioResearchChoices,
} from "../../lib/discovery-studio";
import { resolveRtb, getUpstream } from "../../lib/upstream";
import { mockSparks } from "../../lib/ai/mock-sparks";
import { preparationText } from "../../lib/ai/format";
import type { AgentData } from "../../lib/ai/schemas";
import type { PreparationAgentId, PreparationVersion } from "../../lib/types";

// Deliberately synthetic proposal, not a claim about Movers or a real audience.
export const phase1LongFraming =
  "\n\nSYNTHETIC TEST PROPOSAL — selected framing, unapproved.\n\n" +
  Array.from(
    { length: 9 },
    (_, i) =>
      `Paragraph ${i + 1}: Preserve this exact selected preparation output, including its qualifications and line breaks. This test paragraph represents a proposed strategic interpretation, not original source wording or retrieved research.`,
  ).join("\n\n") +
  "\n\n";
export function phase1Fixture(
  file = "movers_source_text.txt",
  sourceOverride?: string,
) {
  const source =
    sourceOverride ??
    readFileSync(path.join(__dirname, "client-input-pack", file), "utf8");
  const session = applyStudioSource(emptyStudio(), source);
  const upstream = getUpstream(session.preparation),
    original = resolveRtb(upstream).field.sourceValue;
  const data: Record<PreparationAgentId, AgentData> = {
    reasonToBelieve: {
      originalRtb: original,
      originalRtbStatus: "supplied",
      originalRtbApprovalStatus: "unknown",
      xcAdaptation: phase1LongFraming,
      adaptationStatus: "not_approved",
      reviewNotes: ["Synthetic offline fixture."],
      evidenceGaps: [],
    },
    research: {
      campaignName: upstream.fields.campaignName.value,
      objectives: upstream.fields.objective.value,
      audience: upstream.fields.audience.value,
      productInformation: "Not supplied",
      suppliedEvidence: [],
      verifiedEvidence: [],
      illustrativeAssumptions: [],
      audienceContext: [
        "Synthetic audience interpretation for selection tests only.",
      ],
      historicalPerformance: [],
      creativePerformance: [],
      marketContext: [],
      researchToValidate: [],
      evidenceGaps: ["No external research was retrieved."],
      sourceNotes: ["Offline fixture, not live analysis."],
    },
    sparks: { sparks: mockSparks(upstream, "", source) },
  };
  const makeVersion = (id: PreparationAgentId): PreparationVersion => {
    const value = data[id];
    return {
      id: `${id}-v0`,
      number: 1,
      text: preparationText(value),
      data: value,
      guidance: "Synthetic offline fixture",
      createdAt: "2026-10-19T12:00:00Z",
      provider: "mock",
      sourceBrief: source,
      sparks: "sparks" in value ? value.sparks : [],
      inputContext: {
        sourceBrief: source,
        selectedContent: { selectedSparks: [] },
        steeringText: "",
        selectedResearchSources: [],
        suppliedEvidence: [],
      },
    };
  };
  const versions: Record<PreparationAgentId, PreparationVersion> = {
    reasonToBelieve: makeVersion("reasonToBelieve"),
    research: makeVersion("research"),
    sparks: makeVersion("sparks"),
  };
  session.preparation.outputs = (
    Object.keys(versions) as PreparationAgentId[]
  ).map((id) => ({
    agentId: id,
    status: "mock",
    versions: [versions[id]],
    currentVersionId: versions[id].id,
  }));
  session.selectedRtbVersionId = versions.reasonToBelieve.id;
  session.selectedResearchIds = studioResearchChoices(session)
    .slice(0, 2)
    .map((item) => item.id);
  session.preparation.selectedSparkIds = versions.sparks.sparks
    .slice(0, 2)
    .map((item) => item.id);
  return { session, versions, source };
}
