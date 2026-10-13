import { reconcileUpstream, sourceContext, fieldText } from "../upstream";
import { researchSources } from "../preparation";
import { mockSparks } from "./mock-sparks";
import type {
  PreparationAgentId,
  ParsedIMCBrief,
  PreparationVersion,
  UpstreamContext,
} from "../types";
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
export const mockPreparationService: PreparationService = {
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
      : 1;
    const audience =
      source.fields.audience.status === "Supplied"
        ? context.audience
        : "the priority audience (confirm from the brief)";
    let text = "";
    let sparks: PreparationVersion["sparks"] = [];
    if (agentId === "reasonToBelieve") {
      const original = source.fields.originalRTB;
      text =
        original.status === "Supplied"
          ? `Proposed XC framing: connect the supplied RTB to the needs of ${audience}. Explore an everyday moment that makes the existing proof meaningful. Preserve the upstream message hierarchy and approved claims.\n\nProposal only — no upstream approval is granted by this agent or by Kevin’s brief-line approval.`
          : `Upstream RTB: ${fieldText(original)}.\n\nNo replacement RTB has been generated. Preserve this upstream decision; clarify with the GTM owner if a change is needed.`;
    }
    if (agentId === "research")
      text = [
        `SUPPLIED EVIDENCE\n${fieldText(source.fields.research)}`,
        `AUDIENCE CONTEXT\n${fieldText(source.fields.audience)}`,
        "HISTORICAL / CREATIVE PERFORMANCE\nNo connected performance data. Review any supplied evidence above; validate results and applicability with the source owner.",
        "MARKET / CATEGORY CONTEXT\nNo external category research retrieved. Validate any category observations in the supplied brief before treating them as facts.",
        `RESEARCH TO VALIDATE\nCampaign: ${fieldText(source.fields.campaignName)}\nObjective: ${fieldText(source.fields.objective)}\nProduct: ${fieldText(source.fields.product)}\nConfirm audience needs, approved product proof and evidence relevant to this objective.`,
        `EVIDENCE GAPS\n${[
          "research",
          "audience",
          "originalRTB",
          "substantiation",
        ]
          .map((key) => {
            const field = source.fields[key as keyof typeof source.fields];
            return `${key === "originalRTB" ? "Upstream RTB" : key}: ${field.status}${field.status === "Supplied" ? " — source validation required" : ""}`;
          })
          .join(
            "\n",
          )}\nAll connectors are unconnected. No performance results are asserted.`,
        `SOURCE NOTES\nUpstream references: ${fieldText(source.fields.sourceReferences)}\n${researchSources.map((s) => `${s.name}: ${s.purpose} — Not connected`).join("\n")}`,
      ].join("\n\n");
    if (agentId === "sparks") {
      sparks = mockSparks(source, previous[0]?.text);
      text = sparks.map((spark, i) => `${i + 1}. ${spark.text}`).join("\n\n");
    }
    if (agentId !== "sparks" && previous.length > 0)
      text += `\n\nREFINEMENT V${number}\n${guidance ? `Strategist emphasis: ${guidance}` : "Refresh the framing around the supplied objective and evidence gaps."}\nKeep this emphasis tied to the evidence above; validate any additional claims.`;
    return {
      id: crypto.randomUUID(),
      number,
      text,
      guidance:
        guidance ||
        (number === 1
          ? "Initial preparation from IMC brief"
          : "Prepared from current IMC brief"),
      createdAt: new Date().toISOString(),
      sourceBrief: parsedIMC.sourceText,
      sparks,
    };
  },
};
