import {
  getParsedIMC,
  getUpstream,
  fieldText,
  sourceContext,
  reconcileUpstream,
} from "./upstream";
import type {
  PreparationAgentId,
  PreparationState,
  PreparationVersion,
  StrategyInputPack,
  UpstreamContext,
  ParsedIMCBrief,
} from "./types";

export const emptyContext = {
  campaignName: "",
  objective: "",
  audience: "",
  product: "",
  channel: "",
  constraints: "",
};
export const emptyPreparation: PreparationState = {
  upstreamDraft: "",
  sourceSnapshot: "",
  outputs: [],
  selectedSparkIds: [],
  focus: "",
  context: emptyContext,
};
export const demoIMCBrief = `IMC OUTPUT BRIEF — FICTIONAL DEMONSTRATION
Campaign: Life, connected
Objective: Make Xfinity the first choice for households looking for dependable home connectivity.
Audience: Busy households balancing work, entertainment and everyday life.
Product: Xfinity home internet
Channels: Web, email and paid social
Constraints: Avoid unverified speed, pricing or competitive claims. Product proof requires approval.
Reason to believe: Home connectivity and helpful support come together to support the moments that matter.
Research: Illustrative audience observation: people want technology to work quietly in the background. Prior campaign hypothesis: everyday moments may tell a clearer story than feature-heavy messages. No verified performance data is supplied.
Brief type: Growth
Campaign tier: Targeted
KPIs: To be confirmed by the GTM owner
Brand messaging: Everyday connection for the moments that matter.
Messaging approval: Draft demonstration copy — not approved
Message hierarchy: Lead with everyday value, then supporting product proof.
Brand guidelines: Harmony reference pending
Eligibility: Households within the relevant service footprint; confirm offer eligibility.
Exclusions: Intentionally excluded — no additional targeting exclusions supplied for this demo
Substantiation: Needs clarification — approved product evidence required
Disclaimers: Needs clarification — confirm applicable offer disclaimers
Partner approval: Not supplied
Document version: Demo v1
Upstream approval: Draft — fictional demonstration
Resources: GTM / Brand references to be supplied
Creative ask: Explore the human value of a connection that supports everyday life.`;
export const preparationAgents: {
  id: PreparationAgentId;
  name: string;
  thinking: string;
  output: string;
  color: string;
  symbol: string;
}[] = [
  {
    id: "reasonToBelieve",
    name: "Review & Adapt Upstream RTB",
    thinking:
      "Preserve the GTM-provided RTB and its hierarchy. Suggest XC framing separately; flag gaps without adding new claims or replacing upstream strategy.",
    output: "An XC adaptation proposal, separate from the original RTB.",
    color: "purple",
    symbol: "01",
  },
  {
    id: "research",
    name: "Data & Research Agent",
    thinking:
      "Use campaign and audience context to organize supplied evidence. Connected sources will eventually supply performance, research and brand context.",
    output: "Supporting evidence, source notes and missing research.",
    color: "blue",
    symbol: "02",
  },
  {
    id: "sparks",
    name: "Strategic Sparks Agent",
    thinking:
      "Explore tensions and starting ideas from the same IMC context. Offer possibilities to evaluate, not new facts or final brief lines.",
    output: "Individual idea starters for Kevin to select.",
    color: "coral",
    symbol: "03",
  },
];
export const researchSources = [
  "Tableau",
  "iSpot",
  "ACE",
  "Datorama",
  "Brand Hub",
  "Product / audience research",
];
export function currentPreparation(
  state: PreparationState,
  id: PreparationAgentId,
) {
  const output = state.outputs.find((o) => o.agentId === id);
  return output?.versions.find((v) => v.id === output.currentVersionId);
}
export function compileInputPack(state: PreparationState): StrategyInputPack {
  const sparks = currentPreparation(state, "sparks");
  const upstream = getUpstream(state);
  return {
    ...sourceContext(upstream),
    upstream,
    parsedIMC: getParsedIMC(state),
    reasonToBelieve: fieldText(upstream.fields.originalRTB),
    proposedRTB:
      upstream.fields.originalRTB.status === "Supplied"
        ? (currentPreparation(state, "reasonToBelieve")?.text ?? "")
        : `No adaptation carried forward. Upstream RTB: ${fieldText(upstream.fields.originalRTB)}.`,
    research: currentPreparation(state, "research")?.text ?? "",
    sparks:
      sparks?.sparks
        .filter((s) => state.selectedSparkIds.includes(s.id))
        .map((s) => s.text)
        .join("\n") ?? "",
    researchFocus: state.focus,
    preparationSource: "IMC brief → three preparation agents · Mock outputs",
  };
}
export function preparationReady(state: PreparationState) {
  const pack = compileInputPack(state);
  return (
    !state.outputs.some(
      (o) =>
        o.versions.find((v) => v.id === o.currentVersionId)?.sourceBrief !==
        state.sourceSnapshot,
    ) &&
    !!state.sourceSnapshot.trim() &&
    state.upstreamDraft.trim() === state.sourceSnapshot.trim() &&
    !!pack.reasonToBelieve.trim() &&
    !!pack.research.trim() &&
    !!pack.sparks.trim()
  );
}
export interface PreparationService {
  generate(request: {
    agentId: PreparationAgentId;
    parsedIMC: ParsedIMCBrief;
    previous: PreparationVersion[];
    guidance: string;
    upstream: UpstreamContext;
  }): Promise<PreparationVersion>;
}
// TODO: Replace with approved preparation Playbooks and authenticated server-side connectors.
// No live research, vector database, retrieval or Writer invocation is implemented here.
export const preparationService: PreparationService = {
  async generate({ agentId, parsedIMC, previous, guidance, upstream }) {
    if (
      !parsedIMC ||
      parsedIMC.schemaVersion !== 1 ||
      !parsedIMC.sourceText.trim()
    )
      throw new Error(
        "Parse the IMC brief before running a preparation agent.",
      );
    await new Promise((resolve) => setTimeout(resolve, 650));
    const source = reconcileUpstream(parsedIMC, upstream);
    const context = sourceContext(source);
    const number = previous.length
      ? Math.max(...previous.map((v) => v.number)) + 1
      : 0;
    const product =
      source.fields.product.status === "Supplied"
        ? context.product
        : "the supplied offer";
    const audience =
      source.fields.audience.status === "Supplied"
        ? context.audience
        : "the priority audience (confirm from the brief)";
    let text = "";
    let ideas: string[] = [];
    if (agentId === "reasonToBelieve") {
      const original = source.fields.originalRTB;
      text =
        original.status === "Supplied"
          ? `${original.value}\n\nProposed XC framing: connect the supplied RTB to the needs of ${audience}. Preserve the upstream message hierarchy and approved claims.\n\nProposal only — no upstream approval is granted by this agent or by Kevin’s brief-line approval.`
          : `Upstream RTB: ${fieldText(original)}.\n\nNo replacement RTB has been generated. Preserve this upstream decision; clarify with the GTM owner if a change is needed.`;
    }
    if (agentId === "research")
      text = `SUPPLIED EVIDENCE\n${fieldText(source.fields.research)}\n\nAUDIENCE CONTEXT\n${audience}\n\nRESEARCH TO VALIDATE\nHistorical performance: Tableau / Datorama.\nCreative testing and response: iSpot / ACE.\nApproved claims and brand principles: Brand Hub.\n\nEVIDENCE GAPS\nAll connectors are unconnected. No external data was retrieved, and no performance results are asserted.`;
    if (agentId === "sparks") {
      ideas = [
        `What if ${product} played a quieter role, so everyday life could take the lead?`,
        `Explore the tension between a connected household and everyone's individual world.`,
        `What everyday friction could ${product} help the audience move beyond?`,
        `Consider belonging as a human benefit, rather than a technology feature.`,
        `Could a familiar household moment make the campaign promise easier to understand?`,
        `Explore how the audience defines value beyond specifications.`,
      ];
      if (number > 0)
        ideas = ideas.map(
          (idea, i) =>
            `${idea} ${guidance ? `Explore through this guidance: ${guidance}.` : `Alternative ${number}: consider ${i % 2 ? "a shared ritual" : "a small everyday moment"}.`}`,
        );
      text = ideas.map((idea, i) => `${i + 1}. ${idea}`).join("\n\n");
    }
    if (agentId !== "sparks" && number > 0)
      text += `\n\nREFINEMENT V${number}\n${guidance ? `Strategist emphasis: ${guidance}` : "Refresh the framing around the supplied objective and evidence gaps."}\nKeep this emphasis tied to the evidence above; validate any additional claims.`;
    return {
      id: crypto.randomUUID(),
      number,
      text,
      guidance: guidance || "Initial preparation from IMC brief",
      createdAt: new Date().toISOString(),
      sourceBrief: parsedIMC.sourceText,
      sparks: ideas.map((text) => ({ id: crypto.randomUUID(), text })),
    };
  },
};
