// Keep imported brand metadata out of titles without changing the source brief.
export function campaignDisplayName(value: string) {
  return value
    .replace(
      /(?:^|\s)(?:\*\*|__)?Brand(?:\*\*|__)?\s*:(?:\*\*|__)?\s*[\s\S]*$/i,
      "",
    )
    .trim();
}
