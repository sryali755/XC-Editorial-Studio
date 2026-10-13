import { fieldText } from "../upstream";
import type { UpstreamContext } from "../types";
import type { AgentDataMap } from "./schemas";

const territoryTypes = [
  "human_truth",
  "social_cultural",
  "category_convention",
  "product_truth",
  "moment",
  "wildcard",
] as const;
const territoryLabels = [
  [
    "Individual human tension",
    "Shared social ritual",
    "Category convention break",
    "Supplied product truth",
    "Peak need moment",
    "Unexpected outside analogy",
  ],
  [
    "Unspoken personal ambition",
    "Routine disrupted by absence",
    "Role-reversal learning",
    "Deferred decision question",
    "Observed product use",
    "Audience challenges the premise",
  ],
] as const;

// Deterministic UI fixtures, not a simulation of live creative quality or free-form steering.
const sets = [
  [
    [
      "The overlooked contribution",
      "Explore the person whose small contribution lets someone else begin an activity. Could making that contribution visible open a recognition territory without suggesting the product creates cooperation?",
      "audience",
      "Validate whether recognition is meaningful to the supplied audience.",
    ],
    [
      "Before the beginning",
      "Look at the pause just before an online activity begins. What expectation or preparation could help a creative team make the supplied product's role understandable?",
      "product",
      "Validate the relevance of this preparation moment; do not invent a product capability.",
    ],
    [
      "Permission to differ",
      "Consider people choosing different activities in a shared setting. Could respecting those differences offer a useful direction without presenting the product as a solution to disagreement?",
      "audience",
      "Validate whether the shared setting fits the audience rather than assuming a household.",
    ],
    [
      "The question worth asking",
      "Explore the question an audience member would want answered before considering the offer. Could the campaign begin with that decision instead of an unsupported comparison or specification?",
      "objective",
      "Validate the decision question with the audience before claiming it drives choice.",
    ],
    [
      "An ordinary measure",
      "Consider a modest, observable use of the supplied offer that could explain its role. What could make that use legible without turning a human aspiration into a performance promise?",
      "originalRTB",
      "Any demonstration must stay within supplied proof and its approval status.",
    ],
    [
      "Choose the absence",
      "Imagine asking what should stay outside the product story. Could preserving something people value away from a screen reveal a more respectful way to invite consideration?",
      "constraints",
      "Validate the off-screen priority; this does not imply a product benefit.",
    ],
  ],
  [
    [
      "The private ambition",
      "Explore a small ambition someone has not yet shared. Could the reason to begin an online activity create an invitation to consider the offer without promising success?",
      "objective",
      "Validate the ambition with the intended audience before treating it as an insight.",
    ],
    [
      "A changed routine",
      "Consider a familiar routine on the day one participant is absent. What might their usual role reveal about the surrounding activity, without claiming the product replaces that person?",
      "audience",
      "Validate this routine and role with the supplied audience.",
    ],
    [
      "Learning in reverse",
      "Explore a moment when the expected expert asks someone else for help. Could mutual learning open a direction that respects both people and avoids age or skill stereotypes?",
      "brandGuidelines",
      "Validate the learning situation; no demographic behavior is established here.",
    ],
    [
      "The decision postponed",
      "Consider an offer someone keeps meaning to explore. Could understanding the unanswered question behind that delay provide a useful territory without inventing purchase barriers or urgency?",
      "objective",
      "Validate the actual question rather than declaring a consumer barrier.",
    ],
    [
      "One use, closely observed",
      "Take one permitted use of the product and examine what happens around it. Which human detail could make its existing role clear without adding a new feature or claim?",
      "originalRTB",
      "Check the use against supplied proof; no additional functionality is implied.",
    ],
    [
      "The audience asks back",
      "Imagine the intended audience questioning the campaign's premise. Could giving that reasonable question space uncover a more honest invitation to explore the offer?",
      "constraints",
      "Validate the question and answer only with approved supplied information.",
    ],
  ],
] as const;

export function mockSparks(
  upstream: UpstreamContext,
  previousText = "",
): AgentDataMap["sparks"]["sparks"] {
  const campaign = fieldText(upstream.fields.campaignName);
  const objective = fieldText(upstream.fields.objective);
  const audience = fieldText(upstream.fields.audience);
  const candidates = sets[0].map((fallback, index) => {
    const candidate = sets
      .map((set, setIndex) => ({
        spark: set[index],
        territory: territoryLabels[setIndex][index],
      }))
      .find(({ spark: [, text] }) => !previousText.includes(text));
    return (
      candidate ?? { spark: fallback, territory: territoryLabels[0][index] }
    );
  });
  return candidates.map(
    ({ spark: [title, text, field, validation], territory }, i) => {
      const excerpt =
        upstream.fields[field].sourceValue ||
        upstream.fields.campaignName.sourceValue ||
        fieldText(upstream.fields[field]);
      const idea = `${text} For ${campaign}, connect the opportunity to ${audience} and the supplied objective: ${objective}`;
      return {
        id: `spark-${i + 1}`,
        title,
        text: idea,
        campaignGrounding: `${field}: "${excerpt}"`,
        hypothesisToValidate: validation,
        rationale: `Premise: ${text} Grounding: ${excerpt} Validate: ${validation}`,
        territory_type: territoryTypes[i],
        territory,
        idea,
        excerpt,
        hypothesis: validation,
        excerpt_verified: true,
      };
    },
  );
}
