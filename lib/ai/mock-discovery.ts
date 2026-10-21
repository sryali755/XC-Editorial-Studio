import type { AgentDataMap, AgentRequest } from "./schemas";
import { AgentError } from "./errors";
import { discoverySourceDocuments } from "../discovery-sources";
import type { DiscoveryLensId } from "../types";

type DiscoveryRequest = Extract<AgentRequest, { agentType: "discovery" }>;
type Finding = AgentDataMap["discovery"]["findings"][number];
type SupportedLens = "consumer" | "category" | "brand";
type ScenarioId =
  | "movers_retention"
  | "movers_acquisition"
  | "pro_work"
  | "pro_entertainment"
  | "other";
type Scenario = { id: ScenarioId; topic: string; unsupportedQuestion: boolean };
type Spec = readonly [
  title: string,
  quote: string,
  relevance: string,
  limitation: string,
  nextQuestion: string,
];

const note =
  "Deterministic mock analysis of supplied material only. No external or enterprise research was retrieved.";

// These are deliberately bounded, source-dependent simulation scenarios, not
// synthetic customer or market research. A quoted passage must actually occur
// in the current source catalog or the result becomes an explicit gap.
const scenarios: Record<
  Exclude<ScenarioId, "other">,
  Record<SupportedLens, Spec>
> = {
  movers_retention: {
    consumer: [
      "Mover retention is framed through transfer ease, not a measured reason to stay",
      "Customer: One less thing to worry about. Transfer your services in a snap with the Xfinity app and stay connected to what you love.",
      "Transfer steps may be a useful place to investigate an existing customer's decision during a move.",
      "The brief does not document transfer completion, churn reasons, or how movers perceive the app.",
      "Where do existing movers encounter friction when transferring service, and how is that observed?",
    ],
    category: [
      "Keeping service during a move is an objective; alternatives are undocumented",
      "Reinforce why a customer must stay with Xfinity during the move moment.",
      "A category investigation could compare transfer, switching and doing nothing as actual decision paths.",
      "The objective does not document a competitor offer or a mover's trade-off.",
      "What comparison evidence shows the alternatives existing movers actually consider?",
    ],
    brand: [
      "The mover reliability RTB is a supplied claim, not a verified current experience",
      "Most reliable WiFi with our best equipment included – All-in means all-in.",
      "This proof boundary could focus brand substantiation before a retention message is approved.",
      "RTB approval is unknown; the brief does not prove how existing movers experience this claim.",
      "Which approved substantiation and mover-experience source supports this claim for customer executions?",
    ],
  },
  movers_acquisition: {
    consumer: [
      "Prospect messaging proposes an in-home upgrade, not a documented choice motive",
      "Prospect: You've leveled up your space, now level up your internet with the best in-home WiFi",
      "A prospect investigation could test whether a new home changes provider evaluation.",
      "The brief does not supply prospect interviews or observed reasons to choose Xfinity.",
      "Which prospect evidence shows what matters most when selecting internet for a new home?",
    ],
    category: [
      "Competitive jump balls are named but competitor alternatives are not shown",
      "competitive jump balls",
      "The source points to a competitive choice moment that may deserve a like-for-like offer comparison.",
      "No rival offer, switching rate or reason for doing nothing is documented in the supplied pack.",
      "What actual provider alternatives are prospects comparing at the moving moment?",
    ],
    brand: [
      "The five-year price statement is limited to prospect and TOT contexts",
      "Prospect & TOT only: One consistent internet price. 5 Years. Guaranteed. – No strings attached.",
      "Eligibility could shape acquisition messaging after approval.",
      "The source records the restriction, not current availability, legal approval or prospect response.",
      "Which approved offer and substantiation records confirm the eligible prospect executions?",
    ],
  },
  pro_work: {
    consumer: [
      "A work-call use case is supplied, not observed work-from-home demand",
      "Boost your work call with the Xfinity app for seamless connectivity",
      "This may guide research into which household activity matters to existing HSD customers.",
      "No user research shows how often this need occurs or whether the feature solves it.",
      "Which work-from-home interviews or task observations establish the need and experience?",
    ],
    category: [
      "Pro differentiation is stated as intent, not shown by competitor comparison",
      "Xfinity Pro is the latest advancement in our premium roadmap",
      "A category study could compare the work-call proposition with documented alternatives.",
      "The brief has no current rival comparison or measured value-for-dollar result.",
      "Which provider or non-upgrade options do work-from-home customers compare?",
    ],
    brand: [
      "Device priority is a supplied Pro feature statement, not verified current performance",
      "Prioritize A Device",
      "The named feature may be relevant to a work-call proof plan after product review.",
      "The historical brief does not establish current availability, approval or work-call performance.",
      "Which current product document and experience test substantiate this feature?",
    ],
  },
  pro_entertainment: {
    consumer: [
      "Gaming and streaming are named use cases, not ranked customer priorities",
      "Boost your streaming, gaming, and working with our best features and equipment with Xfinity Pro",
      "A household study could test whether entertainment use cases matter differently from work calls.",
      "No supplied research ranks these activities or shows benefit realization.",
      "Which existing-HSD study shows when gaming or streaming drives upgrade consideration?",
    ],
    category: [
      "The premium category claim lacks a gaming or streaming comparison",
      "Xfinity Pro is the latest advancement in our premium roadmap",
      "A comparison might reveal whether these use cases change the choice to upgrade.",
      "No competitor test or no-upgrade alternative is documented for gaming or streaming.",
      "What documented gaming and streaming alternatives are current HSD customers considering?",
    ],
    brand: [
      "Extender support is a supplied Pro feature claim, not a measured entertainment outcome",
      "up to 2 WiFi Extenders",
      "The feature might matter to coverage-sensitive entertainment use cases after verification.",
      "The brief does not establish current eligibility, performance or customer experience.",
      "Which current feature specification and household test support the gaming or streaming claim?",
    ],
  },
};

function firstFocus(
  text: string,
  options: readonly (readonly [ScenarioId, RegExp])[],
) {
  return options
    .map(([id, pattern]) => ({ id, index: text.search(pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)[0]?.id;
}

function scenarioFor(request: DiscoveryRequest): Scenario {
  const campaign = request.context.foundation.campaignContext.campaignName;
  const movers = /mover/i.test(campaign);
  const pro = /xfinity pro/i.test(campaign);
  const options: readonly (readonly [ScenarioId, RegExp])[] = movers
    ? [
        [
          "movers_retention",
          /\b(retention|retain|existing customers?|current customers?|stay|leave|transfer)\b/i,
        ],
        [
          "movers_acquisition",
          /\b(prospects?|acquisition|switch(?:ing)?|choos(?:e|ing)|competitive|new customers?)\b/i,
        ],
      ]
    : pro
      ? [
          ["pro_work", /\b(work|working|home office|call|meeting)\b/i],
          [
            "pro_entertainment",
            /\b(gaming|game|streaming|stream|entertainment)\b/i,
          ],
        ]
      : [];
  const explicitFocus =
    firstFocus(request.guidance ?? "", options) ??
    firstFocus(request.context.question, options);
  const broadCampaignQuestion =
    /\b(campaign|objectives?|problems?|barriers?|evidence|strategy|insights?|message|audience)\b/i.test(
      request.context.question,
    ) ||
    (movers && /\blearn about movers\b/i.test(request.context.question));
  const unsupportedQuestion =
    (movers || pro) && !explicitFocus && !broadCampaignQuestion;
  const id =
    explicitFocus ?? (movers ? "movers_retention" : pro ? "pro_work" : "other");
  const topic: Record<ScenarioId, string> = {
    movers_retention: "existing-customer transfer and retention during a move",
    movers_acquisition: "prospects choosing a provider during a move",
    pro_work: "Xfinity Pro work calls",
    pro_entertainment: "Xfinity Pro gaming and streaming",
    other: campaign || "this campaign",
  };
  return { id, topic: topic[id], unsupportedQuestion };
}

function gap(title: string, missing: string, question: string): Finding {
  return {
    title,
    whatWeFound: missing,
    evidence: [],
    whyItMayMatter:
      "This is an unanswered question for the strategist, not an observed result.",
    whatComplicatesIt:
      "The supplied material cannot establish an audience, cultural, competitive or causal result on its own.",
    questionToExplore: question,
    evidenceState: "research_gap",
  };
}

function support(request: DiscoveryRequest, spec: Spec): Finding {
  const [title, quote, whyItMayMatter, whatComplicatesIt, questionToExplore] =
    spec;
  const source = discoverySourceDocuments(request.context.foundation)
    .filter((entry) => entry.text.includes(quote))
    .sort((a, b) => {
      const score = (locator: string) =>
        /^imc:page:|^imc:lines:/.test(locator)
          ? 3
          : locator === "imc:brief"
            ? 0
            : 1;
      return score(b.locator) - score(a.locator);
    })[0];
  if (!source)
    return gap(
      `${title} — passage unavailable in this mock`,
      "This deterministic scenario cannot verify its supporting passage in the current Input Pack, so it does not assert the finding.",
      questionToExplore,
    );
  return {
    title,
    whatWeFound: `The supplied source states: “${quote}”${/[.!?]$/.test(quote) ? "" : "."}`,
    evidence: [
      {
        source: source.identity,
        locator: source.locator,
        excerpt: quote,
        date: source.date ?? "Not supplied",
        audience: source.audience ?? "Not supplied",
        context:
          "Original supplied IMC wording; source claims and availability remain unverified, and approval stays separate.",
        accessScope: "supplied",
      },
    ],
    whyItMayMatter,
    whatComplicatesIt,
    questionToExplore,
    evidenceState: "evidence_supported",
  };
}

function genericFinding(
  request: DiscoveryRequest,
  lens: DiscoveryLensId,
): Finding {
  const f = request.context.foundation;
  if (lens === "culture")
    return gap(
      "A wider cultural pattern is not established for this campaign",
      "The supplied campaign brief does not document a repeated social ritual, a wider norm, or a cultural countercurrent. Its audience direction cannot establish a cultural trend.",
      "Which original cultural study or observation documents a repeated behavior relevant to this audience?",
    );
  if (lens === "analogous")
    return gap(
      "No separate documented case can be compared with this campaign",
      "The supplied campaign brief does not identify another context with a comparable barrier, an intervention, an observed outcome, and transfer limits. Its own proposed campaign is not an analogous case.",
      "Which original case study documents a comparable barrier, outcome, and limits of transfer?",
    );
  const field =
    lens === "consumer"
      ? f.campaignContext.audience
      : lens === "category"
        ? f.campaignContext.objective
        : lens === "brand"
          ? f.currentRtb.original
          : "";
  const quote = field
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 140);
  if (!quote)
    return gap(
      "Original source support is not established for this question",
      `This offline mock has no supported ${lens} scenario for the current question; it does not invent research.`,
      `Which original source could investigate the ${lens} question in this campaign?`,
    );
  return support(request, [
    lens === "consumer"
      ? "The intended audience is supplied, but its behavior is not observed"
      : lens === "category"
        ? "The objective is supplied, but actual alternatives are not compared"
        : "The original RTB is supplied, but approval and experience remain separate",
    quote,
    `This could focus a ${lens} investigation without treating the brief's intent as a measured result.`,
    "The supplied brief does not verify customer response, current offer status or comparative performance.",
    `What original ${lens} evidence would test the question Kevin asked?`,
  ]);
}

function initialFindings(
  request: DiscoveryRequest,
  scenario: Scenario,
): Finding[] {
  const lens = request.context.lens;
  if (scenario.unsupportedQuestion) {
    const unsupported: Record<
      DiscoveryLensId,
      readonly [string, string, string]
    > = {
      consumer: [
        "Consumer motives cannot be assessed from this off-campaign question",
        "No supplied audience behavior addresses this question. The Consumer lens cannot infer household motivations from unrelated material.",
        "What audience decision in the campaign should be investigated instead?",
      ],
      culture: [
        "This question does not identify a cultural pattern to investigate",
        "The supplied campaign materials contain no cultural study for this topic. A social norm or ritual would require its own original observation.",
        "Which observable social behavior tied to this campaign needs a cultural source?",
      ],
      category: [
        "No category alternatives are established for this question",
        "The request does not identify a provider choice, trade-off, or convention that the supplied brief can compare. Competitor activity is not inferred.",
        "Which actual category decision should be compared using a documented source?",
      ],
      brand: [
        "Brand proof cannot be assessed from this unrelated question",
        "The requested topic has no named Xfinity promise, approval record, or product claim in the supplied Input Pack. Brand credibility cannot be assumed.",
        "Which supplied brand claim or approval boundary should be reviewed?",
      ],
      analogous: [
        "No documented analogous case answers this question",
        "The provided files do not include a separate case with a comparable barrier, intervention, outcome, and transfer limit for this topic.",
        "Which original case document describes a campaign-relevant comparable mechanism?",
      ],
    };
    return [gap(...unsupported[lens])];
  }
  if (scenario.id === "other") {
    const first = genericFinding(request, lens);
    if (lens !== "consumer") return [first];
    const objective = request.context.foundation.campaignContext.objective
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 140);
    if (!objective) return [first];
    const second = support(request, [
      "The intended audience shift is stated as an objective, not measured behavior",
      objective,
      "This is a separate audience research question from who the campaign addresses: it asks whether the desired change occurs.",
      "The objective is a campaign intention, not evidence that customers perceive or act on it.",
      "What original audience research measures whether the intended change in perception or choice occurs?",
    ]);
    return second.evidenceState === "evidence_supported"
      ? [first, second]
      : [first];
  }
  if (lens === "analogous")
    return [
      gap(
        `No documented analogous case is supplied for ${scenario.topic}`,
        `The supplied ${scenario.id.startsWith("movers") ? "Movers" : "Xfinity Pro"} brief does not document a separate comparable case or result. A selected Spark is not case evidence.`,
        `Which original case document shows a comparable barrier to ${scenario.topic}, an actual response and the limits of transfer?`,
      ),
    ];
  if (lens === "culture")
    return [
      gap(
        `A cultural pattern around ${scenario.topic} needs evidence beyond the product brief`,
        `No original cultural research in this Input Pack establishes a shared social norm or trend around ${scenario.topic}.`,
        `Which supplied study or observed ritual shows a wider pattern around ${scenario.topic}?`,
      ),
    ];
  const first = support(request, scenarios[scenario.id][lens]);
  if (lens !== "consumer") return [first];
  const missing: Record<
    Exclude<ScenarioId, "other">,
    readonly [string, string, string]
  > = {
    movers_retention: [
      "The existing-mover transfer journey is not observed",
      "No supplied customer-journey research documents why existing customers leave Xfinity during a move.",
      "Which transfer-completion source identifies where existing movers leave?",
    ],
    movers_acquisition: [
      "Prospect switching barriers remain unmeasured",
      "No supplied prospect study identifies which barrier blocks acquisition at the move moment.",
      "Which switcher research compares installation, availability, price and trust during a move?",
    ],
    pro_work: [
      "The work-call benefit needs household observation",
      "The supplied brief names a work-call scenario but contains no observed household prioritization evidence.",
      "When work calls compete with other devices, what do existing HSD customers prioritize?",
    ],
    pro_entertainment: [
      "Entertainment upgrade behavior is not measured",
      "The brief names gaming and streaming but provides no measured upgrade motivation for either group.",
      "Which usage study distinguishes gamers from streamers among existing HSD customers?",
    ],
  };
  return [first, gap(...missing[scenario.id])];
}

function anotherAnswer(request: DiscoveryRequest, scenario: Scenario): Finding {
  const lens = request.context.lens;
  const topic = scenario.topic;
  const needs: Record<DiscoveryLensId, readonly string[]> = {
    consumer: [
      `the decision step where ${topic} encounter friction`,
      `stated interest versus observed action for ${topic}`,
      `a distinct subgroup need within ${topic}`,
    ],
    culture: [
      `a repeated social ritual around ${topic}`,
      `a countercurrent to an assumed norm around ${topic}`,
      `whether a wider pattern around ${topic} persists`,
    ],
    category: [
      `the actual alternatives considered by ${topic}`,
      `the cost of doing nothing for ${topic}`,
      `a like-for-like comparison for ${topic}`,
    ],
    brand: [
      `approved substantiation relevant to ${topic}`,
      `current product or offer eligibility for ${topic}`,
      `customer experience evidence for the promise made to ${topic}`,
    ],
    analogous: [
      `a documented case with a comparable barrier to ${topic}`,
      `a documented outcome of a comparable intervention for ${topic}`,
      `the limits of transferring a documented mechanism to ${topic}`,
    ],
  };
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const answer = needs[lens]
    .map((need) =>
      gap(
        `Investigate ${need}`,
        `The supplied Input Pack does not establish ${need}. This is an untested research question, not a new finding.`,
        `Which original source would establish ${need}?`,
      ),
    )
    .find(
      (candidate) =>
        !request.context.previousFindings.some(
          (prior) =>
            normalize(prior.title) === normalize(candidate.title) ||
            normalize(prior.whatWeFound) === normalize(candidate.whatWeFound),
        ),
    );
  if (!answer)
    throw new AgentError(
      `This deterministic ${lens} mock has no further distinct answer for the current question. Previous findings are preserved; change or narrow the question to explore a new scenario.`,
      422,
      "mock_discovery_exhausted",
      false,
    );
  return answer;
}

function followUpFinding(
  request: DiscoveryRequest,
  scenario: Scenario,
): Finding {
  const plainContext = (value: string) =>
    value
      .replace(/[“”"'‘’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const lens = request.context.lens;
  const question = plainContext(
    request.guidance?.trim() ||
      request.context.conversation?.messages.at(-1)?.text.trim() ||
      request.context.question,
  );
  const prior =
    request.context.selectedFinding ?? request.context.previousFindings.at(-1);
  const spark = request.context.foundation.selectedSparks?.[0];
  const subject = plainContext(prior?.title || scenario.topic);
  const sparkContext = spark
    ? ` The selected Spark ${plainContext(spark.title || spark.text)} is a creative hypothesis, not observed evidence.`
    : "";
  const followUpContext = `Kevin’s current follow-up asks ${question} about the prior ${lens} interpretation ${subject}. The earlier agent finding is an interpretation, not evidence.`;
  const evidenceNeed: Record<DiscoveryLensId, string> = {
    consumer: "original audience research or observed behavior",
    culture: "an original cultural study or repeated observation",
    category: "a documented comparison of real alternatives",
    brand: "approved substantiation or current product evidence",
    analogous: "an original comparable-case document and its outcomes",
  };
  const direction = /evidence|source|support|proof|data|quote/i.test(question)
    ? {
        title:
          "The source needed to verify this interpretation is not supplied",
        need: `${followUpContext} The Input Pack contains no ${evidenceNeed[lens]} to verify it.${sparkContext}`,
        next: `Which original ${evidenceNeed[lens]} could test the interpretation of ${subject}?`,
      }
    : /wrong|challenge|contrary|opposite|contradict|alternative/i.test(question)
      ? {
          title: "A competing explanation has not been tested",
          need: `${followUpContext} The supplied material does not test a counterexample or alternative cause, so neither the earlier interpretation nor its opposite is established.${sparkContext}`,
          next: `What original ${evidenceNeed[lens]} could distinguish ${subject} from a competing explanation?`,
        }
      : /why|reason|cause|mechanism|barrier/i.test(question)
        ? {
            title: "The mechanism behind this interpretation remains open",
            need: `${followUpContext} The supplied brief does not observe the ${lens}-specific mechanism that could explain it; the earlier finding does not establish causation.${sparkContext}`,
            next: `Which original ${evidenceNeed[lens]} could reveal the mechanism behind ${subject}?`,
          }
        : /deeper|specific|narrow|detail|more/i.test(question)
          ? {
              title: "A more specific decision point needs investigation",
              need: `${followUpContext} The Input Pack does not document the next ${lens}-specific decision point, so this remains a research question rather than a result.${sparkContext}`,
              next: `Which original ${evidenceNeed[lens]} could identify the decision point behind ${subject}?`,
            }
          : {
              title: "This follow-up needs a source-bound answer",
              need: `${followUpContext} The supplied material does not contain enough ${lens}-specific evidence to answer it as a finding.${sparkContext}`,
              next: `Which original ${evidenceNeed[lens]} could answer Kevin’s follow-up about ${subject}?`,
            };
  return gap(
    `${lens[0].toUpperCase()}${lens.slice(1)} · ${direction.title}`,
    direction.need,
    direction.next,
  );
}

export function mockDiscovery(
  request: DiscoveryRequest,
): AgentDataMap["discovery"] {
  const scenario = scenarioFor(request);
  if (scenario.unsupportedQuestion) {
    if (request.context.action === "another_answer")
      throw new AgentError(
        "This deterministic mock cannot explore another angle on that question from the supplied campaign brief. Previous findings are preserved; ask a campaign-specific question or use approved research.",
        422,
        "mock_discovery_unsupported",
        false,
      );
    return {
      findings: initialFindings(request, scenario),
      retrievalNote: note,
    };
  }
  if (request.context.action === "another_answer")
    return {
      findings: [anotherAnswer(request, scenario)],
      retrievalNote: note,
    };
  if (request.context.action === "find_contrary")
    return {
      findings: [
        gap(
          `A competing explanation for ${scenario.topic} needs its own source`,
          "No connected source was searched for counterevidence; the supplied pack cannot establish a contrary result.",
          `What evidence would distinguish the current interpretation from an alternative explanation for ${scenario.topic}?`,
        ),
      ],
      retrievalNote: note,
    };
  if (request.context.action === "check_recency")
    return {
      findings: [
        gap(
          `Current relevance of ${scenario.topic} is not established`,
          "A historical campaign brief cannot by itself verify present-day availability or outcomes.",
          `Which dated current source confirms the product, audience or offer detail relevant to ${scenario.topic}?`,
        ),
      ],
      retrievalNote: note,
    };
  const findings = initialFindings(request, scenario);
  if (
    request.context.action === "initial" ||
    request.context.action === "refresh"
  )
    return { findings, retrievalNote: note };
  // Follow-ups incorporate the current probe and selected prior context, but
  // remain explicit research gaps: the deterministic mock does not retrieve.
  return {
    findings: [followUpFinding(request, scenario)],
    retrievalNote: note,
  };
}

export function mockConnections(
  request: Extract<AgentRequest, { agentType: "connections" }>,
): AgentDataMap["connections"] {
  const [first, second] = request.context.findings;
  return {
    relationships: [
      `${first.title} and ${second.title} may describe different parts of the same campaign problem, but their relationship is an interpretation rather than a sourced conclusion.`,
    ],
    tensions: [
      `${first.lensId} evidence may qualify the ${second.lensId} interpretation; neither finding establishes causation.`,
    ],
    questions: [
      "What additional evidence would show whether these findings share a cause or merely occur together?",
      "Which audience or context would make one explanation more useful than the other?",
    ],
    note: "Working interpretation: the selected findings may be connected, but the supplied evidence does not yet establish the mechanism. Kevin should edit or reject this connection before using it in strategy.",
  };
}
