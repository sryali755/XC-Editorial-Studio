import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  briefTheme as theme,
  sectionContent,
  type BriefDocument,
} from "./brief-document";

pdfMake.addVirtualFileSystem(pdfFonts);

export async function createBriefPdf(document: BriefDocument): Promise<Blob> {
  const content: Content[] = [
    {
      columns: [
        { text: "xfinity", fontSize: 33, bold: true, color: theme.ink },
        {
          text: "CREATIVE / STRATEGY STUDIO",
          style: "eyebrow",
          alignment: "right",
          margin: [0, 18, 0, 0],
        },
      ],
      margin: [0, 0, 0, 23],
    },
    { text: document.status, style: "eyebrow", margin: [0, 0, 0, 10] },
    {
      text: "Creative brief.",
      fontSize: 42,
      bold: true,
      color: theme.ink,
      margin: [0, 0, 0, 9],
    },
    {
      text: document.campaign,
      fontSize: 23,
      color: theme.purple,
      margin: [0, 0, 0, 15],
    },
    {
      text: `XFINITY CREATIVE  /  ${document.date}`,
      fontSize: 9,
      color: theme.muted,
      margin: [0, 0, 0, 24],
    },
  ];
  if (document.approved)
    content.push({
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                {
                  text: document.approved.title.toUpperCase(),
                  fontSize: 9,
                  bold: true,
                  characterSpacing: 1,
                  margin: [0, 0, 0, 10],
                },
                {
                  text: sectionContent(document.approved),
                  fontSize: 21,
                  lineHeight: 1.2,
                },
              ],
              fillColor: theme.purple,
              color: "#FFFFFF",
              margin: [18, 18, 18, 18],
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 24],
    });
  document.groups.forEach((group, index) => {
    content.push({
      text: `${String(index + 1).padStart(2, "0")}  /  ${group.title}`,
      style: "group",
      headlineLevel: 1,
    });
    group.sections.forEach((section) =>
      content.push(
        { text: section.title, style: "section", headlineLevel: 2 },
        {
          text: sectionContent(section),
          style: "body",
          id: `${section.id}-body`,
        },
      ),
    );
  });
  const definition: TDocumentDefinitions = {
    pageSize: "LETTER",
    pageMargins: [48, 56, 48, 55],
    info: {
      title: `${document.campaign} — Xfinity Creative Brief`,
      author: "XC Strategy Studio",
      subject: document.status,
      creator: "XC Strategy Studio",
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: theme.ink,
      lineHeight: 1.25,
    },
    styles: {
      eyebrow: {
        fontSize: 8,
        bold: true,
        color: theme.purple,
        characterSpacing: 1,
      },
      group: {
        fontSize: 16,
        bold: true,
        color: theme.purple,
        margin: [0, 20, 0, 15],
      },
      section: { fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
      body: { margin: [0, 0, 0, 17] },
    },
    background: (_page, size) => ({
      canvas: [
        { type: "rect", x: 0, y: 0, w: size.width, h: 7, color: theme.purple },
      ],
    }),
    header: (page) =>
      page === 1
        ? []
        : {
            columns: [
              {
                text: "XFINITY / CREATIVE BRIEF",
                bold: true,
                color: theme.purple,
              },
              { text: document.date, alignment: "right" },
            ],
            fontSize: 8,
            color: theme.muted,
            margin: [48, 24, 48, 0],
          },
    footer: (page, total) => ({
      columns: [
        { text: document.footer, width: "*" },
        { text: `${page} / ${total}`, alignment: "right", width: 50 },
      ],
      fontSize: 8,
      color: theme.muted,
      margin: [48, 18, 48, 0],
    }),
    // Keep headings with following content; long bodies can continue across pages.
    pageBreakBefore: (node, queries) =>
      !!node.headlineLevel &&
      !queries
        .getFollowingNodesOnPage()
        .some((next) => next.id?.endsWith("-body")),
    content,
  };
  return pdfMake.createPdf(definition).getBlob();
}
