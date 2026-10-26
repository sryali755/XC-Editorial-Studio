import {
  compileInputPack,
  currentPreparation,
  emptyPreparation,
  researchSources,
  studioPreparationIssue,
} from "./preparation";
import { exactGroundingExcerpt } from "./ai/spark-quality";
import { outputSchemas } from "./ai/schemas";
import { rtbOutputIssue } from "./ai/rtb-quality";
import { researchSections } from "./ai/format";
import { extractJobToBeDone } from "./ai/context";
import { parseIMCBrief } from "./imc-parser";
import { canonicalCampaign } from "./canonical-campaign";
import {
  extractUpstream,
  getUpstream,
  resolveRtb,
  sourceContext,
} from "./upstream";
import {
  emptyDiscoveryState,
  inputPackVersion,
  knownDiscoveryFindings,
} from "./discovery";
import {
  compactParse,
  campaignStorageKey,
  readDiscoveryDraft,
  writeDiscoveryDraft,
} from "./discovery-persistence";
import { recoverDiscoveryState } from "./discovery-state";
import { emptyExecution } from "./execution";
import { extractStudioIMCRecords } from "./studio-imc-records";
import {
  consolidateWorkspaceFields,
  preserveRestoredWorkspace,
  seedSelectedWorkspace,
} from "./workspace-suggestions";
import { canvasPrefill } from "./workspace-canvas-prefill";
import { assertCampaignName, usableCampaignName } from "./campaign-identity";
import {
  resolveCampaignIdentity,
  type CampaignNameConfirmation,
} from "./campaign-naming";
import {
  sourceCampaignNames,
  sourceJobContext,
  sourceParentPlatform,
} from "./imc-source-context";
import type { StudioBriefInput } from "./studio-brief-input";
import type {
  ApprovedStrategy,
  DiscoveryRunVersion,
  DiscoveryState,
  GeneratedBrief,
  PreparationState,
  StrategyInputPack,
  StrategySession,
  SuppliedDiscoveryEvidence,
} from "./types";

export const studioStorageKey = "xc-insight-studio-v1";
export function studioPackLabel(session: DiscoveryStudioSession) {
  const ids = [
    ...new Set(
      [...session.packHistory]
        .reverse()
        .map((snapshot) => snapshot.version)
        .concat(inputPackVersion(studioPack(session))),
    ),
  ];
  return `Input pack v${ids.indexOf(inputPackVersion(studioPack(session))) + 1}`;
}
export type StudioScreen = "inputs" | "discovery" | "strategy" | "brief";
export interface StudioResearchSelection {
  id: string;
  versionId: string;
  version: number;
  category: string;
  text: string;
  source: string;
  status: "ai_synthesis" | "supplied";
}
export function studioResearchChoices(session: DiscoveryStudioSession) {
  const version = currentPreparation(session.preparation, "research");
  if (!version || studioPreparationIssue(session.preparation, "research"))
    return [];
  return [version].flatMap((version) => {
    const data = version.data;
    if (!data || !("suppliedEvidence" in data))
      return [
        {
          id: `${version.id}:summary`,
          versionId: version.id,
          version: version.number,
          category: "Research synthesis",
          text: version.text,
          source: "AI synthesis of supplied context",
          status: "ai_synthesis" as const,
        },
      ];
    return researchSections(data).flatMap((section, index) => {
      const values = section.values.filter(
        (value) => value.trim() && value !== "Not supplied.",
      );
      return values.length
        ? [
            {
              id: `${version.id}:${index}`,
              versionId: version.id,
              version: version.number,
              category: section.title,
              text: values.join("\n"),
              source: "AI synthesis of supplied context",
              status: "ai_synthesis" as const,
            },
          ]
        : [];
    });
  });
}
export interface DiscoveryStudioSession {
  schemaVersion: 1;
  workspaceBuildId?: string;
  screen: StudioScreen;
  sourceDocumentText?: string;
  selectedCampaignScope?: string;
  campaignNameConfirmation?: CampaignNameConfirmation;
  campaignNameHistory?: CampaignNameConfirmation[];
  preparation: PreparationState;
  evidence: SuppliedDiscoveryEvidence[];
  sparkVersions: DiscoveryRunVersion[];
  researchVersions: DiscoveryRunVersion[];
  currentResearchVersionId: string;
  preparationErrors: Partial<
    Record<"reasonToBelieve" | "research" | "sparks", string>
  >;
  currentSparkVersionId: string;
  selectedRtbVersionId?: string;
  selectedResearchIds?: string[];
  selectedResearchSources?: string[];
  includedContextIds?: string[];
  confirmationFingerprint?: string;
  campaignArchive?: Record<
    string,
    {
      preparation: PreparationState;
      workspaceBuildId?: string;
      campaignNameConfirmation?: DiscoveryStudioSession["campaignNameConfirmation"];
      campaignNameHistory?: CampaignNameConfirmation[];
      evidence: SuppliedDiscoveryEvidence[];
      selectedRtbVersionId?: string;
      selectedResearchIds?: string[];
      selectedResearchSources?: string[];
      includedContextIds?: string[];
      confirmationFingerprint?: string;
      approved: ApprovedStrategy | null;
      approvals: ApprovedStrategy[];
      approvalSnapshots: Record<string, DiscoveryState>;
      briefs: GeneratedBrief[];
      briefInputs?: Record<string, StudioBriefInput>;
    }
  >;
  packHistory: {
    version: string;
    pack: StrategyInputPack;
    createdAt: string;
  }[];
  approved: ApprovedStrategy | null;
  approvals: ApprovedStrategy[];
  approvalSnapshots: Record<string, DiscoveryState>;
  briefs: GeneratedBrief[];
  briefInputs?: Record<string, StudioBriefInput>;
}
export function emptyStudio(): DiscoveryStudioSession {
  return {
    schemaVersion: 1,
    screen: "inputs",
    preparation: structuredClone(emptyPreparation),
    evidence: [],
    sparkVersions: [],
    researchVersions: [],
    currentResearchVersionId: "",
    preparationErrors: {},
    currentSparkVersionId: "",
    selectedRtbVersionId: "",
    selectedResearchIds: [],
    selectedResearchSources: [],
    packHistory: [],
    approved: null,
    approvals: [],
    approvalSnapshots: {},
    briefs: [],
    briefInputs: {},
  };
}
export function studioPack(session: DiscoveryStudioSession): StrategyInputPack {
  const pack = compileInputPack(session.preparation);
  const identity = resolveCampaignIdentity(
    session.preparation.sourceSnapshot,
    session.campaignNameConfirmation,
  );
  const originalRtb = resolveRtb(getUpstream(session.preparation)).field;
  const originalRtbText =
    originalRtb.status === "Supplied"
      ? originalRtb.sourceValue
      : pack.reasonToBelieve;
  const records = extractStudioIMCRecords(session.preparation.sourceSnapshot);
  const jtbdContext = sourceJobContext(session.preparation.sourceSnapshot);
  const currentResearch = !studioPreparationIssue(
    session.preparation,
    "research",
  )
    ? currentPreparation(session.preparation, "research")
    : undefined;
  const researchAnalyzed = !!currentResearch;
  const evidenceAnalyzed =
    researchAnalyzed &&
    JSON.stringify(currentResearch.inputContext?.suppliedEvidence ?? []) ===
      JSON.stringify(session.evidence);
  const sparkVersion = !studioPreparationIssue(session.preparation, "sparks")
    ? currentPreparation(session.preparation, "sparks")
    : undefined;
  const selectedSparks =
    sparkVersion?.sparks
      .filter(
        (spark) =>
          session.preparation.selectedSparkIds.includes(spark.id) &&
          spark.excerpt_verified === true &&
          !!exactGroundingExcerpt(
            spark.excerpt || spark.campaignGrounding || "",
            session.preparation.sourceSnapshot,
          ),
      )
      .map((spark) => ({
        ...spark,
        versionId: sparkVersion.id,
        version: sparkVersion.number,
      })) ?? [];
  const selectedResearch = studioResearchChoices(session).filter((finding) =>
    session.selectedResearchIds?.includes(finding.id),
  );
  const rtb = session.preparation.outputs
    .find((output) => output.agentId === "reasonToBelieve")
    ?.versions.find(
      (version) =>
        version.id === session.selectedRtbVersionId &&
        version.sourceBrief === session.preparation.sourceSnapshot,
    );
  const parsedRtb = outputSchemas.rtb.safeParse(rtb?.data);
  const validProposal =
    parsedRtb.success &&
    parsedRtb.data.originalRtb === (originalRtb.sourceValue || null) &&
    !rtbOutputIssue(parsedRtb.data, getUpstream(session.preparation));
  const selectedAdaptation =
    parsedRtb.success && validProposal
      ? (parsedRtb.data.xcAdaptation ?? "")
      : "";
  const proposedJTBD =
    parsedRtb.success && validProposal ? parsedRtb.data.proposedJTBD || "" : "";
  return {
    ...pack,
    canonicalCampaign: canonicalCampaign({
      sourceBrief: session.preparation.sourceSnapshot,
      requirements: getUpstream(session.preparation),
      campaignContext: { campaignName: identity.displayName || "" },
      suppliedEvidence: session.evidence,
      proposedJTBD,
      currentRtb: { proposal: selectedAdaptation },
      selectedSparks,
    }),
    workspaceBuildId: session.workspaceBuildId,
    campaignName: identity.displayName || "",
    campaignIdentity: identity,
    reasonToBelieve: originalRtbText,
    imcRecords: records,
    originalJTBD: jtbdContext.original
      .map((record) => record.text)
      .join("\n\n"),
    jtbdContext,
    parentPlatform: sourceParentPlatform(session.preparation.sourceSnapshot),
    proposedRTB: selectedAdaptation,
    ...(proposedJTBD ? { proposedJTBD } : {}),
    selectedPreparationVersions: {
      ...((selectedAdaptation || proposedJTBD) && rtb
        ? { reasonToBelieve: rtb.id }
        : {}),
      ...(currentResearch ? { research: currentResearch.id } : {}),
      ...(sparkVersion ? { sparks: sparkVersion.id } : {}),
    },
    selectedPreparationProviders: {
      ...((selectedAdaptation || proposedJTBD) && rtb?.provider
        ? { reasonToBelieve: rtb.provider }
        : {}),
      ...(selectedResearch.length && currentResearch?.provider
        ? { research: currentResearch.provider }
        : {}),
      ...(selectedSparks.length && sparkVersion?.provider
        ? { sparks: sparkVersion.provider }
        : {}),
    },
    preparationGuidance: {
      ...(selectedAdaptation && rtb?.inputContext?.steeringText.trim()
        ? { reasonToBelieve: rtb.inputContext.steeringText }
        : {}),
      ...(currentResearch?.inputContext?.steeringText.trim()
        ? { research: currentResearch.inputContext.steeringText }
        : {}),
      ...(sparkVersion?.inputContext?.steeringText.trim()
        ? { sparks: sparkVersion.inputContext.steeringText }
        : {}),
    },
    sourceAvailability: [
      {
        source: "Supplied IMC brief",
        status: session.preparation.sourceSnapshot.trim()
          ? researchAnalyzed
            ? ("supplied_analyzed" as const)
            : ("supplied_not_analyzed" as const)
          : ("insufficient_evidence" as const),
        detail:
          "User-supplied brief; claims and approvals are not independently verified.",
      },
      ...session.evidence.map((item) => ({
        source: item.source,
        status: item.text.trim()
          ? evidenceAnalyzed
            ? ("supplied_analyzed" as const)
            : ("supplied_not_analyzed" as const)
          : ("insufficient_evidence" as const),
        detail:
          "Manually supplied source; no external retrieval or independent verification.",
      })),
      ...researchSources.map((source) => ({
        source: source.name,
        status: "not_connected" as const,
        detail:
          "No authorized connector is configured; selection does not retrieve results.",
      })),
    ],
    research: selectedResearch
      .map(
        (finding) =>
          `${finding.category} · V${finding.version} · ${finding.source}\n${finding.text}`,
      )
      .join("\n\n"),
    selectedResearch,
    selectedResearchSources: session.selectedResearchSources ?? [],
    selectedSparks,
    sparks: selectedSparks.map((spark) => spark.text).join("\n"),
    suppliedEvidence: session.evidence,
    evidenceSparks: [],
    preparationSource:
      "XC Strategy Studio · supplied IMC and explicitly selected preparation outputs",
  };
}
export function seedStudioDiscovery(
  pack: StrategyInputPack,
  initialFindings?: DiscoveryState,
): DiscoveryState {
  const initial = emptyDiscoveryState();
  if (!pack.parsedIMC?.sourceText.trim()) return initial;
  // New drafts only: retain source wording and distinguish editable proposals
  // using existing field provenance. Missing context never becomes stored filler.
  const supplied = (field?: { status: string; value: string }) =>
    field?.status === "Supplied" ? field.value.trim() : "";
  const imc = pack.parsedIMC;
  const records = (group: string) =>
    pack.imcRecords
      ?.filter((record) => record.group === group)
      .map((record) => record.text)
      .join("\n\n") ?? "";
  const tension =
    imc.sourceText
      .match(
        /^(?:\*\*)?(?:Consumer|Audience|Human) Tension:?(?:\*\*)?:?\s*(.+)$/im,
      )?.[1]
      ?.trim() ?? "";
  const jobToBeDone =
    pack.originalJTBD !== undefined
      ? pack.originalJTBD.trim()
      : extractJobToBeDone(imc.sourceText);
  const deliverableRecords = records("deliverable");
  const originalRtb = pack.reasonToBelieve.trim();
  const keyMessage =
    pack.imcRecords?.find((record) => record.group === "key_message")?.text ??
    supplied(imc.fields.message_hierarchy);
  const canvas = canvasPrefill(
    pack,
    {
      insight:
        tension ||
        supplied(imc.fields.research)
          .split(/\n\s*\n/)[0]
          .trim(),
      originalJob: jobToBeDone,
      message: keyMessage,
    },
    initialFindings,
  );
  // Brand messaging keeps each source occurrence: a quoted line (such as a
  // core creative thought) suits the brief line; prose suits the direction.
  const messaging = supplied(imc.fields.brand_messaging)
    ? imc.fields.brand_messaging.occurrences.map((item) => item.trim())
    : [];
  const creativeThought =
    messaging
      .map((item) => /^[“"]([^”"]{3,200})[”"]/.exec(item)?.[1]?.trim())
      .find(Boolean) ?? "";
  const direction = messaging.find((item) => !/^[“"]/.test(item)) ?? "";
  const deliverables = deliverableRecords || pack.channel.trim();
  const constraints = pack.constraints.trim();
  const rtbQuestion =
    originalRtb && pack.rtbApprovalStatus !== "approved"
      ? `Is the RTB approved by GTM for this campaign? Current status: ${pack.rtbApprovalStatus ?? "unknown"}.`
      : "";
  return seedSelectedWorkspace(
    {
      ...initial,
      workspaceSuggestionsSeeded: true,
      contextVersion: inputPackVersion(pack),
      question: "",
      humanBriefLine: keyMessage || creativeThought,
      problemStatement: pack.objective.trim(),
      evidenceInsights: canvas.insight.value,
      workingAudience: pack.audience.trim(),
      workingJTBD: canvas.job.value,
      workingRTB: originalRtb,
      strategicDirection: direction,
      openQuestions: [supplied(imc.supplemental.learningAgenda), rtbQuestion]
        .filter(Boolean)
        .join("\n\n"),
      // Channels go to Creative only when the deliverables come from the
      // brief's own deliverable lines; otherwise they fill Deliverables.
      executionConsiderations: [
        supplied(imc.fields.brand_guidelines),
        deliverableRecords && pack.channel.trim()
          ? `Channels: ${pack.channel.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      wholeBrief: {
        deliverables,
        // Some briefs list requested deliverables as constraints; never
        // repeat the same text in two boxes.
        mandatories: deliverables.includes(constraints) ? "" : constraints,
        timelines: records("timing"),
      },
      enabledLensIds: ["consumer", "culture", "category", "brand", "analogous"],
    },
    pack,
    {
      humanBriefLine: keyMessage
        ? "From the IMC key message"
        : "From the IMC core creative thought · not approved",
      problemStatement: "From the IMC objective",
      evidenceInsights: canvas.insight.label,
      workingAudience: "From the IMC audience",
      workingJTBD: canvas.job.label,
      workingRTB: `Original RTB · GTM approval: ${pack.rtbApprovalStatus ?? "unknown"}`,
      strategicDirection: "From the IMC brand messaging · not approved",
      openQuestions: "From the IMC learning agenda and RTB approval status",
      executionConsiderations: "From the IMC brand guidelines and channels",
      "wholeBrief.deliverables": "From the IMC brief",
      "wholeBrief.mandatories": "From the IMC brief",
      "wholeBrief.timelines": "From the IMC brief",
    },
    { evidenceInsights: canvas.insight, workingJTBD: canvas.job },
  );
}
export function prefillWorkspaceSuggestions(
  state: DiscoveryState,
  pack: StrategyInputPack,
): DiscoveryState {
  // Compatibility entry point for restored canvases. Empty values may be
  // intentional: only seedStudioDiscovery initializes new source-aware fields.
  if (
    state.workspaceSuggestionsSeeded ||
    !pack.parsedIMC?.sourceText.trim() ||
    !state.workspaceSuggestionContext
  )
    return state;
  return preserveRestoredWorkspace(state);
}
export function applyStudioSource(
  current: DiscoveryStudioSession,
  source: string,
): DiscoveryStudioSession {
  if (!source.trim())
    throw new Error("Supply an IMC brief before updating the input pack.");
  const parsedIMC = parseIMCBrief(source);
  if (
    new Set(parsedIMC.fields.campaign.occurrences.filter(usableCampaignName))
      .size > 1
  )
    throw new Error(
      "Multiple campaigns were identified. Select one campaign before building its Input Pack.",
    );
  const upstream = extractUpstream(parsedIMC);
  const sameSource = current.preparation.sourceSnapshot === source;
  const previousPack = studioPack(current);
  const oldKey = current.preparation.sourceSnapshot
    ? campaignStorageKey(previousPack)
    : "";
  const newKey = campaignStorageKey({ ...previousPack, parsedIMC });
  const campaignArchive = {
    ...current.campaignArchive,
    ...(oldKey
      ? {
          [oldKey]: {
            workspaceBuildId: current.workspaceBuildId,
            preparation: structuredClone(current.preparation),
            campaignNameConfirmation: current.campaignNameConfirmation,
            campaignNameHistory: current.campaignNameHistory,
            evidence: structuredClone(current.evidence),
            selectedRtbVersionId: current.selectedRtbVersionId,
            selectedResearchIds: current.selectedResearchIds,
            selectedResearchSources: current.selectedResearchSources,
            includedContextIds: current.includedContextIds,
            confirmationFingerprint: current.confirmationFingerprint,
            approved: current.approved,
            approvals: current.approvals,
            approvalSnapshots: current.approvalSnapshots,
            briefs: current.briefs,
            briefInputs: current.briefInputs,
          },
        }
      : {}),
  };
  const restored = !sameSource ? campaignArchive[newKey] : undefined;
  return {
    ...current,
    workspaceBuildId:
      restored?.workspaceBuildId ??
      (sameSource ? current.workspaceBuildId : undefined),
    campaignArchive,
    campaignNameConfirmation:
      restored?.campaignNameConfirmation ??
      (sameSource ? current.campaignNameConfirmation : undefined),
    campaignNameHistory:
      restored?.campaignNameHistory ??
      (sameSource ? current.campaignNameHistory : undefined),
    preparation: restored
      ? {
          ...restored.preparation,
          upstreamDraft: source,
          sourceSnapshot: source,
          parsedIMC,
          upstream,
        }
      : {
          ...current.preparation,
          upstreamDraft: source,
          sourceSnapshot: source,
          parsedIMC,
          upstream,
          context: sourceContext(upstream),
          outputs: current.preparation.outputs.map((output) => ({
            ...output,
            status: sameSource ? output.status : "idle",
            error: undefined,
            currentVersionId: sameSource ? output.currentVersionId : "",
          })),
          selectedSparkIds: sameSource
            ? current.preparation.selectedSparkIds
            : [],
          keptSparkIds: sameSource ? current.preparation.keptSparkIds : [],
        },
    evidence: restored?.evidence ?? (sameSource ? current.evidence : []),
    currentSparkVersionId: sameSource ? current.currentSparkVersionId : "",
    selectedRtbVersionId:
      restored?.selectedRtbVersionId ??
      (sameSource ? current.selectedRtbVersionId : ""),
    selectedResearchIds:
      restored?.selectedResearchIds ??
      (sameSource ? current.selectedResearchIds : []),
    selectedResearchSources:
      restored?.selectedResearchSources ??
      (sameSource ? current.selectedResearchSources : []),
    includedContextIds:
      restored?.includedContextIds ??
      (sameSource ? current.includedContextIds : undefined),
    confirmationFingerprint:
      restored?.confirmationFingerprint ??
      (sameSource ? current.confirmationFingerprint : undefined),
    approved: restored?.approved ?? (sameSource ? current.approved : null),
    approvals: restored?.approvals ?? (sameSource ? current.approvals : []),
    approvalSnapshots:
      restored?.approvalSnapshots ??
      (sameSource ? current.approvalSnapshots : {}),
    briefs: restored?.briefs ?? (sameSource ? current.briefs : []),
    briefInputs:
      restored?.briefInputs ?? (sameSource ? current.briefInputs : {}),
    packHistory: current.preparation.sourceSnapshot
      ? [
          {
            version: inputPackVersion(previousPack),
            pack: structuredClone(previousPack),
            createdAt: new Date().toISOString(),
          },
          ...current.packHistory,
        ]
      : current.packHistory,
  };
}
export function confirmStudioCampaignName(
  current: DiscoveryStudioSession,
  name: string,
): DiscoveryStudioSession {
  if (!current.preparation.sourceSnapshot || !usableCampaignName(name))
    throw new Error("Enter a clear campaign name and confirm it explicitly.");
  if (
    sourceCampaignNames(parseIMCBrief(current.preparation.sourceSnapshot))
      .length > 1
  )
    throw new Error(
      "Select one campaign before confirming its display name. Another campaign's original identity cannot be replaced by a display-name correction.",
    );
  const confirmation: CampaignNameConfirmation = {
    name: name.trim(),
    sourceBrief: current.preparation.sourceSnapshot,
    confirmedAt: new Date().toISOString(),
  };
  const previous = current.campaignNameConfirmation;
  return {
    ...current,
    campaignNameConfirmation: confirmation,
    campaignNameHistory: [
      confirmation,
      ...(current.campaignNameHistory ?? (previous ? [previous] : [])),
    ],
    confirmationFingerprint: undefined,
  };
}

export function studioPreparationUpstream(session: DiscoveryStudioSession) {
  const upstream = getUpstream(session.preparation),
    pack = studioPack(session);
  if (pack.campaignIdentity?.origin !== "human_confirmed") return upstream;
  return {
    ...upstream,
    fields: {
      ...upstream.fields,
      campaignName: {
        ...upstream.fields.campaignName,
        value: pack.campaignName,
        status: "Supplied" as const,
        note: "Human-confirmed campaign name; not extracted from the IMC brief.",
      },
    },
  };
}

export function readStudio(storage: Pick<Storage, "getItem">): {
  session: DiscoveryStudioSession;
  discovery: DiscoveryState;
} {
  let session = emptyStudio();
  try {
    const raw = storage.getItem(studioStorageKey);
    if (raw) {
      const saved = compactParse(raw) as Partial<DiscoveryStudioSession>;
      if (
        saved.schemaVersion === 1 &&
        saved.preparation &&
        Array.isArray(saved.briefs) &&
        Array.isArray(saved.evidence)
      )
        session = {
          ...session,
          ...saved,
          screen:
            (saved.screen as string) === "canvas"
              ? "discovery"
              : (saved.screen as string) === "final"
                ? "strategy"
                : (saved.screen ?? "inputs"),
        };
    } else {
      const old = JSON.parse(
        storage.getItem("xc-strategy-session-v1") || "null",
      ) as StrategySession | null;
      if (old?.preparation?.sourceSnapshot)
        session.preparation = structuredClone(old.preparation);
    }
  } catch {
    /* Retain the original storage entry; start a fresh local workspace. */
  }
  // Rebuild old partial source fields through the current parser, preserving versions.
  session.preparation.outputs = session.preparation.outputs.map((output) => {
    if (output.status !== "pending") return output;
    const message =
      "Generation was interrupted by a page reload. Previous versions are preserved. Retry this agent to run it again.";
    session.preparationErrors = {
      ...session.preparationErrors,
      [output.agentId]: message,
    };
    return { ...output, status: "failed" as const, error: message };
  });
  if (session.preparation.sourceSnapshot) {
    const parsedIMC = parseIMCBrief(session.preparation.sourceSnapshot);
    session.preparation = {
      ...session.preparation,
      parsedIMC,
      upstream: extractUpstream(parsedIMC),
    };
  }
  const pack = studioPack(session);
  const savedDiscovery = readDiscoveryDraft(storage, pack);
  const discovery = consolidateWorkspaceFields(
    recoverDiscoveryState(
      savedDiscovery
        ? session.approved
          ? savedDiscovery
          : preserveRestoredWorkspace(savedDiscovery)
        : seedStudioDiscovery(pack),
    ),
  );
  return {
    session,
    discovery: session.approved
      ? discovery
      : prefillWorkspaceSuggestions(discovery, pack),
  };
}
export function saveStudioDiscovery(
  storage: Pick<Storage, "setItem">,
  pack: StrategyInputPack,
  discovery: DiscoveryState,
) {
  writeDiscoveryDraft(storage, pack, discovery);
}
export function studioStrategySession(
  session: DiscoveryStudioSession,
  discovery: DiscoveryState,
): StrategySession {
  const pack = studioPack(session);
  return {
    preparation: session.preparation,
    pack,
    sharedPack: pack,
    step: 0,
    outputs: [],
    selected: [],
    synthesis: [],
    finalLine: "",
    finalSource: "",
    approved: session.approved,
    execution: emptyExecution,
    brief: null,
    discovery,
  };
}
export function packageDiscoveryBrief(
  approved: ApprovedStrategy,
  discovery: DiscoveryState,
): GeneratedBrief {
  const canvas = approved.discoveryCanvas;
  if (
    approved.approvalState !== "Approved" ||
    !canvas ||
    !canvas.briefLine.trim() ||
    canvas.briefLine !== approved.briefLine ||
    !approved.approvedAt
  )
    throw new Error(
      "Approve the human-authored whole brief before packaging it.",
    );
  const pack = approved.strategyInputPack;
  assertCampaignName(pack);
  if (canvas.inputPackVersion !== inputPackVersion(pack))
    throw new Error(
      "The confirmed Input Pack snapshot does not match this strategy.",
    );
  const draft = canvas.wholeBrief ?? {};
  const known = knownDiscoveryFindings(discovery);
  const findings = canvas.findingReferences.map((ref) => {
    const finding = known.get(ref);
    if (!finding)
      throw new Error(
        `Saved discovery ${ref} is unavailable. Restore its original version before exporting.`,
      );
    if (
      finding.evidence.some((evidence) => evidence.accessScope !== "supplied")
    )
      throw new Error(
        "This brief contains a restricted or unavailable source. Export is blocked until authorized access can be preserved.",
      );
    return finding;
  });
  const original = (key: "disclaimers" | "eligibility" | "substantiation") => {
    const value = pack.upstream?.fields[key]?.sourceValue?.trim() ?? "";
    return /^not supplied\.?$/i.test(value) ? "" : value;
  };
  const sections = [
    { title: "Context", content: draft.context ?? pack.campaignName },
    { title: "Objective", content: draft.objective ?? pack.objective },
    {
      title: "Audience",
      content: canvas.workingAudience ?? draft.audience ?? pack.audience,
    },
    { title: "Insight / Opportunity", content: canvas.evidenceInsights },
    { title: "Brief", content: canvas.briefLine },
    {
      title: "Job to be done",
      content:
        canvas.workingJTBD !== undefined
          ? canvas.workingJTBD || "Not supplied"
          : pack.originalJTBD ||
            extractJobToBeDone(pack.parsedIMC?.sourceText) ||
            "Not supplied",
    },
    {
      title: "Proof / RTB",
      content: canvas.workingRTB ?? pack.reasonToBelieve,
    },
    {
      title: "Selected research · AI synthesis",
      content: pack.research || "No research synthesis selected.",
    },
    {
      title: "Selected Sparks",
      content:
        pack.selectedSparks
          ?.map((spark) =>
            [
              spark.title || spark.text,
              `Preparation V${spark.version - 1} · ${spark.versionId}`,
              spark.idea || spark.text,
              spark.excerpt ||
                spark.campaignGrounding ||
                "No supporting excerpt supplied.",
              spark.hypothesis ||
                spark.hypothesisToValidate ||
                "Hypothesis not supplied.",
              spark.rationale || "",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n") || "No Sparks selected.",
    },
    // Thought-starters, hypothesis, tension and the whole-brief audience were
    // merged into other boxes; only older approved canvases still carry them.
    ...(draft.thoughtStarters?.trim()
      ? [{ title: "Thought-starters", content: draft.thoughtStarters }]
      : []),
    { title: "Deliverables", content: draft.deliverables ?? pack.channel },
    {
      title: "Mandatories",
      content: [
        draft.mandatories ?? pack.constraints,
        original("eligibility"),
        original("substantiation"),
        original("disclaimers"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    { title: "Timelines", content: draft.timelines ?? "" },
    { title: "Problem", content: canvas.problem },
    { title: "Strategic direction", content: canvas.strategicDirection },
    {
      title: "Additional brief instructions",
      content: canvas.executionConsiderations || "Not supplied",
    },
    ...(canvas.hypothesis?.trim()
      ? [
          {
            title: "Working hypothesis — unvalidated",
            content: canvas.hypothesis,
          },
        ]
      : []),
    { title: "Open questions", content: canvas.openQuestions },
    ...(canvas.humanTension?.trim()
      ? [{ title: "Human / Consumer Tension", content: canvas.humanTension }]
      : []),
    ...(draft.audience?.trim() && draft.audience !== canvas.workingAudience
      ? [{ title: "Audience — whole-brief context", content: draft.audience }]
      : []),
    { title: "Original upstream RTB", content: pack.reasonToBelieve },
    {
      title: "Original upstream JTBD",
      content: pack.originalJTBD || "Not supplied",
    },
    ...(pack.proposedRTB
      ? [
          {
            title: "Proposed XC adaptation — not upstream-approved",
            content: pack.proposedRTB,
          },
        ]
      : []),
    {
      title: "Original IMC context",
      content: [
        "Supplied source context, not independently verified. Historical dates and offers require confirmation.",
        ...(pack.campaignIdentity
          ? [
              `Campaign identity provenance: ${pack.campaignIdentity.sourceReference}${pack.campaignIdentity.confirmedAt ? ` Confirmed at ${pack.campaignIdentity.confirmedAt}.` : ""}`,
              `Campaign ID: ${pack.campaignIdentity.id || "Legacy source snapshot"}. Confirmed display name: ${pack.campaignName}.`,
              `Source document title: ${pack.campaignIdentity.sourceDocumentTitle || "Not supplied"}. Source file: ${pack.campaignIdentity.sourceDocumentFileName || "Pasted text"}.`,
              ...(pack.campaignIdentity.sourceCandidate
                ? [
                    `Source name candidate (${pack.campaignIdentity.sourceCandidate.locator}; ${pack.campaignIdentity.sourceCandidate.kind}): ${pack.campaignIdentity.sourceCandidate.excerpt}`,
                  ]
                : []),
              `Campaign name status: ${pack.campaignIdentity.confirmationStatus || "Legacy identity record"}. Original source campaign name: ${pack.campaignIdentity.sourceName || "Not explicitly supplied"}.`,
            ]
          : []),
        ...[
          ["Campaign", pack.campaignName],
          ["Objective", pack.objective],
          ["Audience", pack.audience],
          ["Product", pack.product],
          ["Channels", pack.channel],
          ["Constraints", pack.constraints],
        ].map(([label, value]) => `${label}\n${value || "Not supplied"}`),
        ...(pack.imcRecords ?? [])
          .filter((record) =>
            [
              "key_message",
              "deliverable",
              "timing",
              "source_reference",
              "brand_positioning",
              "campaign_background",
            ].includes(record.group),
          )
          .map(
            (record) =>
              `${record.label} · source line ${record.line}\n${record.text}`,
          ),
      ].join("\n\n"),
    },
    {
      title: "Source availability",
      content:
        pack.sourceAvailability
          ?.map(
            (source) => `${source.source}: ${source.status} — ${source.detail}`,
          )
          .join("\n") || "No external sources connected.",
    },
    {
      title: "Saved discoveries — worth considering, not verification",
      content: findings
        .map((finding) =>
          [
            finding.title,
            `${finding.lensId} · ${finding.inputPackVersion} · Run V${finding.runVersion} · ${finding.researchRunId}`,
            finding.provider === "mock"
              ? "DEMO DATA · simulated analysis"
              : "Analysis of supplied evidence; no external retrieval",
            `Observed claim: ${finding.whatWeFound}`,
            ...finding.evidence.map(
              (evidence) =>
                `${evidence.source} · ${evidence.locator || "Supplied source"}\n“${evidence.excerpt}”\nDate: ${evidence.date} · Audience: ${evidence.audience} · Access: ${evidence.accessScope}`,
            ),
            `Interpretation: ${finding.whyItMayMatter}`,
            `Limitations: ${finding.whatComplicatesIt}`,
          ].join("\n"),
        )
        .join("\n\n"),
    },
    {
      title: "Approval Notes",
      content: `Human strategy approved by ${approved.approvedBy} at ${approved.approvedAt}. Input pack ${canvas.inputPackVersion}. RTB approval: ${pack.rtbApprovalStatus ?? "unknown"}. Proof / RTB is the human's supporting-proof selection; original source proof and any preparation adaptation are separate. This approval does not verify evidence or approve product claims. No AI strategy generation was used to package this document.`,
    },
  ];
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    campaign: pack.campaignName,
    campaignIdentity: structuredClone(pack.campaignIdentity),
    provider: "manual",
    mock:
      findings.some((finding) => finding.provider === "mock") ||
      (!!pack.proposedRTB &&
        pack.selectedPreparationProviders?.reasonToBelieve === "mock") ||
      (!!pack.selectedResearch?.length &&
        pack.selectedPreparationProviders?.research === "mock") ||
      (!!pack.selectedSparks?.length &&
        pack.selectedPreparationProviders?.sparks === "mock") ||
      /fictional demonstration/i.test(pack.parsedIMC?.sourceText ?? ""),
    sections,
  };
}
