import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream } from "../lib/upstream";
import { selectedFoundation } from "../lib/ai/context";
import type { StrategyInputPack } from "../lib/types";

// Fictional campaign fixture. Approval labels below are for testing only.
export const evaluationBrief = `Campaign: Household handoffs — fictional evaluation
Objective: Encourage busy households to explore Xfinity home internet by making its everyday role understandable.
Audience: Adults coordinating work, homework and entertainment in a shared household.
Product: Xfinity home internet
Channels: Email and web
Constraints: No speed, price, reliability guarantees, competitive superiority or invented product features. Keep humor kind. No stereotypes.
Reason to believe: Home internet can connect household devices to online activities.
Research: Not supplied.
Brand messaging: Focus on the household's own activities, not technical boasting.
Messaging approval: Supplied wording only is approved for this fictional exercise. Generated lines remain unapproved.
Message hierarchy: Human situation first; supplied product role second.
Brand guidelines: Clear, warm, straightforward and inclusive. No fear or shame.
Eligibility: Not supplied.
Exclusions: Price promotion intentionally excluded.
Substantiation: No speed, performance or competitive evidence supplied.
Disclaimers: Do not imply this fixture is an official Xfinity offer.`;
export function evaluationPack(): StrategyInputPack {
  const parsedIMC = parseIMCBrief(evaluationBrief);
  const upstream = extractUpstream(evaluationBrief);
  return {
    campaignName: parsedIMC.fields.campaign.value,
    objective: parsedIMC.fields.objective.value,
    audience: parsedIMC.fields.audience.value,
    product: parsedIMC.fields.product.value,
    channel: parsedIMC.fields.channels.value,
    constraints: parsedIMC.fields.constraints.value,
    reasonToBelieve: parsedIMC.fields.reason_to_believe.value,
    research:
      "Not supplied. No audience, cultural, competitor or historical campaign research has been supplied.",
    sparks:
      "Explore household handoffs as a creative hypothesis, not a research finding.",
    selectedSparks: [
      {
        id: "handoffs",
        text: "Explore household handoffs as a creative hypothesis, not a research finding.",
        version: 0,
        versionId: "spark-fixture-v0",
      },
    ],
    parsedIMC,
    upstream,
  };
}
export const evaluationFoundation = () => selectedFoundation(evaluationPack());
