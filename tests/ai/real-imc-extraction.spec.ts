import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseIMCBrief } from "../../lib/imc-parser";
import sample from "../../lib/samples/kevin-imc.json";
import { extractJobToBeDone } from "../../lib/ai/context";

const moversPath = path.join(
  process.env.XC_REAL_IMC_DIR ??
    path.join(__dirname, "../fixtures/client-input-pack"),
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf",
);

async function extractedPdfText(filePath: string) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(filePath)),
    useSystemFonts: true,
    stopAtErrors: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent({ disableNormalization: true });
    let text = "";
    let previousY: number | undefined;
    let previousEnd = 0;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      const x = item.transform[4];
      if (
        previousY !== undefined &&
        Math.abs(y - previousY) > 2 &&
        text &&
        !text.endsWith("\n")
      )
        text += "\n";
      else if (
        text &&
        !text.endsWith("\n") &&
        !/\s$/.test(text) &&
        !/^\s/.test(item.str) &&
        x - previousEnd > 1
      )
        text += " ";
      text += item.str;
      if (item.hasEOL) text += "\n";
      previousY = y;
      previousEnd = x + item.width;
    }
    pages.push(`## Source page ${number}\n${text.trim()}`);
  }
  await loadingTask.destroy();
  return pages.join("\n\n");
}

test("actual Movers PDF preserves separate campaigns, objectives, audience, RTB and constraints", async () => {
  test.skip(
    !existsSync(moversPath),
    "Supply the approved PDF in tests/fixtures/client-input-pack.",
  );
  const source = await extractedPdfText(moversPath);
  expect(source).toContain("## Source page 7");
  expect(source).toContain("## Source page 11");
  const parsed = parseIMCBrief(source);
  expect(parsed.fields.campaign.occurrences).toEqual([
    "Movers - Campaign Extensions Refresh Brief",
    "Xfinity Pro - Campaign Extensions",
  ]);
  expect(parsed.fields.objective.occurrences[0]).toContain(
    "Reinforce why a customer must stay with Xfinity during the move moment.",
  );
  expect(parsed.fields.objective.occurrences[0]).toContain(
    "Position Xfinity as the brand to switch to during the move moment.",
  );
  expect(parsed.fields.objective.occurrences[0]).not.toContain(
    "Drive marginal revenue growth",
  );
  expect(parsed.fields.objective.sourceValue).toContain(
    "Drive marginal revenue growth among existing HSD customers.",
  );
  expect(parsed.fields.audience.occurrences[0]).toBe(
    "Existing customers & prospects who are moving. Both GM and multicultural audiences.",
  );
  expect(parsed.fields.audience.occurrences[1]).toContain(
    "Existing HSD Customers, Premium and Tech Enthusiast consumers",
  );
  expect(parsed.fields.reason_to_believe.occurrences[0]).toBe(
    "• Most reliable WiFi with our best equipment included – All-in means all-in.\n\n• Prospect & TOT only: One consistent internet price. 5 Years. Guaranteed. – No strings attached.",
  );
  expect(parsed.fields.reason_to_believe.occurrences[0]).not.toContain(
    "Target Audience",
  );
  expect(parsed.fields.constraints.sourceValue).toContain(
    "Movers specific messaging remains unchanged.",
  );
  expect(parsed.fields.constraints.sourceValue).toContain(
    "Capitalize ‘Boost’ and ‘Device’",
  );
  // There is no dedicated JTBD or product/offer field in this composite PDF.
  // Product detail is present in background prose, not absent from the source.
  expect(extractJobToBeDone(source)).toBe("");
  expect(parsed.fields.product.status).toBe("Not supplied");
  expect(source).toContain(
    "Xfinity Pro is an HSD bolt-on for an additional $15 a month",
  );
  expect(parsed.supplemental.sourceReferences?.status).toBe("Not supplied");
  expect(source).toContain("evolved brand voice here");
});

test("approved Ecosystem extracted-PDF fixture keeps exact source fields and identifies absent JTBD", () => {
  const parsed = parseIMCBrief(sample.text);
  expect(parsed.fields.campaign.sourceValue).toBe(
    "Ecosystem - Campaign Extensions",
  );
  expect(parsed.fields.objective.sourceValue).toContain(
    "Evolve Xfinity to be about more than just WiFi",
  );
  expect(parsed.fields.audience.sourceValue).toBe(
    "Total audience – prospect and customer (GM)",
  );
  expect(parsed.fields.reason_to_believe.sourceValue).toContain(
    "Xfinity products are better together.",
  );
  expect(parsed.fields.constraints.sourceValue).toContain(
    "Leverage new Imagine That messaging guidelines coming soon",
  );
  expect(parsed.fields.channels.sourceValue).toContain(
    "DJ Reads, Print, Standard Display and Custom, OOH",
  );
  expect(extractJobToBeDone(sample.text)).toBe("");
  expect(sample.sourcePages).toBe("7–9");
  expect(sample.sourceName).toBe(
    "Imagine That - Campaign Extensions IMC Briefs.pdf",
  );
  expect(parsed.supplemental.sourceReferences?.status).toBe("Not supplied");
});
