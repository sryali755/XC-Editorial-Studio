import { runAgent } from "./ai/client";
import { preparationText } from "./ai/format";
import {
  getParsedIMC,
  getUpstream,
  fieldText,
  sourceContext,
} from "./upstream";
import type {
  PreparationAgentId,
  PreparationState,
  StrategyInputPack,
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
    output: "Original upstream RTB + optional XC adaptation proposal.",
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
      "Find six distinct creative territories in the IMC objective, audience, RTB and supplied evidence. Explain each territory’s grounding and the hypothesis to validate.",
    output: "Six titled idea starters with rationale for Kevin to select.",
    color: "coral",
    symbol: "03",
  },
];
export const researchSources = [
  { name: "Tableau", purpose: "Historical performance" },
  { name: "iSpot", purpose: "Creative/media performance" },
  { name: "ACE", purpose: "Creative effectiveness/testing" },
  { name: "Datorama", purpose: "Digital campaign performance" },
  { name: "Brand Hub", purpose: "Approved claims / brand principles" },
  {
    name: "Product / Audience Research",
    purpose: "Supporting customer/product evidence",
  },
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
  const selectedSparks =
    sparks?.sparks
      .filter((spark) => state.selectedSparkIds.includes(spark.id))
      .map((spark) => ({
        ...spark,
        versionId: sparks.id,
        version: sparks.number,
      })) ?? [];
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
    selectedSparks,
    sparks: selectedSparks.map((spark) => spark.text).join("\n"),
    researchFocus: state.focus,
    preparationSource:
      "IMC brief → three preparation agents · Selected current outputs",
  };
}
export function preparationReady(state: PreparationState) {
  const pack = compileInputPack(state);
  return (
    preparationAgents.every((agent) => !!currentPreparation(state, agent.id)) &&
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

export const preparationService = {
  async generate({
    agentId,
    parsedIMC,
    previous,
    guidance,
    upstream,
    currentVersion,
    sparkRevision,
  }: {
    agentId: PreparationAgentId;
    parsedIMC: import("./types").ParsedIMCBrief;
    previous: import("./types").PreparationVersion[];
    guidance: string;
    upstream: import("./types").UpstreamContext;
    currentVersion?: import("./types").PreparationVersion;
    sparkRevision?: {
      targetId?: string;
      keptIds: string[];
      intent: "explore" | "improve";
    };
  }): Promise<import("./types").PreparationVersion> {
    if (!parsedIMC?.sourceText.trim())
      throw new Error(
        "Parse the IMC brief before running a preparation agent.",
      );
    const number = previous.length
      ? Math.max(...previous.map((v) => v.number)) + 1
      : 1;
    const current = currentVersion ?? previous[0];
    const response = await runAgent({
      agentType: agentId === "reasonToBelieve" ? "rtb" : agentId,
      context: { parsedIMC, upstream },
      guidance,
      versionNumber: number,
      ...(sparkRevision ? { sparkRevision } : {}),
      ...(current
        ? {
            previousVersion: {
              number: current.number,
              text: current.text,
              ...(sparkRevision
                ? {
                    data: {
                      sparks: current.sparks.map((spark) => ({
                        ...spark,
                        title: spark.title ?? "",
                        rationale: spark.rationale ?? "",
                      })),
                    },
                  }
                : current.data
                  ? { data: current.data }
                  : {}),
            },
          }
        : {}),
    });
    const id = crypto.randomUUID();
    return {
      ...response,
      id,
      number,
      text: preparationText(response.data),
      guidance: sparkRevision?.targetId
        ? `${sparkRevision.intent === "improve" ? "Improved" : "Replaced"} one Spark. ${guidance}`.trim()
        : guidance || "Initial preparation from IMC brief",
      createdAt: response.generatedAt,
      sourceBrief: parsedIMC.sourceText,
      sparks:
        "sparks" in response.data
          ? response.data.sparks.map((spark, index) => ({
              ...spark,
              id:
                sparkRevision &&
                current &&
                (sparkRevision.targetId
                  ? current.sparks[index].id !== sparkRevision.targetId
                  : sparkRevision.keptIds.includes(current.sparks[index].id))
                  ? current.sparks[index].id
                  : `${id}:${index}`,
            }))
          : [],
    };
  },
};
