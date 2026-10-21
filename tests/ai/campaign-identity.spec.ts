import { expect, test } from "@playwright/test";
import { parseIMCBrief } from "../../lib/imc-parser";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import {
  applyStudioSource,
  confirmStudioCampaignName,
  emptyStudio,
  packageDiscoveryBrief,
  readStudio,
  seedStudioDiscovery,
  studioPack,
  studioPreparationUpstream,
  studioStorageKey,
  studioStrategySession,
} from "../../lib/discovery-studio";
import { approveDiscoveryCanvas } from "../../lib/discovery-handoff";
import { compactStringify } from "../../lib/discovery-persistence";
import { generateAgentResponse } from "../../lib/ai/provider";
import { reviewWorkspaceCampaignName } from "../../lib/campaign-identity";
import { saveWorkspaceDraft } from "../../lib/workspace-suggestions";

const body =
  "Business Objective: Retain customers during a move.\nTarget Audience: Existing customers.\nReason to believe: Supplied proof only.";
test("an explicitly labeled campaign title is not lost in structured extraction", () => {
  const source = `# IMC brief\nCampaign title: Bright Days — Autumn 2026\n${body}`;
  expect(parseIMCBrief(source).fields.campaign.sourceValue).toBe(
    "Bright Days — Autumn 2026",
  );
});
test("PDF campaign headings keep exact source punctuation", () => {
  const source = `## Source page 1\nBright Days – Campaign Extensions Brief\n${body}\n\n## Source page 2\nNew Horizons — Campaign Extensions\n${body}`;
  const scopes = detectIMCCampaignScopes(source);
  expect(scopes.map((s) => s.title)).toEqual([
    "Bright Days – Campaign Extensions Brief",
    "New Horizons — Campaign Extensions",
  ]);
  for (const scope of scopes)
    expect(parseIMCBrief(scope.sourceText).fields.campaign.sourceValue).toBe(
      scope.title,
    );
});
test("a genuinely unnamed campaign cannot be silently approved as a named brief", () => {
  const session = applyStudioSource(emptyStudio(), body),
    pack = studioPack(session),
    state = seedStudioDiscovery(pack);
  expect(pack.campaignName).toBe("");
  expect(() =>
    approveDiscoveryCanvas(
      studioStrategySession(session, state),
      pack,
      state,
      "Kevin's human strategy",
    ),
  ).toThrow(/campaign name/i);
});
test("multiple explicitly labeled campaigns are not silently accepted as one source", () => {
  expect(() =>
    applyStudioSource(
      emptyStudio(),
      `Campaign: Bright Days\n${body}\nCampaign: New Horizons\n${body}`,
    ),
  ).toThrow(/select|multiple|campaign/i);
});
test("human-confirmed metadata persists and exports without rewriting the source or frozen earlier versions", async () => {
  const original = applyStudioSource(emptyStudio(), body);
  const session = confirmStudioCampaignName(
    original,
    "Bright Days — Kevin’s confirmed title",
  );
  const pack = studioPack(session),
    state = seedStudioDiscovery(pack);
  expect(session.preparation.sourceSnapshot).toBe(body);
  expect(pack.parsedIMC!.fields.campaign.status).toBe("Not supplied");
  expect(pack.campaignIdentity!.origin).toBe("human_confirmed");
  const restored = readStudio({
    getItem: (key) =>
      key === studioStorageKey ? compactStringify(session) : null,
  });
  expect(studioPack(restored.session).campaignName).toBe(pack.campaignName);
  const response = await generateAgentResponse({
    agentType: "research",
    context: {
      parsedIMC: pack.parsedIMC!,
      upstream: studioPreparationUpstream(session),
    },
  });
  expect(response.provider).toBe("mock");
  expect(response.data).toHaveProperty("campaignName", pack.campaignName);
  const approved = approveDiscoveryCanvas(
    studioStrategySession(session, state),
    pack,
    state,
    "Kevin's exact human strategy",
  ).approved!;
  const frozen = structuredClone(approved);
  const brief = packageDiscoveryBrief(approved, state);
  expect(brief.campaign).toBe(pack.campaignName);
  expect(
    brief.sections.find((s) => s.title === "Original IMC context")!.content,
  ).toContain("Human-confirmed campaign name; not extracted");
  const renamed = confirmStudioCampaignName(session, "A later confirmed name");
  expect(studioPack(renamed).campaignName).not.toBe(
    approved.strategyInputPack.campaignName,
  );
  expect(approved).toEqual(frozen);
  const switched = applyStudioSource(
    session,
    `Campaign: Another campaign\n${body}`,
  );
  expect(studioPack(switched).campaignName).toBe("Another campaign");
  expect(studioPack(applyStudioSource(switched, body)).campaignName).toBe(
    pack.campaignName,
  );
});
for (const name of ["None", "undefined", "Not supplied", "N/A"])
  test(`placeholder ${name} is unresolved identity rather than a campaign name`, () => {
    const session = applyStudioSource(
      emptyStudio(),
      `Campaign: ${name}\n${body}`,
    );
    expect(studioPack(session).campaignName).toBe("");
    expect(() => confirmStudioCampaignName(session, name)).toThrow();
  });
test("cached pre-fix extraction is reparsed without erasing source text or outputs", () => {
  const source = `Campaign title: Bright Days\n${body}`;
  const session = applyStudioSource(emptyStudio(), source);
  session.preparation.parsedIMC = {
    ...session.preparation.parsedIMC!,
    parserVersion: 3,
    fields: {
      ...session.preparation.parsedIMC!.fields,
      campaign: {
        ...session.preparation.parsedIMC!.fields.campaign,
        value: "",
        sourceValue: "",
        occurrences: [],
        status: "Not supplied",
      },
    },
  };
  const restored = readStudio({
    getItem: (key) =>
      key === studioStorageKey ? compactStringify(session) : null,
  });
  expect(studioPack(restored.session).campaignName).toBe("Bright Days");
  expect(restored.session.preparation.sourceSnapshot).toBe(source);
  expect(restored.session.preparation.outputs).toEqual(
    session.preparation.outputs,
  );
});
test("name resolution repairs only untouched metadata, never saved, edited or cleared human context", () => {
  const session = applyStudioSource(emptyStudio(), body),
    current = seedStudioDiscovery(studioPack(session));
  const named = studioPack(confirmStudioCampaignName(session, "Bright Days"));
  // Context is no longer a Working Space box (the XC Brief takes it from the
  // confirmed campaign name), so a current draft is left untouched.
  expect(current.wholeBrief?.context).toBeUndefined();
  expect(reviewWorkspaceCampaignName(current, named)).toBe(current);
  // An older draft that still holds an untouched seeded Context is repaired.
  const seededContext = "Campaign name not supplied in the Input Pack.";
  const state = {
    ...current,
    wholeBrief: { ...current.wholeBrief, context: seededContext },
    workspaceSuggestionContext: {
      ...current.workspaceSuggestionContext!,
      originalFields: undefined, // Simulate the older layout's pre-snapshot record.
      fields: {
        ...current.workspaceSuggestionContext!.fields,
        "wholeBrief.context": {
          value: seededContext,
          kind: "missing" as const,
          label: "Missing evidence / unresolved starting prompt",
        },
      },
    },
  };
  expect(reviewWorkspaceCampaignName(state, named).wholeBrief!.context).toBe(
    "Bright Days",
  );
  expect(
    reviewWorkspaceCampaignName(state, named).workspaceSuggestionContext!
      .originalFields!["wholeBrief.context"],
  ).toEqual(state.workspaceSuggestionContext.fields["wholeBrief.context"]);
  for (const context of ["", "Kevin’s exact context"]) {
    const edited = { ...state, wholeBrief: { ...state.wholeBrief, context } };
    expect(reviewWorkspaceCampaignName(edited, named)).toBe(edited);
  }
  const saved = {
    ...state,
    fieldVersions: {
      "wholeBrief.context": [
        { id: "v1", number: 1, value: seededContext, savedAt: "2026-10-17" },
      ],
    },
  };
  expect(reviewWorkspaceCampaignName(saved, named)).toBe(saved);
  expect(saveWorkspaceDraft(current)).not.toBe(current);
});
