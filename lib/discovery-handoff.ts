import { emptyExecution, prefillExecution } from "./execution";
import { inputPackVersion } from "./discovery";
import { assertCampaignName } from "./campaign-identity";
import type {
  DiscoveryState,
  StrategyInputPack,
  StrategySession,
  DiscoveryApprovedCanvas,
} from "./types";

export function approveDiscoveryCanvas(
  current: StrategySession,
  pack: StrategyInputPack,
  state: DiscoveryState,
  briefLine: string,
  approvedAt = new Date().toISOString(),
): StrategySession {
  if (!briefLine.trim())
    throw new Error("Write the brief line before approving your strategy.");
  assertCampaignName(pack);
  const strategyPack = structuredClone(pack);
  const canvas: DiscoveryApprovedCanvas = {
    ...(state.wholeBrief
      ? { wholeBrief: structuredClone(state.wholeBrief) }
      : {}),
    problem: state.problemStatement ?? "",
    workingAudience: state.workingAudience,
    workingRTB: state.workingRTB,
    humanTension: state.humanTension,
    evidenceInsights: state.evidenceInsights ?? "",
    workingJTBD: state.workingJTBD ?? "",
    executionConsiderations: state.executionConsiderations ?? "",
    hypothesis: state.hypothesis,
    strategicDirection: state.strategicDirection ?? "",
    briefLine: briefLine.trim(),
    openQuestions: state.openQuestions,
    notes: state.notes,
    inputPackVersion: inputPackVersion(strategyPack),
    findingReferences: [...state.savedFindingIds],
  };
  const approved = {
    approvalState: "Approved" as const,
    sourcePerspectives: [],
    briefLine: canvas.briefLine,
    strategyInputPack: strategyPack,
    approvedAt,
    approvedBy: "Kevin" as const,
    source: "Human-authored in Insight Discovery",
    discoveryCanvas: structuredClone(canvas),
  };
  const execution = prefillExecution(
    current.execution ?? emptyExecution,
    strategyPack,
    current.executionSourcePack ?? current.approved?.strategyInputPack,
  );
  return {
    ...current,
    discovery: structuredClone(state),
    approved,
    sharedPack: strategyPack,
    finalLine: canvas.briefLine,
    finalSource: approved.source,
    finalSourceLines: [],
    execution: { ...execution, creativeDirection: canvas.strategicDirection },
    executionSourcePack: strategyPack,
    brief: null,
    step: 2,
  };
}
