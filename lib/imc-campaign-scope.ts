// Source-only campaign scoping for multi-brief PDFs and their pasted page text.
// No campaign facts or page numbers are hardcoded here.
export interface IMCCampaignScope {
  id: string;
  title: string;
  pages: number[];
  sourceText: string;
}

interface SourcePage {
  number: number;
  raw: string;
  body: string;
}

function sourcePages(source: string) {
  const matches = [
    ...source.matchAll(
      /^(?:(?:## Source page|PDF PAGE)[ \t]+(\d+)|---[ \t]*Source page[ \t]+(\d+)[ \t]*---)[ \t]*$/gim,
    ),
  ];
  const prefix = matches.length ? source.slice(0, matches[0].index).trim() : "";
  const pages: SourcePage[] = matches.map((match, index) => {
    const start = match.index!;
    const end = matches[index + 1]?.index ?? source.length;
    const raw = source
      .slice(start, end)
      .trim()
      .replace(/(?:\n\s*=+\s*)+$/, "");
    return {
      number: Number(match[1] ?? match[2]),
      raw,
      body: raw.slice(match[0].length).trim(),
    };
  });
  return { prefix, pages };
}

function campaignTitle(page: SourcePage) {
  if (
    !/(?:^|\n)Business\s+Objective\b/i.test(page.body) ||
    !/(?:^|\n)Target\s+Audience\b/i.test(page.body)
  )
    return "";
  const title = page.body.match(
    /^(.+?)\s*[-–—]\s*Campaign Extensions(?: Refresh)?(?: Brief)?\s*$/im,
  );
  // PDF extraction may collapse spacing around a title separator; retain the
  // actual separator glyph, capitalization and words (never substitute '-').
  return title?.[0].trim().replace(/\s*([-–—])\s*/, " $1 ") ?? "";
}

function labeledScopes(source: string): IMCCampaignScope[] {
  const matches = [
    ...source.matchAll(
      /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?Campaign(?: name| title)?(?:\*\*|__)?\s*:(?:\*\*|__)?[ \t]*([^\r\n]+)$/gim,
    ),
  ];
  if (new Set(matches.map((match) => match[1].trim())).size < 2) return [];
  const prefix = source.slice(0, matches[0].index).trim();
  return matches.map((match, index) => ({
    id: `labeled:${index}:${match[1].trim()}`,
    title: match[1].trim(),
    pages: [],
    sourceText: [
      prefix,
      source
        .slice(match.index, matches[index + 1]?.index ?? source.length)
        .trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
  }));
}

export function detectIMCCampaignScopes(source: string): IMCCampaignScope[] {
  const { prefix, pages } = sourcePages(source);
  if (!pages.length) return labeledScopes(source);
  const starts = pages.flatMap((page, index) => {
    const title = campaignTitle(page);
    return title ? [{ index, title }] : [];
  });
  if (starts.length < 2) return labeledScopes(source);
  const shared = pages
    .slice(0, starts[0].index)
    .filter((page) => page.number === 1 || page.body.length > 120);
  return starts.map((start, index) => {
    const own = pages
      .slice(start.index, starts[index + 1]?.index ?? pages.length)
      .filter((page) => page.body.length > 120);
    const included = [...shared, ...own];
    return {
      id: `${start.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}:${pages[start.index].number}`,
      title: start.title,
      pages: included.map((page) => page.number),
      sourceText: [prefix, ...included.map((page) => page.raw)]
        .filter(Boolean)
        .join("\n\n"),
    };
  });
}
