import { personas } from "./demo";
import { runAgent } from "./ai/client";
import { selectedFoundation } from "./ai/context";
import { renderBrief } from "./ai/format";
import type { AgentType } from "./ai/schemas";
import {
  defaultPersonality,
  type PersonalitySettings,
} from "./creative-controls";
import type {
  AgentOutput,
  AgentPersona,
  AgentVersion,
  BriefPayload,
  StrategyInputPack,
  SynthesisRequest,
} from "./types";

type PerspectiveType = Extract<
  AgentType,
  "humor" | "culture" | "audience" | "market" | "brand"
>;
async function perspective(
  persona: AgentPersona,
  pack: StrategyInputPack,
  versions: AgentVersion[],
  guidance: string,
  currentVersion?: AgentVersion,
  personality: PersonalitySettings = defaultPersonality(),
  refinementMode: "explore" | "improve" = "explore",
): Promise<AgentVersion> {
  const number = versions.length
    ? Math.max(...versions.map((v) => v.number)) + 1
    : 0;
  const current = currentVersion ?? versions[0];
  const direction = guidance.trim();
  const response = await runAgent({
    agentType: persona.id as PerspectiveType,
    context: selectedFoundation(pack),
    guidance: direction,
    versionNumber: number,
    personality: { ...personality },
    refinementMode,
    priorCandidates: versions.slice(0, 50).map((v) => v.text),
    ...(current
      ? {
          previousVersion: {
            number: current.number,
            text: current.text,
            ...(current.data ? { data: current.data } : {}),
          },
        }
      : {}),
  });
  return {
    ...response,
    id: crypto.randomUUID(),
    number,
    text: response.data.briefLines[0].line,
    guidance:
      direction ||
      (current
        ? "New direction without additional guidance"
        : "Initial perspective"),
    createdAt: response.generatedAt,
  };
}
export const strategyService = {
  async generatePerspectives(
    pack: StrategyInputPack,
    onResult?: (output: AgentOutput) => void,
  ): Promise<AgentOutput[]> {
    return Promise.all(
      personas.map(async (persona) => {
        let output: AgentOutput;
        try {
          const version = await perspective(persona, pack, [], "");
          output = {
            agentId: persona.id,
            versions: [version],
            currentVersionId: version.id,
            personality: defaultPersonality(),
            steeringText: "",
          };
        } catch (error) {
          output = {
            agentId: persona.id,
            versions: [],
            currentVersionId: "",
            personality: defaultPersonality(),
            steeringText: "",
            error:
              error instanceof Error
                ? error.message
                : "This perspective failed. Please retry.",
          };
        }
        onResult?.(output);
        return output;
      }),
    );
  },
  refine: perspective,
  synthesize(request: SynthesisRequest) {
    return runAgent({
      agentType: "synthesis",
      context: {
        foundation: selectedFoundation(request.strategyInputPack),
        lines: request.lines,
        weights: request.weights,
      },
    });
  },
};
export async function generateXCBrief(payload: BriefPayload) {
  const approved = payload.approvedBriefLine;
  if (
    !approved.approvedAt ||
    !approved.briefLine.trim() ||
    approved.approvedBy !== "Kevin"
  )
    throw new Error("Explicit strategy approval is required.");
  // Always use the approved snapshot, even if an unrelated working pack later changes.
  const strategyInputPack = approved.strategyInputPack;
  const response = await runAgent({
    agentType: "finalBrief",
    context: {
      foundation: selectedFoundation(strategyInputPack),
      approvedStrategy: {
        briefLine: approved.briefLine,
        approvedBy: approved.approvedBy,
        approvedAt: approved.approvedAt,
        source: approved.source,
        approvalState: "Approved",
      },
      executionDirection: payload.executionDirection,
    },
  });
  return renderBrief(response, { ...payload, strategyInputPack });
}
