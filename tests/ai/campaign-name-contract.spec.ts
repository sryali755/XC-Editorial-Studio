import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  resolveCampaignIdentity,
  campaignIdentityIssue,
  campaignSourceId,
} from "../../lib/campaign-naming";
import { discoveryFoundation } from "../../lib/discovery-context";
import { discoveryStorageKey } from "../../lib/discovery-persistence";
import { inputPackVersion } from "../../lib/discovery";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  emptyStudio,
  studioPack,
  seedStudioDiscovery,
  studioStrategySession,
  packageDiscoveryBrief,
} from "../../lib/discovery-studio";
import { requestSchema, type AgentRequest } from "../../lib/ai/schemas";
import { runValidatedAgentRequest } from "../../lib/ai/discovery-submission";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import { buildStudioBriefInput } from "../../lib/studio-brief-input";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { blackFridayNamingSource } from "../fixtures/black-friday-campaign-identity";

const scopes = detectIMCCampaignScopes(
  readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  ),
);
type DiscoveryRequest = Extract<AgentRequest, { agentType: "discovery" }>;
function request(
  pack: ReturnType<typeof studioPack>,
  lens:
    "consumer" | "culture" | "category" | "brand" | "analogous" = "consumer",
): DiscoveryRequest {
  const parsed = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(pack),
      lens,
      investigationType: "problem",
      question: "What evidence is missing for this campaign?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (parsed.agentType !== "discovery") throw new Error("Wrong agent");
  return parsed;
}

test.beforeEach(() => {
  expect(process.env.AI_MODE).toBe("mock");
  expect(process.env.OPENAI_API_KEY).toBe("");
  expect(process.env.XC_OFFLINE_TEST).toBe("1");
});

test("Black Friday cover yields an attributed candidate, never an automatically confirmed name or platform", () => {
  const session = applyStudioSource(emptyStudio(), blackFridayNamingSource);
  const pack = studioPack(session),
    identity = pack.campaignIdentity!;
  expect(identity.sourceCandidate).toEqual({
    name: "Black Friday Toolkit",
    kind: "cover_title",
    excerpt: "Black Friday\nToolkit",
    locator: "imc:slide:1",
  });
  expect(identity.sourceDocumentTitle).toBe("Black Friday Toolkit");
  expect(identity.sourceDocumentFileName).toBe("BLK_FRI.pptx");
  expect(identity.confirmationStatus).toBe("unresolved");
  expect(pack.campaignName).toBe("");
  expect(pack.parsedIMC!.fields.campaign.status).toBe("Not supplied");
  expect(identity.sourceCandidate!.name).not.toMatch(
    /Smart Switch|Xfinity|2025|pptx/i,
  );
  const state = seedStudioDiscovery(pack);
  expect(() =>
    approveDiscoveryCanvas(
      studioStrategySession(session, state),
      pack,
      state,
      "Human strategy",
    ),
  ).toThrow(/campaign name/i);
});

test("confirmed Black Friday display metadata propagates without rewriting original source fields", async () => {
  const original = applyStudioSource(emptyStudio(), blackFridayNamingSource);
  const session = confirmStudioCampaignName(original, "Black Friday Toolkit");
  const pack = studioPack(session);
  expect(pack.campaignIdentity).toMatchObject({
    id: campaignSourceId(blackFridayNamingSource),
    displayName: "Black Friday Toolkit",
    sourceName: "",
    humanConfirmedName: "Black Friday Toolkit",
    origin: "human_confirmed",
    confirmationStatus: "human_confirmed",
  });
  expect(pack.parsedIMC).toEqual(studioPack(original).parsedIMC);
  expect(pack.parsedIMC!.sourceText).toBe(blackFridayNamingSource);
  for (const lens of [
    "consumer",
    "culture",
    "category",
    "brand",
    "analogous",
  ] as const) {
    const input = request(pack, lens);
    const result = await runValidatedAgentRequest(input, async () =>
      mockDiscovery(input),
    );
    expect(result.findings.length).toBeGreaterThan(0);
    expect(input.context.foundation.campaignContext.campaignName).toBe(
      "Black Friday Toolkit",
    );
    expect(
      input.context.foundation.campaignIdentity!.sourceCandidate!.excerpt,
    ).toBe("Black Friday\nToolkit");
  }
});

for (const scope of scopes) {
  test(`${scope.title}: exact source name stays authoritative while display-only rename retains identity and source validation`, async () => {
    const session = applyStudioSource(emptyStudio(), scope.sourceText);
    const before = studioPack(session);
    expect(before.campaignName).toBe(scope.title);
    expect(before.campaignIdentity!.confirmationStatus).toBe(
      "source_confirmed",
    );
    expect(scope.sourceText).toContain(
      before.campaignIdentity!.sourceCandidate!.excerpt,
    );
    const renamed = studioPack(
      confirmStudioCampaignName(session, `${scope.title} — internal review`),
    );
    expect(renamed.campaignName).toBe(`${scope.title} — internal review`);
    expect(renamed.campaignIdentity!.sourceName).toBe(scope.title);
    expect(renamed.campaignIdentity!.sourceCandidate!.name).toBe(scope.title);
    expect(renamed.campaignIdentity!.id).toBe(before.campaignIdentity!.id);
    expect(inputPackVersion(renamed)).toBe(inputPackVersion(before));
    expect(discoveryStorageKey(renamed)).toBe(discoveryStorageKey(before));
    const input = request(renamed);
    await expect(
      runValidatedAgentRequest(input, async () => true),
    ).resolves.toBe(true);
    const forged = request(renamed);
    forged.context.foundation.campaignContext.campaignName =
      "A different unconfirmed campaign";
    await expect(
      runValidatedAgentRequest(forged, async () => true),
    ).rejects.toMatchObject({ code: "discovery_submission_mismatch" });
  });
}

test("first confirmation and later display-name corrections do not invalidate an unnamed source's research content version", () => {
  const original = applyStudioSource(emptyStudio(), blackFridayNamingSource);
  const confirmed = confirmStudioCampaignName(original, "Black Friday Toolkit");
  const renamed = confirmStudioCampaignName(
    confirmed,
    "Black Friday Toolkit — retail review",
  );
  expect(inputPackVersion(studioPack(original))).toBe(
    inputPackVersion(studioPack(confirmed)),
  );
  expect(inputPackVersion(studioPack(renamed))).toBe(
    inputPackVersion(studioPack(confirmed)),
  );
  expect(renamed.campaignNameHistory!.map((entry) => entry.name)).toEqual([
    "Black Friday Toolkit — retail review",
    "Black Friday Toolkit",
  ]);
});

test("renaming preserves selections, preparation output history, drafts and immutable approvals", () => {
  let session = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), blackFridayNamingSource),
    "Black Friday Toolkit",
  );
  session = {
    ...session,
    selectedRtbVersionId: "rtb-v1",
    selectedResearchIds: ["research-v1"],
    includedContextIds: ["rtb:proposal"],
    preparation: {
      ...session.preparation,
      selectedSparkIds: ["spark-1"],
      keptSparkIds: ["spark-1"],
    },
  };
  const state = {
    ...seedStudioDiscovery(studioPack(session)),
    humanBriefLine: "Kevin's exact manual strategy.",
    notes: "Kevin's notes.",
    drafts: {
      agents: { consumer: "An unfinished message" },
      findings: {},
      routes: {},
      connections: "A comparison draft",
    },
  };
  const approved = approveDiscoveryCanvas(
    studioStrategySession(session, state),
    studioPack(session),
    state,
    state.humanBriefLine,
  ).approved!;
  session.approved = approved;
  session.approvals = [approved];
  session.approvalSnapshots = { [approved.approvedAt]: state };
  const frozen = structuredClone(session);
  const renamed = confirmStudioCampaignName(
    session,
    "Black Friday Toolkit — updated display",
  );
  expect(renamed.preparation).toEqual(frozen.preparation);
  expect(renamed.selectedRtbVersionId).toBe(frozen.selectedRtbVersionId);
  expect(renamed.selectedResearchIds).toEqual(frozen.selectedResearchIds);
  expect(renamed.approvalSnapshots).toEqual(frozen.approvalSnapshots);
  expect(renamed.approvals).toEqual(frozen.approvals);
  expect(renamed.approved).toEqual(frozen.approved);
  expect(renamed.confirmationFingerprint).toBeUndefined();
  expect(packageDiscoveryBrief(approved, state).campaign).toBe(
    "Black Friday Toolkit",
  );
  const reconfirmed = approveDiscoveryCanvas(
    studioStrategySession(renamed, state),
    studioPack(renamed),
    state,
    state.humanBriefLine,
  ).approved!;
  expect(
    buildStudioBriefInput(reconfirmed, state).campaignIdentity!.displayName,
  ).toBe("Black Friday Toolkit — updated display");
  expect(packageDiscoveryBrief(reconfirmed, state).campaign).toBe(
    "Black Friday Toolkit — updated display",
  );
  expect(approved.strategyInputPack.campaignName).toBe("Black Friday Toolkit");
});

test("filename, product and creative platform do not become an official name or plausible candidate", () => {
  for (const text of [
    "Source: Incredible Summer Campaign.pdf\nProduct: Xfinity Mobile\nBusiness Objective: Drive consideration.",
    "Parent platform: Imagine That\nProduct: Xfinity Mobile\nBusiness Objective: Drive consideration.",
    "# Creative Brief\nBrand: Xfinity\nBusiness Objective: Drive consideration.",
    "Business Objective\nDrive consideration for the holiday campaign.\nProduct: Xfinity Mobile",
  ]) {
    const identity = resolveCampaignIdentity(text);
    expect(identity.displayName).toBe("");
    expect(identity.sourceCandidate).toBeUndefined();
    const session = confirmStudioCampaignName(
      applyStudioSource(emptyStudio(), text),
      "Kevin's confirmed name",
    );
    expect(studioPack(session).campaignName).toBe("Kevin's confirmed name");
  }
});

test("multiple campaigns require selection; another source cannot reuse a confirmation or candidate", () => {
  const multi =
    "Campaign: First campaign\nBusiness Objective: First objective.\nCampaign: Second campaign\nBusiness Objective: Second objective.";
  expect(() => applyStudioSource(emptyStudio(), multi)).toThrow(
    /multiple|select/i,
  );
  expect(resolveCampaignIdentity(multi).confirmationStatus).toBe("unresolved");
  const session = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), blackFridayNamingSource),
    "Black Friday Toolkit",
  );
  const switched = applyStudioSource(session, scopes[0].sourceText);
  expect(studioPack(switched).campaignIdentity!.id).not.toBe(
    studioPack(session).campaignIdentity!.id,
  );
  expect(studioPack(switched).campaignName).toBe(scopes[0].title);
  const restored = applyStudioSource(switched, blackFridayNamingSource);
  expect(studioPack(restored).campaignName).toBe("Black Friday Toolkit");
  expect(restored.campaignNameHistory).toEqual(session.campaignNameHistory);
});

for (const field of [
  "id",
  "sourceName",
  "sourceDocumentTitle",
  "sourceReference",
  "humanConfirmedName",
  "confirmationStatus",
] as const) {
  test(`forged ${field} is rejected before any provider invocation`, async () => {
    const pack = studioPack(
      confirmStudioCampaignName(
        applyStudioSource(emptyStudio(), blackFridayNamingSource),
        "Black Friday Toolkit",
      ),
    );
    const input = request(pack);
    const forged = input.context.foundation.campaignIdentity!;
    if (field === "confirmationStatus")
      forged.confirmationStatus = "source_confirmed";
    else forged[field] = "Forged metadata";
    let called = false;
    await expect(
      runValidatedAgentRequest(input, async () => {
        called = true;
        return true;
      }),
    ).rejects.toMatchObject({ code: "discovery_submission_mismatch" });
    expect(called).toBe(false);
  });
}

test("forged candidate excerpt, locator and platform substitution are rejected", () => {
  const identity = resolveCampaignIdentity(blackFridayNamingSource);
  for (const field of ["name", "excerpt", "locator"] as const) {
    const forged = structuredClone(identity);
    forged.sourceCandidate![field] = "The Smart Switch";
    expect(campaignIdentityIssue(blackFridayNamingSource, "", forged)).not.toBe(
      "",
    );
  }
});

test("a partially edited JSON source keeps the naming preview unresolved without accepting a confirmation", () => {
  const source = '{"campaign":';
  expect(() => resolveCampaignIdentity(source)).not.toThrow();
  expect(
    resolveCampaignIdentity(source, {
      name: "A name",
      sourceBrief: source,
      confirmedAt: new Date().toISOString(),
    }).confirmationStatus,
  ).toBe("unresolved");
  expect(() => applyStudioSource(emptyStudio(), source)).toThrow(/JSON/i);
});

test("a filename containing the official name cannot displace the actual campaign-field locator", () => {
  const source =
    "Source: Bright Days Campaign Brief.pdf\n\n## Source page 4\nCampaign: Bright Days Campaign Brief\nBusiness Objective: Investigate the issue.";
  const identity = resolveCampaignIdentity(source);
  expect(identity.sourceCandidate!.locator).toBe("imc:page:4");
  expect(identity.sourceCandidate!.excerpt).toBe(
    "Campaign: Bright Days Campaign Brief",
  );
});

test("renamed context accepts prior same-source findings without changing their recorded versions", async () => {
  const firstSession = confirmStudioCampaignName(
    applyStudioSource(emptyStudio(), blackFridayNamingSource),
    "Black Friday Toolkit",
  );
  const original = studioPack(firstSession);
  const initial = request(original);
  const finding = {
    ...mockDiscovery(initial).findings[0],
    id: "prior-finding",
    lensId: "consumer" as const,
    runVersion: 1,
    inputPackVersion: inputPackVersion(original),
    researchRunId: "prior-run",
  };
  const revised = studioPack(
    confirmStudioCampaignName(
      firstSession,
      "Black Friday Toolkit — display review",
    ),
  );
  const followup = request(revised);
  followup.context.action = "explore_deeper";
  followup.context.previousFindings = [finding];
  followup.context.selectedFinding = finding;
  await expect(
    runValidatedAgentRequest(followup, async () => true),
  ).resolves.toBe(true);
  expect(followup.context.previousFindings).toEqual([finding]);
  expect(followup.context.foundation.campaignContext.campaignName).toBe(
    revised.campaignName,
  );
});
