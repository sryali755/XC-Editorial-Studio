import type { StrategyInputPack } from "./types";

// First sentence of a supplied field (or the whole first line, for names),
// without Markdown or list markers, cut at a word boundary so it reads
// naturally inside a question.
function short(text: string | undefined, max: number, sentence = true) {
  const line =
    (text ?? "")
      .split("\n")
      .map((item) =>
        item
          .replace(/\*\*/g, "")
          .replace(/^\s*[-•*]\s*/, "")
          .trim(),
      )
      .find(Boolean) ?? "";
  const value = (sentence ? line.split(/(?<=[.!?])\s/)[0] : line)
    .trim()
    .replace(/[.;:,]+$/, "");
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trim()}…`;
}

// A long audience reads better trimmed at its first clause ("Adults aged
// 25–50 who are…" becomes "Adults aged 25–50").
function audienceLabel(text: string) {
  if (text.length <= 60) return text;
  const clause = /\s(?:who|that|with|and are)\s|,\s|\s[–-]\s|\s\(/.exec(
    text.slice(12),
  );
  return clause ? text.slice(0, clause.index + 12).trim() : text;
}

// Investigation questions built only from this campaign's Input Pack. Each is
// an editable starting point; nothing here calls a model or adds evidence.
// The order mixes kinds of question so consecutive suggestions feel different.
export function briefInvestigationQuestions(pack: StrategyInputPack): string[] {
  const campaign =
    short(pack.campaignName, 80, false) ||
    short(pack.product, 60, false) ||
    "this campaign";
  const audience =
    audienceLabel(short(pack.audience, 130)) || "the intended audience";
  const product = short(pack.product, 60, false);
  const objective = short(pack.objective, 140);
  // A pointer such as "Refer to next page" is not a claim to question.
  const rtb = /^(?:refer|see)\b/i.test(pack.reasonToBelieve.trim())
    ? ""
    : short(pack.reasonToBelieve, 140);
  const jtbd = short(pack.originalJTBD, 140);
  const tension = short(
    pack.parsedIMC?.sourceText.match(
      /^(?:\*\*)?(?:Consumer|Audience|Human) Tension:?(?:\*\*)?:?\s*(.+)$/im,
    )?.[1],
    140,
  );
  const kpis = pack.parsedIMC?.fields.kpis;
  const kpi =
    kpis?.status === "Supplied"
      ? short(kpis.value, 90).replace(/^[A-Z](?=[a-z])/, (first) =>
          first.toLowerCase(),
        )
      : "";
  const hypotheses = (pack.selectedSparks ?? [])
    .map((spark) => short(spark.hypothesis || spark.hypothesisToValidate, 140))
    .filter(Boolean);
  const gaps = (pack.selectedResearch ?? [])
    .filter((item) =>
      ["RESEARCH TO VALIDATE", "EVIDENCE GAPS"].includes(
        item.category.toUpperCase(),
      ),
    )
    .flatMap((item) => item.text.split("\n").map((line) => short(line, 140)))
    .filter(Boolean);
  const questions = [
    `What barriers could prevent ${audience} from responding to ${campaign}?`,
    rtb &&
      `Which part of the RTB (“${rtb}”) would this audience find hardest to believe, and why?`,
    product &&
      `What is this audience choosing instead of ${product} today, including doing nothing?`,
    `What everyday moments or cultural shifts make ${campaign} relevant right now?`,
    tension && `How could ${campaign} resolve this tension: “${tension}”?`,
    objective &&
      `What is the biggest obstacle to this objective: “${objective}”?`,
    `Which claims or benefits in ${campaign} need stronger proof?`,
    jtbd && `What gets in the way of this job to be done: “${jtbd}”?`,
    `Who outside this category has solved a similar problem for this audience, and what would transfer?`,
    product &&
      `When does this audience actually think about ${product}, and what prompts them?`,
    `How do different groups within ${audience} differ in what they need from ${campaign}?`,
    `Where could ${campaign} differ from expected category messages?`,
    kpi &&
      `What would need to change in this audience’s behavior to move ${kpi}?`,
    ...hypotheses.map(
      (hypothesis) =>
        `What evidence would test this Spark hypothesis: “${hypothesis}”?`,
    ),
    ...gaps.map((gap) => `How could we close this evidence gap: “${gap}”?`),
  ];
  return [...new Set(questions.filter((item): item is string => !!item))];
}
