import type { AgentDataMap } from "./schemas";
import { resolveRtb, type extractUpstream } from "../upstream";

function hasProposal(value: string | null | undefined) {
  const proposal = value?.trim() ?? "";
  return (
    !!proposal &&
    normalized(proposal) !== "when i i want to so i can" &&
    !/^(?:not (?:supplied|provided|generated|available)\b|no (?:separate |formal |original |proposed |distinct |approved )*(?:jtbd|job to be done|(?:xc )?(?:adaptation|framing))\b|unknown[.!]?$|n\/?a[.!]?$|none[.!]?$)/i.test(
      proposal,
    )
  );
}

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function rtbOutputIssue(
  data: AgentDataMap["rtb"],
  upstream: ReturnType<typeof extractUpstream>,
  requireJob = false,
): string | undefined {
  if (
    resolveRtb(upstream).field.status === "Supplied" &&
    !hasProposal(data.xcAdaptation)
  )
    return "The brief supplies RTBs, but the agent returned no XC adaptation. Retry this agent; the original proof is preserved.";
  // Missing properties identify legacy versions, which remain readable.
  if (!requireJob && data.proposedJTBD === undefined) return;
  const enoughContext =
    upstream.fields.audience.status === "Supplied" &&
    upstream.fields.objective.status === "Supplied";
  if (enoughContext && !hasProposal(data.proposedJTBD))
    return "The brief supplies audience and objective context, but the agent returned no proposed JTBD. Retry this agent.";
  if (
    hasProposal(data.proposedJTBD) &&
    [
      upstream.fields.objective.sourceValue,
      ...upstream.fields.objective.sourceValue.split(/\n+/),
    ]
      .filter((value) => value.trim())
      .some((value) => normalized(value) === normalized(data.proposedJTBD!))
  )
    return "The proposed JTBD repeats the campaign objective rather than describing the audience's job. Retry this agent.";
  // Sentence form belongs to prompt guidance. Do not discard an otherwise
  // complete proposal for contractions, pronouns, punctuation or phrasing.
  if (
    !enoughContext &&
    !hasProposal(data.proposedJTBD) &&
    !data.evidenceGaps.length
  )
    return "The agent must identify the missing audience or objective context before a JTBD can be proposed.";
}
