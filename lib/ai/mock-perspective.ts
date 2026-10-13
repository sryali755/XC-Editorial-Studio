import {
  defaultPersonality,
  personalityInstructions,
  type PerspectiveId,
} from "../creative-controls";
import type { AgentDataMap, AgentRequest } from "./schemas";

// Demonstration fixtures only: not an LLM, quality evaluation, or consumer evidence.
const angles: Record<PerspectiveId, string[]> = {
  humor: [
    "Find a little room for the day that never quite goes to plan.",
    "Give the household's unofficial logistics department a creative day off.",
    "Treat the family calendar like the overbooked celebrity it thinks it is.",
    "Cast the household to-do list as a diva demanding its own dressing room.",
  ],
  culture: [
    "Explore the small rituals that make a household feel like itself.",
    "Show how separate daily routines might become a shared story.",
    "Imagine the group chat and the kitchen table comparing notes on belonging.",
    "Reimagine a household as a tiny culture with its own unofficial constitution.",
  ],
  audience: [
    "Start with the practical task the audience wants to get through.",
    "Give the person organizing the day a place in the story too.",
    "Explore the tension between being needed by everyone and having time for yourself.",
    "Tell the day from the perspective of the wish nobody put on the calendar.",
  ],
  market: [
    "Make the supplied product role clear through a recognizable audience situation.",
    "Explore the audience's everyday task as a fresh frame for the offer.",
    "Shift the creative question from what a product contains to what people make of it.",
    "Imagine a category described by a household's priorities instead of a specification sheet.",
  ],
  brand: [
    "Express the supplied brand principle through one concrete daily moment.",
    "Give the approved brand meaning a role in an ordinary human story.",
    "Use the supplied brand principle to organize a fresh contrast between intention and action.",
    "Recast the supplied brand principle as the unexpected narrator of the creative story.",
  ],
};
export function mockPerspective(
  request: Extract<AgentRequest, { agentType: PerspectiveId }>,
): AgentDataMap["humor"] {
  const settings = request.personality ?? defaultPersonality();
  const band =
    settings.primary <= 3
      ? 0
      : settings.primary <= 6
        ? 1
        : settings.primary <= 8
          ? 2
          : 3;
  const number = request.versionNumber ?? 0;
  const options = angles[request.agentType];
  const offset = settings.secondary > 6 ? 1 : 0;
  const prior = [
    ...(request.priorCandidates ?? []),
    request.previousVersion?.text ?? "",
  ];
  const base = options[(band + number + offset) % options.length];
  const alternate = options.find((line) => !prior.includes(line));
  const line = prior.includes(base) ? (alternate ?? base) : base;
  return {
    briefLines: [
      {
        id: `mock-${request.agentType}-${number}`,
        line,
        rationale: `Mock creative hypothesis for ${request.context.campaignContext.campaignName}. Validate against the supplied objective and RTB; no facts or brand approvals are inferred. ${personalityInstructions(request.agentType, settings)} Steering recorded: ${request.guidance || "None"}. Free-form steering requires live mode for semantic interpretation.`,
      },
    ],
    perspectiveSummary:
      "Deterministic demonstration suggestion, not verified research or a live quality result.",
  };
}
