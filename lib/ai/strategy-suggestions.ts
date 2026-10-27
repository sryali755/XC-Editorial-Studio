import { extractStudioIMCRecords } from "../studio-imc-records";
import type { DiscoveryState, StrategyInputPack } from "../types";
import { knownDiscoveryFindings } from "../discovery";
import type { AgentDataMap, AgentRequest } from "./schemas";

export type SuggestionRequest = Extract<
  AgentRequest,
  { agentType: "strategySuggestions" }
>;
export type SuggestionContext = SuggestionRequest["context"];
export type SuggestionOption =
  AgentDataMap["strategySuggestions"]["suggestions"][number];

export function strategySuggestionContext(
  pack: StrategyInputPack,
  discovery: DiscoveryState,
): SuggestionContext {
  const sourceBrief = pack.parsedIMC?.sourceText ?? "";
  const records = (
    pack.imcRecords?.length
      ? pack.imcRecords
      : extractStudioIMCRecords(sourceBrief)
  )
    .filter((record) => sourceBrief.includes(record.excerpt))
    .slice(0, 25)
    .map((record) => ({
      id: record.id,
      label: record.label,
      excerpt: record.excerpt.slice(0, 500),
    }));
  if (!records.length && sourceBrief.trim()) {
    const match = sourceBrief.match(/\S[\s\S]{0,799}/);
    if (match)
      records.push({ id: "imc:source", label: "IMC brief", excerpt: match[0] });
  }
  const known = knownDiscoveryFindings(discovery);
  return {
    sourceBrief,
    campaignName: pack.campaignName,
    objective: pack.objective,
    audience: pack.audience,
    originalRtb: pack.reasonToBelieve,
    rtbApprovalStatus: pack.rtbApprovalStatus ?? "unknown",
    sourceExcerpts: records,
    sparkInputs: (pack.selectedSparks ?? []).slice(0, 6).map((spark) => ({
      id: spark.id,
      title: (spark.title || spark.territory || spark.text).slice(0, 12000),
      idea: (spark.idea || spark.text).slice(0, 12000),
      excerpt: (spark.excerpt || "").slice(0, 12000),
    })),
    selectedResearch: (pack.selectedResearch ?? [])
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        text: item.text.slice(0, 12000),
        source: item.source.slice(0, 12000),
      })),
    savedFindings: discovery.savedFindingIds
      .flatMap((id) => {
        const finding = known.get(id);
        return finding
          ? [
              {
                id,
                title: (finding.title.trim() || "Saved finding").slice(
                  0,
                  12000,
                ),
                whatWeFound: (
                  finding.whatWeFound.trim() || "No conclusion recorded."
                ).slice(0, 12000),
                whyItMayMatter: (
                  finding.whyItMayMatter.trim() ||
                  "Not specified in the saved finding."
                ).slice(0, 12000),
                whatComplicatesIt: (
                  finding.whatComplicatesIt.trim() ||
                  "Not specified in the saved finding."
                ).slice(0, 12000),
                questionToExplore: (
                  finding.questionToExplore.trim() ||
                  "What would validate this finding?"
                ).slice(0, 12000),
                evidenceState: finding.evidenceState,
              },
            ]
          : [];
      })
      .slice(0, 12),
    currentDraft: {
      briefLine: discovery.humanBriefLine ?? "",
      problem: discovery.problemStatement ?? "",
      insight: discovery.evidenceInsights ?? "",
    },
  };
}

// A chosen line changes the draft, not the context that generated the choices.
export function strategySuggestionFingerprint(context: SuggestionContext) {
  const working = {
    problem: context.currentDraft.problem,
    insight: context.currentDraft.insight,
  };
  const text = JSON.stringify({ ...context, currentDraft: working });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `suggest-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function strategySuggestionIssue(
  context: SuggestionContext,
  data: AgentDataMap["strategySuggestions"],
) {
  const sources = new Map(
    context.sourceExcerpts.map((item) => [item.id, item]),
  );
  const sparks = new Set(context.sparkInputs.map((item) => item.id));
  const findings = new Set(context.savedFindings.map((item) => item.id));
  const lines = new Set<string>();
  for (const option of data.suggestions) {
    const unsupportedComparison =
      /\b(?:(?:every|all|any) other (?:[\w-]+\s+){0,3}(?:router|network|provider|brand|product|competitor)s?|fastest|best-in-class|unmatched|unrivalled|unrivaled|outperform\w*|outclass\w*|(?:faster|better|more reliable) than)\b/i;
    if (
      unsupportedComparison.test(option.briefLine) &&
      !context.sourceBrief.includes(option.briefLine)
    )
      return "A suggested line introduces an unsupported competitive superiority claim. Remove the comparison and ground the direction in the supplied capabilities.";
    const line = option.briefLine.trim().toLowerCase().replace(/\s+/g, " ");
    if (lines.has(line))
      return "The suggested brief lines repeat the same direction.";
    lines.add(line);
    if (!option.evidenceIds.some((id) => sources.has(id)))
      return "A suggested line has no valid IMC brief support.";
    for (const id of option.evidenceIds) {
      const source = sources.get(id);
      if (!source || !context.sourceBrief.includes(source.excerpt))
        return `A suggested line cites an unsupported IMC excerpt (${id}).`;
    }
    if (option.sparkIds.some((id) => !sparks.has(id)))
      return "A suggested line cites a Spark that was not selected.";
    const findingLinks = option.findingLinks ?? [];
    if (findings.size && !findingLinks.length)
      return "A suggested line does not explain how a saved Discovery finding shaped it.";
    const linked = new Set<string>();
    for (const link of findingLinks) {
      if (!findings.has(link.findingId))
        return "A suggested line cites a Discovery finding that was not saved.";
      if (linked.has(link.findingId))
        return "A suggested line repeats the same Discovery finding link.";
      linked.add(link.findingId);
    }
  }
  return "";
}
