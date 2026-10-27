export interface SparkSourceExcerpt {
  id: string;
  excerpt: string;
}

// Offer source slices; the model must select relevant support, not the adapter.
// Offsets retain original Unicode whitespace, punctuation, and line formatting.
export function sparkSourceCatalog(
  source: string,
  focus = "",
): SparkSourceExcerpt[] {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const prefix = `imc-${(hash >>> 0).toString(16)}`;
  const words = (value: string) =>
    new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const keywords = words(focus);
  const candidates: (SparkSourceExcerpt & { score: number; start: number })[] =
    [];
  for (const line of source.matchAll(/[^\r\n\u2028\u2029]+/gu)) {
    const tokens = [...line[0].matchAll(/\S+/gu)];
    for (let offset = 0; offset < tokens.length; offset += 28) {
      const first = tokens[offset],
        last = tokens[Math.min(offset + 27, tokens.length - 1)];
      const start = line.index! + first.index!;
      const end = line.index! + last.index! + last[0].length;
      const excerpt = source.slice(start, end);
      if (excerpt.length < 8) continue;
      const score = [...words(excerpt)].filter((word) =>
        keywords.has(word),
      ).length;
      candidates.push({
        id: `${prefix}:${start}-${end}`,
        excerpt,
        score,
        start,
      });
    }
  }
  const selected = keywords.size
    ? candidates
        .sort((a, b) => b.score - a.score || a.start - b.start)
        .slice(0, 80)
    : candidates.length <= 80
      ? candidates
      : Array.from(
          { length: 80 },
          (_, index) =>
            candidates[Math.floor((index * (candidates.length - 1)) / 79)],
        );
  return selected
    .sort((a, b) => a.start - b.start)
    .map(({ id, excerpt }) => ({ id, excerpt }));
}

export function resolveSparkSourceIds(
  value: unknown,
  catalog: SparkSourceExcerpt[],
): unknown {
  if (
    !value ||
    typeof value !== "object" ||
    !("sparks" in value) ||
    !Array.isArray(value.sparks)
  )
    return value;
  return {
    ...value,
    sparks: value.sparks.map((spark: unknown) => {
      if (!spark || typeof spark !== "object" || !("excerptId" in spark))
        return spark;
      const selected = catalog.find((item) => item.id === spark.excerptId);
      // Unknown IDs and contradictory quotations remain invalid for strict parsing.
      if (
        !selected ||
        ("excerpt" in spark && spark.excerpt !== selected.excerpt)
      )
        return spark;
      const { excerptId: _id, ...fields } = spark;
      void _id;
      return { ...fields, excerpt: selected.excerpt };
    }),
  };
}
