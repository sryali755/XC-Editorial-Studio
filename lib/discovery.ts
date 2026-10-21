import { runDiscoveryAgent } from "./ai/discovery-client";
import {
  discoveryFoundation as selectedFoundation,
  discoveryFoundationVersion,
} from "./discovery-context";
import { discoveryCoverage } from "./discovery-sources";
import { discoveryCardContract } from "./discovery-contract";
import { LENS_CONTRACT_VERSION } from "./discovery-lens-quality";
import { buildDiscoveryConversationMemory } from "./discovery-conversation-memory";
import { validateConnectionFindingEvidence } from "./discovery-connection-evidence";
import type {
  DiscoveryAction,
  DiscoveryConnectionNote,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryLensRun,
  DiscoveryRunVersion,
  DiscoverySourceCoverage,
  DiscoveryState,
  DiscoveryThreadMessage,
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

export function inputPackVersion(pack: StrategyInputPack) {
  return discoveryFoundationVersion(selectedFoundation(pack));
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
  preparationRole,
  peerFindings,
  nextVersionNumber,
  threadMessages,
  turnId,
  threadId,
  generationContextId,
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
  preparationRole?: "data_synthesis" | "evidence_sparks";
  peerFindings?: DiscoveryFinding[];
  nextVersionNumber?: number;
  threadMessages?: DiscoveryThreadMessage[];
  turnId?: string;
  threadId?: string;
  generationContextId?: string;
}): Promise<DiscoveryRunVersion> {
  const number =
    nextVersionNumber ??
    (previous.length
      ? Math.max(...previous.map((version) => version.number)) + 1
      : 1);
  const packVersion = inputPackVersion(pack);
  const currentContextVersions = previous.filter(
    (version) =>
      version.inputPackVersion === packVersion &&
      version.question === question &&
      version.investigationType === investigationType,
  );
  const preserveFindingId = selectedFinding?.lensId === lensId;
  const current = preserveFindingId
    ? currentContextVersions.find((version) =>
        selectedFinding.researchRunId
          ? version.id === selectedFinding.researchRunId
          : version.findings.some(
              (finding) =>
                finding.id === selectedFinding.id &&
                finding.runVersion === selectedFinding.runVersion,
            ),
      )
    : currentContextVersions.find(
        (version) => version.id === generationContextId,
      );
  const previousFindings = currentContextVersions
    .slice()
    .reverse()
    .flatMap((version) => version.findings)
    .slice(0, 30);
  const selectedRef = selectedFinding
    ? discoveryFindingRef(selectedFinding)
    : undefined;
  const currentMessageText = guidance.trim() || action.replaceAll("_", " ");
  const conversation =
    turnId && threadId && (action !== "initial" || guidance.trim())
      ? buildDiscoveryConversationMemory({
          scope: {
            kind: selectedRef ? "finding" : "agent",
            threadId,
            inputPackVersion: packVersion,
            question,
            investigationType,
            ...(selectedRef ? { findingRef: selectedRef } : {}),
          },
          previousMessages: threadMessages ?? [],
          currentMessage: {
            id: turnId,
            author: "Kevin",
            text: currentMessageText,
            createdAt: new Date().toISOString(),
            action,
            inputPackVersion: packVersion,
            question,
            investigationType,
            ...(selectedRef ? { findingRef: selectedRef } : {}),
          },
        })
      : undefined;
  const response = await runDiscoveryAgent(
    {
      agentType: "discovery",
      context: {
        ...(preparationRole ? { preparationRole } : {}),
        foundation: selectedFoundation(pack),
        lens: lensId,
        investigationType,
        question,
        action,
        previousFindings,
        ...(peerFindings?.length
          ? { peerFindings: peerFindings.slice(0, 20) }
          : {}),
        ...(selectedFinding ? { selectedFinding } : {}),
        ...(conversation ? { conversation } : {}),
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
  const allGaps = response.data.findings.every(
    (finding) => finding.evidenceState === "research_gap",
  );
  const retrievalStatus = allGaps
    ? ["find_contrary", "check_recency"].includes(action)
      ? ("unavailable" as const)
      : ("insufficient" as const)
    : ("supplied_only" as const);
  const retrievalNote = allGaps
    ? "Only supplied sources were checked. No external or enterprise source is connected; the available material did not establish this answer."
    : "Only supplied sources were analyzed; no new evidence was retrieved. Claims remain qualified by their original source.";
  const revisesFindingRef =
    current && selectedFinding
      ? discoveryFindingRef(selectedFinding)
      : undefined;
  const revisionSummary =
    current && selectedFinding
      ? generated[0]?.whatWeFound === selectedFinding.whatWeFound
        ? "The selected finding was revisited; its core conclusion did not change. The earlier version remains available."
        : `The selected finding was revised from V${selectedFinding.runVersion - 1}. The earlier wording and evidence remain available.`
      : undefined;
  return {
    id: versionId,
    ...(!preparationRole ? { lensContractVersion: LENS_CONTRACT_VERSION } : {}),
    ...(preparationRole ? { preparationRole } : {}),
    number,
    question,
    investigationType,
    action,
    guidance,
    createdAt,
    inputPackVersion: packVersion,
    retrievalStatus,
    retrievalNote,
    ...(revisesFindingRef ? { revisesFindingRef } : {}),
    ...(revisionSummary ? { revisionSummary } : {}),
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
  sourcePacks,
  sourceContextConsent = false,
  guidance,
  signal,
}: {
  pack: StrategyInputPack;
  findings: DiscoveryFinding[];
  sourcePacks?: StrategyInputPack[];
  sourceContextConsent?: boolean;
  guidance: string;
  signal?: AbortSignal;
}): Promise<DiscoveryConnectionNote> {
  if (findings.length < 2 || findings.length > 12)
    throw new Error(
      "Select between 2 and 12 exact finding versions to compare.",
    );
  if (new Set(findings.map((finding) => finding.lensId)).size < 2)
    throw new Error("Select findings from at least two different agents.");
  if (sourcePacks && sourcePacks.length !== findings.length)
    throw new Error(
      "Each selected finding needs its exact source Input Pack snapshot.",
    );
  const originals = sourcePacks ?? findings.map(() => pack);
  const campaignIdentity = (value: StrategyInputPack) =>
    value.parsedIMC?.sourceText ||
    JSON.stringify([
      value.campaignName,
      value.objective,
      value.audience,
      value.product,
    ]);
  findings.forEach((finding, index) => {
    const sourcePack = originals[index];
    if (campaignIdentity(sourcePack) !== campaignIdentity(pack))
      throw new Error("Findings from different campaigns cannot be compared.");
    if (inputPackVersion(sourcePack) !== finding.inputPackVersion)
      throw new Error(
        `The source Input Pack version for ${finding.title} does not match the selected finding.`,
      );
    if (
      inputPackVersion(sourcePack) !== inputPackVersion(pack) &&
      !sourceContextConsent
    )
      throw new Error(
        "Earlier-context findings require explicit consent for this exact selection.",
      );
    const evidenceIssue = validateConnectionFindingEvidence(sourcePack, [
      finding,
    ]);
    if (evidenceIssue) throw new Error(evidenceIssue);
  });
  const response = await runDiscoveryAgent(
    {
      agentType: "connections",
      context: {
        foundation: selectedFoundation(pack),
        findings,
        ...(sourceContextConsent
          ? { sourceFoundations: originals.map(selectedFoundation) }
          : {}),
      },
      guidance,
    },
    signal,
  );
  return {
    id: crypto.randomUUID(),
    provider: response.provider,
    retrievalStatus: "supplied_only",
    sourceContextConsent,
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
    generatedNote: response.data.note,
    editVersions: [],
    selectedFindingSnapshots: findings.map((finding) => ({
      findingRef: discoveryFindingRef(finding),
      lensId: finding.lensId,
      inputPackVersion: finding.inputPackVersion,
      title: finding.title,
      evidence: structuredClone(finding.evidence),
      whatComplicatesIt: finding.whatComplicatesIt,
    })),
    createdAt: response.generatedAt,
    editedByKevin: false,
  };
}
