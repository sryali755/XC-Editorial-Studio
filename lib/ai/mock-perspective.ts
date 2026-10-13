import {
  currentPersonality,
  defaultPersonality,
  type PerspectiveId,
} from "../creative-controls";
import { intensityBandIndex } from "../roundtable-prompts";
import type { AgentDataMap, AgentRequest } from "./schemas";

// Demonstration fixtures only: not an LLM, quality evaluation, or consumer evidence.
const lines: Record<PerspectiveId, string[][]> = {
  humor: [
    [
      "Notice the straight-faced work of keeping every online plan on speaking terms.",
      "Find the dry truth in the schedule that looked reasonable five minutes ago.",
      "The smallest coordination snag can reveal the biggest shared routine.",
    ],
    [
      "Put the audience’s double-booked online plans in charge of the comedy.",
      "Work, homework, and entertainment all discover they booked the same day.",
      "Treat the shared schedule like it has one more online plan up its sleeve.",
    ],
    [
      "Competing online plans become the world’s smallest, busiest traffic control tower.",
      "The shared schedule has the confidence of a celebrity with no open dates.",
      "Every online activity auditions for the same wildly overbooked day.",
    ],
    [
      "Imagine the schedule holding a press conference about its many conflicting online plans.",
      "Every online activity arrives wearing a badge that says, obviously, I go first.",
      "Stage the day as a tiny parliament where every online plan demands the floor.",
    ],
  ],
  culture: [
    [
      "Start with the simple ritual of checking what everyone else needs online.",
      "A day of shared online activities develops its own quiet social rules.",
      "Notice how one shared day becomes a pattern everyone learns together.",
    ],
    [
      "Work, homework, and entertainment negotiate one shared daily rhythm.",
      "The audience’s online handoffs become a ritual everyone recognizes.",
      "Explore the unspoken rules that keep different online plans moving together.",
    ],
    [
      "Reframe the shared schedule as the audience’s unofficial social operating system.",
      "Online handoffs become the ritual that reveals who a group relies on.",
      "Explore how separate online routines become one shared household language.",
    ],
    [
      "Treat coordination, not connection, as the real social currency of the day.",
      "Recast the shared online schedule as a culture people build in real time.",
      "Ask what belonging looks like when everyone’s online priorities arrive together.",
    ],
  ],
  audience: [
    [
      "A crowded day leaves someone coordinating the next online task.",
      "One practical handoff sits at the center of the audience’s online story.",
      "The audience moves one shared online plan forward at a time.",
    ],
    [
      "Everyone’s work, homework, and entertainment leave one person quietly coordinating.",
      "The person behind the shared schedule rarely gets a moment of recognition.",
      "Each online plan wants a clear place in the day.",
    ],
    [
      "Recognize the person carrying everyone’s online plans without making it their whole story.",
      "Lead with the relief of knowing what needs to happen next online.",
      "The coordinator’s own plan keeps landing last.",
    ],
    [
      "See the person behind the schedule before showing the schedule they carry.",
      "Honor the quiet wish to participate, not just coordinate everyone else.",
      "One person’s need for room becomes the emotional center of the day.",
    ],
  ],
  market: [
    [
      "Judge home internet by the online activities it is asked to connect.",
      "The supplied product role becomes the clearest reason to consider the offer.",
      "Frame the offer around connecting devices to the audience’s real online tasks.",
    ],
    [
      "Judge home internet by how clearly it fits the audience’s competing online priorities.",
      "Shift consideration from technical theater to the product role the brief actually proves.",
      "The audience’s online activities become the lens for evaluating home internet.",
    ],
    [
      "Change the home-internet question from specifications to the plans waiting to happen.",
      "Reframe consideration around what connected devices are there to help people do.",
      "Coordination becomes the proposed measure of relevance, not an unsupported performance claim.",
    ],
    [
      "Invert the category frame: begin with the shared day, then earn the product story.",
      "Treat relevance to real online plans as the category question specifications cannot answer alone.",
      "Challenge the offer to prove its role through the audience’s actual online priorities.",
    ],
  ],
  brand: [
    [
      "The audience’s activities lead, with the supplied product role arriving second.",
      "Use clear, warm language to make one online handoff easy to recognize.",
      "Keep the product grounded in the straightforward role the brief supplies.",
    ],
    [
      "The audience’s real activities lead the story and the product supports it.",
      "The supplied human-first hierarchy becomes a fresh online handoff story.",
      "Clear, inclusive recognition becomes the structure of the campaign idea.",
    ],
    [
      "Build the campaign around the audience first, then reveal the product’s grounded role.",
      "Stretch the human-first hierarchy into a story told through shared online priorities.",
      "Straightforward recognition, not technical boasting, becomes the campaign’s signature move.",
    ],
    [
      "Push the human-first hierarchy as far as the supplied brand guidance allows.",
      "The audience owns the whole opening before the product earns its place.",
      "Restraint becomes the bold brand move: real online priorities, plainly recognized.",
    ],
  ],
};

const tensions: Record<PerspectiveId, string[]> = {
  humor: [
    "A carefully planned day can become overbooked the moment everyone’s online priorities arrive.",
    "Small coordination tasks often carry more ceremony than their importance deserves.",
    "The shared schedule looks authoritative even when every plan competes with it.",
  ],
  culture: [
    "Shared online routines create unspoken rules about whose need comes next.",
    "Separate activities become a social ritual when people coordinate them together.",
    "A group’s sense of belonging can show up in ordinary online handoffs.",
  ],
  audience: [
    "The person coordinating the day also wants room for their own priorities.",
    "A practical online task can carry an unspoken need to feel recognized.",
    "Keeping shared plans moving can make the coordinator disappear from the story.",
  ],
  market: [
    "The category convention is to lead with specifications rather than the activities the product connects.",
    "The category often asks what the product contains instead of what role it plays.",
    "The familiar category story can obscure the audience’s actual basis for consideration.",
  ],
  brand: [
    "The supplied human-first message hierarchy can become a creative structure, not just a tone.",
    "Clear and inclusive language must still produce a fresh campaign choice.",
    "An established brand principle needs a campaign-specific application to feel new.",
  ],
};

function absentNamedProduct(guidance: string, source: string) {
  return (
    guidance.match(/\b(?:Xfinity|Comcast)\s+[A-Z][A-Za-z0-9-]*/g) ?? []
  ).find((name) => !source.toLowerCase().includes(name.toLowerCase()));
}

export function mockPerspective(
  request: Extract<AgentRequest, { agentType: PerspectiveId }>,
): AgentDataMap["humor"] {
  const settings = currentPersonality(
    request.personality ?? defaultPersonality(),
  );
  const band = intensityBandIndex(settings.primary);
  const number = request.versionNumber ?? 0;
  const candidates = lines[request.agentType][band];
  const evidence = [
    request.context.campaignContext.objective,
    request.context.campaignContext.audience,
    request.context.currentRtb.original,
    request.context.selectedSparks[0]?.text,
  ].filter((value): value is string => Boolean(value?.trim()));
  const rotation = number % candidates.length;
  const source = JSON.stringify(request.context);
  const absent = absentNamedProduct(request.guidance ?? "", source);
  const hasResearch = !/^not supplied\.?/i.test(
    request.context.currentResearch.trim(),
  );
  return {
    options: candidates.map((_, index) => {
      const selected = (index + rotation) % candidates.length;
      return {
        brief_line: candidates[selected],
        tension: tensions[request.agentType][selected],
        evidence: [evidence[selected % evidence.length]],
        territory: `For ${request.context.campaignContext.campaignName}, explore this tension through the ${request.agentType} lens without adding product claims.`,
        why_on_strategy: `This direction supports the supplied objective: ${request.context.campaignContext.objective}`,
        assumptions: hasResearch
          ? []
          : [
              "The creative interpretation is illustrative because audience research was not supplied.",
            ],
      };
    }),
    steering_note: absent
      ? `${absent} is not supplied in the XC Input Pack. No features or claims were inferred; Kevin should add approved product information before using it.`
      : request.guidance?.trim()
        ? `Applied the compatible creative intent in Kevin's steering: ${request.guidance.trim()}`
        : "",
    change_note:
      number > 0
        ? `Changed the lead line and tension from previous versions for V${number}.`
        : "",
  };
}
