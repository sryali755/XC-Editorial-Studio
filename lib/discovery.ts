import { runDiscoveryAgent } from "./ai/discovery-client";
import { selectedFoundation } from "./ai/context";
import { discoveryCoverage } from "./discovery-sources";
import { discoveryCardContract } from "./discovery-contract";
import type {
  DiscoveryAction,
  DiscoveryConnectionNote,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryLensRun,
  DiscoveryRunVersion,
  DiscoverySourceCoverage,
  DiscoveryState,
  StrategyInputPack,
} from "./types";

export const discoveryLenses: {
  id: DiscoveryLensId;
  name: string;
  shortName: string;
  purpose: string;
  question: string;
  color: string;
  icon: string;
}[] = [
  {
    id: "consumer",
    name: "Consumer / Audience",
    shortName: "Consumer",
    purpose: "Motivations, barriers, behaviors, language and differences.",
    question: "What do people believe, need, resist or misunderstand?",
    color: "blue",
    icon: "◎",
  },
  {
    id: "culture",
    name: "Culture",
    shortName: "Culture",
    purpose: "Wider conversations, norms, behaviors and tensions.",
    question: "What is happening around this problem beyond the category?",
    color: "purple",
    icon: "◈",
  },
  {
    id: "category",
    name: "Category / Competition",
    shortName: "Category",
    purpose: "Alternatives, propositions, conventions and category friction.",
    question: "What category dynamics might explain the problem?",
    color: "green",
    icon: "↗",
  },
  {
    id: "brand",
    name: "Brand",
    shortName: "Brand",
    purpose: "Brand truths, perceptions, experience and credibility limits.",
    question: "What can Xfinity credibly say, and what is specifically true?",
    color: "amber",
    icon: "✦",
  },
  {
    id: "analogous",
    name: "Analogous Solutions",
    shortName: "Analogous",
    purpose: "Comparable problems, mechanisms and transferable lessons.",
    question: "Who faced a similar barrier, and what can be learned?",
    color: "coral",
    icon: "✳",
  },
];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function inputPackVersion(pack: StrategyInputPack) {
  const text = canonical(selectedFoundation(pack));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pack-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function emptyDiscoveryState(): DiscoveryState {
  return {
    investigationType: "problem",
    question: "",
    contextVersion: "",
    selectedLensId: "consumer",
    runs: discoveryLenses.map(({ id }) => ({
      lensId: id,
      status: "idle",
      versions: [],
      currentVersionId: "",
      thread: [],
    })),
    savedFindingIds: [],
    selectedFindingIds: [],
    findingThreads: {},
    connectionNotes: [],
    problemStatement: "",
    evidenceInsights: "",
    notes: "",
    hypothesis: "",
    strategicDirection: "",
    openQuestions: "",
    drafts: { agents: {}, findings: {}, routes: {}, connections: "" },
    asideFindingIds: [],
    workspaceView: "discovery",
  };
}

export function currentDiscoveryVersion(run?: DiscoveryLensRun) {
  return run?.versions.find((version) => version.id === run.currentVersionId);
}

export function currentDiscoveryFindings(state: DiscoveryState) {
  return state.runs.flatMap(
    (run) => currentDiscoveryVersion(run)?.findings ?? [],
  );
}

export function discoveryFindingRef(finding: DiscoveryFinding) {
  return `${finding.id}@${finding.runVersion}`;
}

export function knownDiscoveryFindings(state: DiscoveryState) {
  const byId = new Map<string, DiscoveryFinding>();
  for (const run of state.runs)
    for (const version of [...run.versions].reverse())
      for (const finding of version.findings) {
        byId.set(discoveryFindingRef(finding), finding);
        // ID-only keys keep pre-Insight-Discovery browser sessions readable.
        if (!byId.has(finding.id)) byId.set(finding.id, finding);
      }
  return byId;
}

export function discoverySourceCoverage(
  pack: StrategyInputPack,
  analyzed = false,
): DiscoverySourceCoverage[] {
  return discoveryCoverage(selectedFoundation(pack), analyzed);
}

export async function generateDiscoveryVersion({
  lensId,
  pack,
  question,
  investigationType,
  action,
  guidance,
  previous,
  selectedFinding,
  routedFromLens,
  signal,
}: {
  lensId: DiscoveryLensId;
  pack: StrategyInputPack;
  question: string;
  investigationType: "problem" | "hypothesis";
  action: DiscoveryAction;
  guidance: string;
  previous: DiscoveryRunVersion[];
  selectedFinding?: DiscoveryFinding;
  routedFromLens?: DiscoveryLensId;
  signal?: AbortSignal;
}): Promise<DiscoveryRunVersion> {
  const number = previous.length
    ? Math.max(...previous.map((version) => version.number)) + 1
    : 1;
  const preserveFindingId = selectedFinding?.lensId === lensId;
  const current = preserveFindingId
    ? previous.find((version) =>
        selectedFinding.researchRunId
          ? version.id === selectedFinding.researchRunId
          : version.findings.some(
              (finding) =>
                finding.id === selectedFinding.id &&
                finding.runVersion === selectedFinding.runVersion,
            ),
      )
    : undefined;
  const previousFindings = previous
    .flatMap((version) => version.findings)
    .slice(0, 30);
  const response = await runDiscoveryAgent(
    {
      agentType: "discovery",
      context: {
        foundation: selectedFoundation(pack),
        lens: lensId,
        investigationType,
        question,
        action,
        previousFindings,
        ...(selectedFinding ? { selectedFinding } : {}),
        ...(routedFromLens ? { routedFromLens } : {}),
      },
      guidance,
      versionNumber: number,
      ...(current
        ? {
            previousVersion: {
              number: current.number,
              text: current.findings.map((finding) => finding.title).join("\n"),
              data: responseData(current),
            },
          }
        : {}),
    },
    signal,
  );
  const versionId = crypto.randomUUID();
  const packVersion = inputPackVersion(pack);
  const createdAt = response.generatedAt;
  const generated = response.data.findings.map((finding, index) => ({
    ...finding,
    id:
      index === 0 && preserveFindingId && selectedFinding
        ? selectedFinding.id
        : `${versionId}:finding-${index + 1}`,
    lensId,
    inputPackVersion: packVersion,
    runVersion: number,
    provider: response.provider,
    version: number,
    researchRunId: versionId,
    createdAt,
    updatedAt: createdAt,
  }));
  const findings =
    selectedFinding && current
      ? current.findings.map((finding) =>
          finding.id === selectedFinding.id ? generated[0] : finding,
        )
      : generated;
  return {
    id: versionId,
    number,
    question,
    investigationType,
    action,
    guidance,
    createdAt,
    inputPackVersion: packVersion,
    inputPackSnapshot: structuredClone(pack),
    cards: findings.map(discoveryCardContract),
    findings,
    sourceCoverage: discoverySourceCoverage(pack, true),
    provider: response.provider,
    ...(response.model ? { model: response.model } : {}),
  };
}

function responseData(version: DiscoveryRunVersion) {
  return {
    findings: version.findings.map((finding) => ({
      title: finding.title,
      whatWeFound: finding.whatWeFound,
      evidence: finding.evidence,
      whyItMayMatter: finding.whyItMayMatter,
      whatComplicatesIt: finding.whatComplicatesIt,
      questionToExplore: finding.questionToExplore,
      evidenceState: finding.evidenceState,
    })),
    retrievalNote:
      "This version analyzed supplied evidence only. No external connector was searched.",
  };
}

export async function connectDiscoveryFindings({
  pack,
  findings,
  guidance,
  signal,
}: {
  pack: StrategyInputPack;
  findings: DiscoveryFinding[];
  guidance: string;
  signal?: AbortSignal;
}): Promise<DiscoveryConnectionNote> {
  const response = await runDiscoveryAgent(
    {
      agentType: "connections",
      context: { foundation: selectedFoundation(pack), findings },
      guidance,
    },
    signal,
  );
  return {
    id: crypto.randomUUID(),
    demo:
      response.provider === "mock" ||
      findings.some((finding) => finding.provider === "mock"),
    findingIds: findings.map((finding) => finding.id),
    findingVersions: findings.map((finding) => ({
      findingId: finding.id,
      runVersion: finding.runVersion,
      researchRunId: finding.researchRunId,
      inputPackVersion: finding.inputPackVersion,
    })),
    relationships: response.data.relationships,
    tensions: response.data.tensions,
    questions: response.data.questions,
    note: response.data.note,
    createdAt: response.generatedAt,
    editedByKevin: false,
  };
}
