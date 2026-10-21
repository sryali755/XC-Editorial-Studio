import type { Foundation } from "./ai/schemas";
import type { DiscoverySourceCoverage } from "./types";

export interface DiscoverySourceDocument {
  date?: string;
  audience?: string;
  identity: string;
  locator: string;
  aliases: string[];
  text: string;
  accessScope: "supplied";
}

export interface DiscoveryCitation {
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

// A locator identifies a retained source span, not merely a field name. PDF
// pages and PowerPoint slides are available from document extraction; plain
// text/Word content has line spans and is never assigned a fabricated page.
function imcSourceSpans(source: string): DiscoverySourceDocument[] {
  if (!source.trim()) return [];
  const lines = source.split(/\r?\n/);
  const markers = lines.flatMap((line, index) => {
    const page = line.match(
      /^(?:(?:## Source page|PDF PAGE)\s+(\d+)|---\s*Source page\s+(\d+)\s*---)\s*$/i,
    );
    const slide = line.match(/^## Source slide\s+(\d+)\s*$/i);
    return page
      ? [{ index, kind: "page", number: Number(page[1] ?? page[2]) }]
      : slide
        ? [{ index, kind: "slide", number: Number(slide[1]) }]
        : [];
  });
  const span = (
    start: number,
    end: number,
    locator: string,
    identity: string,
  ) => ({
    identity,
    locator,
    aliases: ["IMC brief", "Supplied IMC brief"],
    text: lines.slice(start, end).join("\n").trim(),
    accessScope: "supplied" as const,
  });
  const lineSpans = (start: number, end: number) => {
    const result: DiscoverySourceDocument[] = [];
    let cursor = start;
    while (cursor < end) {
      while (cursor < end && !lines[cursor].trim()) cursor++;
      if (cursor >= end) break;
      const first = cursor;
      while (cursor < end && lines[cursor].trim()) cursor++;
      const last = cursor;
      result.push(
        span(
          first,
          last,
          `imc:lines:${first + 1}-${last}`,
          `IMC brief — lines ${first + 1}–${last}`,
        ),
      );
    }
    return result;
  };
  if (!markers.length) return lineSpans(0, lines.length);
  const result = lineSpans(0, markers[0].index);
  for (const [index, marker] of markers.entries()) {
    const end = markers[index + 1]?.index ?? lines.length;
    result.push(
      span(
        marker.index,
        end,
        `imc:${marker.kind}:${marker.number}`,
        `IMC brief — source ${marker.kind} ${marker.number}`,
      ),
    );
  }
  return result.filter((item) => item.text);
}

export function locatedDiscoveryCitation(
  sources: DiscoverySourceDocument[],
  evidence: DiscoveryCitation,
): DiscoverySourceDocument | undefined {
  if (!isSpecificDiscoveryLocator(evidence.locator) || !evidence.excerpt.trim())
    return undefined;
  return sources.find(
    (source) =>
      source.locator === evidence.locator &&
      [source.identity, ...source.aliases].some(
        (name) => name.toLowerCase() === evidence.source.toLowerCase(),
      ) &&
      source.text.includes(evidence.excerpt),
  );
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
    const spans = imcSourceSpans(foundation.sourceBrief ?? "");
    const originalField = (identity: string, aliases: string[], text: string) =>
      spans
        .filter((source) => usable(text) && source.text.includes(text))
        .map((source) => document(identity, source.locator, aliases, text));
    return [
      ...(foundation.suppliedEvidence ?? []).map((source) => ({
        identity: source.source,
        locator: source.locator || `supplied:${source.id}`,
        aliases: [],
        text: source.text,
        accessScope: source.accessScope,
        date: source.date,
        audience: source.audience,
      })),
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
