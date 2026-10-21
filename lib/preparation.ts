import { runAgent } from "./ai/client";
import { preparationText } from "./ai/format";
import { sparkSetIssue } from "./ai/spark-quality";
import { outputSchemas } from "./ai/schemas";
import {
  getParsedIMC,
  getUpstream,
  fieldText,
  sourceContext,
  resolveRtb,
} from "./upstream";
import type {
  PreparationAgentId,
  PreparationSelectedContent,
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
  const current = output?.versions.find(
    (v) => v.id === output.currentVersionId,
  );
  return current?.sourceBrief === state.sourceSnapshot ? current : undefined;
}
export function selectedPreparationContent(
  state: PreparationState,
): PreparationSelectedContent {
  const rtb = currentPreparation(state, "reasonToBelieve");
  const research = currentPreparation(state, "research");
  const sparks = currentPreparation(state, "sparks");
  return {
    ...(rtb
      ? {
          reasonToBelieve: {
            versionId: rtb.id,
            version: rtb.number,
            text: rtb.text,
          },
        }
      : {}),
    ...(research
      ? {
          research: {
            versionId: research.id,
            version: research.number,
            text: research.text,
          },
        }
      : {}),
    selectedSparks:
      sparks?.sparks
        .filter((spark) => state.selectedSparkIds.includes(spark.id))
        .map((spark) => ({
          ...spark,
          versionId: sparks.id,
          version: sparks.number,
        })) ?? [],
  };
}
export function compileInputPack(state: PreparationState): StrategyInputPack {
  const sparks = currentPreparation(state, "sparks");
  const upstream = getUpstream(state);
  const rtb = resolveRtb(upstream);
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
    reasonToBelieve: fieldText(rtb.field),
    rtbApprovalStatus: rtb.approvalStatus,
    proposedRTB:
      rtb.field.status === "Supplied"
        ? (currentPreparation(state, "reasonToBelieve")?.text ?? "")
        : `No adaptation carried forward. Upstream RTB: ${fieldText(rtb.field)}.`,
    research: currentPreparation(state, "research")?.text ?? "",
    selectedSparks,
    sparks: selectedSparks.map((spark) => spark.text).join("\n"),
    researchFocus: state.focus,
    preparationSource:
      "IMC brief → three preparation agents · Selected current outputs",
  };
}
export function validCurrentPreparation(
  state: PreparationState,
  id: PreparationAgentId,
  aiMode: "mock" | "live" = "mock",
) {
  const output = state.outputs.find((candidate) => candidate.agentId === id);
  const current = currentPreparation(state, id);
  if (!output || !current || output.error) return false;
  if (output.status === "pending" || output.status === "failed") return false;
  if (aiMode === "live" && current.provider === "mock") return false;
  if (!current.text.trim()) return false;
  if (id === "sparks")
    return (
      current.sparks.length === 6 &&
      current.sparks.every(
        (spark) =>
          spark.id &&
          (spark.idea || spark.text).trim() &&
          spark.excerpt_verified !== false,
      )
    );
  return true;
}

export function studioPreparationIssue(
  state: PreparationState,
  id: PreparationAgentId,
  aiMode: "mock" | "live" = "mock",
): string | undefined {
  const output = state.outputs.find((candidate) => candidate.agentId === id);
  const current = currentPreparation(state, id);
  if (!state.sourceSnapshot.trim()) return "No IMC brief has been built.";
  if (state.upstreamDraft.trim() !== state.sourceSnapshot.trim())
    return "The edited IMC brief has not been rebuilt.";
  if (!output) return "Not run.";
  if (output.status === "pending") return "Generation is still pending.";
  if (output.status === "failed" || output.error)
    return output.error || "Generation failed; retry this agent.";
  if (!current) return "No current version matches this IMC brief.";
  if (output.status !== "success" && output.status !== "mock")
    return "This version has not completed generation.";
  if (aiMode === "live" && current.provider === "mock")
    return "This is a demo output, not a live AI result.";
  if (!current.text.trim()) return "The generated output is empty.";
  if (id === "reasonToBelieve") {
    const parsed = outputSchemas.rtb.safeParse(current.data);
    if (!parsed.success) return "The RTB output is incomplete.";
    const original = resolveRtb(getUpstream(state)).field;
    if (
      original.status === "Supplied" &&
      parsed.data.originalRtb !== original.sourceValue
    )
      return "The original RTB does not match the current IMC brief.";
    return;
  }
  if (id === "research")
    return outputSchemas.research.safeParse(current.data).success
      ? undefined
      : "The research output is incomplete.";
  const parsed = outputSchemas.sparks.safeParse(current.data);
  if (!parsed.success || current.sparks.length !== 6)
    return "Six complete Sparks are required.";
  const issue = sparkSetIssue(
    {
      sparks: current.sparks.map((spark) => ({
        ...spark,
        title: spark.title ?? "",
        rationale: spark.rationale ?? "",
        campaignGrounding: spark.campaignGrounding ?? "",
        hypothesisToValidate: spark.hypothesisToValidate ?? "",
      })),
    },
    undefined,
    getParsedIMC(state),
  );
  if (issue) return issue;
  if (current.sparks.some((spark) => spark.excerpt_verified !== true))
    return "Every Spark excerpt must be verified against the current IMC brief.";
}

export function preparationReady(
  state: PreparationState,
  aiMode: "mock" | "live" = "mock",
) {
  const pack = compileInputPack(state);
  return (
    preparationAgents.every((agent) =>
      validCurrentPreparation(state, agent.id, aiMode),
    ) &&
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

// The Discovery Input Pack requires structured, source-verifiable V0 artifacts.
// Keep the older Creative-mode readiness contract for saved text-only versions.
export function studioPreparationReady(
  state: PreparationState,
  aiMode: "mock" | "live" = "mock",
) {
  const currentSparks = currentPreparation(state, "sparks");
  return (
    preparationReady(state, aiMode) &&
    !!currentSparks?.sparks.some((spark) =>
      state.selectedSparkIds.includes(spark.id),
    ) &&
    preparationAgents.every(
      (agent) => !studioPreparationIssue(state, agent.id, aiMode),
    )
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
    selectedContent,
  }: {
    agentId: PreparationAgentId;
    parsedIMC: import("./types").ParsedIMCBrief;
    previous: import("./types").PreparationVersion[];
    guidance: string;
    upstream: import("./types").UpstreamContext;
    currentVersion?: import("./types").PreparationVersion;
    selectedContent?: PreparationSelectedContent;
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
    const current =
      currentVersion ??
      previous.find((version) => version.sourceBrief === parsedIMC.sourceText);
    const existingSelection = selectedContent ?? { selectedSparks: [] };
    const response = await runAgent({
      agentType: agentId === "reasonToBelieve" ? "rtb" : agentId,
      context: { parsedIMC, upstream, selectedContent: existingSelection },
      guidance,
      versionNumber: number,
      ...(sparkRevision ? { sparkRevision } : {}),
      ...(agentId === "sparks"
        ? {
            sparkHistory: previous.slice(0, 50).map((version) => ({
              number: version.number,
              sparks: version.sparks.map((spark) => ({
                id: spark.id,
                title: spark.title,
                text: spark.text,
                territory_type: spark.territory_type,
                territory: spark.territory,
                idea: spark.idea,
              })),
            })),
          }
        : {}),
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
        : guidance ||
          (number === 1
            ? "Initial preparation from IMC brief"
            : "Prepared from current IMC brief"),
      createdAt: response.generatedAt,
      sourceBrief: parsedIMC.sourceText,
      inputContext: {
        sourceBrief: parsedIMC.sourceText,
        selectedContent: structuredClone(existingSelection),
        steeringText: guidance.trim(),
      },
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
