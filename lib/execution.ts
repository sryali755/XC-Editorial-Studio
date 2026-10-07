import type {
  ExecutionDirection,
  StrategyInputPack,
  UpstreamKey,
} from "./types";
import { fieldText, upstreamFields } from "./upstream";

export const emptyExecution: ExecutionDirection = {
  requiredAssets: "",
  assetCount: 0,
  channels: "",
  placements: "",
  desktop: "",
  mobile: "",
  messaging: "",
  copy: "",
  creativeDirection: "",
  formats: "",
  timing: "",
  constraints: "",
};
function knownExecution(
  pack: StrategyInputPack,
): Partial<Omit<ExecutionDirection, "assetCount">> {
  const fields = (keys: UpstreamKey[]) =>
    keys
      .flatMap((key) => {
        const field = pack.upstream?.fields[key];
        return field && field.status !== "Not supplied"
          ? [
              `${upstreamFields.find((f) => f.key === key)?.label}: ${fieldText(field)}`,
            ]
          : [];
      })
      .join("\n\n");
  return {
    channels: pack.channel,
    messaging: fields([
      "brandMessaging",
      "messageHierarchy",
      "messagingApproval",
    ]),
    copy: fields(["disclaimers"]),
    timing: fields(["milestones"]),
    constraints: [
      pack.constraints,
      fields([
        "brandGuidelines",
        "eligibility",
        "exclusions",
        "substantiation",
        "partnerApproval",
      ]),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
// Refresh inherited values when the approved pack changes, preserving manual execution edits.
export function prefillExecution(
  current: ExecutionDirection,
  pack: StrategyInputPack,
  previousPack?: StrategyInputPack,
): ExecutionDirection {
  const previous = previousPack ? knownExecution(previousPack) : {};
  const result = { ...emptyExecution, ...current };
  for (const [key, value] of Object.entries(knownExecution(pack))) {
    const field = key as Exclude<keyof ExecutionDirection, "assetCount">;
    if (!result[field] || result[field] === previous[field])
      result[field] = value;
  }
  return result;
}
