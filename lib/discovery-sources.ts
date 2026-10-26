import type { Foundation } from "./ai/schemas";
import type { DiscoverySourceCoverage } from "./types";
import { buildSourceRegistry, originalSourceExcerpt } from "./source-registry";

export interface DiscoverySourceDocument {
  documentId?: string;
  passageId?: string;
  date?: string;
  audience?: string;
  identity: string;
  locator: string;
  aliases: string[];
  text: string;
  accessScope: "supplied";
}

export interface DiscoveryCitation {
  documentId?: string;
  passageId?: string;
  source: string;
  locator?: string;
  excerpt: string;
}

export function isSpecificDiscoveryLocator(locator?: string): boolean {
  const value = locator?.trim() ?? "";
  if (!value) return false;
  return (
    !value.startsWith("imc:") ||
    /^imc:(?:(?:page|slide):\d+|lines:\d+-\d+)$/.test(value)
  );
}

export function isLegacyDiscoveryLocator(locator?: string): boolean {
  const value = locator?.trim() ?? "";
  return (
    !value ||
    /^imc:(?:brief|rtb|research|campaignName|objective|audience|product|channel|constraints|jobToBeDone)$/.test(
      value,
    )
  );
}

export function locatedDiscoveryCitation(
  sources: DiscoverySourceDocument[],
  evidence: DiscoveryCitation,
): DiscoverySourceDocument | undefined {
  return resolveDiscoveryCitation(sources, evidence)?.source;
}

export function sourceIdentityMatches(
  source: DiscoverySourceDocument,
  evidence: DiscoveryCitation,
) {
  return (
    (!evidence.documentId || source.documentId === evidence.documentId) &&
    (!evidence.passageId || source.passageId === evidence.passageId) &&
    [source.identity, ...source.aliases, source.documentId].some(
      (name) => name?.toLowerCase() === evidence.source.toLowerCase(),
    )
  );
}

export function resolveDiscoveryCitation(
  sources: DiscoverySourceDocument[],
  evidence: DiscoveryCitation,
) {
  if (!isSpecificDiscoveryLocator(evidence.locator) || !evidence.excerpt.trim())
    return undefined;
  const matches = sources.flatMap((source) => {
    if (
      !sourceIdentityMatches(source, evidence) ||
      (source.locator !== evidence.locator &&
        source.passageId !== evidence.locator)
    )
      return [];
    const match = originalSourceExcerpt(source.text, evidence.excerpt);
    return match ? [{ source, ...match }] : [];
  });
  const identities = new Set(
    matches.map(
      (match) =>
        `${match.source.documentId ?? match.source.identity}:${match.source.passageId ?? match.source.locator}`,
    ),
  );
  // Never silently attribute a normalized excerpt to another document/page.
  return identities.size === 1 ? matches[0] : undefined;
}

// This adapter reads user-supplied context. It does not represent a network
// connector or grant access to any enterprise system.
export interface DiscoverySourceProvider {
  id: string;
  read: (foundation: Foundation) => DiscoverySourceDocument[];
}

const usable = (text = "") =>
  text.trim() &&
  !/^(not supplied|intentionally excluded|needs clarification)\b/i.test(text)
    ? text
    : "";

export const suppliedDiscoverySourceProvider: DiscoverySourceProvider = {
  id: "supplied-context",
  read(foundation) {
    const document = (
      identity: string,
      locator: string,
      aliases: string[],
      text: string,
    ): DiscoverySourceDocument => ({
      identity,
      locator,
      aliases,
      text: usable(text),
      accessScope: "supplied",
    });
    const fields = foundation.requirements.fields;
    const originals = fields.research?.sourceValue ?? "";
    const registry = buildSourceRegistry(
      foundation.sourceBrief ?? "",
      foundation.suppliedEvidence,
    );
    const suppliedIds = new Set(
      registry.documents
        .filter((doc) => doc.kind === "supplied")
        .map((doc) => doc.id),
    );
    const registered = registry.passages.map((passage) => ({
      ...passage,
      passageId: passage.id,
      accessScope: "supplied" as const,
    }));
    const spans = registered.filter(
      (passage) => !suppliedIds.has(passage.documentId),
    );
    const originalField = (identity: string, aliases: string[], text: string) =>
      spans.flatMap((source) => {
        const match = usable(text) && originalSourceExcerpt(source.text, text);
        return match
          ? [
              {
                ...document(identity, source.locator, aliases, match.excerpt),
                documentId: source.documentId,
                passageId: source.passageId,
              },
            ]
          : [];
      });
    return [
      ...registered.filter((passage) => suppliedIds.has(passage.documentId)),
      ...spans,
      ...Object.entries(foundation.campaignContext).flatMap(([key, text]) =>
        originalField(`IMC brief — ${key}`, [], text ?? ""),
      ),
      ...originalField(
        "Original RTB",
        ["Reason to Believe"],
        fields.originalRTB?.sourceValue || foundation.currentRtb.original,
      ),
      // An original research excerpt is eligible only when it can be located
      // in the supplied source text. Generated preparation is never evidence.
      ...originalField(
        "Original upstream research",
        ["Supplied IMC source — original research"],
        originals,
      ),
    ].filter((source) => source.text);
  },
};

export function discoverySourceDocuments(foundation: Foundation) {
  return suppliedDiscoverySourceProvider.read(foundation);
}

export function discoveryCoverage(
  foundation: Foundation,
  analyzed = false,
): DiscoverySourceCoverage[] {
  const status = analyzed ? "connected_searched" : "available_not_searched";
  const originalResearchAvailable = discoverySourceDocuments(foundation).some(
    (source) => source.identity === "Original upstream research",
  );
  return [
    ...(foundation.suppliedEvidence ?? []).map<DiscoverySourceCoverage>(
      (source) => ({
        source: source.source,
        status: source.text.trim()
          ? status
          : ("insufficient_evidence" as const),
        detail:
          "Manually supplied evidence. Original text and metadata remain inspectable; supplying a document does not independently verify its claims.",
      }),
    ),
    {
      source: "Current XC Input Pack",
      status,
      detail: analyzed
        ? "Supplied contextual snapshot analyzed. No new evidence was retrieved."
        : "Supplied contextual snapshot is available; this lens has not analyzed it yet.",
    },
    {
      source: "Supplied IMC brief",
      status: foundation.sourceBrief?.trim() ? status : "insufficient_evidence",
      detail: foundation.sourceBrief?.trim()
        ? "Original supplied text; source claims retain their approval and verification status."
        : "No original IMC brief is supplied.",
    },
    {
      source: "Supplied IMC source — original research",
      status: originalResearchAvailable ? status : "insufficient_evidence",
      detail: originalResearchAvailable
        ? "Original supplied research text is available. Its claims are not independently verified; generated synthesis is separate context."
        : "No locatable original upstream research is available in the supplied source text. Generated synthesis is not source evidence.",
    },
    ...[
      "Tableau",
      "iSpot",
      "ACE",
      "Datorama",
      "Brand Hub",
      "Product / Audience Research",
      "Authorized web / case studies",
    ].map((source) => ({
      source,
      status: "not_connected" as const,
      detail:
        "No authorized connector is configured. No live retrieval was performed.",
    })),
  ];
}
