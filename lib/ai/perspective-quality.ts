import type { Foundation, AgentDataMap } from "./schemas";

export type PerspectiveQualityCheck = "banned_openers" | "spark_echo";

export type PerspectiveQualityReview = {
  blockingIssue: string;
  retryChecks: PerspectiveQualityCheck[];
};

const bannedOpener = /^(?:[“"'‘’]\s*)?(?:make|give|show|help|let|reveal|position|turn)\b/i;

function strings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function words(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function containsWordPhrase(line: string, phrase: string[]) {
  if (phrase.length < 3) return false;
  const haystack = words(line);
  return haystack.some((_, index) =>
    phrase.every((word, offset) => haystack[index + offset] === word),
  );
}

function echoesSelectedSpark(line: string, foundation: Foundation) {
  const normalizedLine = ` ${words(line).join(" ")} `;
  return foundation.selectedSparks.some((spark) => {
    const title = words(spark.title ?? "").join(" ");
    if (title && normalizedLine.includes(` ${title} `)) return true;
    const ideaWords = words(spark.text);
    for (let index = 0; index <= ideaWords.length - 3; index++)
      if (containsWordPhrase(line, ideaWords.slice(index, index + 3)))
        return true;
    return false;
  });
}

export function perspectiveQualityReview(
  data: AgentDataMap["humor"],
  foundation: Foundation,
  previousLines: string[] = [],
): PerspectiveQualityReview {
  const retryChecks: PerspectiveQualityCheck[] = [];
  if (data.options.some((option) => bannedOpener.test(option.brief_line.trim())))
    retryChecks.push("banned_openers");
  if (
    data.options.some((option) =>
      echoesSelectedSpark(option.brief_line, foundation),
    )
  )
    retryChecks.push("spark_echo");
  return {
    blockingIssue: perspectiveOutputIssue(data, foundation, previousLines),
    retryChecks,
  };
}

export function perspectiveRetryInstruction(
  review: PerspectiveQualityReview,
) {
  const instructions: string[] = [];
  if (review.blockingIssue)
    instructions.push(
      `Correct this validation failure: ${review.blockingIssue} Every evidence item must be a contiguous, character-for-character excerpt copied from a value in the XC Input Pack above. Do not prepend or rename a field label.`,
    );
  if (review.retryChecks.includes("banned_openers"))
    instructions.push(
      "Rewrite: state the tension, do not start any line with an instruction verb.",
    );
  if (review.retryChecks.includes("spark_echo"))
    instructions.push(
      "Do not restate the selected Spark; build your line on your own lens's tension.",
    );
  return instructions.join(" ");
}

export function perspectiveOutputIssue(
  data: AgentDataMap["humor"],
  foundation: Foundation,
  previousLines: string[] = [],
) {
  const lineKeys = data.options.map((option) => normalized(option.brief_line));
  if (new Set(lineKeys).size !== data.options.length)
    return "The three options must use distinct brief lines.";
  const tensionKeys = data.options.map((option) => normalized(option.tension));
  if (new Set(tensionKeys).size !== data.options.length)
    return "The three options must be grounded in distinct tensions.";
  for (const option of data.options) {
    const wordCount = option.brief_line.trim().split(/\s+/).length;
    if (wordCount > 25)
      return `A brief line exceeded the 25-word limit: "${option.brief_line}"`;
  }
  if (previousLines.some((previous) => lineKeys[0] === normalized(previous)))
    return "The lead options repeated a previously generated brief line.";

  const sourceStrings = strings(foundation);
  for (const option of data.options) {
    for (const excerpt of option.evidence) {
      if (!sourceStrings.some((source) => source.includes(excerpt)))
        return `An evidence quotation is not an exact excerpt from the current Input Pack: "${excerpt}"`;
    }
  }
  return "";
}
