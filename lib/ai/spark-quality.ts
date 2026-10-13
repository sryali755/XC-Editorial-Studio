import { outputSchemas, type AgentDataMap, type AgentRequest } from "./schemas";
import type { ParsedIMCBrief } from "../types";

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function groundingCandidates(grounding: string) {
  const candidates: string[] = [];
  for (const match of grounding.matchAll(/["“]([^"”]+)["”]/g))
    candidates.push(match[1].trim());
  const separator = grounding.indexOf(":");
  if (separator >= 0) candidates.push(grounding.slice(separator + 1).trim());
  candidates.push(grounding.trim());
  return [...new Set(candidates)]
    .map((candidate) => candidate.replace(/^["“']+|["”']+$/g, "").trim())
    .filter((candidate) => candidate.length >= 8);
}

export function exactGroundingExcerpt(
  campaignGrounding: string,
  sourceBrief: string,
) {
  return groundingCandidates(campaignGrounding).find((candidate) =>
    sourceBrief.includes(candidate),
  );
}

// Structural/duplicate checks support human assessment; they cannot judge originality.
export function sparkSetIssue(
  data: AgentDataMap["sparks"],
  previous?: AgentRequest["previousVersion"],
  parsedIMC?: ParsedIMCBrief,
): string | undefined {
  if (
    data.sparks.length !== 6 ||
    data.sparks.some(
      (s) =>
        !s.id.trim() ||
        !s.title.trim() ||
        !s.text.trim() ||
        !s.rationale.trim() ||
        !s.campaignGrounding.trim() ||
        !s.hypothesisToValidate.trim(),
    )
  )
    return "The Sparks response needs six complete idea starters with titles, creative opportunities, campaign grounding and hypotheses to validate.";
  if (
    new Set(data.sparks.map((s) => s.id)).size !== 6 ||
    new Set(data.sparks.map((s) => normalize(s.title))).size !== 6 ||
    new Set(data.sparks.map((s) => normalize(s.text))).size !== 6
  )
    return "The Sparks response repeated a title, idea or identifier.";
  if (parsedIMC) {
    const invalid = data.sparks.filter(
      (spark) =>
        !exactGroundingExcerpt(spark.campaignGrounding, parsedIMC.sourceText),
    );
    if (invalid.length)
      return "Each Spark must ground itself in an exact excerpt from the current IMC brief.";
  }
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
