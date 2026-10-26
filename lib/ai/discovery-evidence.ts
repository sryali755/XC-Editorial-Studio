import {
  discoverySourceDocuments,
  locatedDiscoveryCitation,
  resolveDiscoveryCitation,
  sourceIdentityMatches,
} from "../discovery-sources";
import { originalSourceExcerpt } from "../source-registry";
import type { AgentData, AgentRequest } from "./schemas";
import { crossLensIssue } from "../discovery-lens-quality";

export function unsupportedDiscoveryFactualAssertion(
  finding: Extract<AgentData, { findings: unknown }>["findings"][number],
) {
  const excerpts = finding.evidence.map((evidence) => evidence.excerpt);
  // Exact source quotations can be checked deterministically. They do not
  // certify the source's independent truth, or surrounding model prose.
  // A research-gap label also cannot launder an invented quote or statistic:
  // its empty evidence array gives those assertions no source support.
  const surfaces: [string, string][] = [
    ["title", finding.title],
    ["whatWeFound", finding.whatWeFound],
    ["whyItMayMatter", finding.whyItMayMatter],
    ["whatComplicatesIt", finding.whatComplicatesIt],
    ["questionToExplore", finding.questionToExplore],
    ...finding.evidence.map((evidence, index): [string, string] => [
      `evidence[${index}].context`,
      evidence.context,
    ]),
  ];
  for (const [field, surface] of surfaces) {
    for (const quote of surface.matchAll(
      /(?:[“"]([^”"]{3,})[”"]|‘([^’]{3,})’)/g,
    )) {
      const quotedText = quote[1] ?? quote[2];
      if (
        !excerpts.some((excerpt) => originalSourceExcerpt(excerpt, quotedText))
      ) {
        // Identify the actual defect for the bounded repair, without logging
        // the response or relaxing quotation checks in interpretation fields.
        // The model receives this escaped preview only as untrusted input data.
        const preview = JSON.stringify(
          quotedText.length > 140 ? `${quotedText.slice(0, 140)}…` : quotedText,
        );
        return `unsupported customer or source quotation in the finding text (${field}; phrase ${preview})`;
      }
    }
    // A number elsewhere in a source cannot validate a new numerical claim.
    // Only an exact source sentence may be presented as a sourced statistic.
    const sentences = surface.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (
        /(?:\b(?:\d+(?:\.\d+)?\s*(?:%|percent\b|percentage points?\b|in\s+\d+\b|out of\s+\d+\b)|(?:one|two|three|four|five|six|seven|eight|nine)\s+in\s+(?:ten|\d+))|\$\s*\d+(?:\.\d+)?)(?!\w)/i.test(
          sentence,
        ) &&
        !excerpts.some((excerpt) =>
          originalSourceExcerpt(excerpt, sentence.trim()),
        )
      )
        return `unsupported quantified assertion in the finding text (${field})`;
    }
  }
  return "";
}

// Date and audience metadata the model cannot support are replaced with the
// source's own values. Source locators are citation identity and must instead
// survive unchanged so validation can reject an unsupported attribution.
export function normalizeDiscoveryEvidenceMetadata(
  request: Extract<AgentRequest, { agentType: "discovery" }>,
  data: AgentData,
): AgentData {
  if (!("findings" in data)) return data;
  const sources = discoverySourceDocuments(request.context.foundation);
  return {
    ...data,
    findings: data.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((evidence) => {
        const resolved = resolveDiscoveryCitation(sources, evidence);
        const verified = resolved?.source;
        if (!verified || evidence.accessScope !== "supplied") return evidence;
        const audienceOk =
          evidence.audience === "Not supplied" ||
          evidence.audience === verified.audience ||
          verified.text.includes(evidence.audience);
        const dateOk =
          evidence.date === "Not supplied" ||
          evidence.date === verified.date ||
          verified.text.includes(evidence.date);
        return {
          ...evidence,
          ...(resolved &&
          (resolved.method === "format_normalized" ||
            evidence.source === verified.documentId ||
            evidence.locator === verified.passageId)
            ? {
                source: verified.identity,
                locator: verified.locator,
                excerpt: resolved.excerpt,
                documentId: verified.documentId,
                passageId: verified.passageId,
                matchMethod: resolved.method,
              }
            : {}),
          audience: audienceOk
            ? evidence.audience
            : (verified.audience ?? "Not supplied"),
          date: dateOk ? evidence.date : (verified.date ?? "Not supplied"),
        };
      }),
    })),
  };
}

export function validateDiscoveryEvidence(
  request: Extract<AgentRequest, { agentType: "discovery" }>,
  data: AgentData,
) {
  if (!("findings" in data)) return "The response did not contain findings.";
  if (request.context.action === "another_answer" && data.findings.length !== 1)
    return "Another answer must return exactly one distinct finding.";
  if (!request.context.preparationRole) {
    const overlap = crossLensIssue(
      request.context.lens,
      data.findings,
      request.context.peerFindings ?? [],
    );
    if (overlap) return overlap;
  }
  if (request.context.action === "another_answer") {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const finding = data.findings[0];
    if (
      request.context.previousFindings.some(
        (previous) =>
          normalize(previous.title) === normalize(finding.title) ||
          normalize(previous.whatWeFound) === normalize(finding.whatWeFound),
      )
    )
      return "This answer repeats a previous finding. Return a materially different angle or a specific new research question; do not invent evidence.";
  }
  const sources = discoverySourceDocuments(request.context.foundation);
  for (const [index, finding] of data.findings.entries()) {
    if (
      finding.evidenceState === "evidence_supported" &&
      !finding.evidence.length
    )
      return `Finding ${index + 1} is labeled evidence-supported but has no evidence.`;
    if (finding.evidenceState === "research_gap" && finding.evidence.length)
      return `Finding ${index + 1} is a research gap but presents evidence as a finding.`;
    for (const [evidenceIndex, evidence] of finding.evidence.entries()) {
      if (evidence.accessScope !== "supplied")
        return `Finding ${index + 1} claims access to a source that is not connected.`;
      const path = `findings[${index}].evidence[${evidenceIndex}]`;
      const matches = sources.filter((source) =>
        sourceIdentityMatches(source, evidence),
      );
      const excerptMatches = matches.filter(
        (source) =>
          evidence.excerpt.trim() &&
          originalSourceExcerpt(source.text, evidence.excerpt),
      );
      if (!excerptMatches.length)
        return `Finding ${index + 1} includes an excerpt or source identity that cannot be verified in the current Input Pack (${path}.${matches.length ? "excerpt" : "source"}). Use a registered document/passage reference and an original-source excerpt or return a research gap.`;
      if (!evidence.locator?.trim())
        return `Finding ${index + 1} requires an exact source locator for this excerpt (${path}.locator).`;
      const verified = locatedDiscoveryCitation(sources, evidence);
      if (!verified)
        return `Finding ${index + 1} has an unsupported source locator or ambiguous attribution (${path}.locator). Use the registered passage containing the excerpt; do not change its document or page.`;
      if (
        evidence.date !== "Not supplied" &&
        evidence.date !== verified.date &&
        !verified.text.includes(evidence.date)
      )
        return `Finding ${index + 1} invents a source date; use Not supplied.`;
      if (
        evidence.audience !== "Not supplied" &&
        evidence.audience !== verified.audience &&
        !verified.text.includes(evidence.audience)
      )
        return `Finding ${index + 1} invents source audience metadata.`;
    }
    const unsupported = unsupportedDiscoveryFactualAssertion(finding);
    if (unsupported) {
      const correction = unsupported.startsWith("unsupported quantified")
        ? "Remove the unsupported statistic or supply its exact source sentence in this finding's evidence. A question or tentative disclaimer does not substantiate a number."
        : "Any quoted phrase must occur exactly in this finding's evidence excerpts. Write hypothetical labels in unquoted, explicitly tentative prose. Do not remove quotation marks from invented testimony to present it as a fact.";
      return `Finding ${index + 1} contains an ${unsupported}. ${correction}`;
    }
  }
  return "";
}

export function validatedDiscoveryFindings(
  request: Extract<AgentRequest, { agentType: "discovery" }>,
  data: Extract<AgentData, { findings: unknown }>,
) {
  const findings: typeof data.findings = [],
    issues: { path: string; message: string }[] = [];
  if (request.context.action === "another_answer" && data.findings.length !== 1)
    return {
      findings,
      issues: [
        {
          path: "findings",
          message: "Another answer must return exactly one distinct finding.",
        },
      ],
    };
  for (const [index, finding] of data.findings.entries()) {
    const singleIssue = validateDiscoveryEvidence(request, {
      ...data,
      findings: [finding],
    });
    const duplicateIssue =
      !singleIssue && !request.context.preparationRole
        ? crossLensIssue(
            request.context.lens,
            [...findings, finding],
            request.context.peerFindings ?? [],
          )
        : "";
    const message = singleIssue || duplicateIssue;
    if (message)
      issues.push({
        path: `findings[${index}]`,
        message: message
          .replace(/^Finding 1\b/, `Finding ${index + 1}`)
          .replace(/findings\[0\]/g, `findings[${index}]`),
      });
    else findings.push(finding);
  }
  return { findings, issues };
}
