import { strToU8, zipSync } from "fflate";

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const types =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" />';
export const wordRtb =
  "Supplied product proof — preserved exactly, not a new claim.";
export function wordFixture() {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(types),
      "word/document.xml":
        strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Campaign: Word source campaign</w:t></w:r></w:p>
      <w:p><w:r><w:t>Business Objective: Understand consideration barriers.</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Audience</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Existing customers considering a change.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>Reason to Believe</w:t></w:r></w:p>
      <w:p><w:r><w:t>${escapeXml(wordRtb)}</w:t></w:r></w:p>
      <w:del><w:p><w:r><w:t>Deleted proof must not be imported.</w:t></w:r></w:p></w:del>
    </w:body></w:document>`),
    }),
  );
}
export function presentationFixture() {
  const paragraph = (text: string) =>
    `<a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
  const slide = (content: string) =>
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`;
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(types),
      "ppt/presentation.xml": strToU8(
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst><p:extLst><p:ext><p:section><p:sldIdLst><p:sldId id="256"/><p:sldId id="257"/></p:sldIdLst></p:section></p:ext></p:extLst></p:presentation>',
      ),
      "ppt/_rels/presentation.xml.rels": strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
      ),
      "ppt/slides/slide2.xml": strToU8(
        slide(
          `<p:sp><p:txBody>${paragraph("Campaign: PowerPoint source campaign")}${paragraph("Business Objective: Investigate the premium/value perception gap.")}${paragraph("Reason to Believe:")}${paragraph("Exact supplied offer wording; approval not provided.")}</p:txBody></p:sp>`,
        ),
      ),
      "ppt/slides/slide1.xml": strToU8(slide("<p:pic/>")),
    }),
  );
}
// Minimal real PDF with an embedded text stream and valid offsets; no external fonts or images.
export function pdfFixture(lines: string[]) {
  const escaped = (text: string) =>
    text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 40 780 Td ${lines.map((line, index) => `${index ? "0 -22 Td " : ""}(${escaped(line)}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
