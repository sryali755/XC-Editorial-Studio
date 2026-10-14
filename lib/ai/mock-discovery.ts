import type { AgentDataMap, AgentRequest } from "./schemas";

type DiscoveryRequest = Extract<AgentRequest, { agentType: "discovery" }>;

function usable(value?: string) {
  const text = value?.trim() ?? "";
  return text && !/^(?:not supplied|intentionally excluded)[.]?$/i.test(text)
    ? text
    : "";
}

function excerpt(value: string) {
  const first = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (first || value.trim()).slice(0, 260);
}

const language = {
  consumer: {
    title: "The audience definition carries the first unanswered question",
    matter:
      "This may help the strategist distinguish a real audience barrier from a broad targeting description.",
    question:
      "What observed behavior or stated attitude differentiates the priority audience in this situation?",
  },
  culture: {
    title: "The wider social context is still mostly unstated",
    matter:
      "A relevant shared behavior may change how the campaign problem is understood, but that connection remains a hypothesis.",
    question:
      "Which durable social behavior surrounds this problem, and what supplied evidence shows it applies here?",
  },
  category: {
    title:
      "The objective implies a category choice without showing the alternatives",
    matter:
      "Understanding the real alternatives may reveal whether the campaign faces differentiation, friction, or simple inaction.",
    question:
      "What alternatives—including doing nothing—does the audience actually consider, and what evidence explains that choice?",
  },
  brand: {
    title: "The proof sets a credibility boundary for the investigation",
    matter:
      "Keeping the fixed proof separate from interpretation may prevent the strategy from depending on a stronger claim than the brief supports.",
    question:
      "Which perception or experience evidence shows whether this proof is meaningful and credible to the audience?",
  },
  analogous: {
    title: "A supplied Spark can frame an analogy, but not prove one",
    matter:
      "A structurally comparable case could expand the strategist's thinking if its mechanism and limitations are documented.",
    question:
      "Which documented case faced the same underlying barrier, and where does the comparison stop being useful?",
  },
} as const;

export function mockDiscovery(
  request: DiscoveryRequest,
): AgentDataMap["discovery"] {
  const foundation = request.context.foundation;
  const lens = request.context.lens;
  const copy = language[lens];
  const selected = request.context.selectedFinding;
  const primary =
    lens === "consumer"
      ? usable(foundation.campaignContext.audience)
      : lens === "culture"
        ? usable(foundation.currentResearch)
        : lens === "category"
          ? usable(foundation.campaignContext.objective)
          : lens === "brand"
            ? usable(foundation.currentRtb.original)
            : usable(
                foundation.selectedSparks[0]?.excerpt ||
                  foundation.selectedSparks[0]?.text,
              );
  const source =
    lens === "consumer"
      ? "IMC brief — audience"
      : lens === "culture"
        ? "Prepared research"
        : lens === "category"
          ? "IMC brief — objective"
          : lens === "brand"
            ? "Original RTB"
            : "Selected Spark";
  const supported = Boolean(primary);
  const actionLead =
    request.context.action === "find_contrary"
      ? "A competing explanation remains plausible"
      : request.context.action === "check_recency"
        ? "Recency is not established by the supplied material"
        : request.context.action === "separate_audience"
          ? "The supplied audience may contain meaningfully different groups"
          : request.context.action === "compare_input"
            ? "The finding is only partly resolved by the Input Pack"
            : request.context.action === "ask_another_lens"
              ? "Another lens changes what the finding can support"
              : request.context.action === "explore_deeper"
                ? "The finding points to a more specific evidence need"
                : copy.title;
  const finding = {
    title: selected ? actionLead : copy.title,
    whatWeFound: supported
      ? `The supplied material documents a relevant starting point for the ${lens} investigation, but it does not by itself establish the cause of the campaign problem.`
      : `The supplied material does not contain enough evidence to establish a ${lens} finding for this investigation.`,
    evidence: supported
      ? [
          {
            source,
            excerpt: excerpt(primary),
            date: "Not supplied",
            audience: foundation.campaignContext.audience || "Not supplied",
            context: `Supplied context for the ${lens} lens`,
            accessScope: "supplied" as const,
          },
        ]
      : [],
    whyItMayMatter: copy.matter,
    whatComplicatesIt:
      request.context.action === "find_contrary"
        ? "No connected source was searched for counterevidence. The current material may support more than one explanation."
        : "The brief provides campaign direction, not independent proof of audience response or causal effect.",
    questionToExplore: copy.question,
    evidenceState: supported
      ? ("evidence_supported" as const)
      : ("research_gap" as const),
  };
  if (request.context.action !== "initial")
    return {
      findings: [finding],
      retrievalNote:
        "This response re-analyzed supplied evidence only. No external or enterprise source was searched.",
    };
  const constraint = usable(foundation.campaignContext.constraints);
  return {
    findings: [
      finding,
      constraint
        ? {
            title: "A campaign constraint may shape the evidence question",
            whatWeFound:
              "The supplied constraints narrow what can be claimed or explored, but they do not explain the audience or market response.",
            evidence: [
              {
                source: "IMC brief — constraints",
                excerpt: excerpt(constraint),
                date: "Not supplied",
                audience: foundation.campaignContext.audience || "Not supplied",
                context: "Campaign constraint",
                accessScope: "supplied" as const,
              },
            ],
            whyItMayMatter:
              "This may help focus research on an answer the campaign can use without turning the restriction into a strategy.",
            whatComplicatesIt:
              "A restriction is not evidence that a particular interpretation will be effective.",
            questionToExplore:
              "What evidence would distinguish a useful opportunity from an idea the constraints simply permit?",
            evidenceState: "evidence_supported" as const,
          }
        : {
            title: "The campaign constraints need confirmation",
            whatWeFound:
              "No usable campaign constraint was supplied for this investigation.",
            evidence: [],
            whyItMayMatter:
              "Knowing the credibility and execution boundaries may prevent later research from pointing toward an unusable direction.",
            whatComplicatesIt:
              "A missing constraint cannot be treated as permission.",
            questionToExplore:
              "Which claims, naming rules, partner requirements, or exclusions apply?",
            evidenceState: "research_gap" as const,
          },
    ],
    retrievalNote:
      "This response analyzed supplied evidence only. No external or enterprise source was searched.",
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
