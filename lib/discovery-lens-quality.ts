import type {
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryState,
} from "./types";

export const LENS_CONTRACT_VERSION = "distinct-lenses-v1";

export const lensAssignments: Record<DiscoveryLensId, string> = {
  consumer:
    "Own audience motivations, behavior and friction. Lead with a meaningful difference between audience situations, not a general summary of the brand message. For movers, distinguish keeping an existing service from choosing a new provider. State what is intended messaging versus observed audience evidence.",
  culture:
    "Own wider social norms, rituals and tensions beyond connectivity or service transfer. Do not re-label a customer benefit as a cultural finding. A moving-stress statement in the brief can motivate a specific cultural research question; it does not establish a trend. If no cultural evidence is supplied, lead with a precise culture-specific research gap and the source needed to investigate it.",
  category:
    "Own choices and trade-offs among documented alternatives, including staying, switching or doing nothing. Do not lead with a paraphrase of transfer ease or continuity. Distinguish offer eligibility, comparison criteria and category conventions from actual competitor evidence; never invent rival offers. If comparative evidence is missing, ask a specific comparison question tied to the brief.",
  brand:
    "Own the boundary between Xfinity's promise, product proof, eligibility, approval and demonstrated experience. Do not repeat the audience's functional benefit as your main finding. Examine what the brand can substantiate for each execution and what remains unapproved or unproven. For restricted offers, preserve exact audience qualifications.",
  analogous:
    "Own documented analogous cases: another identified context, its comparable barrier, an actual approach and the limits of transferability. An Xfinity customer-message excerpt alone is NOT an analogous case. If no original documented case is supplied, lead with one precise research_gap describing the comparable mechanism to look for and the case document needed; evidence must be empty. Never substitute a summary of the current campaign or a famous case from memory.",
};

type FindingText = Pick<DiscoveryFinding, "title" | "whatWeFound">;

// Catch an obvious off-role recap; this is a bounded role check, not a
// semantic guarantee that a claimed case or its interpretation is correct.
export function discoveryLensRoleIssue(
  lens: DiscoveryLensId,
  finding: FindingText,
) {
  if (lens !== "analogous") return "";
  const lead = `${finding.title} ${finding.whatWeFound}`;
  if (
    !/\b(?:case(?:s| study)?|analog(?:y|ies|ous)|comparable|another (?:industry|context|sector)|outside.category|cross.industry|transfer(?:ring|ability)? (?:a |the )?(?:mechanism|approach|learning))\b/i.test(
      lead,
    )
  )
    return "The analogous lens returned a campaign or audience recap instead of a documented comparable case or a precise case-research gap. Identify the separate case, its intervention and transfer limits; if no case is supplied, return a focused research_gap with empty evidence. Do not repeat the Consumer answer.";
  return "";
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/staying connected|stay connected/g, "continuity")
      .replace(/simplicity|simple|easy/g, "ease")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2 &&
          !new Set([
            "the",
            "and",
            "for",
            "with",
            "from",
            "that",
            "this",
            "but",
            "not",
            "are",
            "was",
            "has",
            "its",
            "plus",
            "what",
            "how",
            "does",
            "brief",
            "supplied",
            "existing",
            "customers",
            "customer",
            "xfinity",
            "one",
            "less",
            "thing",
            "worry",
            "about",
            "supported",
            "supports",
            "framed",
            "specifically",
            "mean",
            "means",
            "meaning",
          ]).has(word),
      ),
  );
}

function nearSame(left: string, right: string) {
  const a = words(left),
    b = words(right);
  const common = [...a].filter((word) => b.has(word)).length;
  const smaller = Math.min(a.size, b.size);
  return (
    smaller >= 3 &&
    (common / new Set([...a, ...b]).size >= 0.72 ||
      (common === smaller && Math.abs(a.size - b.size) <= 2))
  );
}

export function crossLensIssue(
  lens: DiscoveryLensId,
  findings: FindingText[],
  peers: (FindingText & { lensId: DiscoveryLensId })[],
) {
  if (!findings.length) return "The agent returned no finding.";
  const exact = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const sameTitle = (left: FindingText, right: FindingText) =>
    exact(left.title) === exact(right.title) ||
    nearSame(left.title, right.title);
  const sameBody = (left: FindingText, right: FindingText) =>
    exact(left.whatWeFound) === exact(right.whatWeFound) ||
    nearSame(left.whatWeFound, right.whatWeFound);
  const sourceRecap = (finding: FindingText) =>
    /^the supplied source states:\s*[“"]/i.test(finding.whatWeFound);
  for (const [index, finding] of findings.entries()) {
    if (
      lens !== "analogous" &&
      /\b(?:analogu[ey]|analogous|outside.category)\b/i.test(finding.title) &&
      /\b(?:case|cases|not evidenced|not supplied|no documented)\b/i.test(
        finding.title + " " + finding.whatWeFound,
      ) &&
      /\b(?:not (?:supplied|evidenced)|no (?:supplied|documented)|research gap)\b/i.test(
        finding.title + " " + finding.whatWeFound,
      )
    )
      return `Finding ${index + 1} is an analogous-case gap in the ${lens} lens (findings[${index}].title). Investigate this lens's own responsibility: ${lensAssignments[lens]}`;
    if (
      findings
        .slice(index + 1)
        .some((other) => sameTitle(finding, other) || sameBody(finding, other))
    )
      return `This answer repeats a finding within the same lens. Retry for a distinct angle; previous answers and selections are preserved.`;
    for (const peer of peers) {
      if (peer.lensId === lens) continue;
      // Two disciplines may cite the same exact source observation while
      // asking genuinely different questions of it. With only title/body
      // text available, reject copied interpretations but do not mistake a
      // bare shared quotation for duplicated lens work.
      if (
        sameTitle(finding, peer) ||
        (sameBody(finding, peer) &&
          !(sourceRecap(finding) && sourceRecap(peer)))
      )
        return `This answer overlaps the ${peer.lensId} agent's finding. Retry this agent for its own perspective; previous answers and selections are preserved.`;
    }
  }
  return "";
}

export function currentPeerFindings(
  state: DiscoveryState,
  lens: DiscoveryLensId,
  packVersion: string,
  question: string,
) {
  return state.runs
    .filter((run) => run.lensId !== lens)
    .flatMap((run) => {
      const version = run.versions.find(
        (item) => item.id === run.currentVersionId,
      );
      return version?.lensContractVersion === LENS_CONTRACT_VERSION &&
        version.inputPackVersion === packVersion &&
        version.question === question &&
        version.investigationType === state.investigationType
        ? version.findings.filter(
            (finding) => !discoveryLensRoleIssue(run.lensId, finding),
          )
        : [];
    })
    .slice(0, 20);
}
