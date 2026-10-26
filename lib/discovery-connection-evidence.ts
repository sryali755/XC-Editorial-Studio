import { discoveryFoundation } from "./discovery-context";
import {
  discoverySourceDocuments,
  isLegacyDiscoveryLocator,
  isSpecificDiscoveryLocator,
  locatedDiscoveryCitation,
  sourceIdentityMatches,
} from "./discovery-sources";
import { originalSourceExcerpt } from "./source-registry";
import type { DiscoveryFinding, StrategyInputPack } from "./types";
import type { Foundation } from "./ai/schemas";
import { unsupportedDiscoveryFactualAssertion } from "./ai/discovery-evidence";

// A generated connection can only reason over original-source excerpts already
// eligible in the supplied pack. A research gap has no positive evidence.
export function validateConnectionFindingEvidence(
  pack: StrategyInputPack,
  findings: DiscoveryFinding[],
): string {
  return validateConnectionFindingEvidenceForFoundation(
    discoveryFoundation(pack),
    findings,
  );
}

export function validateConnectionFindingEvidenceForFoundation(
  foundation: Foundation,
  findings: DiscoveryFinding[],
): string {
  const sources = discoverySourceDocuments(foundation);
  for (const finding of findings) {
    if (
      finding.evidenceState === "evidence_supported" &&
      !finding.evidence.length
    )
      return `${finding.title} claims evidence support but has no source excerpt.`;
    if (finding.evidenceState === "research_gap" && finding.evidence.length)
      return `${finding.title} is a research gap and cannot assert evidence.`;
    const unsupported = unsupportedDiscoveryFactualAssertion(finding);
    if (unsupported)
      return `${finding.title} contains an ${unsupported}; review the original-source excerpt before comparison.`;
    for (const evidence of finding.evidence) {
      if (evidence.accessScope !== "supplied")
        return `${finding.title} cites a source that is not supplied and accessible.`;
      const excerptExists = sources.some(
        (candidate) =>
          sourceIdentityMatches(candidate, evidence) &&
          evidence.excerpt.trim() &&
          originalSourceExcerpt(candidate.text, evidence.excerpt),
      );
      if (!excerptExists)
        return `${finding.title} includes an excerpt or source identity that cannot be verified in the supplied Input Pack.`;
      if (!isSpecificDiscoveryLocator(evidence.locator))
        return isLegacyDiscoveryLocator(evidence.locator)
          ? `${finding.title} has a legacy or missing source location that needs review before comparison.`
          : `${finding.title} has an unsupported source locator.`;
      const source = locatedDiscoveryCitation(sources, evidence);
      if (!source) return `${finding.title} has an unsupported source locator.`;
      if (
        evidence.date !== "Not supplied" &&
        evidence.date !== source.date &&
        !source.text.includes(evidence.date)
      )
        return `${finding.title} cites an unsupported source date.`;
      if (
        evidence.audience !== "Not supplied" &&
        evidence.audience !== source.audience &&
        !source.text.includes(evidence.audience)
      )
        return `${finding.title} cites unsupported audience metadata.`;
    }
  }
  return "";
}
