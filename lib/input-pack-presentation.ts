import { currentPreparation, studioPreparationIssue } from "./preparation";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  studioPack,
  type DiscoveryStudioSession,
} from "./discovery-studio";
import type { PreparationAgentId, StrategyInputPack } from "./types";

// A derived view, not another editable/stored JTBD. The immutable selected
// version remains authoritative; the legacy property name is kept compatible
// with Discovery foundations and all existing persistence/approval snapshots.
export function selectedJtbdFraming(pack: StrategyInputPack) {
  return {
    text: pack.proposedRTB ?? "",
    versionId: pack.selectedPreparationVersions?.reasonToBelieve,
  };
}

// Presentation only: never write back into selected versions or source records.
export function compactPackParagraphs(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();
}

export function dynamicPackPresentation(pack: StrategyInputPack) {
  const objective = compactPackParagraphs(pack.objective);
  const audience = compactPackParagraphs(pack.audience);
  const objectiveParts: { label: string; text: string }[] = [];
  const audienceObjectives = objective.match(
    /^Customer:\s*([\s\S]*?)\s*Prospect:\s*([\s\S]*)$/i,
  );
  if (audienceObjectives) {
    const prospectAndOverall = audienceObjectives[2].match(
      /^([\s\S]*?)\n\s*(?:Overall Objective:\s*|(Target\b))([\s\S]*)$/i,
    );
    objectiveParts.push({
      label: "Customer",
      text: audienceObjectives[1].trim(),
    });
    objectiveParts.push({
      label: "Prospect",
      text: prospectAndOverall
        ? prospectAndOverall[1].trim()
        : audienceObjectives[2].trim(),
    });
    if (prospectAndOverall)
      objectiveParts.push({
        label: "Overall Objective",
        text: `${prospectAndOverall[2] || ""}${prospectAndOverall[3]}`.trim(),
      });
  }
  const rtbs = (pack.reasonToBelieve || "")
    .split(/\n\s*(?:[•·]|[-*](?=\s))\s*/)
    .map((value) => value.replace(/^\s*[•·*-]\s*/, "").trim())
    .filter(Boolean);
  const canonical = (value: string) =>
    value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const research = (pack.selectedResearch ?? []).map((item) => ({
    ...item,
    repeatsObjective: Boolean(
      objective &&
      canonical(item.text) &&
      canonical(objective).includes(canonical(item.text)),
    ),
  }));
  const strategicContext = [
    audience && `Audience situation: ${audience}`,
    objective &&
      `Campaign priority: ${objective
        .replace(/^Customer:\s*/i, "")
        .split(/(?<=[.!?])\s+/)[0]
        .replace(/\s+/g, " ")}`,
    pack.selectedSparks?.length &&
      `Selected creative opportunities: ${pack.selectedSparks.map((spark) => spark.title || spark.text).join("; ")}. These are directions to explore, not validated research.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    objective,
    objectiveParts,
    audience,
    rtbs,
    research,
    strategicContext,
  };
}

export function preparationCardState(
  session: DiscoveryStudioSession,
  id: PreparationAgentId,
  mode: "mock" | "live",
  stale = false,
  busy = false,
) {
  const output = session.preparation.outputs.find(
    (item) => item.agentId === id,
  );
  const current = currentPreparation(session.preparation, id);
  if (stale || (!busy && (!output || output.status === "idle")))
    return { state: "unrun" as const, label: "Awaiting Input Pack Generation" };
  if (busy || output?.status === "pending")
    return { state: "generating" as const, label: "Generating…" };
  const failure =
    session.preparationErrors[id] ||
    output?.error ||
    (output?.status === "failed"
      ? "Preparation failed. Previous versions are preserved; retry this agent."
      : undefined) ||
    (current
      ? studioPreparationIssue(session.preparation, id, mode)
      : undefined);
  if (failure)
    return {
      state: "failed" as const,
      label: "Needs Attention — Retry",
      failure,
    };
  return current
    ? { state: "ready" as const, label: "Results Ready" }
    : { state: "unrun" as const, label: "Awaiting Input Pack Generation" };
}

// Build is the explicit confirmation action. Validate the display-name edit
// atomically before publishing a new pack or starting any preparation handler.
export function buildStudioCampaign(
  current: DiscoveryStudioSession,
  source: string,
  displayName: string,
) {
  const next = applyStudioSource(current, source);
  return displayName.trim() &&
    studioPack(next).campaignName === displayName.trim()
    ? next
    : confirmStudioCampaignName(next, displayName);
}
