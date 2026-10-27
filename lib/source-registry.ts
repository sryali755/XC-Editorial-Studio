import { z } from "zod";

// Deterministic content identity, not authentication or an external-source claim.
export function contentId(prefix: string, value: string) {
  let a = 2166136261,
    b = 0x9e3779b9;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b ^ code, 2246822519);
  }
  return `${prefix}-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function mappedText(value: string) {
  let text = "",
    offset = 0;
  const starts: number[] = [],
    ends: number[] = [];
  for (const raw of value) {
    const start = offset;
    offset += raw.length;
    if (/[\u00ad\u200b\ufeff]/u.test(raw)) continue;
    const char = /\s/u.test(raw)
      ? " "
      : /[“”]/u.test(raw)
        ? '"'
        : /[‘’]/u.test(raw)
          ? "'"
          : raw;
    if (char === " " && (!text || text.endsWith(" "))) {
      if (text) ends[ends.length - 1] = offset;
      continue;
    }
    text += char;
    for (let index = 0; index < char.length; index++) {
      starts.push(start);
      ends.push(offset);
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}
export function normalizeSourceText(value: string) {
  return mappedText(value).text;
}
export function originalSourceExcerpt(source: string, excerpt: string) {
  if (!excerpt.trim()) return undefined;
  const exact = source.indexOf(excerpt);
  if (exact >= 0)
    return {
      excerpt,
      start: exact,
      end: exact + excerpt.length,
      method: "exact" as const,
    };
  const mapped = mappedText(source),
    needle = normalizeSourceText(excerpt);
  if (!needle) return undefined;
  const index = mapped.text.indexOf(needle);
  if (index < 0) return undefined;
  const start = mapped.starts[index],
    end = mapped.ends[index + needle.length - 1];
  return {
    excerpt: source.slice(start, end),
    start,
    end,
    method: "format_normalized" as const,
  };
}

export const sourceRegistrySchema = z
  .object({
    version: z.literal(1),
    documents: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          originalText: z.string(),
          kind: z.enum(["imc", "supplied"]),
        })
        .strict(),
    ),
    passages: z.array(
      z
        .object({
          id: z.string(),
          documentId: z.string(),
          identity: z.string(),
          locator: z.string(),
          aliases: z.array(z.string()),
          text: z.string(),
          date: z.string().optional(),
          audience: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
export type RegisteredPassage = SourceRegistry["passages"][number];
export interface SuppliedSourceInput {
  id: string;
  source: string;
  locator?: string;
  text: string;
  date?: string;
  audience?: string;
}

export function buildSourceRegistry(
  source: string,
  supplied: SuppliedSourceInput[] = [],
): SourceRegistry {
  const documents: SourceRegistry["documents"] = [];
  const passages: RegisteredPassage[] = [];
  const lines = source.split(/\r?\n/);
  const headers = lines.flatMap((line, index) => {
    const match = line.match(/^Source:\s*(.+)$/);
    return match && (index === 0 || /^Extraction:/.test(lines[index + 1] ?? ""))
      ? [{ index, name: match[1].trim() }]
      : [];
  });
  const regions = headers.length
    ? [
        ...(headers[0].index > 0
          ? [{ index: 0, name: "Pasted IMC brief", contentStart: 0 }]
          : []),
        ...headers.map((header) => {
          let contentStart = header.index + 1;
          while (
            /^(?:Extraction:|Import notes\b)/.test(lines[contentStart] ?? "")
          )
            contentStart++;
          return { ...header, contentStart };
        }),
      ]
    : [{ index: 0, name: "Supplied IMC brief", contentStart: 0 }];
  for (const [regionIndex, region] of regions.entries()) {
    const end = regions[regionIndex + 1]?.index ?? lines.length;
    const originalText = lines
      .slice(region.contentStart, end)
      .join("\n")
      .trim();
    if (!originalText) continue;
    const documentId = contentId("doc", normalizeSourceText(originalText));
    if (!documents.some((doc) => doc.id === documentId))
      documents.push({
        id: documentId,
        name: region.name,
        originalText,
        kind: "imc",
      });
    const markers = lines.flatMap((line, index) => {
      if (index < region.index || index >= end) return [];
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
    const occurrences = new Map<string, number>();
    const add = (
      start: number,
      last: number,
      locator: string,
      identity: string,
    ) => {
      const text = lines.slice(start, last).join("\n").trim();
      if (!text || /^(?:Source:|Extraction:|Import notes)/.test(text)) return;
      const digest = contentId(
        "passage",
        `${documentId}\n${normalizeSourceText(text)}`,
      );
      const occurrence = occurrences.get(digest) ?? 0;
      occurrences.set(digest, occurrence + 1);
      passages.push({
        id: `${digest}-${occurrence}`,
        documentId,
        identity,
        locator,
        aliases: ["IMC brief", "Supplied IMC brief", region.name],
        text,
      });
    };
    const lineSpans = (start: number, last: number) => {
      let cursor = start;
      while (cursor < last) {
        while (cursor < last && !lines[cursor].trim()) cursor++;
        const first = cursor;
        while (cursor < last && lines[cursor].trim()) cursor++;
        if (cursor > first)
          add(
            first,
            cursor,
            `imc:lines:${first + 1}-${cursor}`,
            `IMC brief — lines ${first + 1}–${cursor}`,
          );
      }
    };
    if (!markers.length) lineSpans(region.contentStart, end);
    else {
      lineSpans(region.contentStart, markers[0].index);
      markers.forEach((marker, index) =>
        add(
          marker.index,
          markers[index + 1]?.index ?? end,
          `imc:${marker.kind}:${marker.number}`,
          `IMC brief — source ${marker.kind} ${marker.number}`,
        ),
      );
    }
  }
  for (const evidence of supplied) {
    if (!evidence.text.trim()) continue;
    const documentId = contentId(
      "supplied",
      `${evidence.id}\n${normalizeSourceText(evidence.text)}`,
    );
    documents.push({
      id: documentId,
      name: evidence.source,
      originalText: evidence.text,
      kind: "supplied",
    });
    passages.push({
      id: contentId(
        "passage",
        `${documentId}\n${normalizeSourceText(evidence.text)}`,
      ),
      documentId,
      identity: evidence.source,
      locator: evidence.locator || `supplied:${evidence.id}`,
      aliases: [],
      text: evidence.text,
      date: evidence.date,
      audience: evidence.audience,
    });
  }
  return { version: 1, documents, passages };
}
