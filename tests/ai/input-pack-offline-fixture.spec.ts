import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractStudioIMCRecords } from "../../lib/studio-imc-records";
import { extractJobToBeDone } from "../../lib/ai/context";
import { extractUpstream, resolveRtb } from "../../lib/upstream";

const fixtureDir = path.join(__dirname, "../fixtures/client-input-pack");
const pdfName =
  "Imagine That - Movers Campaign Extensions Brief(20261017-163923).pdf";
const fixture = (name: string) => path.join(fixtureDir, name);
const available = existsSync(fixture(pdfName));

type Expected = {
  source_sha256: string;
  campaigns: {
    id: string;
    title: string;
    campaign_pages: number[];
    expected_fields: { field: string; page: number; contains: string }[];
    must_not_import_from_other_campaign: string[];
  }[];
  shared_brand_guidance: { page: number; exact_source_excerpt: string }[];
};

test("supplied PDF expectation fixture scopes two campaigns without cross-contamination", () => {
  test.skip(
    !available,
    "Supply the approved offline test kit in tests/fixtures/client-input-pack.",
  );
  const expected = JSON.parse(
    readFileSync(fixture("imagine_that_expected_input_pack.json"), "utf8"),
  ) as Expected;
  expect(
    createHash("sha256")
      .update(readFileSync(fixture(pdfName)))
      .digest("hex"),
  ).toBe(expected.source_sha256);
  const text = readFileSync(
    fixture("imagine_that_full_extracted_text.txt"),
    "utf8",
  );
  const scopes = detectIMCCampaignScopes(text);
  expect(scopes.map((scope) => scope.title)).toEqual(
    expected.campaigns.map((campaign) => campaign.title),
  );
  expect(scopes).toHaveLength(2);
  for (const [index, campaign] of expected.campaigns.entries()) {
    const scope = scopes[index];
    const parsed = parseIMCBrief(scope.sourceText);
    const records = extractStudioIMCRecords(scope.sourceText);
    expect(parsed.fields.campaign.sourceValue).toBe(campaign.title);
    expect(scope.pages).toContain(campaign.campaign_pages[0]);
    for (const field of campaign.expected_fields) {
      const page = scope.sourceText.match(
        new RegExp(`PDF PAGE ${field.page}\\n([\\s\\S]*?)(?=PDF PAGE \\d+|$)`),
      )?.[1];
      expect(
        page,
        `${campaign.id}/${field.field} page ${field.page}`,
      ).toContain(field.contains);
    }
    const expectedRecords = [
      [
        "key_message",
        campaign.id === "movers" ? "key_message_customer" : "key_message",
      ],
      ["timing", "timing"],
      ...(campaign.id === "xfinity_pro"
        ? [["deliverable", "deliverable_desktop"]]
        : []),
    ] as ["key_message" | "timing" | "deliverable", string][];
    for (const [group, fieldName] of expectedRecords) {
      const excerpt = campaign.expected_fields.find(
        (field) => field.field === fieldName,
      )!.contains;
      expect(
        records.some(
          (record) => record.group === group && record.text.includes(excerpt),
        ),
        `${campaign.id}/${fieldName} is a structured source record`,
      ).toBe(true);
    }
    if (campaign.id === "xfinity_pro")
      expect(
        records.some(
          (record) =>
            record.group === "campaign_background" &&
            record.text.includes("additional $15 a month") &&
            record.text.includes("WiFi 7"),
        ),
        "Pro product details remain source-attributed background, not an invented offer field",
      ).toBe(true);
    for (const forbidden of campaign.must_not_import_from_other_campaign)
      expect(scope.sourceText, `${campaign.id} contamination`).not.toContain(
        forbidden,
      );
    for (const shared of expected.shared_brand_guidance)
      expect(scope.sourceText).toContain(shared.exact_source_excerpt);
    expect(extractJobToBeDone(scope.sourceText)).toBe("");
    expect(resolveRtb(extractUpstream(parsed)).approvalStatus).toBe("unknown");
    expect(parsed.fields.reason_to_believe.status).toBe("Supplied");
    expect(parsed.fields.research.status).toBe("Not supplied");
    expect(parsed.supplemental.sourceReferences?.status).toBe("Not supplied");
    if (campaign.id === "movers") {
      expect(parsed.fields.objective.sourceValue).toContain(
        "Reinforce why a customer must stay with Xfinity",
      );
      expect(parsed.fields.objective.sourceValue).toContain(
        "Position Xfinity as the brand to switch",
      );
      expect(parsed.fields.objective.sourceValue).toContain(
        "Target existing customers and prospects",
      );
      expect(parsed.fields.audience.sourceValue).toContain(
        "Existing customers & prospects who are moving",
      );
      expect(parsed.fields.reason_to_believe.sourceValue).toContain(
        "Prospect & TOT only",
      );
      expect(parsed.fields.channels.sourceValue).toContain(
        "OLA, DJ Reads, Print, Display",
      );
      expect(parsed.fields.constraints.sourceValue).toContain(
        "Movers specific messaging remains unchanged.",
      );
    } else {
      expect(parsed.fields.objective.sourceValue).toContain(
        "Drive marginal revenue growth",
      );
      expect(parsed.fields.objective.sourceValue).toContain(
        "Demonstrate how customers can level up",
      );
      expect(parsed.fields.audience.sourceValue).toContain(
        "Existing HSD Customers",
      );
      expect(parsed.fields.reason_to_believe.sourceValue).toContain(
        "Choose a device to boost",
      );
      expect(parsed.fields.reason_to_believe.sourceValue).toContain(
        "Turn the home office into a powerhouse.",
      );
      expect(parsed.fields.channels.sourceValue).toContain("Digital Display");
      expect(parsed.fields.constraints.sourceValue).toContain(
        "Capitalize ‘Boost’ and ‘Device’",
      );
      expect(scope.sourceText).toContain("additional $15 a month");
    }
  }
});

test("standalone supplied campaign text stays single-campaign when pasted", () => {
  test.skip(
    !available,
    "Supply the approved offline test kit in tests/fixtures/client-input-pack.",
  );
  for (const [file, included, excluded] of [
    [
      "movers_source_text.txt",
      "Prospect & TOT only",
      "Xfinity Pro is an HSD bolt-on",
    ],
    [
      "xfinity_pro_source_text.txt",
      "additional $15 a month",
      "Prospect & TOT only",
    ],
  ]) {
    const source = readFileSync(fixture(file), "utf8");
    expect(detectIMCCampaignScopes(source)).toEqual([]);
    expect(source).toContain(included);
    expect(source).not.toContain(excluded);
    const parsed = parseIMCBrief(source);
    expect(parsed.fields.reason_to_believe.status).toBe("Supplied");
    expect(extractJobToBeDone(source)).toBe("");
  }
});
