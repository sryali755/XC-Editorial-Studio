import { expect, test } from "@playwright/test";
import {
  sparkSourceCatalog,
  resolveSparkSourceIds,
} from "../../lib/ai/spark-source-catalog";

test("catalog choices retain exact Unicode and stay within the short-quote budget", () => {
  const source =
    "PRODUCT: When\u00a0everyone\u00a0needs\u00a0WiFi\u00a0at\u00a0once — Gateway helps.\r\n" +
    Array.from({ length: 65 }, (_, i) => `word${i}`).join(" ");
  const catalog = sparkSourceCatalog(source, "Gateway WiFi");
  expect(catalog.length).toBeGreaterThan(1);
  for (const entry of catalog) {
    expect(source.includes(entry.excerpt)).toBe(true);
    expect(entry.excerpt.split(/\s+/).length).toBeLessThan(30);
  }
  expect(catalog[0].excerpt).toContain("When\u00a0everyone");
  const result = resolveSparkSourceIds(
    { sparks: [{ title: "Model choice", excerptId: catalog[0].id }] },
    catalog,
  );
  expect(result).toEqual({
    sparks: [{ title: "Model choice", excerpt: catalog[0].excerpt }],
  });
});

test("IDs from another source and contradictory quotes are never silently replaced", () => {
  const catalog = sparkSourceCatalog(
    "This brief contains the exact source phrase.",
  );
  const other = sparkSourceCatalog(
    "A different brief with different source support.",
  );
  const foreign = { sparks: [{ excerptId: other[0].id }] };
  expect(resolveSparkSourceIds(foreign, catalog)).toEqual(foreign);
  const contradictory = {
    sparks: [{ excerptId: catalog[0].id, excerpt: "An invented claim." }],
  };
  expect(resolveSparkSourceIds(contradictory, catalog)).toEqual(contradictory);
});

test("large catalogs are bounded and retain the model's relevant choices", () => {
  const source = Array.from(
    { length: 200 },
    (_, i) =>
      `Passage ${i}: ${i === 199 ? "Gateway product bandwidth" : "General campaign context"}`,
  ).join("\n");
  const catalog = sparkSourceCatalog(source, "Gateway bandwidth");
  expect(catalog).toHaveLength(80);
  expect(
    catalog.some((entry) =>
      entry.excerpt.includes("Gateway product bandwidth"),
    ),
  ).toBe(true);
  expect(sparkSourceCatalog("tiny")).toEqual([]);
});
