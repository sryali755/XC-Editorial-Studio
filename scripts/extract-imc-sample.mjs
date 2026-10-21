import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: node scripts/extract-imc-sample.mjs source.pdf output.json",
  );
const bytes = fs.readFileSync(input);
const pdf = await getDocument({
  data: new Uint8Array(bytes),
  useSystemFonts: true,
}).promise;
const qaDir = path.join(path.dirname(output), ".qa");
fs.mkdirSync(qaDir, { recursive: true });
const pages = [];
for (let number = 7; number <= 9; number++) {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
  const lines = (items) => {
    const lines = [];
    for (const item of items) {
      let row = lines.find((row) => Math.abs(row.y - item.transform[5]) < 2);
      if (!row) {
        row = { y: item.transform[5], items: [] };
        lines.push(row);
      }
      row.items.push(item);
    }
    return lines
      .sort((a, b) => b.y - a.y)
      .map((row) =>
        row.items
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((item) => item.str)
          .join(" "),
      )
      .join("\n");
  };
  const items = content.items.filter(
    (item) => typeof item.str === "string" && item.str.trim(),
  );
  let text;
  {
    const viewport = page.getViewport({ scale: 1.1 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    fs.writeFileSync(
      path.join(qaDir, `source-page-${number}.png`),
      canvas.toBuffer("image/png"),
    );
    const y = (item) =>
      viewport.convertToViewportPoint(item.transform[4], item.transform[5])[1];
    if (number === 8) {
      const top = items.filter((item) => y(item) < 108);
      const body = items.filter((item) => y(item) >= 108);
      text = [
        lines(top.filter((item) => item.transform[4] < page.view[2] * 0.6)),
        lines(top.filter((item) => item.transform[4] >= page.view[2] * 0.6)),
        ...[
          [0, 0.39],
          [0.39, 0.74],
          [0.74, 1],
        ].map(([start, end]) =>
          lines(
            body.filter(
              (item) =>
                item.transform[4] >= page.view[2] * start &&
                item.transform[4] < page.view[2] * end,
            ),
          ),
        ),
      ].join("\n\n");
    } else {
      const pixels = canvas
        .getContext("2d")
        .getImageData(
          Math.floor(canvas.width * (number === 7 ? 0.95 : 0.9)),
          0,
          1,
          canvas.height,
        ).data;
      const bands = [];
      let start = null;
      for (let row = 0; row <= canvas.height; row++) {
        const offset = row * 4;
        const gray =
          row < canvas.height &&
          pixels[offset] >= 235 &&
          pixels[offset] <= 246 &&
          pixels[offset] === pixels[offset + 1] &&
          pixels[offset] === pixels[offset + 2];
        if (gray && start === null) start = row;
        if (!gray && start !== null) {
          if (row - start > 12) bands.push([start, row]);
          start = null;
        }
      }
      const expected = number === 7 ? 7 : 5;
      if (bands.length !== expected)
        throw new Error(
          `Expected ${expected} table rows on page ${number}; found ${bands.length}`,
        );
      const used = new Set();
      const cells = bands.map(([top, bottom]) => {
        const cell = items.filter(
          (item) => y(item) >= top - 2 && y(item) <= bottom + 2,
        );
        cell.forEach((item) => used.add(item));
        const label = lines(
          cell.filter((item) => item.transform[4] < page.view[2] * 0.23),
        );
        const body = lines(
          cell.filter((item) => item.transform[4] >= page.view[2] * 0.23),
        );
        return `${label}:\n${body}`;
      });
      text = [
        lines(items.filter((item) => !used.has(item) && y(item) < bands[0][0])),
        ...cells,
      ].join("\n\n");
    }
  }
  pages.push({ page: number, text });
}
const sourceName = "Imagine That - Campaign Extensions IMC Briefs.pdf";
if (!pages[0].text.startsWith("Ecosystem - Campaign Extensions"))
  throw new Error(
    "The supplied PDF does not match the expected Ecosystem campaign brief.",
  );
const text =
  `Source: ${sourceName}\nSource pages: 7–9 (complete Ecosystem campaign extension brief).\nExtraction: original cell/column text with layout normalized; no model rewriting. Source claims retain their original qualifications and approval status.\nCampaign: ${pages[0].text.split("\n")[0]}\n\n` +
  pages
    .map((page) => `--- Source page ${page.page} ---\n${page.text}`)
    .join("\n\n");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      title: "Imagine That — Ecosystem campaign extensions",
      sourceName,
      sourcePages: "7–9",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      pages,
      text,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({ pages: pages.length, chars: text.length, sourceName }),
);
