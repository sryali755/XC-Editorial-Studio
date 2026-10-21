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

export function campaignStorageKey(pack: StrategyInputPack) {
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

export function discoveryStorageKey(pack: StrategyInputPack) {
  const key = campaignStorageKey(pack);
  return pack.workspaceBuildId ? `${key}:build:${pack.workspaceBuildId}` : key;
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

type StoredDiscoveryDraft = DiscoveryState & {
  packSnapshots?: Record<string, StrategyInputPack>;
};

const packRef = "$packRef";
let lastSavedAt = 0;

// Every run version keeps a snapshot of the pack it used, and approvals clone
// whole investigations. Storing each distinct snapshot once keeps saves within
// the ~5 MB sessionStorage quota.
export function compactStringify(value: unknown) {
  const packs: Record<string, unknown> = {};
  const ids = new Map<string, string>();
  return JSON.stringify(
    {
      $compact: 1,
      $savedAt: (lastSavedAt = Math.max(Date.now(), lastSavedAt + 1)),
      $value: value,
      $packs: packs,
    },
    (key, item) => {
      if (key !== "inputPackSnapshot" || !item || typeof item !== "object")
        return item;
      const text = JSON.stringify(item);
      let id = ids.get(text);
      if (id === undefined) {
        id = String(ids.size);
        ids.set(text, id);
        packs[id] = item;
      }
      return { [packRef]: id };
    },
  );
}

export function compactParse(raw: string): unknown {
  const parsed = JSON.parse(raw);
  if (parsed?.$compact !== 1) return parsed;
  const packs = parsed.$packs as Record<string, unknown>;
  const restore = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(restore);
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    if (packRef in record) return packs[record[packRef] as string];
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, restore(item)]),
    );
  };
  return restore(parsed.$value);
}

export function writeDiscoveryDraft(
  storage: Pick<Storage, "setItem">,
  pack: StrategyInputPack,
  discovery: DiscoveryState,
) {
  storage.setItem(discoveryStorageKey(pack), compactStringify(discovery));
}

// Rewrites saves from earlier builds in the compact format to free space.
export function compactStoredWorkspace(
  storage: Storage,
  sessionKey: string,
  indexedKeys: ReadonlySet<string> = new Set(),
) {
  for (const key of Object.keys(storage)) {
    if (indexedKeys.has(key)) continue;
    const draft = key.startsWith("xc-insight-discovery-v2:");
    if (!draft && key !== sessionKey) continue;
    try {
      const raw = storage.getItem(key);
      if (!raw || raw.startsWith('{"$compact":1')) continue;
      const value = compactParse(raw);
      storage.setItem(
        key,
        compactStringify(
          draft ? expandDraft(value as StoredDiscoveryDraft) : value,
        ),
      );
    } catch {
      /* Leave an unreadable entry untouched. */
    }
  }
}

function expandDraft({ packSnapshots, ...value }: StoredDiscoveryDraft) {
  if (!packSnapshots) return value;
  return {
    ...value,
    runs: value.runs.map((run) => ({
      ...run,
      versions: run.versions.map((version) =>
        version.inputPackSnapshot || !packSnapshots[version.inputPackVersion]
          ? version
          : {
              ...version,
              inputPackSnapshot: packSnapshots[version.inputPackVersion],
            },
      ),
    })),
  };
}

export function readDiscoveryDraft(
  storage: Pick<Storage, "getItem">,
  pack: StrategyInputPack,
): DiscoveryState | undefined {
  try {
    const raw = storage.getItem(discoveryStorageKey(pack));
    const legacyRaw =
      raw || pack.workspaceBuildId
        ? null
        : storage.getItem("xc-insight-discovery-v1");
    if (!raw && !legacyRaw) return undefined;
    const parsed = compactParse(raw ?? legacyRaw!) as StoredDiscoveryDraft;
    if (!Array.isArray(parsed.runs)) return undefined;
    const value = expandDraft(parsed);
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
