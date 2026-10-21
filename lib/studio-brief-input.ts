import { knownDiscoveryFindings, inputPackVersion } from "./discovery";
import type { ApprovedStrategy, DiscoveryState } from "./types";
import { assertCampaignName } from "./campaign-identity";

// The fourth stage consumes only a human-confirmed snapshot. Execution fields
// are optional until Kevin defines the final XC Brief requirements.
export function buildStudioBriefInput(
  approved: ApprovedStrategy,
  discovery: DiscoveryState,
) {
  const canvas = approved.discoveryCanvas;
  if (
    approved.approvalState !== "Approved" ||
    !canvas?.briefLine.trim() ||
    canvas.briefLine !== approved.briefLine
  )
    throw new Error(
      "Confirm the current human-authored strategy before generating an XC Brief.",
    );
  const pack = approved.strategyInputPack;
  assertCampaignName(pack);
  if (canvas.inputPackVersion !== inputPackVersion(pack))
    throw new Error(
      "The confirmed Input Pack snapshot does not match this strategy.",
    );
  const known = knownDiscoveryFindings(discovery);
  const findings = canvas.findingReferences.map((id) => {
    const finding = known.get(id);
    if (!finding)
      throw new Error(
        `The selected finding ${id} is unavailable in the confirmed snapshot.`,
      );
    return {
      id,
      agent: finding.lensId,
      version: finding.runVersion,
      researchRunId: finding.researchRunId,
      text: finding.whatWeFound,
      evidence: finding.evidence,
      limitations: finding.whatComplicatesIt,
    };
  });
  return {
    confirmedAt: approved.approvedAt,
    confirmedBy: approved.approvedBy,
    briefLine: canvas.briefLine,
    campaign: pack.campaignName,
    campaignIdentity: pack.campaignIdentity
      ? structuredClone(pack.campaignIdentity)
      : undefined,
    objective: pack.objective,
    audience:
      canvas.workingAudience ?? canvas.wholeBrief?.audience ?? pack.audience,
    sourceBrief: pack.parsedIMC?.sourceText ?? "",
    jtbdProposal: canvas.workingJTBD ?? "",
    proposedRTB: pack.proposedRTB ?? "",
    workingRTB: canvas.workingRTB ?? pack.reasonToBelieve,
    humanTension: canvas.humanTension ?? "",
    originalRTB: pack.reasonToBelieve,
    rtbApprovalStatus: pack.rtbApprovalStatus ?? "unknown",
    supportingProof: pack.selectedResearch ?? [],
    selectedResearchSources: pack.selectedResearchSources ?? [],
    selectedSparks: pack.selectedSparks ?? [],
    selectedAgentFindings: findings,
    strategicDirection: canvas.strategicDirection,
    constraints: pack.constraints,
    execution: {
      channels: pack.channel,
      deliverables: canvas.wholeBrief?.deliverables ?? "",
      mandatories: canvas.wholeBrief?.mandatories ?? "",
      timing: canvas.wholeBrief?.timelines ?? "",
      assets: "",
      pages: "",
      desktopMobile: "",
      messaging: "",
      creativeDirection: "",
      copy: "",
      formats: "",
      creativeHero: "",
      cardsModules: "",
    },
    additionalInstructions: canvas.executionConsiderations ?? "",
  };
}

export type StudioBriefInput = ReturnType<typeof buildStudioBriefInput>;
