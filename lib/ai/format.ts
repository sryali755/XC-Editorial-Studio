import { carryUpstream } from "../upstream";
import type { AgentData, AgentDataMap, AgentResponse } from "./schemas";
import type { BriefPayload, GeneratedBrief } from "../types";
import { withDiscoveryCanvas } from "../discovery-brief";

export function preparationText(data: AgentData): string {
  if ("originalRtb" in data)
    return [
      data.proposedJTBD && `Proposed JTBD · not approved\n${data.proposedJTBD}`,
      data.xcAdaptation,
      ...data.reviewNotes,
      ...data.evidenceGaps,
    ]
      .filter(Boolean)
      .join("\n\n");
  if ("sparks" in data)
    return data.sparks.map((s, i) => `${i + 1}. ${s.text}`).join("\n\n");
  if ("suppliedEvidence" in data)
    return researchSections(data)
      .map((s) => `${s.title}\n${s.values.join("\n") || "Not supplied."}`)
      .join("\n\n");
  return "";
}
export function researchSections(data: AgentDataMap["research"]) {
  return [
    { title: "CAMPAIGN NAME", values: [data.campaignName] },
    { title: "OBJECTIVES", values: [data.objectives] },
    { title: "AUDIENCE", values: [data.audience] },
    { title: "PRODUCT INFORMATION", values: [data.productInformation] },
    {
      title: "SUPPLIED RESEARCH & SUPPORTING EVIDENCE",
      values: data.suppliedEvidence,
    },
    {
      title: "VERIFIED EVIDENCE",
      values: data.verifiedEvidence.length
        ? data.verifiedEvidence
        : ["None explicitly identified as verified in the IMC brief."],
    },
    {
      title: "ILLUSTRATIVE ASSUMPTIONS",
      values: data.illustrativeAssumptions.length
        ? data.illustrativeAssumptions
        : ["None identified."],
    },
    { title: "AUDIENCE CONTEXT", values: data.audienceContext },
    {
      title: "HISTORICAL / CREATIVE PERFORMANCE",
      values: [...data.historicalPerformance, ...data.creativePerformance],
    },
    { title: "MARKET / CATEGORY CONTEXT", values: data.marketContext },
    {
      title: "RESEARCH TO VALIDATE",
      values: data.researchToValidate.map((r) => `${r.source}: ${r.question}`),
    },
    { title: "EVIDENCE GAPS", values: data.evidenceGaps },
    { title: "SOURCE NOTES", values: data.sourceNotes },
  ];
}
export function renderBrief(
  response: AgentResponse<AgentDataMap["finalBrief"]>,
  payload: BriefPayload,
): GeneratedBrief {
  const d = response.data,
    p = payload.strategyInputPack,
    e = payload.executionDirection;
  const brief: GeneratedBrief = {
    ...response,
    id: crypto.randomUUID(),
    createdAt: response.generatedAt,
    campaign: d.campaign || "Untitled campaign",
    mock: response.provider === "mock",
    sections: [
      { title: "Campaign", content: d.campaign },
      { title: "Objective", content: d.objective },
      { title: "Approved Brief Line", content: d.approvedStrategy },
      { title: "Original upstream RTB", content: d.reasonToBelieve },
      {
        title: "Proposed XC adaptation — not upstream-approved",
        content: p.proposedRTB || "No separate adaptation recorded.",
      },
      ...carryUpstream(p),
      { title: "Audience", content: d.audience },
      {
        title: "Messaging Direction",
        content: [e.messaging, ...d.messagingDirection]
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("\n\n"),
      },
      {
        title: "Supporting Data & Research",
        content: [p.research, ...d.supportingEvidence]
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("\n\n"),
      },
      {
        title: "Creative Direction",
        content: [e.creativeDirection, d.creativeDirection]
          .filter((v, i, a) => v && a.indexOf(v) === i)
          .join("\n\n"),
      },
      { title: "Required Assets", content: d.requiredAssets.join("\n") },
      { title: "Channels", content: d.channels.join("\n") },
      { title: "Web Deliverables", content: e.desktop },
      { title: "Mobile Deliverables", content: e.mobile },
      { title: "Placement", content: e.placements },
      { title: "Copy Requirements", content: e.copy },
      {
        title: "Requirements / Constraints",
        content: [e.formats, ...d.requirements, ...d.constraints]
          .filter(Boolean)
          .join("\n"),
      },
      { title: "Timing", content: e.timing },
      { title: "Disclaimers", content: d.disclaimers.join("\n") },
      { title: "Approval Notes", content: d.approvalNotes.join("\n\n") },
      { title: "Strategic Sparks", content: p.sparks },
      {
        title: "Research Emphasis / Additional Direction",
        content: p.researchFocus || "No additional emphasis supplied.",
      },
    ],
  };
  return withDiscoveryCanvas(brief, payload);
}
