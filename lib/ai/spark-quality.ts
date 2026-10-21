import {
  outputSchemas,
  sparkTerritoryTypes,
  type AgentDataMap,
  type AgentRequest,
} from "./schemas";
import type { ParsedIMCBrief } from "../types";

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const normalizeExcerpt = (text: string) =>
  text.toLocaleLowerCase().replace(/\s+/g, " ").trim();

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

function sparkExcerpt(spark: AgentDataMap["sparks"]["sparks"][number]) {
  return spark.excerpt || spark.campaignGrounding;
}

export function invalidSparkExcerptIndexes(
  data: AgentDataMap["sparks"],
  sourceBrief: string,
  onlyId?: string,
) {
  return data.sparks.flatMap((spark, index) =>
    (!onlyId || spark.id === onlyId) &&
    !exactGroundingExcerpt(sparkExcerpt(spark), sourceBrief)
      ? [index]
      : [],
  );
}

export function markSparkExcerptVerification(
  data: AgentDataMap["sparks"],
  sourceBrief: string,
  onlyId?: string,
) {
  return {
    sparks: data.sparks.map((spark) =>
      !onlyId || spark.id === onlyId
        ? {
            ...spark,
            excerpt_verified: Boolean(
              exactGroundingExcerpt(sparkExcerpt(spark), sourceBrief),
            ),
          }
        : spark,
    ),
  };
}

export function sparkStructuralIssue(
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
        !s.rationale.trim() ||
        !s.campaignGrounding.trim() ||
        !s.hypothesisToValidate.trim() ||
        (s.idea !== undefined && !s.idea.trim()) ||
        (s.excerpt !== undefined && !s.excerpt.trim()) ||
        (s.hypothesis !== undefined && !s.hypothesis.trim()) ||
        (s.territory_type !== undefined && !s.territory?.trim()),
    )
  )
    return "The Sparks response needs six complete idea starters with territory types, titles, ideas, excerpts, rationales and hypotheses.";
  const types = data.sparks.map((spark) => spark.territory_type);
  if (
    types.some(Boolean) &&
    types.some((type, index) => type !== sparkTerritoryTypes[index])
  )
    return "The Sparks response must contain one of each territory type in the required order.";
  if (
    new Set(data.sparks.map((s) => s.id)).size !== 6 ||
    new Set(data.sparks.map((s) => normalize(s.title))).size !== 6 ||
    new Set(data.sparks.map((s) => normalize(s.idea || s.text))).size !== 6
  )
    return "The Sparks response repeated a title, idea or identifier.";
  if (!previous) return;
  const parsed = outputSchemas.sparks.safeParse(previous.data);
  const previousIdeas = parsed.success
    ? parsed.data.sparks.map((s) => s.idea || s.text)
    : previous.text
        .split(/\n\s*\n|\n(?=\d+[.)]\s)/)
        .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""));
  const old = new Set(previousIdeas.map(normalize));
  if (data.sparks.every((s) => old.has(normalize(s.idea || s.text))))
    return "The Sparks response repeated the previous set.";
}

export function sparkRevisionIssue(
  data: AgentDataMap["sparks"],
  request: AgentRequest,
) {
  if (
    request.agentType !== "sparks" ||
    !("sparkRevision" in request) ||
    !request.sparkRevision?.targetId
  )
    return;
  const previous = outputSchemas.sparks.safeParse(
    request.previousVersion?.data,
  );
  if (!previous.success) return "A complete prior Spark set is required.";
  const targetId = request.sparkRevision.targetId;
  const before = previous.data.sparks.find((spark) => spark.id === targetId);
  const after = data.sparks.find((spark) => spark.id === targetId);
  if (!before || !after) return "The targeted Spark slot was not preserved.";
  if (
    normalize(after.idea || after.text) ===
    normalize(before.idea || before.text)
  )
    return "The targeted Spark must change rather than repeat its previous idea.";
  if (request.sparkRevision.intent === "improve") return;
  if (
    normalize(after.territory || after.title) ===
    normalize(before.territory || before.title)
  )
    return "A replacement Spark must use a new creative territory.";
  if (
    normalizeExcerpt(after.excerpt || after.campaignGrounding) ===
    normalizeExcerpt(before.excerpt || before.campaignGrounding)
  )
    return "A replacement Spark must use a different supporting excerpt.";
  const rejected = (request.sparkHistory ?? [])
    .flatMap((version) => version.sparks)
    .filter((spark) => spark.id === targetId)
    .map((spark) => normalize(spark.idea || spark.text));
  if (rejected.includes(normalize(after.idea || after.text)))
    return "A replacement Spark repeated a previously rejected angle.";
}

// Structural/duplicate checks support human assessment; they cannot judge originality.
export function sparkSetIssue(
  data: AgentDataMap["sparks"],
  previous?: AgentRequest["previousVersion"],
  parsedIMC?: ParsedIMCBrief,
): string | undefined {
  const structural = sparkStructuralIssue(data, previous);
  if (structural) return structural;
  if (parsedIMC) {
    if (invalidSparkExcerptIndexes(data, parsedIMC.sourceText).length)
      return "Each Spark must ground itself in an exact excerpt from the current IMC brief.";
  }
}
