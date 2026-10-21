import type { GeneratedBrief } from "./types";
import { campaignDisplayName } from "./campaign-display";

export const briefTheme = {
  purple: "#6242C7",
  ink: "#1D2139",
  muted: "#62697C",
  lilac: "#EEE9FA",
  line: "#DCE1EB",
};

export type BriefSection = GeneratedBrief["sections"][number] & { id: string };
const groups = [
  {
    title: "Campaign foundation",
    sections: ["Campaign", "Objective", "Audience", "Planning context"],
  },
  {
    title: "Strategy & messaging",
    sections: [
      "Original upstream RTB",
      "Proposed XC adaptation — not upstream-approved",
      "Brand messaging & hierarchy",
      "Messaging Direction",
      "Creative Direction",
    ],
  },
  {
    title: "Execution & deliverables",
    sections: [
      "Required Assets",
      "Channels",
      "Web Deliverables",
      "Mobile Deliverables",
      "Placement",
      "Copy Requirements",
      "Specifications / Constraints",
      "Requirements / Constraints",
      "Timing",
    ],
  },
  {
    title: "Evidence & inspiration",
    sections: [
      "Upstream research",
      "Supporting Data & Research",
      "Strategic Sparks",
      "Research Emphasis / Additional Direction",
    ],
  },
  {
    title: "Mandatories & approvals",
    sections: [
      "Execution restrictions",
      "Disclaimers",
      "Approval Notes",
      "Source & approval record",
    ],
  },
];

// Presentation only: both exports and the preview share every original section.
// Unknown and duplicate headings are retained, including legacy saved briefs.
export function buildBriefDocument(brief: GeneratedBrief) {
  const sections = brief.sections.map((section, index) => ({
    ...section,
    content:
      section.title.trim().toLowerCase() === "campaign"
        ? campaignDisplayName(section.content)
        : section.content,
    id: `brief-section-${index}`,
  }));
  const approved = sections.find(
    (s) =>
      s.title === "Approved Brief Line" ||
      (brief.provider === "manual" && s.title === "Brief"),
  );
  const remaining = sections.filter((s) => s !== approved);
  const grouped =
    brief.provider === "manual"
      ? [{ title: "XC Creative Brief", sections: remaining }]
      : groups.map((group) => ({
          title: group.title,
          sections: remaining.filter((s) => group.sections.includes(s.title)),
        }));
  const known = new Set(
    grouped.flatMap((group) => group.sections.map((s) => s.id)),
  );
  grouped.push({
    title: "Additional context",
    sections: remaining.filter((s) => !known.has(s.id)),
  });
  const date = new Date(brief.createdAt);
  return {
    campaign: campaignDisplayName(brief.campaign) || "Untitled campaign",
    date: Number.isNaN(date.getTime())
      ? "Date not supplied"
      : new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "America/New_York",
        }).format(date),
    status:
      brief.provider === "manual"
        ? brief.mock
          ? "HUMAN-APPROVED BRIEF · INCLUDES DEMO MATERIAL"
          : "HUMAN-APPROVED BRIEF"
        : brief.mock
          ? "MOCK BRIEF · FOR REVIEW"
          : "AI-ASSISTED BRIEF · FOR REVIEW",
    footer: `${brief.provider === "manual" ? "Human-authored strategy" : brief.mock ? "Illustrative content" : "AI-assisted draft"} · XC Strategy Studio`,
    approved,
    groups: grouped.filter((group) => group.sections.length > 0),
  };
}
export type BriefDocument = ReturnType<typeof buildBriefDocument>;
export const sectionContent = (section: BriefSection) =>
  section.content || "Not supplied.";
export function briefFilename(campaign: string, extension: "pdf" | "docx") {
  const name = campaignDisplayName(campaign)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return `Xfinity-Creative-Brief${name ? `-${name}` : ""}.${extension}`;
}
