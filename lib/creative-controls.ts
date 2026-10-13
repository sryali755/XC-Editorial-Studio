import { z } from "zod";

export const perspectiveIds = [
  "humor",
  "culture",
  "audience",
  "market",
  "brand",
] as const;
export type PerspectiveId = (typeof perspectiveIds)[number];
export const personalitySchema = z
  .object({
    primary: z.number().int().min(1).max(10),
    secondary: z.number().int().min(1).max(10),
  })
  .strict();
export type PersonalitySettings = z.infer<typeof personalitySchema>;
export const defaultPersonality = (): PersonalitySettings => ({
  primary: 5,
  secondary: 5,
});
export function isPerspective(id: string): id is PerspectiveId {
  return perspectiveIds.includes(id as PerspectiveId);
}
type Control = {
  label: string;
  levels: [string, string, string, string];
  bands: [string, string, string, string];
};
export const creativeControls: Record<
  PerspectiveId,
  { primary: Control; secondary: Control }
> = {
  humor: {
    primary: {
      label: "Wit & Humor",
      levels: ["Restrained", "Balanced", "Bold", "Experimental"],
      bands: [
        "Subtle, understated and restrained; one gentle observation.",
        "Balanced, playful and clever; a recognizable human contradiction.",
        "Bold, surprising and unconventional; use incongruity or a sharp reversal.",
        "Highly experimental and unexpected, while remaining brand-safe; surprise without forced puns.",
      ],
    },
    secondary: {
      label: "Creative Boldness",
      levels: ["Familiar", "Fresh", "Unexpected", "Experimental"],
      bands: [
        "Use a direct, familiar setup.",
        "Try a fresh angle on a familiar moment.",
        "Use an unexpected comparison or creative tension.",
        "Explore an unusual premise or form that still makes immediate strategic sense.",
      ],
    },
  },
  culture: {
    primary: {
      label: "Cultural Relevance",
      levels: ["Everyday", "Shared", "Cultural", "Provocative"],
      bands: [
        "Focus on a small everyday social interaction.",
        "Connect a recognizable shared behavior to the audience tension.",
        "Explore a wider cultural tension grounded in supplied evidence or clearly framed as a hypothesis.",
        "Offer a provocative cultural interpretation as a hypothesis; never invent a current trend.",
      ],
    },
    secondary: {
      label: "Unexpected Connections",
      levels: ["Close", "Adjacent", "Surprising", "Far-reaching"],
      bands: [
        "Keep the connection close to the supplied context.",
        "Connect two familiar audience experiences.",
        "Connect seemingly unrelated rituals with a clear strategic bridge.",
        "Try a distant cultural analogy; explain the relevance and do not imply evidence exists.",
      ],
    },
  },
  audience: {
    primary: {
      label: "Audience Empathy",
      levels: ["Practical", "Personal", "Deep", "Intimate"],
      bands: [
        "Address a practical task or friction simply.",
        "Balance the practical need with a human motivation.",
        "Explore a deeper tension between what people want and what gets in the way.",
        "Take an intimate audience point of view as a creative hypothesis, without stereotypes or diagnosis.",
      ],
    },
    secondary: {
      label: "Emotional Resonance",
      levels: ["Calm", "Warm", "Vivid", "Powerful"],
      bands: [
        "Use calm, functional language.",
        "Add warmth and a specific human stake.",
        "Make the emotional stake vivid without sentimentality.",
        "Explore a powerful emotional contrast without fear, shame or manipulation.",
      ],
    },
  },
  market: {
    primary: {
      label: "Strategic Differentiation",
      levels: ["Direct", "Distinct", "Challenging", "Reframing"],
      bands: [
        "Clarify the supplied product role directly.",
        "Offer a distinct audience-relevant framing.",
        "Challenge a category convention only if evidenced; otherwise propose a positioning hypothesis.",
        "Reframe what the category could mean without asserting superiority or competitor weaknesses.",
      ],
    },
    secondary: {
      label: "Exploratory Thinking",
      levels: ["Established", "Adjacent", "Exploratory", "New territory"],
      bands: [
        "Stay close to the supplied positioning.",
        "Explore an adjacent positioning angle.",
        "Test a less obvious benefit frame supported by the RTB.",
        "Explore a new frame of reference as a proposal, never a new product benefit or proven market opportunity.",
      ],
    },
  },
  brand: {
    primary: {
      label: "Brand Alignment",
      levels: ["Light touch", "Recognizable", "Strong", "Unmistakable"],
      bands: [
        "Express mandatory brand principles lightly and naturally; every constraint still applies.",
        "Make the supplied brand positioning recognizable in the idea.",
        "Make approved brand principles the main organizing idea.",
        "Make the supplied brand meaning unmistakable, without copying slogans or inventing heritage.",
      ],
    },
    secondary: {
      label: "Pattern Exploration",
      levels: ["Familiar", "Adapted", "Recombined", "Reinvented"],
      bands: [
        "Use a familiar creative structure; do not call it proven without evidence.",
        "Adapt a supplied learning or use a simple contrast as an untested technique.",
        "Recombine a supplied learning with a fresh narrative structure.",
        "Reinvent the expression of a supplied principle; label untested patterns as hypotheses, not past successes.",
      ],
    },
  },
};
export function controlLevel(control: Control, value: number) {
  return control.levels[value <= 3 ? 0 : value <= 6 ? 1 : value <= 8 ? 2 : 3];
}
export function controlDescription(control: Control, value: number) {
  return control.bands[value <= 3 ? 0 : value <= 6 ? 1 : value <= 8 ? 2 : 3];
}
export function personalityInstructions(
  id: PerspectiveId,
  settings: PersonalitySettings,
) {
  return (["primary", "secondary"] as const)
    .map((key) => {
      const control = creativeControls[id][key];
      return `${control.label}: ${settings[key]}/10. ${controlDescription(control, settings[key])}`;
    })
    .join("\n");
}
