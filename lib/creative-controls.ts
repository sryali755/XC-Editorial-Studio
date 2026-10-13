import { z } from "zod";
import {
  ROUND_TABLE_INTENSITY_BANDS,
  intensityBandIndex,
} from "./roundtable-prompts";

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
    // Accepted only so saved sessions from the two-control prototype remain loadable.
    secondary: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export type PersonalitySettings = z.infer<typeof personalitySchema>;
export const defaultPersonality = (): PersonalitySettings => ({
  primary: 5,
});
export const currentPersonality = (
  settings?: PersonalitySettings,
): PersonalitySettings => ({ primary: settings?.primary ?? 5 });
export function isPerspective(id: string): id is PerspectiveId {
  return perspectiveIds.includes(id as PerspectiveId);
}
type Control = {
  label: string;
  levels: [string, string, string, string];
  bands: [string, string, string, string];
};
export const creativeControls: Record<PerspectiveId, { primary: Control }> = {
  humor: {
    primary: {
      label: "Wit & Humor",
      levels: ["Restrained", "Balanced", "Bold", "Experimental"],
      bands: ROUND_TABLE_INTENSITY_BANDS.humor,
    },
  },
  culture: {
    primary: {
      label: "Cultural Relevance",
      levels: ["Everyday", "Shared", "Cultural", "Provocative"],
      bands: ROUND_TABLE_INTENSITY_BANDS.culture,
    },
  },
  audience: {
    primary: {
      label: "Audience Empathy",
      levels: ["Practical", "Personal", "Deep", "Intimate"],
      bands: ROUND_TABLE_INTENSITY_BANDS.audience,
    },
  },
  market: {
    primary: {
      label: "Strategic Differentiation",
      levels: ["Direct", "Distinct", "Challenging", "Reframing"],
      bands: ROUND_TABLE_INTENSITY_BANDS.market,
    },
  },
  brand: {
    primary: {
      label: "Brand Alignment",
      levels: ["Light touch", "Recognizable", "Strong", "Unmistakable"],
      bands: ROUND_TABLE_INTENSITY_BANDS.brand,
    },
  },
};
export function controlLevel(control: Control, value: number) {
  return control.levels[intensityBandIndex(value)];
}
export function controlDescription(control: Control, value: number) {
  return control.bands[intensityBandIndex(value)];
}
export function personalityInstructions(
  id: PerspectiveId,
  settings: PersonalitySettings,
) {
  const control = creativeControls[id].primary;
  return `${control.label}: ${settings.primary}/10. ${controlDescription(control, settings.primary)}`;
}
