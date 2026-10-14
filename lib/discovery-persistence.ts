import { inputPackVersion } from "./discovery";
import { recoverDiscoveryState } from "./discovery-state";
import type { DiscoveryState, StrategyInputPack } from "./types";

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function discoveryStorageKey(pack: StrategyInputPack) {
  const identity =
    pack.parsedIMC?.sourceText ||
    JSON.stringify([
      pack.campaignName,
      pack.objective,
      pack.audience,
      pack.product,
    ]);
  return `xc-insight-discovery-v2:${hash(identity)}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const legacyVersion = (pack: StrategyInputPack) =>
  `pack-${hash(canonical({ source: pack.parsedIMC?.sourceText ?? "", rtb: pack.reasonToBelieve, research: pack.research, sparks: pack.selectedSparks, constraints: pack.constraints }))}`;

export function readDiscoveryDraft(
  storage: Pick<Storage, "getItem">,
  pack: StrategyInputPack,
): DiscoveryState | undefined {
  try {
    const raw = storage.getItem(discoveryStorageKey(pack));
    const legacyRaw = raw ? null : storage.getItem("xc-insight-discovery-v1");
    if (!raw && !legacyRaw) return undefined;
    const value = JSON.parse(raw ?? legacyRaw!) as DiscoveryState;
    if (
      !Array.isArray(value.runs) ||
      !Array.isArray(value.savedFindingIds) ||
      !Array.isArray(value.connectionNotes)
    )
      return undefined;
    // A pre-isolation draft has no source identity. Import it only when its
    // original snapshot fingerprint matches; otherwise leave it archived intact.
    if (
      !raw &&
      value.contextVersion !== inputPackVersion(pack) &&
      value.contextVersion !== legacyVersion(pack)
    )
      return undefined;
    return recoverDiscoveryState(value);
  } catch {
    return undefined;
  }
}
