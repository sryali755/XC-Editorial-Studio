import { AgentError } from "./errors";
import type { AgentRequest } from "./schemas";
import { exactGroundingExcerpt } from "./spark-quality";
import { validateConnectionFindingEvidenceForFoundation } from "../discovery-connection-evidence";
import { discoveryFoundationVersion } from "../discovery-context";
import { discoverySourceDocuments } from "../discovery-sources";
import { detectIMCCampaignScopes } from "../imc-campaign-scope";
import { parseIMCBrief } from "../imc-parser";
import { usableCampaignName } from "../campaign-identity";
import { campaignIdentityIssue } from "../campaign-naming";
import {
  sourceCampaignNames,
  sourceJobContext,
  sourceParentPlatform,
} from "../imc-source-context";
import {
  extractUpstream,
  fieldText,
  resolveRtb,
  sourceContext,
  upstreamFields,
} from "../upstream";

// The browser sends extracted text, not authenticated PDF bytes. This checks
// internal consistency with that received text; it cannot certify the upload.
type DiscoveryFoundation = Extract<
  AgentRequest,
  { agentType: "discovery" }
>["context"]["foundation"];
function foundationIssue(foundation: DiscoveryFoundation): string | undefined {
  const source = foundation.sourceBrief ?? "";
  if (!source.trim())
    return "The current selected IMC brief is missing. Rebuild the Input Pack before running Discovery.";
  if (detectIMCCampaignScopes(source).length > 1)
    return "The request contains multiple campaigns. Select one campaign in the Input Pack before running Discovery.";

  // Manually supplied files are legitimate context, but they cannot reuse
  // source identities/locators reserved for the submitted IMC brief.
  const reservedNames = new Set(
    [
      "IMC brief",
      "Supplied IMC brief",
      "Original RTB",
      "Reason to Believe",
      "Original upstream research",
      "Supplied IMC source — original research",
      ...[
        "campaignName",
        "objective",
        "audience",
        "product",
        "channel",
        "constraints",
        "jobToBeDone",
      ].map((key) => `IMC brief — ${key}`),
      ...discoverySourceDocuments({
        ...foundation,
        suppliedEvidence: [],
      }).flatMap((item) => [item.identity, ...item.aliases]),
    ].map((name) => name.trim().toLowerCase()),
  );
  for (const evidence of foundation.suppliedEvidence ?? []) {
    if (
      /^imc:/i.test(evidence.locator.trim()) ||
      reservedNames.has(evidence.source.trim().toLowerCase()) ||
      /^imc brief\s*[—-]\s*(?:source (?:page|slide)\s+\d+|lines\s+\d+[–-]\d+)$/i.test(
        evidence.source.trim(),
      )
    )
      return `Manually supplied evidence ${evidence.id} uses an IMC source identity or locator. Give it its own source name and location before running Discovery.`;
  }

  for (const source of foundation.sourceAvailability ?? []) {
    if (
      source.status === "connected_searched" ||
      source.status === "available_not_searched" ||
      source.status === "search_failed"
    )
      return `${source.source} claims external availability or a search attempt that this prototype has not performed. Mark it not connected or attach the original document as supplied evidence.`;
    if (
      (source.status === "supplied_analyzed" ||
        source.status === "supplied_not_analyzed") &&
      source.source !== "Supplied IMC brief" &&
      !(foundation.suppliedEvidence ?? []).some(
        (evidence) => evidence.source === source.source && evidence.text.trim(),
      )
    )
      return `${source.source} is marked supplied but has no matching supplied source document in this Input Pack.`;
  }

  const extracted = extractUpstream(source);
  for (const { key, label } of upstreamFields) {
    // Human-reviewed values and statuses may differ; sourceValue may not.
    if (
      foundation.requirements.fields[key].sourceValue !==
      extracted.fields[key].sourceValue
    )
      return `${label} does not match the selected IMC source text. Rebuild the Input Pack before running Discovery.`;
    const reviewed = foundation.requirements.fields[key];
    const submittedMetadata = reviewed as typeof reviewed & {
      present?: boolean;
      occurrences?: string[];
    };
    const originalMetadata = extracted.fields[key] as typeof reviewed & {
      present?: boolean;
      occurrences?: string[];
    };
    if (
      (submittedMetadata.present !== undefined &&
        submittedMetadata.present !== originalMetadata.present) ||
      (submittedMetadata.occurrences !== undefined &&
        JSON.stringify(submittedMetadata.occurrences) !==
          JSON.stringify(originalMetadata.occurrences))
    )
      return `${label} source occurrence metadata does not match the selected IMC brief. Rebuild the Input Pack before running Discovery.`;
    if (
      reviewed.status === "Supplied" &&
      reviewed.value !== reviewed.sourceValue &&
      reviewed.value.trim() &&
      !source.includes(reviewed.value)
    )
      return `${label} is marked as supplied but its edited wording is not in the selected IMC source text. Mark it for clarification or cite supplied evidence before running Discovery.`;
  }

  const expectedContext = sourceContext(foundation.requirements);
  const sourceNames = sourceCampaignNames(parseIMCBrief(source));
  if (sourceNames.length > 1)
    return "The selected IMC source contains conflicting campaign titles. Select one campaign before running Discovery.";
  expectedContext.campaignName = sourceNames[0] ?? "";
  if (foundation.campaignIdentity?.id) {
    const identityIssue = campaignIdentityIssue(
      source,
      foundation.campaignContext.campaignName,
      foundation.campaignIdentity,
    );
    if (identityIssue) return identityIssue;
    expectedContext.campaignName =
      foundation.campaignIdentity.displayName || "";
  } else if (
    !sourceNames.length &&
    foundation.campaignIdentity?.origin === "human_confirmed"
  ) {
    if (
      !usableCampaignName(foundation.campaignContext.campaignName) ||
      !foundation.campaignIdentity.confirmedAt ||
      foundation.campaignIdentity.sourceReference !==
        "Human-confirmed campaign name; not extracted from the IMC brief."
    )
      return "Confirm a missing campaign name explicitly as human metadata, not as extracted IMC content.";
    expectedContext.campaignName = foundation.campaignContext.campaignName;
  }
  if (
    !foundation.campaignIdentity?.id &&
    sourceNames.length &&
    foundation.campaignIdentity?.origin === "human_confirmed"
  )
    return "A human-confirmed campaign name cannot replace identity supplied in the selected IMC brief.";
  for (const key of [
    "campaignName",
    "objective",
    "audience",
    "product",
    "channel",
    "constraints",
  ] as const) {
    if (foundation.campaignContext[key] !== expectedContext[key])
      return `${key} conflicts with the Input Pack's structured source fields. Rebuild the Input Pack before running Discovery.`;
  }

  const jobs = sourceJobContext(source);
  const explicitJtbd = jobs.original.map((record) => record.text).join("\n\n");
  const submittedJtbd = foundation.campaignContext.jobToBeDone?.trim() ?? "";
  if (submittedJtbd !== explicitJtbd)
    return "The original JTBD conflicts with the selected IMC source text. Rebuild the Input Pack before running Discovery.";
  if (
    foundation.jtbdContext &&
    JSON.stringify(foundation.jtbdContext) !== JSON.stringify(jobs)
  )
    return "The original/proposed JTBD source records or approval states conflict with the selected IMC brief.";
  if (
    foundation.parentPlatform &&
    JSON.stringify(foundation.parentPlatform) !==
      JSON.stringify(sourceParentPlatform(source))
  )
    return "The parent platform conflicts with the selected IMC source text.";

  const resolvedRtb = resolveRtb(foundation.requirements);
  const originalRtb =
    resolvedRtb.field.status === "Supplied"
      ? resolvedRtb.field.sourceValue
      : fieldText(resolvedRtb.field);
  if (
    foundation.currentRtb.original !== originalRtb ||
    foundation.currentRtb.status !== resolvedRtb.field.status ||
    foundation.currentRtb.approvalStatus !== resolvedRtb.approvalStatus
  )
    return "The original RTB or its GTM approval status conflicts with the selected IMC source fields. Rebuild the Input Pack before running Discovery.";

  for (const spark of foundation.selectedSparks) {
    // An excerpt is a source claim. Older selections without one remain
    // usable, but must never be represented as excerpt-verified evidence.
    const excerpt = spark.excerpt || spark.campaignGrounding || "";
    if (
      (excerpt || spark.excerpt_verified === true) &&
      !exactGroundingExcerpt(excerpt, source)
    )
      return `Selected Spark ${spark.id} quotes text outside the selected IMC brief. Reselect the Spark before running Discovery.`;
  }
  return undefined;
}

export function discoverySubmissionIssue(
  request: AgentRequest,
): string | undefined {
  if (request.agentType !== "discovery" && request.agentType !== "connections")
    return undefined;
  const current = request.context.foundation;
  const issue = foundationIssue(current);
  if (issue) return issue;
  if (request.agentType === "discovery") {
    const currentVersion = discoveryFoundationVersion(current);
    if (
      request.context.conversation &&
      request.context.conversation.scope.inputPackVersion !== currentVersion
    )
      return "The conversation belongs to an earlier Input Pack version. Its history is preserved; start a current scoped turn.";
    const findings = [
      ...(request.context.selectedFinding
        ? [
            {
              label: "Selected finding",
              finding: request.context.selectedFinding,
            },
          ]
        : []),
      ...request.context.previousFindings.map((finding, index) => ({
        label: `Previous finding ${index + 1}`,
        finding,
      })),
      ...(request.context.peerFindings ?? []).map((finding, index) => ({
        label: `Peer finding ${index + 1}`,
        finding,
      })),
    ];
    for (const { label, finding } of findings) {
      if (finding.inputPackVersion !== currentVersion)
        return `${label} belongs to another Input Pack version. Use only findings from the current campaign context; earlier versions remain in history.`;
      const evidenceIssue = validateConnectionFindingEvidenceForFoundation(
        current,
        [finding],
      );
      if (evidenceIssue) return `${label}: ${evidenceIssue}`;
    }
  }
  if (request.agentType === "connections") {
    for (const [index, finding] of request.context.findings.entries()) {
      const historical = request.context.sourceFoundations?.[index] ?? current;
      const historicalIssue = foundationIssue(historical);
      if (historicalIssue)
        return `Selected finding ${index + 1}: ${historicalIssue}`;
      if (historical.sourceBrief !== current.sourceBrief)
        return `Selected finding ${index + 1} belongs to another campaign. Compare findings from the selected campaign only.`;
      const evidenceIssue = validateConnectionFindingEvidenceForFoundation(
        historical,
        [finding],
      );
      if (evidenceIssue)
        return `Selected finding ${index + 1}: ${evidenceIssue}`;
    }
  }
  return undefined;
}

export async function runValidatedAgentRequest<T>(
  request: AgentRequest,
  invoke: (request: AgentRequest) => Promise<T>,
): Promise<T> {
  const issue = discoverySubmissionIssue(request);
  if (issue)
    throw new AgentError(issue, 422, "discovery_submission_mismatch", false);
  return invoke(request);
}
