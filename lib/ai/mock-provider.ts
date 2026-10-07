import "server-only";
import { personas } from "../demo";
import { parseIMCBrief } from "../imc-parser";
import { fieldText, reconcileUpstream } from "../upstream";
import { mockPreparationService } from "./mock-preparation";
import { mockStrategyService, mockBriefService } from "./mock-strategy";
import { foundationPack } from "./context";
import type { AgentData, AgentRequest } from "./schemas";
import type { AgentVersion } from "../types";

export async function generateMock(request: AgentRequest): Promise<AgentData> {
  const { guidance = "", previousVersion } = request;
  const prior: AgentVersion[] = previousVersion
    ? [
        {
          number: (request.versionNumber ?? previousVersion.number + 1) - 1,
          text: previousVersion.text,
          id: "prior",
          guidance: "",
          createdAt: "",
        },
      ]
    : [];
  if ("parsedIMC" in request.context) {
    const parsedIMC = parseIMCBrief(request.context.parsedIMC.sourceText);
    const upstream = reconcileUpstream(parsedIMC, request.context.upstream);
    const version = await mockPreparationService.generate({
      agentId:
        request.agentType === "rtb"
          ? "reasonToBelieve"
          : (request.agentType as "research" | "sparks"),
      parsedIMC,
      upstream,
      guidance,
      previous: prior.map((v) => ({
        ...v,
        sourceBrief: parsedIMC.sourceText,
        sparks: [],
      })),
    });
    if (request.agentType === "rtb")
      return {
        originalRtb: parsedIMC.fields.reason_to_believe.value || null,
        originalRtbStatus: "supplied",
        xcAdaptation: version.text,
        adaptationStatus: "not_approved",
        reviewNotes: [],
        evidenceGaps: [],
      };
    if (request.agentType === "sparks")
      return {
        sparks: version.sparks.map((spark) => ({
          ...spark,
          title: "",
          rationale:
            "Exploratory idea starter; validate against the supplied campaign context.",
        })),
      };
    return {
      suppliedEvidence: [fieldText(upstream.fields.research)],
      audienceContext: [fieldText(upstream.fields.audience)],
      historicalPerformance: [
        "No connected performance data. Review any supplied evidence above; validate results with the source owner.",
      ],
      creativePerformance: ["No external creative testing results retrieved."],
      marketContext: [
        "No external category research retrieved. Validate supplied category observations before treating them as facts.",
      ],
      researchToValidate: [
        {
          source: "Tableau / Datorama",
          question: `Which historical results inform ${fieldText(upstream.fields.campaignName)} and ${fieldText(upstream.fields.objective)}?`,
        },
        {
          source: "iSpot / ACE",
          question:
            "Which creative responses and testing results are available?",
        },
        {
          source: "Brand Hub",
          question: "Which product claims and brand principles are approved?",
        },
        {
          source: "Product / Audience Research",
          question:
            "Which customer insights support this audience and product?",
        },
      ],
      evidenceGaps: [
        "All connectors are unconnected. No performance results are asserted.",
        ...["research", "substantiation"].map(
          (key) =>
            `${key}: ${fieldText(upstream.fields[key as "research" | "substantiation"])}`,
        ),
      ],
      sourceNotes: [
        `Upstream references: ${fieldText(upstream.fields.sourceReferences)}`,
        ...(prior.length
          ? [
              `REFINEMENT V${version.number}\nStrategist emphasis: ${guidance || "Refresh around supplied objectives and gaps."}`,
            ]
          : []),
      ],
    };
  }
  if (request.agentType === "synthesis")
    return {
      synthesizedLines: [
        {
          id: "synthesis-1",
          line: await mockStrategyService.synthesize({
            strategyInputPack: foundationPack(request.context.foundation),
            lines: request.context.lines,
            weights: request.context.weights,
          }),
          rationale:
            "Combines the selected perspectives using the requested weighting; requires human approval.",
        },
      ],
    };
  if (request.agentType === "finalBrief") {
    const p = foundationPack(request.context.foundation),
      e = request.context.executionDirection,
      a = request.context.approvedStrategy;
    // Retain the existing deterministic final-brief helper for mock compatibility.
    await mockBriefService.generateXCBrief({
      strategyInputPack: p,
      executionDirection: e,
      approvedBriefLine: { ...a, strategyInputPack: p },
    });
    return {
      campaign: p.campaignName,
      objective: p.objective,
      reasonToBelieve: p.reasonToBelieve,
      audience: p.audience,
      approvedStrategy: a.briefLine,
      messagingDirection: [e.messaging],
      supportingEvidence: [p.research],
      creativeDirection: e.creativeDirection || "Not supplied.",
      requiredAssets: [`${e.assetCount} assets — ${e.requiredAssets}`],
      channels: [e.channels],
      requirements: [e.copy],
      constraints: [e.constraints, p.constraints].filter(Boolean),
      disclaimers: [fieldText(p.upstream!.fields.disclaimers)],
      approvalNotes: [
        `Strategy explicitly approved by ${a.approvedBy} at ${a.approvedAt}.`,
        `Source: ${a.source}`,
      ],
    };
  }
  const persona = personas.find((p) => p.id === request.agentType)!;
  const pack = foundationPack(request.context);
  const version = prior.length
    ? await mockStrategyService.refine(persona, pack, prior, guidance)
    : (await mockStrategyService.generatePerspectives(pack)).find(
        (o) => o.agentId === persona.id,
      )!.versions[0];
  return {
    briefLines: [
      { id: version.id, line: version.text, rationale: persona.thinking },
    ],
    perspectiveSummary: persona.role,
  };
}
