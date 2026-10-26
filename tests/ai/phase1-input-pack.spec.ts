import { expect, test } from "@playwright/test";
import { request as httpRequest } from "node:http";
import {
  phase1Fixture,
  phase1LongFraming,
} from "../fixtures/phase1-input-pack";
import {
  applyStudioSource,
  emptyStudio,
  readStudio,
  studioPack,
  studioStorageKey,
  seedStudioDiscovery,
} from "../../lib/discovery-studio";
import {
  buildStudioCampaign,
  preparationCardState,
  selectedJtbdFraming,
} from "../../lib/input-pack-presentation";
import {
  compactStringify,
  writeDiscoveryDraft,
  discoveryStorageKey,
} from "../../lib/discovery-persistence";
import { saveWorkspaceDraft } from "../../lib/workspace-suggestions";
import { discoveryFoundation } from "../../lib/discovery-context";
import { foundationPack } from "../../lib/ai/context";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { outputSchemas, requestSchema } from "../../lib/ai/schemas";
import {
  invalidSparkExcerptIndexes,
  sparkSetIssue,
} from "../../lib/ai/spark-quality";
import { getParsedIMC } from "../../lib/upstream";

test("Phase 1 test process denies fetch and HTTP before any connection", () => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
  expect(() => fetch("http://127.0.0.1:3000/forbidden")).toThrow("PHASE1_NO_API");
  expect(() => httpRequest("http://127.0.0.1:3000/forbidden")).toThrow(
    "PHASE1_NO_API",
  );
});

for (const file of ["movers_source_text.txt", "xfinity_pro_source_text.txt"])
  test(`E/F: exact framing and source separation survive persistence and every lens prompt: ${file}`, () => {
    const { session, source } = phase1Fixture(file);
    const stored = compactStringify(session);
    const { session: restored } = readStudio({
      getItem: (key) => (key === studioStorageKey ? stored : null),
    });
    const pack = studioPack(restored);
    expect(restored.preparation.outputs).toEqual(session.preparation.outputs);
    expect(pack.proposedRTB).toBe(phase1LongFraming);
    expect(selectedJtbdFraming(pack)).toEqual({
      text: phase1LongFraming,
      versionId: session.selectedRtbVersionId,
    });
    expect(pack.originalJTBD).toBe("");
    expect(pack.jtbdContext?.original).toEqual([]);
    expect(pack.reasonToBelieve).not.toContain("SYNTHETIC TEST PROPOSAL");
    const foundation = discoveryFoundation(pack);
    expect(foundation.sourceBrief).toBe(source);
    expect(foundation.campaignContext.campaignName).toBe(pack.campaignName);
    expect(foundation.campaignContext.jobToBeDone).toBeUndefined();
    expect(foundation.currentRtb.proposal).toBe(phase1LongFraming);
    expect(foundationPack(foundation).proposedRTB).toBe(phase1LongFraming);
    for (const lens of [
      "consumer",
      "culture",
      "category",
      "brand",
      "analogous",
    ]) {
      const request = requestSchema.parse({
        agentType: "discovery",
        context: {
          foundation,
          lens,
          investigationType: "problem",
          question: "Which supplied context needs investigation?",
          action: "initial",
          previousFindings: [],
        },
      });
      expect(buildAgentPrompt(request).input).toContain(
        JSON.stringify(phase1LongFraming).slice(1, -1),
      );
    }
  });

test("G: selected composition and version restoration preserve unrelated inputs", () => {
  const { session, versions } = phase1Fixture();
  const initial = studioPack(session);
  expect(initial.selectedResearch).toHaveLength(2);
  expect(initial.selectedSparks).toHaveLength(2);
  expect(initial.proposedRTB).toBe(phase1LongFraming);
  session.preparation.selectedSparkIds =
    session.preparation.selectedSparkIds.slice(1);
  const deselected = studioPack(session);
  expect(deselected.selectedSparks?.map((item) => item.id)).toEqual(
    session.preparation.selectedSparkIds,
  );
  expect(deselected.selectedResearch).toEqual(initial.selectedResearch);
  expect(deselected.reasonToBelieve).toBe(initial.reasonToBelieve);
  expect(deselected.proposedRTB).toBe(initial.proposedRTB);
  const rtb = session.preparation.outputs.find(
    (item) => item.agentId === "reasonToBelieve",
  )!;
  const next = structuredClone(versions.reasonToBelieve);
  next.id = "rtb-later-version";
  next.number = 2;
  const parsed = outputSchemas.rtb.parse(next.data);
  next.data = {
    ...parsed,
    xcAdaptation: "\nNew synthetic selected proposal.\n",
  };
  rtb.versions.push(next);
  rtb.currentVersionId = next.id;
  // Regeneration never silently selects the new AI proposal.
  expect(studioPack(session).proposedRTB).toBe(phase1LongFraming);
  session.selectedRtbVersionId = next.id;
  expect(studioPack(session).proposedRTB).toBe(
    "\nNew synthetic selected proposal.\n",
  );
  session.selectedRtbVersionId = versions.reasonToBelieve.id;
  expect(studioPack(session).proposedRTB).toBe(phase1LongFraming);
  expect(studioPack(session).selectedResearch).toEqual(
    initial.selectedResearch,
  );
  expect(rtb.versions).toHaveLength(2);
});

test("C: Build validates names atomically and never mutates original evidence", () => {
  const { session, source } = phase1Fixture();
  const before = structuredClone(session);
  for (const name of ["", "None", " "])
    expect(() => buildStudioCampaign(session, source, name)).toThrow();
  expect(session).toEqual(before);
  const longName = "a".repeat(100_000);
  expect(
    studioPack(buildStudioCampaign(session, source, longName)).campaignName,
  ).toBe(longName);
  const updated = buildStudioCampaign(
    session,
    source,
    "Kevin's reviewed campaign name",
  );
  expect(studioPack(updated).campaignName).toBe(
    "Kevin's reviewed campaign name",
  );
  expect(updated.preparation.sourceSnapshot).toBe(source);
  expect(updated.preparation.outputs).toEqual(session.preparation.outputs);
  expect(updated.selectedCampaignScope).toBe(session.selectedCampaignScope);
  expect(studioPack(updated).campaignIdentity?.sourceCandidate).toEqual(
    studioPack(session).campaignIdentity?.sourceCandidate,
  );
});

test("A/H: card state derives idle, pending, missing, ready and failed without a second persisted status", () => {
  const { session, source } = phase1Fixture();
  expect(
    preparationCardState(
      applyStudioSource(emptyStudio(), source),
      "sparks",
      "mock",
    ).state,
  ).toBe("unrun");
  expect(preparationCardState(session, "sparks", "mock").state).toBe("ready");
  expect(
    preparationCardState(session, "sparks", "mock", false, true).state,
  ).toBe("generating");
  // Missing original source fields and disconnected connectors are not failures.
  expect(preparationCardState(session, "reasonToBelieve", "mock").label).toBe(
    "Results Ready",
  );
  session.preparationErrors.sparks = "Exact excerpt validation failed";
  expect(preparationCardState(session, "sparks", "mock")).toMatchObject({
    state: "failed",
    failure: "Exact excerpt validation failed",
  });
  expect(preparationCardState(session, "sparks", "mock", true).state).toBe(
    "unrun",
  );
});

test("H: real campaign exact-excerpt validator rejects fabricated grounding and preserves source", () => {
  const { session, versions, source } = phase1Fixture();
  const parsedIMC = getParsedIMC(session.preparation);
  const valid = outputSchemas.sparks.parse(versions.sparks.data);
  expect(valid.sparks).toHaveLength(6);
  expect(sparkSetIssue(valid, undefined, parsedIMC)).toBeUndefined();
  const invalid = structuredClone(valid);
  invalid.sparks[2].excerpt =
    "SYNTHETIC ABSENT SOURCE CLAIM NOT IN THIS DOCUMENT";
  expect(invalidSparkExcerptIndexes(invalid, source)).toEqual([2]);
  expect(sparkSetIssue(invalid, undefined, parsedIMC)).toContain(
    "exact excerpt",
  );
  const incomplete = { sparks: valid.sparks.slice(0, 5) };
  expect(sparkSetIssue(incomplete, undefined, parsedIMC)).toContain(
    "six complete",
  );
  expect(session.preparation.sourceSnapshot).toBe(source);
  expect(versions.sparks.data).toEqual(valid);
});

test("campaign isolation excludes a selected version belonging to another source", () => {
  const { session } = phase1Fixture();
  const before = studioPack(session);
  const version = session.preparation.outputs.find(
    (item) => item.agentId === "reasonToBelieve",
  )!.versions[0];
  version.sourceBrief = phase1Fixture("xfinity_pro_source_text.txt").source;
  expect(studioPack(session).proposedRTB).toBe("");
  expect(studioPack(session).reasonToBelieve).toBe(before.reasonToBelieve);
  expect(studioPack(session).campaignName).toBe(before.campaignName);
});

test("B/I: restoring a pre-fix trimmed pack never loses Kevin's fields or saved versions", () => {
  const { session } = phase1Fixture();
  const current = studioPack(session);
  const legacy = { ...current, proposedRTB: phase1LongFraming.trim() };
  const human = saveWorkspaceDraft({
    ...seedStudioDiscovery(legacy),
    humanBriefLine:
      "Kevin's exact saved direction — keep this unchanged.\nSecond human paragraph.",
    workingJTBD: "Kevin's edited job, not the proposed framing.",
    notes: "Private human notes preserved.",
    evidenceInsights: "", // Intentional empty field.
  });
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  storage.setItem(studioStorageKey, compactStringify(session));
  writeDiscoveryDraft(storage, legacy, human);
  expect(discoveryStorageKey(current)).toBe(discoveryStorageKey(legacy));
  const restored = readStudio(storage);
  expect(studioPack(restored.session).proposedRTB).toBe(phase1LongFraming);
  for (const key of [
    "humanBriefLine",
    "workingJTBD",
    "notes",
    "evidenceInsights",
    "fieldVersions",
    "activeFieldVersionIds",
    "savedFindingIds",
  ] as const)
    expect(restored.discovery[key]).toEqual(human[key]);
});
