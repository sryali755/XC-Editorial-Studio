import "server-only";
import { mockPerspective } from "./mock-perspective";
import { parseIMCBrief } from "../imc-parser";
import { fieldText, reconcileUpstream, resolveRtb } from "../upstream";
import { mockPreparationService } from "./mock-preparation";
import { mockStrategyService, mockBriefService } from "./mock-strategy";
import { foundationPack } from "./context";
import {
  isPerspectiveRequest,
  outputSchemas,
  type AgentData,
  type AgentRequest,
} from "./schemas";
import type { AgentVersion } from "../types";
import { mockConnections, mockDiscovery } from "./mock-discovery";

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
  if (
    request.agentType === "rtb" ||
    request.agentType === "research" ||
    request.agentType === "sparks"
  ) {
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
      return (() => {
        const resolved = resolveRtb(upstream);
        return {
          originalRtb: resolved.field.sourceValue || null,
          originalRtbStatus:
            resolved.field.status === "Supplied"
              ? "supplied"
              : resolved.field.status === "Intentionally excluded"
                ? "intentionally_excluded"
                : "not_supplied",
          originalRtbApprovalStatus: resolved.approvalStatus,
          xcAdaptation: version.text,
          proposedJTBD:
            upstream.fields.audience.status === "Supplied" &&
            upstream.fields.objective.status === "Supplied"
              ? "When I consider the offer described in this brief, I want to understand its benefits and requirements, so I can decide whether it fits my needs."
              : null,
          adaptationStatus: "not_approved",
          reviewNotes: resolved.approvalNote ? [resolved.approvalNote] : [],
          evidenceGaps:
            upstream.fields.audience.status !== "Supplied" ||
            upstream.fields.objective.status !== "Supplied"
              ? ["Audience and objective context are needed to propose a JTBD."]
              : [],
        };
      })();
    if (request.agentType === "sparks") {
      const previousSparks = outputSchemas.sparks.safeParse(
        previousVersion?.data,
      );
      return {
        sparks: version.sparks.map((spark, index) => ({
          ...spark,
          ...(previousSparks.success
            ? {
                id: previousSparks.data.sparks[index].id,
                territory_type:
                  previousSparks.data.sparks[index].territory_type ??
                  spark.territory_type,
              }
            : {}),
          title: spark.title ?? "",
          rationale:
            spark.rationale ??
            "Mock creative hypothesis; validate against supplied context.",
          campaignGrounding:
            spark.campaignGrounding ??
            `Campaign: ${fieldText(upstream.fields.campaignName)}`,
          hypothesisToValidate:
            spark.hypothesisToValidate ??
            "Validate this creative hypothesis with the intended audience.",
        })),
      };
    }
    return {
      campaignName: fieldText(upstream.fields.campaignName),
      objectives: fieldText(upstream.fields.objective),
      audience: fieldText(upstream.fields.audience),
      productInformation: fieldText(upstream.fields.product),
      suppliedEvidence: [
        `Research (${upstream.fields.research.status}; not independently verified): ${fieldText(upstream.fields.research)}`,
        `Supporting evidence (${upstream.fields.substantiation.status}; not independently verified): ${fieldText(upstream.fields.substantiation)}`,
      ],
      verifiedEvidence: [],
      illustrativeAssumptions:
        /\b(?:illustrative|hypothesis|assumption|proposed)\b/i.test(
          upstream.fields.research.sourceValue,
        )
          ? [upstream.fields.research.sourceValue]
          : [],
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
  if (request.agentType === "discovery") return mockDiscovery(request);
  if (request.agentType === "connections") return mockConnections(request);
  if (request.agentType === "strategySuggestions") {
    const context = request.context;
    const clip = (value: string, fallback: string) =>
      (value.trim() || fallback)
        .replace(/\s+/g, " ")
        .replace(/[.;:]$/, "")
        .slice(0, 110);
    const campaign = (context.campaignName.trim() || "this campaign").slice(
      0,
      110,
    );
    const audience = clip(context.audience, "the intended audience");
    const objective = clip(context.objective, "the supplied objective");
    const rtb = clip(context.originalRtb, "the brief's supplied proof");
    const selected = context.sparkInputs[0];
    const evidenceIds = context.sourceExcerpts
      .slice(0, 2)
      .map((source) => source.id);
    const rtbSource = context.sourceExcerpts.find((source) =>
      /reason.to.believe|rtb/i.test(source.label),
    );
    const findingLinks = (index: number, use: string) => {
      if (!context.savedFindings.length) return [];
      const finding =
        context.savedFindings[index % context.savedFindings.length];
      return finding
        ? [
            {
              findingId: finding.id,
              contribution: `The saved finding “${finding.title}” raises ${clip(finding.whatWeFound, "an unresolved audience question")}. This direction ${use}; treat the finding as ${finding.evidenceState === "research_gap" ? "an unverified research gap" : "an interpretation of supplied sources"}.`,
            },
          ]
        : [];
    };
    return {
      suggestions: [
        {
          briefLine: `Give ${audience} a reason to see ${campaign} as relevant to ${objective}.`,
          rationale: `Demo-only strategic framing drawn from the IMC objective and audience; it is not a verified result.`,
          evidenceIds,
          sparkIds: [],
          findingLinks: findingLinks(0, "focuses on that audience question"),
          validationGap: `Check which part of ${objective} matters most to ${audience}.`,
        },
        {
          briefLine: `Make ${campaign} answer the audience's most important barrier to ${objective}.`,
          rationale: `Demo-only barrier framing${selected ? ` inspired by the selected Spark “${selected.title}”` : ""}. The source brief does not prove which barrier dominates.`,
          evidenceIds,
          sparkIds: selected ? [selected.id] : [],
          findingLinks: findingLinks(1, "tests it as a possible barrier"),
          validationGap: `Identify the actual barrier in audience research before treating this as an insight.`,
        },
        {
          briefLine: `Connect ${campaign}'s supplied reason to believe to ${audience}'s decision about ${objective}.`,
          rationale: `Demo-only proof framing using the supplied RTB: ${rtb}. Approval remains ${context.rtbApprovalStatus}.`,
          evidenceIds: rtbSource ? [rtbSource.id] : evidenceIds,
          sparkIds: [],
          findingLinks: findingLinks(
            2,
            "asks whether the supplied proof responds to it",
          ),
          validationGap: `Verify that the supplied proof is approved and meaningful to ${audience}.`,
        },
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
  if (isPerspectiveRequest(request)) return mockPerspective(request);
  throw new Error("Unsupported mock agent.");
}
