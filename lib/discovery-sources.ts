import type { Foundation } from "./ai/schemas";
import type { DiscoverySourceCoverage } from "./types";

export interface DiscoverySourceDocument {
  identity: string;
  locator: string;
  aliases: string[];
  text: string;
  accessScope: "supplied";
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
    return [
      document(
        "IMC brief",
        "imc:brief",
        ["Supplied IMC brief"],
        foundation.sourceBrief ?? "",
      ),
      ...Object.entries(foundation.campaignContext).map(([key, text]) =>
        document(`IMC brief — ${key}`, `imc:${key}`, [], text ?? ""),
      ),
      document(
        "Original RTB",
        "imc:rtb",
        ["Reason to Believe"],
        fields.originalRTB?.sourceValue || foundation.currentRtb.original,
      ),
      // Prepared research can point to original research, but its generated
      // interpretation, assumptions and proposed questions are not evidence.
      document(
        "Original upstream research",
        "imc:research",
        ["Prepared research"],
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
  return [
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
      source: "Prepared research",
      status: foundation.currentResearch.trim()
        ? status
        : "insufficient_evidence",
      detail: foundation.currentResearch.trim()
        ? "Generated research planning is context, not independent evidence. Quotes must match original supplied sources."
        : "No current prepared research is supplied.",
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
