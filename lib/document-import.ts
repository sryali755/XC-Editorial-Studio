// Client-side, deterministic extraction only. No LLM calls or external uploads.
import { strFromU8, unzipSync } from "fflate";

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_MAX_CHARS = 60_000;
export const DOCUMENT_ACCEPT = ".pdf,.pptx,.docx,.txt,.md,.csv";
export interface ImportedDocument {
  text: string;
  fileName: string;
  format: "PDF" | "PowerPoint" | "Word" | "Text";
  warnings: string[];
}
const MAX_XML_BYTES = 12 * 1024 * 1024;
const MAX_PARTS = 1000;

function xml(bytes: Uint8Array | undefined): XMLDocument {
  if (!bytes)
    throw new Error(
      "This Office file is incomplete. Save a fresh copy and try again.",
    );
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      "This file contains unsupported XML declarations. Save a fresh Office copy.",
    );
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error(
      "This Office file contains invalid XML. Save a fresh copy and try again.",
    );
  return document;
}
function elements(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}
function visibleText(node: Node): string {
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (["del", "moveFrom", "instrText"].includes(element.localName)) return "";
  if (element.localName === "t") return element.textContent ?? "";
  if (["br", "cr"].includes(element.localName)) return "\n";
  if (element.localName === "tab") return "\t";
  return Array.from(element.childNodes).map(visibleText).join("");
}
function paragraphs(root: Element | Document): string {
  return elements(root, "p")
    .filter((paragraph) => {
      for (
        let parent = paragraph.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (["del", "moveFrom", "p"].includes(parent.localName)) return false;
        if (parent === root) break;
      }
      return true;
    })
    .map((paragraph) => {
      const text = visibleText(paragraph);
      const style = elements(paragraph, "pStyle")[0];
      const value =
        style?.getAttribute("w:val") ?? style?.getAttribute("val") ?? "";
      const heading = value.match(/^Heading([1-6])$/i);
      return text.trim()
        ? `${heading ? "#".repeat(Number(heading[1])) + " " : ""}${text}`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}
function officeParts(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0,
    count = 0;
  try {
    return unzipSync(bytes, {
      filter: (part) => {
        if (++count > MAX_PARTS)
          throw new Error(
            "This Office file has too many parts. Split it into smaller files.",
          );
        const required =
          /^(?:\[Content_Types\]\.xml|word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml|ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|ppt\/slides\/slide\d+\.xml)$/.test(
            part.name,
          );
        if (!required) return false;
        total += part.originalSize;
        if (total > MAX_XML_BYTES)
          throw new Error(
            "This Office file expands to too much text. Split it into smaller files.",
          );
        return true;
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /too many parts|too much text/.test(error.message)
    )
      throw error;
    throw new Error(
      "This Office file is corrupted, encrypted or not a valid .pptx/.docx file. Open it in Office and save an unprotected copy.",
    );
  }
}
function word(bytes: Uint8Array) {
  const parts = officeParts(bytes);
  xml(parts["[Content_Types].xml"]);
  const document = xml(parts["word/document.xml"]);
  const body = elements(document, "body")[0];
  if (!body) throw new Error("The Word document has no readable body.");
  // Keep table cells together rather than flattening labels away from values.
  const blocks = Array.from(body.children).map((block) => {
    if (block.localName !== "tbl") return paragraphsWrapper(block);
    return Array.from(block.children)
      .filter((child) => child.localName === "tr")
      .map((row) => {
        const cells = Array.from(row.children)
          .filter((child) => child.localName === "tc")
          .map(paragraphs);
        if (cells.length === 2 && cells[0].trim().length < 100)
          return `${cells[0].trim().replace(/:$/, "")}:\n${cells[1]}`;
        return cells.join(" | ");
      })
      .join("\n\n");
  });
  for (const name of Object.keys(parts)
    .filter((name) => /^word\/(?:header|footer|footnotes|endnotes)/.test(name))
    .sort()) {
    const text = paragraphs(xml(parts[name]));
    if (text.trim())
      blocks.push(
        `## Word supporting text (${name.replace("word/", "")})\n${text}`,
      );
  }
  const hasImages =
    elements(document, "drawing").length > 0 ||
    elements(document, "pict").length > 0;
  return {
    text: blocks.filter(Boolean).join("\n\n"),
    warnings: [
      "Word layout is normalized. Review tables and reading order before applying.",
      ...(hasImages
        ? [
            "Embedded images/charts were not read. Paste any important text or evidence from them separately.",
          ]
        : []),
    ],
  };
}
function paragraphsWrapper(block: Element) {
  if (block.localName === "p") {
    const wrapper = block.ownerDocument.createElement("extraction");
    wrapper.appendChild(block.cloneNode(true));
    return paragraphs(wrapper);
  }
  return paragraphs(block);
}
function powerPoint(bytes: Uint8Array) {
  const parts = officeParts(bytes);
  xml(parts["[Content_Types].xml"]);
  const presentation = xml(parts["ppt/presentation.xml"]);
  const relationships = xml(parts["ppt/_rels/presentation.xml.rels"]);
  const paths = new Map(
    elements(relationships, "Relationship")
      .filter((item) => item.getAttribute("TargetMode") !== "External")
      .map((item) => [
        item.getAttribute("Id"),
        item.getAttribute("Target") ?? "",
      ]),
  );
  // Section metadata repeats slide IDs without relationships; only this list is presentation order.
  const slideList = Array.from(presentation.documentElement.children).find(
    (child) => child.localName === "sldIdLst",
  );
  const slideIds = Array.from(slideList?.children ?? []).filter(
    (child) => child.localName === "sldId",
  );
  if (!slideIds.length || slideIds.length > 150)
    throw new Error(
      "Use a PowerPoint with 1–150 slides. Split larger decks before importing.",
    );
  const imageSlides: number[] = [],
    emptySlides: number[] = [];
  const slides = slideIds.map((id, index) => {
    const relationship =
      id.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ?? id.getAttribute("r:id");
    const target = paths.get(relationship);
    const name = target?.startsWith("/ppt/")
      ? target.slice(1)
      : `ppt/${target}`;
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name))
      throw new Error(
        "This presentation has an unsupported slide reference. Save a fresh .pptx copy.",
      );
    const slide = xml(parts[name]);
    if (elements(slide, "pic").length) imageSlides.push(index + 1);
    const text = paragraphs(slide);
    if (!text.trim()) emptySlides.push(index + 1);
    return {
      text,
      block: `## Source slide ${index + 1}\n${text || "[No extractable text on this slide.]"}`,
    };
  });
  if (!slides.some((slide) => slide.text.trim()))
    throw new Error(
      "No readable slide text was found. This may be an image-only deck. Paste the source text or use a searchable PDF.",
    );
  return {
    text: slides.map((slide) => slide.block).join("\n\n"),
    warnings: [
      "Slide text follows the file’s object order. Review columns and tables. Speaker notes and linked files are not imported.",
      ...(imageSlides.length
        ? [
            `Images on slides ${imageSlides.join(", ")} were not read. Paste important text inside images separately; no OCR was performed.`,
          ]
        : []),
      ...(emptySlides.length
        ? [`No text was extracted from slides ${emptySlides.join(", ")}.`]
        : []),
    ],
  };
}
async function pdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    stopAtErrors: true,
  });
  // Do not open an untracked password dialog or leave encrypted files pending.
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    const document = await task.promise;
    if (document.numPages > 150)
      throw new Error(
        "Use a PDF of 150 pages or fewer. Split larger files before importing.",
      );
    const pages: string[] = [],
      emptyPages: number[] = [];
    let count = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent({ disableNormalization: true });
      let text = "",
        previousY: number | undefined,
        previousEnd = 0;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5],
          x = item.transform[4];
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
      if (!text.trim()) emptyPages.push(number);
      count += text.length;
      if (count > DOCUMENT_MAX_CHARS)
        throw new Error(
          "The extracted text exceeds 60,000 characters. Split the file or paste the relevant brief; nothing was truncated.",
        );
      pages.push(
        `## Source page ${number}\n${text.trim() || "[No extractable text on this page.]"}`,
      );
      page.cleanup();
    }
    if (emptyPages.length === document.numPages)
      throw new Error(
        "No readable text was found. This PDF is scanned or image-only. Use a searchable PDF or paste its text; OCR is not enabled.",
      );
    return {
      text: pages.join("\n\n"),
      warnings: [
        "PDF layout is normalized. Review columns and tables; images/charts are not interpreted.",
        ...(emptyPages.length
          ? [
              `Pages ${emptyPages.join(", ")} had no extractable text and were not read. Use searchable pages or paste the missing text; no OCR was performed.`,
            ]
          : []),
      ],
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /150 pages|60,000|No readable text/.test(error.message)
    )
      throw error;
    throw new Error(
      "Unable to read this PDF. It may be password-protected, corrupted or unsupported. Save an unprotected searchable PDF and retry.",
    );
  } finally {
    await task.destroy();
  }
}
export async function extractDocument(file: File): Promise<ImportedDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "doc" || extension === "ppt")
    throw new Error(
      `Older .${extension} files need conversion. Open it in Word/PowerPoint and Save As .${extension}x (or a searchable PDF), then upload that copy.`,
    );
  if (!extension || !/^(?:pdf|pptx|docx|txt|md|csv)$/.test(extension))
    throw new Error(
      "Choose a PDF, PowerPoint (.pptx), Word (.docx), TXT, MD or CSV file.",
    );
  if (!file.size)
    throw new Error("This file is empty. Choose a file with text.");
  if (file.size > DOCUMENT_MAX_BYTES)
    throw new Error(
      "Choose a file up to 15 MB, or split it into smaller files.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  let result: { text: string; warnings: string[] };
  const format =
    extension === "pdf"
      ? "PDF"
      : extension === "pptx"
        ? "PowerPoint"
        : extension === "docx"
          ? "Word"
          : "Text";
  if (extension === "pdf") {
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw new Error(
        "This is not a valid PDF. Save or export it as a PDF and retry.",
      );
    result = await pdf(bytes);
  } else if (extension === "pptx" || extension === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error(
        "This is not a valid Office .pptx/.docx file. Save an unprotected copy in the matching format.",
      );
    result = extension === "pptx" ? powerPoint(bytes) : word(bytes);
  } else {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Save the text file as UTF-8 and try again.");
    }
    if (text.includes("\0"))
      throw new Error(
        "This is not a readable text file. Save it as UTF-8 text.",
      );
    result = { text, warnings: [] };
  }
  if (!result.text.trim())
    throw new Error(
      "No readable text was found in this file. Paste the original source text instead.",
    );
  const safeName = file.name.replace(/[\r\n\0]/g, " ");
  const text = `Source: ${safeName}\n${format === "Text" ? "" : `Extraction: ${format} text only; layout normalized. Review against the original document.\nImport notes (not source evidence): ${result.warnings.join(" ")}\n\n`}${result.text.trim()}`;
  if (text.length > DOCUMENT_MAX_CHARS)
    throw new Error(
      "The extracted text exceeds 60,000 characters. Split the file or paste the relevant brief; nothing was truncated.",
    );
  return { text, fileName: safeName, format, warnings: result.warnings };
}
