import { extractJobToBeDone } from "./context";
import { sparkTerritoryTypes, type AgentRequest } from "./schemas";
import type { SourceField } from "../types";

export const SPARKS_PROMPT_VERSION = "sparks-v1.2";

export const sparksPrompt = `You are the Strategic Sparks agent for the Xfinity Creative (XC) team. You read an upstream IMC brief and give Kevin, the XC strategist, six creative idea starters ("Sparks") to react to before the Round Table begins.

WHAT A SPARK IS
A Spark is an early, open creative territory: a sharp angle on the campaign that a strategist could build several brief lines from. It is looser than a brief line and must NOT be a tagline, headline, or finished copy. A good Spark:
- Starts from something specific in this brief: a quoted fact, audience insight, RTB, or restriction.
- Opens a territory rather than closing it. Kevin should be able to imagine three different brief lines from it.
- Is surprising enough to be worth discussing, and grounded enough to be defensible.
- Could not be pasted into another campaign's brief unchanged.

THE SIX TERRITORIES (one Spark per type, so the set is genuinely different)
1. human_truth: a real behavior, habit, or feeling of the target audience.
2. social_cultural: something people do together, such as households, families, friends, or shared rituals.
3. category_convention: something every brand in this category says or does, which this campaign could break.
4. product_truth: the upstream RTB made vivid. Use only the facts in the brief.
5. moment: a specific time or situation where the audience's need peaks.
6. wildcard: an unexpected reframe or analogy from outside the category that still points back to the brief.

HOW YOU WORK (reason internally; return only the JSON)
1. Read the full brief: objective, JTBD, RTB, audience, insights, product, research, brand guidelines, restrictions, and requirements.
2. For each territory, find the strongest supporting excerpt and draft 2–3 candidate Sparks.
3. Keep the best candidate per territory. Reject any that are generic, overlap with another Spark, or rely on facts not in the brief.
4. Check that no two Sparks rest on the same underlying tension. If two do, replace the weaker one.

RULES (these override everything else)
- "excerpt" must be copied word for word from the brief, with no paraphrasing. Keep it under 30 words.
- Never invent product features, claims, statistics, research, trends, or results.
- Never alter the upstream RTB. product_truth may frame it, never extend it.
- Respect every brand guideline, restriction, and exclusion in the brief.
- If the brief is too thin to support a territory honestly, still return a Spark for it, but say so in "hypothesis" and keep the idea modest.
- Write in plain human language. Do not copy brief or marketing jargon into the title or idea, such as "eligible", "consideration", "leverage", "solution", "journey".
- Avoid generic advertising language: seamless, effortless, stay connected, the moments that matter, unlock, elevate, empower, peace of mind.
- If the brief includes its own upstream Sparks or a core creative thought, treat them as input. You may build on at most two of them, and you must add a new angle rather than restate them.
- End each idea on the tension, not a call to action. Do not close with phrases like "invite them to consider", "point to the product as an option", or "worth reviewing".
- Do not repeat compliance caveats (e.g. "without implying savings, coverage, speed…") or "this insight is illustrative" in every Spark. Mention a limit only when it is specific to that Spark.
- The wildcard Spark must genuinely surprise: an angle from outside the category that Kevin would not reach on his own, still grounded in an excerpt.
- Avoid stock metaphors: theater, stage, backstage, stage manager, cast, orchestra, conductor, command center, switchboard, juggling, superhero. Find an analogy specific to this campaign's audience and moment.
- Ground each Spark in evidence: audience, research, RTB, category, or brand sections. The objective alone is not supporting evidence. Never use the brief's proposed XC adaptation, core creative thought, or upstream Sparks as a Spark's excerpt.
- Before returning, name each Spark's core tension in five words or fewer internally. If two Sparks share a core tension, replace the weaker one. On a thin brief, the brief's own consumer tension may anchor at most one Spark.
- A new moment, stakeholder, or metaphor does not make a new tension. For example, "choosing a plan feels complicated" remains the same premise whether it appears as a mental tab, a shopping moment, or an outside-category analogy. Use a different supplied detail and strategic question for the other territories, or name the gap in the hypothesis.
- "territory_type" must always be filled. The Round Table uses it to route each Spark to the matching thinking partner.
- A supplied RTB is not automatically approved. Describe its supplied role without calling it approved unless the brief explicitly records that approval.

OUTPUT
Return valid JSON only, matching this schema:
{
  "sparks": [
    {
      "territory_type": "human_truth | social_cultural | category_convention | product_truth | moment | wildcard",
      "title": "2–5 word evocative name",
      "territory": "short label for the creative territory (3–6 words)",
      "idea": "one or two sentences: the Spark itself, the angle Kevin could build from",
      "excerpt": "exact words from the brief that support it",
      "rationale": "one or two sentences: why this matters for this campaign's objective or JTBD",
      "hypothesis": "one sentence: what must be true about the audience or market for this to work, to validate with research"
    }
  ]
}
"sparks" must contain exactly 6 items, one per territory_type, in the order listed above.`;

export type SparksRequest = Extract<
  AgentRequest,
  { context: { parsedIMC: unknown } }
> & { agentType: "sparks" };
type PromptSpark = {
  id: string;
  territory_type: (typeof sparkTerritoryTypes)[number];
  title: string;
  territory: string;
  idea: string;
  excerpt: string;
  rationale: string;
  hypothesis: string;
};

function sourceValue(field: SourceField) {
  if (field.status === "Supplied")
    return field.sourceValue.trim() || field.value.trim() || "Not provided";
  if (field.status === "Intentionally excluded")
    return "Intentionally excluded";
  return "Not provided";
}

function joinProvided(...values: string[]) {
  const present = values.filter((value) => value && value !== "Not provided");
  return present.length ? present.join("\n") : "Not provided";
}

function storedSparks(request: SparksRequest): PromptSpark[] {
  const data = request.previousVersion?.data as
    { sparks?: Record<string, unknown>[] } | undefined;
  return (data?.sparks ?? []).map((spark, index) => ({
    id: String(spark.id ?? `spark-${index + 1}`),
    territory_type:
      (spark.territory_type as PromptSpark["territory_type"]) ??
      sparkTerritoryTypes[index] ??
      "wildcard",
    title: String(spark.title ?? ""),
    territory: String(spark.territory ?? spark.title ?? ""),
    idea: String(spark.idea ?? spark.text ?? ""),
    excerpt: String(spark.excerpt ?? spark.campaignGrounding ?? ""),
    rationale: String(spark.rationale ?? ""),
    hypothesis: String(spark.hypothesis ?? spark.hypothesisToValidate ?? ""),
  }));
}

function compactSpark(spark: PromptSpark) {
  const output: Partial<PromptSpark> = { ...spark };
  delete output.id;
  return output;
}

function titlesAndIdeas(sparks: PromptSpark[]) {
  return sparks.length
    ? sparks.map((spark) => `- ${spark.title}: ${spark.idea}`).join("\n")
    : "None";
}

function initialMessage(request: SparksRequest) {
  const fields = request.context.upstream.fields;
  const fullBrief = request.context.parsedIMC.sourceText;
  const previous = storedSparks(request);
  const guidance = request.guidance?.trim();
  return `IMC BRIEF
${fullBrief}

EXTRACTED FIELDS (use "Not provided" when empty)
Campaign: ${sourceValue(fields.campaignName)}
Objective: ${sourceValue(fields.objective)}
Job to Be Done: ${extractJobToBeDone(fullBrief) || "Not provided"}
Upstream RTB (fixed): ${sourceValue(fields.originalRTB)}
Target audience: ${sourceValue(fields.audience)}
Audience insights: ${sourceValue(fields.research)}
Product information: ${joinProvided(sourceValue(fields.product), sourceValue(fields.substantiation))}
Supporting research: ${sourceValue(fields.research)}
Brand guidelines: ${joinProvided(sourceValue(fields.brandGuidelines), sourceValue(fields.brandMessaging), sourceValue(fields.messageHierarchy))}
Restrictions / exclusions: ${joinProvided(sourceValue(fields.constraints), sourceValue(fields.eligibility), sourceValue(fields.exclusions), sourceValue(fields.disclaimers))}
Creative requirements: ${joinProvided(sourceValue(fields.channel), sourceValue(fields.kpis), sourceValue(fields.journeyDestinations), sourceValue(fields.milestones))}
${guidance ? `\nKEVIN'S NOTE\n"${guidance}"\nApply this note within the brief's factual and brand rules.\n` : ""}${previous.length ? `\nPREVIOUS SPARKS (create six genuinely different angles; do not merely reword these)\n${titlesAndIdeas(previous)}\n` : ""}
Generate the six Sparks now. Return the JSON.`;
}

function targetedMessage(request: SparksRequest) {
  const fullBrief = request.context.parsedIMC.sourceText;
  const targetId = request.sparkRevision?.targetId;
  const sparks = storedSparks(request);
  const current = sparks.find((spark) => spark.id === targetId);
  if (!current) return initialMessage(request);
  const others = sparks.filter((spark) => spark.id !== targetId);
  const note = request.guidance?.trim() ?? "";
  if (request.sparkRevision?.intent === "improve")
    return `IMC BRIEF
${fullBrief}

SPARK TO IMPROVE (territory_type: ${current.territory_type})
${JSON.stringify(compactSpark(current), null, 2)}

KEVIN'S NOTE (may be empty): "${note}"

THE OTHER FIVE SPARKS (do not overlap with these)
${titlesAndIdeas(others)}

Improve this Spark. Keep the same territory_type and the same core angle, but make it sharper, more specific to this brief, and more useful to build brief lines from. If Kevin left a note, it is your top priority within the rules. You may choose a better excerpt if it is quoted word for word from the brief.

Return JSON with "sparks" containing exactly 1 item.`;

  const rejected = (request.sparkHistory ?? [])
    .flatMap((version) => version.sparks)
    .filter((spark) => spark.id === targetId)
    .map(
      (spark) => `- ${spark.title || "Untitled"}: ${spark.idea || spark.text}`,
    );
  return `IMC BRIEF
${fullBrief}

SPARK BEING REPLACED (territory_type: ${current.territory_type})
${JSON.stringify(compactSpark(current), null, 2)}

PREVIOUSLY REJECTED SPARKS FOR THIS SLOT (do not repeat these angles)
${rejected.length ? rejected.join("\n") : "None beyond the current Spark."}

THE OTHER FIVE SPARKS (do not overlap with these)
${titlesAndIdeas(others)}

KEVIN'S NOTE (may be empty): "${note}"

Write a completely different Spark for the same territory_type, built on a different tension and a different excerpt. Do not reword the old one.

Return JSON with "sparks" containing exactly 1 item.`;
}

export function sparksUserMessage(
  request: SparksRequest,
  attempt = 0,
  retryInstruction = "",
) {
  const base = request.sparkRevision?.targetId
    ? targetedMessage(request)
    : initialMessage(request);
  if (!attempt) return base;
  return `${base}\n\nVALIDATION RETRY\n${retryInstruction || "The prior response was invalid. Return only valid JSON matching the requested schema and item count."}`;
}
