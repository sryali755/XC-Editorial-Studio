import type { BriefPayload, GeneratedBrief } from "./types";
import { fieldText } from "./upstream";

// Optional Discovery packaging only. Creative callers receive the exact same
// object and sections when their approval record contains no Discovery canvas.
export function withDiscoveryCanvas(
  brief: GeneratedBrief,
  payload: BriefPayload,
): GeneratedBrief {
  const approved = payload.approvedBriefLine;
  const canvas = approved.discoveryCanvas;
  if (!canvas) return brief;
  if (
    approved.approvalState !== "Approved" ||
    canvas.briefLine !== approved.briefLine
  )
    throw new Error(
      "The Discovery canvas needs explicit human approval before generating the final brief.",
    );
  const human = [
    { title: "Problem — human approved", content: canvas.problem },
    {
      title: "Insight / Opportunity — human synthesis",
      content: canvas.evidenceInsights,
    },
    { title: "Working hypothesis — unvalidated", content: canvas.hypothesis },
    {
      title: "Strategic Direction — human approved",
      content: canvas.strategicDirection,
    },
    { title: "Open questions — human approved", content: canvas.openQuestions },
    {
      title: "Discovery references — exact versions",
      content: canvas.findingReferences.join("\n"),
    },
  ].filter((section) => section.content.trim());
  const pack = approved.strategyInputPack;
  const execution = payload.executionDirection;
  const originalField = (key: "research" | "disclaimers") => {
    const field = pack.upstream?.fields[key];
    return field
      ? field.status === "Supplied"
        ? field.sourceValue || "Not supplied."
        : fieldText(field)
      : "Not supplied.";
  };
  // Packaging may format requirements, but it cannot approve a new model
  // interpretation. These sections use supplied sources, confirmed execution
  // requirements and the explicitly approved human canvas only.
  const contents: Record<string, string> = {
    "Messaging Direction": execution.messaging,
    "Supporting Data & Research": originalField("research"),
    "Requirements / Constraints": [
      execution.formats,
      execution.constraints,
      pack.constraints,
    ]
      .filter(Boolean)
      .join("\n\n"),
    Disclaimers: originalField("disclaimers"),
    "Approval Notes": `Strategy explicitly approved by ${approved.approvedBy} at ${approved.approvedAt}. Source: ${approved.source}.\nUpstream RTB approval: ${pack.rtbApprovalStatus ?? "unknown"}. Human synthesis and hypotheses do not independently verify evidence or approve product claims.`,
  };
  const excluded = new Set([
    "Creative Direction",
    "Proposed XC adaptation — not upstream-approved",
    "Strategic Sparks",
    "Research Emphasis / Additional Direction",
  ]);
  return {
    ...brief,
    sections: [
      ...brief.sections
        .filter((section) => !excluded.has(section.title))
        .map((section) =>
          section.title in contents
            ? { ...section, content: contents[section.title] }
            : section,
        ),
      ...human,
    ],
  };
}
