import type { PerspectiveId } from "../creative-controls";
import {
  ROUND_TABLE_PERSONAS,
  ROUND_TABLE_TEMPLATE_VERSION,
} from "../roundtable-prompts";

// Compatibility exports for evaluation tooling. Prompt copy lives in one file:
// lib/roundtable-prompts.ts.
export const PROMPT_TEMPLATE_VERSION = ROUND_TABLE_TEMPLATE_VERSION;
export const personaPrompts = ROUND_TABLE_PERSONAS;
export function promptTemplateVersion(agent: PerspectiveId) {
  return `${ROUND_TABLE_TEMPLATE_VERSION}:${agent}`;
}
