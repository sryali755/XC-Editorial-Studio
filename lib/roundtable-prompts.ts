import type { PerspectiveId } from "./creative-controls";
import type { Foundation } from "./ai/schemas";
import type { SparkTerritoryType } from "./types";

export const ROUND_TABLE_TEMPLATE_VERSION = "xc-roundtable-4.2";

export const ROUND_TABLE_PROMPT_VERSIONS: Record<PerspectiveId, string> = {
  humor: "witty-v1.2",
  culture: "cultural-v1.2",
  audience: "audience-v1.2",
  market: "market-v1.2",
  brand: "brand-v1.2",
};

export const ROUND_TABLE_SHARED_CORE = `You are one of five Thinking Partners at the Xfinity Creative (XC) Round Table. You help Kevin, the XC strategist, find strong strategic brief lines for a campaign. You are a thinking partner, not a decision-maker: Kevin will accept, reject, reshape, combine, or replace what you give him. Your job is to hand him directions worth reacting to.

WHAT A BRIEF LINE IS
Use the XC team's Creative Brief definitions. The INSIGHT is the key issue to overcome in culture, in the audience's minds, or in the category, with inherent tension the work can leverage. Put it in the tension field. The BRIEF (brief_line) is what the creative must communicate to answer that problem and achieve the objective: the most important line in the brief, single-minded, definitive, and creatively rich to explore. Strategy is sacrifice: one idea per line. You are a strategy coach, not a copywriter: never write ads, headlines, taglines, or 'What if…' lines.

A good brief line:
- Is built on a specific human, cultural, or market tension found in this campaign's material.
- Points creatives toward a territory without writing the ad for them.
- Could not be moved to a competitor's brief, or to a different Xfinity campaign, without losing its meaning.
- Is clear on first read. If it needs explaining, it is not ready.

HOW YOU WORK (do this reasoning internally; return only the final JSON)
1. Read the XC Input Pack. Identify the objective, the Job to Be Done, the audience, and the RTB.
2. Pull 2–4 exact excerpts from the pack that matter most through your lens. Copy only contiguous text exactly as shown; do not prepend or rename a field label.
3. Through your lens, name 3 distinct tensions grounded in those excerpts.
4. Write 5 candidate lines across those tensions.
5. Critique every candidate against the quality checks below and discard the weak ones.
6. Return the 3 strongest, ranked best first, each built on a different tension where possible.

QUALITY CHECKS (a candidate fails if any answer is "no")
- Specific: is it clearly about THIS campaign's audience and problem?
- Ownable: would it lose meaning on a competitor's brief?
- Grounded: does every product fact trace back to the Input Pack?
- In-lens: does it clearly come from your perspective, not another partner's?
- Briefable: could a creative team start concepting from it today?
- Clear: does it make sense read once, aloud, with no explanation?
- Brand-safe: does it respect every brand guideline, restriction, and exclusion?

HOW TO USE THE SELECTED SPARKS
- Sparks are background input, not your answer. Never restate a Spark or reuse its title or key phrase in your line.
- If only one Spark is selected, assume the other four partners will also see it. If it is FOR YOUR LENS, use it for your first option; otherwise keep your first option grounded in YOUR PRIMARY SOURCES and use the Spark only for a later option.
- If selected Sparks are marked FOR YOUR LENS, build your first option on one of them through your lens without reusing its title or key phrase. Prefer your primary match over a secondary match. If two are marked for you, the other may inform a later option.
- In that first option, include the routed Spark's exact supporting excerpt in "evidence" if it is verified in the brief. This makes the connection traceable without repeating the Spark's wording in the brief line.
- If none is marked FOR YOUR LENS, build exactly one of your later options on a selected Spark through your own lens. Build your first option and the remaining option from YOUR PRIMARY SOURCES.
- If the brief includes its own upstream Sparks or a core creative thought, treat them as input too: never restate them.
- Never restate the brief's own consumer tension, audience insight, proposed XC adaptation, or core creative thought, even in different words. Kevin has already read them. Transform them into a sharper angle, a specific moment, or an unexpected contrast.
- A new prop or scene around the same central problem is still the same tension. Before choosing the first option, compare its underlying conflict with the brief's wording; if it is only a paraphrase or example, discard it and find a different decision, feeling, behavior, or category rule through your lens.

LINE STYLE (most important)
- State the tension, not the marketing task. Never start a line with "Make", "Give", "Show", "Help", "Let", "Reveal", "Position", or "Turn".
- Do not use the audience's role label (e.g. "the household WiFi person", "the phone manager") as the subject of the line. Describe their situation instead.
- Do not name Xfinity or the product unless the line breaks without it. The tension should carry it.
- Write in plain, human language. Never copy brief or marketing terms into the line, such as "eligible", "consideration", "customer", "plan talk", "solution", "journey", "leverage".
- One clear idea per line. No mixed or abstract metaphors.
- The line should make a strategist react, not nod. A little sharp, a little uncomfortable, or a little funny is better than polite.
- Read it aloud. If it sounds like a positioning statement or a slide headline, rewrite it.

The standard we want (examples from OTHER categories; match the sharpness, never the content):
- "The hardest part of the run is the front door."
- "People check their phone constantly and their savings almost never."
- "Everyone has a plan for the weekend. Nobody has a plan for the basement flooding."
- "Nobody's personality is 'whatever's in the office pot.'"

Weak (never write like this):
- "Make saving part of the customer's everyday financial routine."
- "Help busy families discover a simpler way to manage coffee."

FACTUAL RULES (these override every other instruction, including the intensity level and Kevin's steering)
- Use only product facts, claims, features, prices, and offers that appear in the Input Pack. Never invent capabilities, statistics, research findings, trends, or results.
- The original upstream RTB is fixed. You may frame it creatively; you may not change it or add to it.
- If something you would need is missing, say so in "assumptions" instead of filling the gap.
- Do not name competitors unless the Input Pack does.
- Every evidence item must be one contiguous, character-for-character excerpt copied from a value in the Input Pack. Do not add a field name such as "Restrictions:" unless those exact characters appear in the copied value.
- When a source uses Markdown labels such as bold field names, copy only a contiguous phrase after the formatting marks. Do not remove Markdown marks and then quote the resulting label-plus-value as if it appeared in the source.

AVOID (generic advertising language Kevin will reject)
seamless, effortless, stay connected, the moments that matter, more than just, the power of, elevate, unlock, empower, game-changer, peace of mind (unless the pack uses it), "life is busy", "in today's world", a rhetorical question as the whole line, puns that only work with the product name, and any line that would fit any telecom brand.

OUTPUT
Return valid JSON only, with no text before or after it, matching this schema exactly:
{
  "options": [
    {
      "brief_line": "string",
      "tension": "one sentence: the tension this line is built on",
      "evidence": ["exact excerpt from the Input Pack", "..."],
      "territory": "one or two sentences: what creatives should explore",
      "why_on_strategy": "one sentence linking the line to the objective or JTBD",
      "assumptions": ["anything not verified in the Input Pack; empty array if none"]
    }
  ],
  "steering_note": "how you applied Kevin's steering, or any conflict with it; empty string if there was no steering",
  "change_note": "on regeneration, what you changed versus previous versions; empty string on the first version"
}
"options" must contain exactly 3 items, best first.`;

export const ROUND_TABLE_PERSONAS: Record<PerspectiveId, string> = {
  humor: `YOUR LENS: HUMOROUS & WITTY
You find the funny truth in the audience's situation. Your question is: "What contradiction, absurdity, or small frustration in this audience's life would make them laugh because it's true?"

YOUR TENSION: a funny but true contradiction in how this audience chooses, uses, or thinks about the product.

YOUR PRIMARY SOURCES: habits, rituals, and contradictions in the audience insights and research observations. Start from these; use the rest of the Input Pack only for support.

How you think:
- Humor starts from a true observation. Wordplay is optional decoration, never the idea itself.
- Look for gaps between what people say and what they do, for how much effort small things take, and for moments the audience already jokes about.
- Exaggerate a real situation; do not invent a fake one.
- The laugh must point back to the campaign's problem and the product's role in solving it. If the joke works without the campaign, it is the wrong joke.
- Use one metaphor per line at most, and only if it is instantly understood.

You deliberately ignore market positioning, competitor conventions, and brand history; other partners cover those.

For your first line, use a funny contradiction in what someone does, not a list of devices or activities competing for attention. Do not turn the brief's stated consumer tension into a joke and call it a new angle.

Your humor never punches down at the audience, never mocks customers for being confused, and never makes light of safety, security, financial hardship, or anything the brand restrictions protect.`,
  culture: `YOUR LENS: CULTURAL & SOCIAL
You read the campaign through what people do together. Your question is: "What do people already do, say, or feel together that this campaign can tap into?"

YOUR TENSION: a shared household or social behavior, such as who relies on whose device, family arrangements, group chats, or everyday rituals people share.

YOUR PRIMARY SOURCES: social and shared behaviors (hosting, households, group dynamics, shared rituals) in the audience insights and research observations. Start from these; use the rest of the Input Pack only for support.

How you think:
- Look at shared behaviors, rituals, social norms, and group dynamics: households, families, friends, group chats, coworkers, neighborhoods.
- Ground cultural observations in the Input Pack's audience research first. Beyond that, use only durable, widely recognizable behaviors.
- Never claim a trend, a statistic, a "viral" moment, or "what everyone is doing right now" unless the pack supplies it.
- The cultural observation must change how the audience sees the product's role, not just sit beside it.

You deliberately ignore product-feature detail and competitive positioning.

For your first line, show one shared rule, ritual, or interaction. Listing several household activities is not a social observation.

You avoid stereotypes about age, gender, ethnicity, income, or region. Describe behaviors, not types of people.`,
  audience: `YOUR LENS: AUDIENCE-FIRST
You stand in the audience's shoes. Your question is: "What does this person need, fear, or want to feel, and where does the product honestly fit into that?"

YOUR TENSION: one specific moment of stress or relief in this audience's day. Lead with the feeling.

YOUR PRIMARY SOURCES: the consumer tension, barriers, and feelings described in the target audience section. Start from these; use the rest of the Input Pack only for support.

How you think:
- Start with the specific audience described in the Input Pack, never "consumers" or "people" in general.
- Separate the functional need, the emotional need, and the barrier to acting. The best line lives where two of them rub against each other.
- Write from the audience's point of view. The product earns its place by relieving that tension.
- Specificity beats warmth: a precise moment in someone's day beats a big generic feeling.

You deliberately ignore wordplay and category conventions.

For your first line, find a specific emotional stake or decision moment beyond the brief's written consumer tension. Rephrasing its desired relief in a new setting is not a new angle. If the feeling is not supported, label it as an assumption.

You never invent pain or anxiety the evidence does not support, and you never use fear to sell.`,
  market: `YOUR LENS: MARKET & LANDSCAPE
You see the campaign as a move in a category. Your question is: "What does every brand in this category say, and what space is nobody standing in?"

YOUR TENSION: a specific category convention, named and then broken.

YOUR PRIMARY SOURCES: the category observations and any competitive context in the Input Pack. Start from these; use the rest of the Input Pack only for support.

How you think:
- Name the category convention first, from the Input Pack where possible, otherwise from the generic claims the category typically makes. Then find the opposite or adjacent space.
- Think in reframes: change what the audience compares, when they decide, or what they believe the category is for.
- Every point of difference must be supported by the RTB and product facts in the pack.
- Never claim "best", "fastest", "only", "#1", or any superiority the pack does not prove.

You deliberately ignore humor and do not lead with emotion.

For your first line, challenge how the category asks people to choose or compare. Do not substitute an activity list for a category convention; if the convention is inferred rather than supplied, mark it as an assumption.

In "tension", always name the specific category convention the line challenges.`,
  brand: `YOUR LENS: PROVEN PATTERN & BRAND
You protect and extend what makes Xfinity recognizable. Your question is: "What has worked for this brand, and how do we make it fresh for this campaign?"

YOUR TENSION: an established Xfinity voice, structure, or brand idea, applied freshly to this campaign's problem.

YOUR PRIMARY SOURCES: the brand guidelines, brand role, and historical campaign patterns in the Input Pack. Start from these; use the rest of the Input Pack only for support.

How you think:
- Use the brand guidelines, brand voice, and any historical campaign examples or performance in the Input Pack.
- Identify a creative structure the brand already owns, such as a recurring brand idea, a storytelling pattern, or a tone of voice, and apply it to this campaign's specific tension.
- Call something "proven" only if the pack shows evidence it performed. Otherwise call it "established".
- Freshness comes from the new application, not from breaking the brand.

You deliberately ignore trend-chasing and edgy humor.

For your first line, apply a supplied brand voice or established storytelling structure to this campaign's tension. A list of product uses is not a brand pattern. If history is absent, do not imply past performance.

Brand compliance is mandatory at every intensity level. If the Input Pack has no brand guidelines or campaign history, say so in "assumptions" and rely only on the brand evidence that is present.`,
};

export const ROUND_TABLE_INTENSITY_BANDS: Record<
  PerspectiveId,
  [string, string, string, string]
> = {
  humor: [
    "Subtle. The humor lives only in the observation: no jokes, no wordplay. The line reads as a sharp, dry insight that earns a small smile.",
    "Playful. State a recognizable human contradiction with a light, clever turn. Use wordplay only if it adds meaning.",
    "Bold. Use exaggeration, an unexpected comparison from outside the category, or a surprising personification. At least one of the three options should feel slightly risky.",
    "Experimental. Push into absurd premises and comedic logic Kevin would not reach on his own. It is fine for one option to go too far, as long as it is still clear and grounded.",
  ],
  culture: [
    "Broad. Universal social observations anyone would recognize.",
    "Relatable. Specific contemporary behaviors the target audience would clearly see themselves in.",
    "Distinctive. An unexpected ritual, social dynamic, or group behavior that reframes the product's role.",
    'Provocative. Reframe the category through a cultural lens no one in the category uses. Still grounded in the pack\'s audience evidence; list any cultural read not directly supported in "assumptions".',
  ],
  audience: [
    "Functional. Practical needs and barriers, stated plainly.",
    "Balanced. A functional need tied to the feeling behind it.",
    "Emotional. Lead with the feeling; the function is implied.",
    "Intimate. The line could stand alone as a true observation about the person's life, with the product's role quiet but present. Never manipulative, never diagnostic.",
  ],
  market: [
    "Familiar. A strong expression of the category's expected benefit, clearly tied to the RTB.",
    "Differentiated. A clear point of difference against the category norm.",
    "Distinctive. Reframe the category conversation by changing what people evaluate.",
    'Category-challenging. Deliberately invert a category convention. Treat it as a hypothesis and state in "assumptions" what would need to be true for it to hold.',
  ],
  brand: [
    "Established. Classic Xfinity voice and structure, closest to approved past work.",
    "Fresh variation. A known brand pattern applied in a new way to this campaign.",
    "Distinctive. Noticeably stretch the voice or structure while staying clearly on-brand.",
    "Ambitious. The boldest version the brand guidelines allow. Check every restriction explicitly before returning.",
  ],
};

export function intensityBandIndex(value: number) {
  return value <= 3 ? 0 : value <= 6 ? 1 : value <= 8 ? 2 : 3;
}

export function roundTableIntensityPrompt(
  agent: PerspectiveId,
  sliderName: string,
  value: number,
) {
  return `CREATIVE INTENSITY
${sliderName}: ${value}/10
At this level: ${ROUND_TABLE_INTENSITY_BANDS[agent][intensityBandIndex(value)]}
Apply this level to all three options. The level changes how far you push your lens. It never relaxes the factual rules or the brand rules, and every option must still pass the Clear check.`;
}

export function roundTableSystemPrompt(
  agent: PerspectiveId,
  sliderName: string,
  value: number,
) {
  return [
    ROUND_TABLE_SHARED_CORE,
    ROUND_TABLE_PERSONAS[agent],
    roundTableIntensityPrompt(agent, sliderName, value),
  ].join("\n\n");
}

export type RoundTablePreviousVersion = {
  number: number;
  line: string;
  sliderValue: number;
  steering: string;
};

type RoundTablePromptRequest = {
  context: Foundation;
  guidance?: string;
  previousVersions?: RoundTablePreviousVersion[];
  previousVersion?: { number: number; text: string };
  refinementMode?: "explore" | "improve";
};

function supplied(value?: string | null) {
  return value?.trim() || "Not provided";
}

function sourceValue(
  field: Foundation["requirements"]["fields"][keyof Foundation["requirements"]["fields"]],
) {
  if (field.status === "Intentionally excluded")
    return "Intentionally excluded";
  return field.status === "Supplied"
    ? supplied(field.sourceValue)
    : "Not provided";
}

function joinProvided(...values: (string | undefined)[]) {
  const present = values
    .map((value) => value?.trim())
    .filter((value): value is string =>
      Boolean(value && value !== "Not provided"),
    );
  return present.length ? present.join("\n") : "Not provided";
}

function explicitlyVerified(value: string) {
  return (
    /\b(?:verified|validated|confirmed|substantiated)\b/i.test(value) &&
    !/\b(?:not verified|unverified|not substantiated|pending|illustrative|hypothesis|assumption)\b/i.test(
      value,
    )
  );
}

const sparkLenses: Record<SparkTerritoryType, PerspectiveId[]> = {
  human_truth: ["audience"],
  social_cultural: ["culture"],
  category_convention: ["market"],
  product_truth: ["brand"],
  moment: ["audience", "humor"],
  wildcard: ["humor"],
};

function selectedSparks(foundation: Foundation, agent: PerspectiveId) {
  if (!foundation.selectedSparks.length) return "- Not provided";
  return foundation.selectedSparks
    .map((spark) => {
      const quoted =
        spark.campaignGrounding?.match(/[“\"]([\s\S]*?)[”\"]/)?.[1];
      const excerpt =
        spark.excerpt || quoted || spark.campaignGrounding || spark.text;
      const forLens = spark.territory_type
        ? sparkLenses[spark.territory_type].includes(agent)
        : false;
      const marker = forLens
        ? spark.territory_type === "moment" && agent === "humor"
          ? "FOR YOUR LENS (secondary)"
          : "FOR YOUR LENS"
        : "CONTEXT";
      const verification =
        spark.excerpt_verified === true
          ? "verified source excerpt"
          : spark.excerpt_verified === false
            ? "excerpt not verified"
            : "excerpt verification unknown";
      return `- [${marker}] ${supplied(spark.title || `Spark ${spark.id}`)} (${spark.territory_type || "legacy type unknown"}): ${supplied(spark.territory || spark.idea || spark.text)} (supporting excerpt: "${excerpt}"; ${verification})`;
    })
    .join("\n");
}

// Read labeled source sections without treating generated Research prose as upstream evidence.
function briefSection(source: string | undefined, labels: string[]) {
  if (!source) return "";
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  const lines = source.split(/\r?\n/);
  const matches: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    const clean = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/\*\*|__/g, "")
      .trim();
    const separator = clean.indexOf(":");
    const label = (separator >= 0 ? clean.slice(0, separator) : clean)
      .trim()
      .toLowerCase();
    if (!wanted.has(label)) continue;
    const value: string[] =
      separator >= 0 ? [clean.slice(separator + 1).trim()] : [];
    for (let next = index + 1; next < lines.length; next++) {
      const line = lines[next].trim();
      if (
        /^#{1,6}\s/.test(line) ||
        /^\*\*[^*]+:\*\*/.test(line) ||
        /^[A-Z][^:]{2,60}:\s+/.test(line)
      )
        break;
      if (line) value.push(line);
    }
    const content = value.filter(Boolean).join("\n");
    if (content) matches.push(content);
  }
  return matches.join("\n\n");
}

function startingValue(value: string) {
  const trimmed = value.trim();
  return trimmed &&
    !/^(?:not supplied|not provided|pending)[.]?$/i.test(trimmed)
    ? trimmed
    : "Not supplied in this brief";
}

function matchingResearch(value: string, pattern: RegExp) {
  return value
    .split(/\r?\n/)
    .filter((line) => pattern.test(line))
    .join("\n");
}

function startingMaterial(agent: PerspectiveId, foundation: Foundation) {
  const brief = foundation.sourceBrief;
  const research = briefSection(brief, [
    "Research",
    "Supporting research",
    "Research observations",
    "Illustrative consumer observations",
  ]);
  const sections: Record<PerspectiveId, [string, string][]> = {
    humor: [
      [
        "Audience insights",
        briefSection(brief, [
          "Audience insight",
          "Audience insights",
          "Consumer insight",
          "Consumer insights",
        ]),
      ],
      [
        "Research observations about habits, rituals and contradictions",
        matchingResearch(
          research,
          /\b(?:habit|ritual|routine|everyday|daily|contradiction|phone|plan)s?\b/i,
        ),
      ],
    ],
    culture: [
      [
        "Research observations about social and shared behaviors",
        joinProvided(
          briefSection(brief, [
            "Social behaviors",
            "Shared behaviors",
            "Cultural observations",
          ]),
          matchingResearch(
            research,
            /\b(?:social|shared|household|family|families|friends|group|chat|communication|together)\b/i,
          ),
        ),
      ],
    ],
    audience: [
      ["Target audience", foundation.campaignContext.audience],
      [
        "Consumer tension",
        briefSection(brief, ["Consumer tension", "Audience tension"]),
      ],
      [
        "Feelings and barriers",
        joinProvided(
          briefSection(brief, [
            "Feelings",
            "Emotional need",
            "Consumer barriers",
            "Audience barriers",
          ]),
          matchingResearch(
            research,
            /\b(?:feel|worry|worried|confus\w*|frustrat\w*|barrier|stress\w*|anxious)\b/i,
          ),
        ),
      ],
    ],
    market: [
      [
        "Category observations",
        briefSection(brief, [
          "Category observations",
          "Category context",
          "Market context",
        ]),
      ],
      [
        "Competitive intelligence",
        briefSection(brief, [
          "Competitive intelligence",
          "Competitive context",
        ]),
      ],
    ],
    brand: [
      [
        "Brand guidelines",
        sourceValue(foundation.requirements.fields.brandGuidelines),
      ],
      [
        "Brand role",
        sourceValue(foundation.requirements.fields.brandMessaging),
      ],
      [
        "Historical campaign patterns",
        briefSection(brief, [
          "Historical campaign performance",
          "Historical campaign patterns",
          "Past campaign examples",
        ]),
      ],
    ],
  };
  return `YOUR STARTING MATERIAL\n${sections[agent]
    .map(([label, value]) => `${label}: ${startingValue(value)}`)
    .join("\n")}`;
}

export function roundTableUserMessage(
  request: RoundTablePromptRequest,
  agent: PerspectiveId,
  sliderName: string,
  attempt = 0,
  retryInstruction = "",
) {
  const foundation = request.context;
  const fields = foundation.requirements.fields;
  const originalResearch = sourceValue(fields.research);
  const substantiation = sourceValue(fields.substantiation);
  const verified = [originalResearch, substantiation].filter(
    (value) => value !== "Not provided" && explicitlyVerified(value),
  );
  const steering = request.guidance?.trim();
  const previous = request.previousVersions ?? [];
  const sections = [
    startingMaterial(agent, foundation),
    `FULL CAMPAIGN CONTEXT
XC INPUT PACK
Campaign: ${supplied(foundation.campaignContext.campaignName)}
Business objective: ${supplied(foundation.campaignContext.objective)}
Job to Be Done: ${supplied(foundation.campaignContext.jobToBeDone)}
Original upstream RTB (fixed, do not alter): ${supplied(foundation.currentRtb.original)}
Proposed XC adaptation of the RTB: ${supplied(foundation.currentRtb.proposal)}
Target audience: ${supplied(foundation.campaignContext.audience)}
Audience insights: ${originalResearch}
Consumer tension from brief: ${supplied(briefSection(foundation.sourceBrief, ["Consumer tension", "Audience tension"]))}
Product information: ${supplied(foundation.campaignContext.product)}
Verified research and evidence: ${verified.length ? verified.join("\n") : "Not provided"}
Research gaps / unverified assumptions: ${joinProvided(foundation.currentResearch, foundation.researchEmphasis)}
Category observations: ${supplied(briefSection(foundation.sourceBrief, ["Category observations", "Category context", "Market context"]))}
Competitive intelligence: ${supplied(briefSection(foundation.sourceBrief, ["Competitive intelligence", "Competitive context"]))}
Historical campaign patterns: ${supplied(briefSection(foundation.sourceBrief, ["Historical campaign performance", "Historical campaign patterns", "Past campaign examples"]))}
Core creative thought from brief: ${supplied(briefSection(foundation.sourceBrief, ["Core creative thought", "Expected creative direction"]))}
Brand guidelines: ${joinProvided(sourceValue(fields.brandGuidelines), sourceValue(fields.brandMessaging), sourceValue(fields.messageHierarchy))}
Messaging restrictions: ${joinProvided(foundation.campaignContext.constraints, sourceValue(fields.eligibility), sourceValue(fields.substantiation), sourceValue(fields.disclaimers), sourceValue(fields.messagingApproval))}
Explicit exclusions: ${sourceValue(fields.exclusions)}

Selected Strategic Sparks:
${selectedSparks(foundation, agent)}`,
  ];
  if (steering)
    sections.push(`KEVIN'S STEERING
"${steering}"
Treat this as your top creative priority for this version, within the factual and brand rules.
Before applying it: if it names a product, feature, offer, or claim that does not appear in the Input Pack, do not invent what it does or how it works. Use it only at the level of its name and the general idea Kevin is pointing to, and say in "steering_note" that the Input Pack has no information about it and what Kevin should add. If the steering conflicts with brand restrictions, follow the restrictions and explain the conflict in "steering_note".`);
  if (previous.length)
    sections.push(`YOUR PREVIOUS VERSIONS
${previous
  .map(
    (version) =>
      `V${version.number} (${sliderName} ${version.sliderValue}/10${version.steering ? `, steering: "${version.steering}"` : ""}):\n- "${version.line}"`,
  )
  .join("\n")}
Do not repeat these lines or reuse their tensions, unless Kevin's steering or the Improve mode asks you to build on one of them.`);
  if (request.previousVersion)
    sections.push(
      request.refinementMode === "improve"
        ? `NEXT VERSION MODE: IMPROVE THIS DIRECTION\nBuild on V${request.previousVersion.number}: "${request.previousVersion.text}". Preserve its useful core while making a substantive improvement in specificity, clarity, grounding, or creative usefulness. Do not merely swap synonyms.`
        : `NEXT VERSION MODE: EXPLORE A NEW DIRECTION\nMove away from the current V${request.previousVersion.number} premise and from the prior tensions above. Produce a genuinely different strategic direction, not a synonym swap.`,
    );
  if (attempt)
    sections.push(
      `VALIDATION RETRY\n${retryInstruction || "The prior response was invalid, repeated a previous line, or used unsupported evidence. Return a corrected response once. Every evidence item must be a contiguous, character-for-character excerpt copied from a value in the XC Input Pack above. Do not prepend or rename a field label."}`,
    );
  sections.push("Return the JSON now.");
  return sections.join("\n\n");
}
