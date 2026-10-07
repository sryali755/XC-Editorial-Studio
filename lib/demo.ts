import type {
  AgentPersona,
  ExecutionDirection,
  StrategyInputPack,
} from "./types";
export const personas: AgentPersona[] = [
  {
    id: "humor",
    name: "Humorous / Witty",
    role: "A little wit. A different way in.",
    thinking:
      "Explore playful, clever or unexpected expressions without losing the campaign objective.",
    color: "coral",
    icon: "✳",
  },
  {
    id: "culture",
    name: "Cultural / Social",
    role: "Find the tension in the everyday.",
    thinking:
      "Look for relevant behaviors, shared conversations and social tensions in the supplied evidence.",
    color: "purple",
    icon: "◈",
  },
  {
    id: "audience",
    name: "Audience-first",
    role: "Start with the people who matter.",
    thinking:
      "Consider the priority audience’s needs, motivations, barriers and emotional perspective.",
    color: "blue",
    icon: "◎",
  },
  {
    id: "market",
    name: "Market / Landscape",
    role: "Find a space worth owning.",
    thinking:
      "Use available market and competitive context to identify differentiated strategic angles.",
    color: "green",
    icon: "↗",
  },
  {
    id: "brand",
    name: "Proven-pattern / Brand",
    role: "Build on what works. Move it forward.",
    thinking:
      "Evolve historical campaign learnings while remaining true to the brand’s principles.",
    color: "amber",
    icon: "✦",
  },
];
export const demoPack: StrategyInputPack = {
  campaignName: "Life, connected",
  objective:
    "Make Xfinity the first choice for households looking for reliable home connectivity.",
  audience:
    "Busy, digitally connected households balancing work, entertainment and everyday life.",
  product: "Xfinity home internet",
  channel: "Web, email and paid social",
  constraints:
    "Lead with everyday value. Avoid unverified speed, pricing or competitive claims.",
  reasonToBelieve:
    "Xfinity brings home connectivity and helpful support together, giving households a dependable foundation for the moments that matter.",
  research:
    "DEMO EVIDENCE — illustrative, not verified research.\n\nAudience insight: households want technology to work quietly in the background.\nPrior campaign learning: relatable everyday moments created a clearer story than feature-heavy messaging.\nProduct context: home internet connects work, play and family life.\nMarket context: technical claims dominate the category; explore the human benefit.",
  sparks:
    "The best connection is the one you don’t have to think about.\nA home is many different worlds, happening at once.\nPeople don’t want more internet in their lives. They want more life from their internet.",
};
export const demoExecution: ExecutionDirection = {
  requiredAssets:
    "Homepage hero, supporting benefit card, email header and social tiles",
  assetCount: 6,
  channels: "Web, email, paid social",
  placements: "Xfinity homepage, product page, prospect email, social feed",
  desktop: "Full-width hero and supporting card; responsive desktop layouts.",
  mobile: "Mobile hero crop, stacked card and short-form microcopy.",
  messaging:
    "Lead with the everyday freedom of a connection that supports real life.",
  copy: "One headline, supporting sentence and CTA per asset. CTA: Explore Xfinity.",
  formats:
    "Responsive web modules; PNG/JPG social exports; editable source files.",
  timing: "Concept review: October 12, 2026. Final handoff: October 23, 2026.",
  constraints:
    "Use approved brand guidelines. Confirm product claims and final dimensions before production.",
};
