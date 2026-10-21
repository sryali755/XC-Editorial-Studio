// Keep imported brand metadata out of titles without changing the source brief.
export function usableCampaignName(value: string) {
  return (
    !!value.trim() &&
    !/[\r\n]/.test(value.trim()) &&
    !/^(?:none|null|undefined|n\/?a|not supplied|unknown|untitled(?: campaign)?)[.!]?$/i.test(
      value.trim(),
    )
  );
}

export function campaignDisplayName(value: string) {
  return value
    .replace(
      /(?:^|\s)(?:\*\*|__)?Brand(?:\*\*|__)?\s*:(?:\*\*|__)?\s*[\s\S]*$/i,
      "",
    )
    .trim();
}
