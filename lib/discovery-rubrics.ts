import type { DiscoveryLensId } from "./types";

// Public investigation criteria and output expectations, not hidden model reasoning.
export const discoveryRubrics: Record<DiscoveryLensId, string[]> = {
  consumer: [
    "Establish audience and situation.",
    "Separate observed behavior from stated attitudes.",
    "Identify motivations, friction, workarounds and unmet needs.",
    "Compare relevant groups.",
    "Explain evidence limits and unanswered questions.",
  ],
  culture: [
    "Identify relevant conversations and behaviors.",
    "Establish when, where and among whom they occur.",
    "Distinguish recurring patterns from isolated viral examples.",
    "Explore countercurrents and alternative interpretations.",
    "Explain the connection to this campaign problem.",
  ],
  category: [
    "Map alternatives, including doing nothing.",
    "Compare claims, propositions, offers and friction.",
    "Identify repeated category conventions.",
    "Surface differences and overlooked factors.",
    "Separate observed competitive activity from inferred effects.",
  ],
  brand: [
    "Review approved positioning and product truths.",
    "Examine available perception, experience and performance evidence.",
    "Compare intended positioning with evidence.",
    "Surface strengths and tensions.",
    "Identify unresolved brand-specific questions.",
  ],
  analogous: [
    "Describe the underlying problem independently of the product.",
    "Find supplied documented cases with a comparable mechanism or barrier.",
    "Explain the original context and approach.",
    "Report outcomes only where documented.",
    "Explain transferability and where the analogy breaks down.",
  ],
};
