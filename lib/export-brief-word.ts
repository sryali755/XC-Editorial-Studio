import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  briefTheme,
  sectionContent,
  type BriefDocument,
} from "./brief-document";

const theme = Object.fromEntries(
  Object.entries(briefTheme).map(([key, value]) => [key, value.slice(1)]),
) as typeof briefTheme;

export async function createBriefWord(document: BriefDocument): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "xfinity", style: "Wordmark" }),
    new Paragraph({ text: "CREATIVE / STRATEGY STUDIO", style: "Eyebrow" }),
    new Paragraph({
      text: document.status,
      style: "Eyebrow",
      spacing: { before: 360, after: 140 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Creative brief.",
          font: "Arial",
          size: 84,
          bold: true,
          color: theme.ink,
        }),
      ],
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({ text: document.campaign, style: "CampaignTitle" }),
    new Paragraph({
      text: `XFINITY CREATIVE  /  ${document.date}`,
      style: "DocumentMeta",
    }),
  ];
  if (document.approved)
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: theme.purple },
                margins: { top: 300, bottom: 300, left: 340, right: 340 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: document.approved.title.toUpperCase(),
                        font: "Arial",
                        size: 18,
                        bold: true,
                        color: "FFFFFF",
                      }),
                    ],
                    keepNext: true,
                    spacing: { after: 180 },
                  }),
                  ...sectionContent(document.approved)
                    .split(/\r?\n/)
                    .map(
                      (text) =>
                        new Paragraph({
                          children: [
                            new TextRun({
                              text,
                              font: "Arial",
                              size: 40,
                              color: "FFFFFF",
                            }),
                          ],
                          spacing: { line: 500, after: 60 },
                        }),
                    ),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  document.groups.forEach((group, index) => {
    children.push(
      new Paragraph({
        text: `${String(index + 1).padStart(2, "0")}  /  ${group.title}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    group.sections.forEach((section) => {
      children.push(
        new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }),
      );
      const lines = sectionContent(section).split(/\r?\n/);
      lines.forEach((text, i) =>
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text, font: "Arial", size: 21, color: theme.ink }),
            ],
            widowControl: true,
            spacing: { after: i === lines.length - 1 ? 240 : 50 },
          }),
        ),
      );
    });
  });
  const doc = new Document({
    title: `${document.campaign} — Xfinity Creative Brief`,
    creator: "XC Strategy Studio",
    description: document.status,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 21, color: theme.ink },
          paragraph: { spacing: { line: 290 } },
        },
        title: {
          run: { font: "Arial", size: 84, bold: true, color: theme.ink },
          paragraph: { spacing: { after: 160 }, keepNext: true },
        },
        heading1: {
          run: { font: "Arial", size: 32, bold: true, color: theme.purple },
          paragraph: { spacing: { before: 360, after: 200 }, keepNext: true },
        },
        heading2: {
          run: { font: "Arial", size: 21, bold: true, color: theme.ink },
          paragraph: { spacing: { before: 40, after: 80 }, keepNext: true },
        },
      },
      paragraphStyles: [
        {
          id: "Wordmark",
          name: "Xfinity wordmark",
          basedOn: "Normal",
          run: { font: "Arial", size: 66, bold: true },
          paragraph: { keepNext: true, spacing: { after: 80 } },
        },
        {
          id: "Eyebrow",
          name: "Brief eyebrow",
          basedOn: "Normal",
          run: { font: "Arial", size: 17, bold: true, color: theme.purple },
          paragraph: { keepNext: true, spacing: { after: 180 } },
        },
        {
          id: "CampaignTitle",
          name: "Campaign title",
          basedOn: "Normal",
          run: { font: "Arial", size: 46, color: theme.purple },
          paragraph: { keepNext: true, spacing: { after: 180 } },
        },
        {
          id: "DocumentMeta",
          name: "Document metadata",
          basedOn: "Normal",
          run: { font: "Arial", size: 18, color: theme.muted },
          paragraph: { spacing: { after: 360 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1120,
              bottom: 1100,
              left: 960,
              right: 960,
              header: 480,
              footer: 480,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "XFINITY / CREATIVE BRIEF",
                    font: "Arial",
                    color: theme.purple,
                    bold: true,
                    size: 16,
                  }),
                ],
                border: {
                  bottom: {
                    color: theme.purple,
                    style: BorderStyle.SINGLE,
                    size: 18,
                    space: 10,
                  },
                },
                spacing: { after: 120 },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${document.footer}     |     `,
                    font: "Arial",
                    size: 16,
                    color: theme.muted,
                  }),
                  new TextRun({
                    font: "Arial",
                    children: [
                      PageNumber.CURRENT,
                      " / ",
                      PageNumber.TOTAL_PAGES,
                    ],
                    size: 16,
                    color: theme.muted,
                  }),
                ],
                border: {
                  top: {
                    color: theme.line,
                    style: BorderStyle.SINGLE,
                    size: 4,
                    space: 8,
                  },
                },
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
