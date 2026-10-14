import { discoverySourceDocuments } from "../discovery-sources";
import type { AgentData, AgentRequest } from "./schemas";

export function validateDiscoveryEvidence(
  request: Extract<AgentRequest, { agentType: "discovery" }>,
  data: AgentData,
) {
  if (!("findings" in data)) return "The response did not contain findings.";
  const sources = discoverySourceDocuments(request.context.foundation);
  for (const [index, finding] of data.findings.entries()) {
    if (
      finding.evidenceState === "evidence_supported" &&
      !finding.evidence.length
    )
      return `Finding ${index + 1} is labeled evidence-supported but has no evidence.`;
    if (finding.evidenceState === "research_gap" && finding.evidence.length)
      return `Finding ${index + 1} is a research gap but presents evidence as a finding.`;
    for (const evidence of finding.evidence) {
      if (evidence.accessScope !== "supplied")
        return `Finding ${index + 1} claims access to a source that is not connected.`;
      const matches = sources.filter((source) =>
        [source.identity, ...source.aliases].some(
          (name) => name.toLowerCase() === evidence.source.toLowerCase(),
        ),
      );
      const verified = matches.find(
        (source) =>
          evidence.excerpt.trim() && source.text.includes(evidence.excerpt),
      );
      if (!verified)
        return `Finding ${index + 1} includes an excerpt or source identity that cannot be verified in the current Input Pack. Use an exact original-source excerpt or return a research gap.`;
      if (evidence.locator && evidence.locator !== verified.locator)
        return `Finding ${index + 1} has an unsupported source locator. Use ${verified.locator} or leave it empty.`;
      if (
        evidence.date !== "Not supplied" &&
        !verified.text.includes(evidence.date)
      )
        return `Finding ${index + 1} invents a source date; use Not supplied.`;
      if (
        evidence.audience !== "Not supplied" &&
        evidence.audience !==
          request.context.foundation.campaignContext.audience &&
        !verified.text.includes(evidence.audience)
      )
        return `Finding ${index + 1} invents source audience metadata.`;
    }
  }
  return "";
}
