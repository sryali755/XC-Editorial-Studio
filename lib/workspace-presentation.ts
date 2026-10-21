import type { DiscoveryState, StrategyInputPack } from "./types";

// Selected category context is persisted by the Input Pack. Missing-source
// placeholders are not category evidence and must not become competitor facts.
export function workspaceCategoryContext(pack: StrategyInputPack) {
  return (pack.selectedResearch ?? [])
    .filter(
      (item) =>
        /category|market|competitor/i.test(item.category) &&
        item.text.trim() &&
        !/\b(?:not supplied|not connected|source needed|no (?:connected|supplied|documented).*(?:retrieved|evidence|research|offers|results))\b/i.test(
          item.text,
        ),
    )
    .map((item) => item.text)
    .join("\n\n");
}

// A nonempty historical seed is not the current new-draft initializer (which
// always seeds an empty human field). Preserve its stored origin and value.
export function isRestoredBriefLineSuggestion(
  state: DiscoveryState,
  value: string,
) {
  const seed = state.workspaceSuggestionContext?.fields.humanBriefLine;
  return Boolean(
    value.trim() &&
    seed?.value === value &&
    seed.kind !== "missing" &&
    /\b(?:spark|imc key message|imc core creative thought)\b/i.test(seed.label),
  );
}

export function workspaceSourceVersion(version?: number) {
  return typeof version === "number" &&
    Number.isInteger(version) &&
    version >= 1
    ? `V${version - 1}`
    : "Version not recorded";
}

export const workspaceHistoryLabels: Record<string, string> = {
  humanBriefLine: "Brief line",
  problemStatement: "Problem",
  evidenceInsights: "Insight",
  workingAudience: "Audience",
  workingJTBD: "Job to be done",
  workingRTB: "Proof / RTB",
  strategicDirection: "Strategic direction",
  openQuestions: "Open questions",
  executionConsiderations: "Notes for Creative",
  notes: "Private notes",
  "wholeBrief.deliverables": "Deliverables",
  "wholeBrief.mandatories": "Mandatories",
  "wholeBrief.timelines": "Timelines",
  humanTension: "Earlier human tension",
  hypothesis: "Earlier working hypothesis",
  "wholeBrief.audience": "Earlier whole-brief audience",
  "wholeBrief.thoughtStarters": "Earlier thought-starters",
  "wholeBrief.context": "Earlier context",
  "wholeBrief.objective": "Earlier objective",
};

const excerpt = (value: string | undefined, limit: number) => {
  const clean = value?.replace(/\s+/g, " ").trim() || "";
  if (/^(?:not supplied|not provided|unknown)\.?$/i.test(clean)) return "";
  return clean.length <= limit
    ? clean
    : `${clean.slice(0, limit).replace(/\s+\S*$/, "")}…`;
};

// Frozen Suggested V0 only. Later findings, current selections and human edits
// never silently become new inputs to this reference panel.
export function workspaceStartingPoint(state: DiscoveryState) {
  const seed = state.workspaceSuggestionContext;
  const fields = seed?.originalFields ?? seed?.fields;
  const candidate = fields?.humanBriefLine;
  const chips: string[] = [];
  const lines: string[] = [];
  const add = (key: string, label: string, limit: number) => {
    const field = fields?.[key];
    const value = excerpt(field?.value, limit);
    if (!value) return;
    lines.push(`${label}: ${value}`);
    if (field?.kind === "selected") {
      const chip =
        key === "workingRTB" ? "Selected XC framing" : "Selected data";
      if (!chips.includes(chip)) chips.push(chip);
    } else if (!chips.includes("Input Pack")) chips.push("Input Pack");
  };
  const firstSentence =
    candidate?.value.match(/^[\s\S]+?[.!?](?:\s|$)/)?.[0] || candidate?.value;
  const idea = excerpt(firstSentence, 220);
  if (idea) {
    lines.push(idea);
    if (candidate?.kind === "selected" && seed?.sparks[0])
      chips.push(seed.sparks[0].split(" · ").slice(2).join(" · "));
    else chips.push("Input Pack");
  }
  add("workingAudience", "Audience", 130);
  add("problemStatement", "Objective", 180);
  add("workingRTB", "Supplied proof / selected framing", 180);
  add("evidenceInsights", "Insight to examine", 160);
  return {
    lines,
    chips: [...new Set(chips.filter(Boolean))],
    candidate: candidate?.value || "",
    candidateLabel: candidate?.label || "",
    packVersion: seed?.packVersion,
  };
}
