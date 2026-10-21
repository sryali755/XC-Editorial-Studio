import { test, expect } from "@playwright/test";
import { parseIMCBrief } from "../lib/imc-parser";
import { extractUpstream, getUpstream, resolveRtb } from "../lib/upstream";
import { emptyPreparation } from "../lib/preparation";
import { getParsedIMC } from "../lib/upstream";
import { mockPreparationService as preparationService } from "../lib/ai/mock-preparation";
import {
  mobileBusinessObjective,
  mobileIMCBrief,
  mobileReasonToBelieve,
} from "./fixtures/mobile-imc-brief";

const fields = {
  campaign: "Fall household campaign",
  objective: "Increase consideration without changing the offer.",
  audience: "Busy households",
  product: "Home internet",
  channels: "Web, email",
  constraints: "Use existing approved claims only.",
  reason_to_believe: "Support and connectivity for everyday life.",
  research:
    "First observation.\nSecond observation — preserve the exact wording.",
  brief_type: "Growth",
  campaign_tier: "Targeted",
  kpis: "Consideration and qualified visits",
  brand_messaging: "Keep the everyday connected.",
  messaging_approval: "Pending Brand review",
  message_hierarchy: "Human benefit first.\nProduct proof second.",
  brand_guidelines: "Harmony v3",
  eligibility: "Serviceable households",
  exclusions: "Intentionally excluded. — no extra audience exclusions",
  substantiation: "Evidence reference 12",
  disclaimers: "Offer terms apply.",
};
test("brand metadata is extracted separately and legacy unedited campaign fields are repaired", () => {
  const source =
    "**Campaign:** Life Has Enough Drama\n\n**Brand:** Xfinity\nObjective: Encourage consideration\nResearch: One qualified observation.\nSupporting line.";
  const parsed = parseIMCBrief(source);
  expect(parsed.fields.campaign.sourceValue).toBe("Life Has Enough Drama");
  expect(parsed.supplemental.brand?.sourceValue).toBe("Xfinity");
  expect(parsed.fields.research.sourceValue).toBe(
    "One qualified observation.\nSupporting line.",
  );
  expect(Object.keys(parsed.fields)).toHaveLength(19);
  expect(parsed.sourceText).toBe(source);
  for (const content of [
    JSON.stringify({ campaign: "Autumn", brand: "Xfinity" }),
    "field,value\ncampaign,Autumn\nbrand,Xfinity",
    "| Campaign | Autumn |\n| Brand | Xfinity |",
  ])
    expect(parseIMCBrief(content).fields.campaign.sourceValue).toBe("Autumn");
  const legacy = extractUpstream(source);
  legacy.fields.campaignName.value = legacy.fields.campaignName.sourceValue =
    "Life Has Enough Drama\n\n**Brand:** Xfinity";
  const state = {
    ...emptyPreparation,
    sourceSnapshot: source,
    upstream: legacy,
    parsedIMC: { ...parsed, parserVersion: undefined },
  };
  expect(getParsedIMC(state).parserVersion).toBe(5);
  expect(getUpstream(state).fields.campaignName.value).toBe(
    "Life Has Enough Drama",
  );
  legacy.fields.campaignName.value = "A human-reviewed title";
  expect(getUpstream(state).fields.campaignName.value).toBe(
    "A human-reviewed title",
  );
});
test("extracts the pasted mobile Markdown brief without inventing absent fields", () => {
  const parsed = parseIMCBrief(mobileIMCBrief);
  const displayedFields = [
    parsed.supplemental.brand,
    ...Object.values(parsed.fields),
    parsed.supplemental.partnerApproval,
  ];
  expect(displayedFields).toHaveLength(21);
  expect(
    displayedFields.filter((field) => field?.status === "Supplied"),
  ).toHaveLength(13);
  expect(parsed.parserVersion).toBe(5);
  expect(parsed.fields.objective).toMatchObject({
    status: "Supplied",
    sourceValue: mobileBusinessObjective,
  });
  expect(parsed.fields.reason_to_believe).toMatchObject({
    status: "Supplied",
    sourceValue: mobileReasonToBelieve,
  });
  expect(parsed.fields.channels.sourceValue).toBe(
    "Paid Social, Online Video, Digital Display, Website, and Email.",
  );
  expect(parsed.fields.constraints.sourceValue).toContain(
    "Five independent creative perspectives.",
  );
  expect(parsed.fields.kpis.sourceValue).toContain("Campaign engagement");
  expect(parsed.fields.substantiation.status).toBe("Not supplied");
  const rtb = resolveRtb(extractUpstream(parsed));
  expect(rtb.field.sourceValue).toBe(mobileReasonToBelieve);
  expect(rtb.approvalStatus).toBe("unknown");
  expect(extractUpstream(parsed).fields.upstreamApproval.sourceValue).toContain(
    "not approved marketing content",
  );
});
test("preserves the actual RTB and keeps approval unknown without a distinct approval record", () => {
  const source =
    "Campaign: Exact RTB test\nReason to believe: First line exactly.\nSecond line, including punctuation!";
  const parsed = parseIMCBrief(source);
  const resolved = resolveRtb(extractUpstream(parsed));
  expect(resolved.field.sourceValue).toBe(
    "First line exactly.\nSecond line, including punctuation!",
  );
  expect(resolved.approvalStatus).toBe("unknown");
  expect(resolved.approvalNote).toContain("Approval is unknown");

  const distinct = extractUpstream(
    "Campaign: Approved RTB test\nGTM-approved RTB: GTM wording exactly.",
  );
  expect(resolveRtb(distinct)).toMatchObject({
    approvalStatus: "approved",
    field: { sourceValue: "GTM wording exactly." },
  });
});
test("extracts all 19 snake_case fields and retains multiline text before agent use", async () => {
  const text = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const parsed = parseIMCBrief(text);
  expect(Object.keys(parsed.fields)).toEqual(Object.keys(fields));
  for (const [key, value] of Object.entries(fields)) {
    const result = parsed.fields[key as keyof typeof fields];
    expect(result.sourceValue).toBe(value);
    expect(result.value).toBe(value);
    expect(result.present).toBe(true);
    expect(result.status).toBe(
      key === "exclusions" ? "Intentionally excluded" : "Supplied",
    );
  }
  const before = JSON.stringify(parsed);
  const upstream = extractUpstream(parsed);
  const outputs = await Promise.all(
    (["reasonToBelieve", "research", "sparks"] as const).map((agentId) =>
      preparationService.generate({
        agentId,
        parsedIMC: parsed,
        upstream,
        previous: [],
        guidance: "",
      }),
    ),
  );
  expect(upstream.fields.originalRTB.sourceValue).toBe(
    fields.reason_to_believe,
  );
  expect(outputs[0].text).toContain("Proposed XC framing");
  expect(outputs[1].text).toContain(fields.research);
  expect(outputs[1].text).not.toContain("No labeled research supplied");
  expect(JSON.stringify(parsed)).toBe(before);
  expect(Object.isFrozen(parsed.fields.reason_to_believe)).toBe(true);
});
test("supports heading, bold, bulleted and table labels without truncating evidence", () => {
  const parsed = parseIMCBrief(
    "## Reason to Believe\nOriginal claim.\nSupporting line.\n\n**Research:**\nHistorical performance: supplied result.\n- Source: https://example.test/evidence\n\n- **Campaign name**: Autumn\n| Brand messaging | Exact message |\n| messaging_approval | Pending |\n### Disclaimers\nIntentionally excluded.\n## Unrelated appendix\nNot part of disclaimers",
  );
  expect(parsed.fields.reason_to_believe.value).toBe(
    "Original claim.\nSupporting line.",
  );
  expect(parsed.fields.research.value).toBe(
    "Historical performance: supplied result.\n- Source: https://example.test/evidence",
  );
  expect(parsed.fields.campaign.value).toBe("Autumn");
  expect(parsed.fields.brand_messaging.value).toBe("Exact message");
  expect(parsed.fields.messaging_approval.value).toBe("Pending");
  expect(parsed.fields.disclaimers.status).toBe("Intentionally excluded");
  expect(parsed.fields.disclaimers.value).toBe("Intentionally excluded.");
});
test("checks the complete document before marking absent fields and preserves duplicate occurrences", () => {
  const parsed = parseIMCBrief(
    "Campaign: First name\nObjective:\nAudience: Households\nResearch: Intentionally excluded\nResearch: Later explicitly supplied evidence.\nCampaign: Revised name\nSubstantiation: No claim evidence is supplied, pending review.",
  );
  expect(parsed.fields.objective).toMatchObject({
    status: "Not supplied",
    present: true,
    value: "",
  });
  expect(parsed.fields.product).toMatchObject({
    status: "Not supplied",
    present: false,
    value: "",
  });
  expect(parsed.fields.audience.value).toBe("Households");
  expect(parsed.fields.research.status).toBe("Supplied");
  expect(parsed.fields.research.occurrences).toEqual([
    "Intentionally excluded",
    "Later explicitly supplied evidence.",
  ]);
  expect(parsed.fields.campaign.value).toBe("First name\n\nRevised name");
  expect(parsed.fields.substantiation.status).toBe("Supplied");
});
test("parses JSON and repairs legacy Not supplied statuses using actual parsed content", async () => {
  const parsed = parseIMCBrief(JSON.stringify(fields));
  expect(parsed.fields.research.value).toBe(fields.research);
  expect(() => parseIMCBrief("{invalid json")).toThrow("invalid");
  const source = JSON.stringify(fields);
  const legacy = extractUpstream(parseIMCBrief(""));
  const repaired = getUpstream({
    ...emptyPreparation,
    sourceSnapshot: source,
    upstream: legacy,
  });
  expect(repaired.fields.originalRTB.sourceValue).toBe(
    fields.reason_to_believe,
  );
  expect(repaired.fields.originalRTB.status).toBe("Supplied");
  expect(repaired.fields.research.value).toBe(fields.research);
  expect(repaired.fields.exclusions.status).toBe("Intentionally excluded");
  const output = await preparationService.generate({
    agentId: "research",
    parsedIMC: parsed,
    upstream: legacy,
    previous: [],
    guidance: "",
  });
  expect(output.text).toContain(fields.research);
  expect(legacy.fields.research.status).toBe("Not supplied");
});
test("the parsed record is visible before preparation completes and remains unchanged by refinement", async ({
  page,
}) => {
  await page.goto("/");
  const text = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill(text);
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(page.locator(".parsed-imc")).toBeVisible();
  await expect(page.locator(".dynamic-pack .spark-option")).toHaveCount(6);
  await page.locator(".parsed-imc > summary").click();
  await expect(
    page
      .locator(".parsed-imc")
      .getByText(fields.reason_to_believe, { exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!).preparation
        .parsedIMC,
  );
  await page
    .getByRole("article", { name: "Review & Adapt Upstream RTB" })
    .getByRole("button", { name: "Regenerate this agent" })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Review & Adapt Upstream RTB" })
      .locator(".card-top"),
  ).toContainText("V2");
  const after = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("xc-strategy-session-v1")!).preparation
        .parsedIMC,
  );
  expect(after).toEqual(before);
  await page.reload();
  await page.locator(".parsed-imc > summary").click();
  await expect(page.locator(".parsed-field-grid")).toContainText(
    fields.research,
  );
});
test("invalid structured input cannot run preparation agents", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "IMC output brief", exact: false })
    .fill('{"research":');
  await page
    .getByRole("button", { name: "Prepare XC Input Pack", exact: true })
    .click();
  await expect(page.locator(".error")).toContainText("invalid");
  await expect(page.locator(".prepared-text")).toHaveCount(0);
});
