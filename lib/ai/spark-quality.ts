import { outputSchemas, type AgentDataMap, type AgentRequest } from "./schemas";

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Structural/duplicate checks support human assessment; they cannot judge originality.
export function sparkSetIssue(
  data: AgentDataMap["sparks"],
  previous?: AgentRequest["previousVersion"],
): string | undefined {
  if (
    data.sparks.length !== 6 ||
    data.sparks.some(
      (s) =>
        !s.id.trim() ||
        !s.title.trim() ||
        !s.text.trim() ||
        !s.rationale.trim(),
    )
  )
    return "The Sparks response needs six complete idea starters with titles and rationales.";
  if (
    new Set(data.sparks.map((s) => s.id)).size !== 6 ||
    new Set(data.sparks.map((s) => normalize(s.text))).size !== 6
  )
    return "The Sparks response repeated an idea or identifier.";
  if (!previous) return;
  const parsed = outputSchemas.sparks.safeParse(previous.data);
  const previousIdeas = parsed.success
    ? parsed.data.sparks.map((s) => s.text)
    : previous.text
        .split(/\n\s*\n|\n(?=\d+[.)]\s)/)
        .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""));
  const old = new Set(previousIdeas.map(normalize));
  if (data.sparks.every((s) => old.has(normalize(s.text))))
    return "The Sparks response repeated the previous set.";
}
