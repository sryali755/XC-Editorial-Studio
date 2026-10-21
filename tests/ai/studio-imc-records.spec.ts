import { expect, test } from "@playwright/test";
import { extractStudioIMCRecords } from "../../lib/studio-imc-records";

test("separate objective, audience and RTB headings retain exact source spans", () => {
  const source = `# Campaign
## Business Objective
Retain existing movers.

## Marketing Objective
Increase consideration during moves.

**Primary Audience:** Existing customers who are moving.
**Secondary Audience:** Prospects choosing a provider.

## Reason to Believe — Existing Customers
Transfer service in the app.

## Reason to Believe — Prospects
The eligible offer has a price guarantee.`;
  const records = extractStudioIMCRecords(source);
  expect(
    records
      .filter((record) => record.group === "business_objective")
      .map((record) => record.text),
  ).toEqual(["Retain existing movers."]);
  expect(
    records
      .filter((record) => record.group === "marketing_objective")
      .map((record) => record.text),
  ).toEqual(["Increase consideration during moves."]);
  expect(
    records
      .filter((record) => record.group === "audience_segment")
      .map((record) => record.label),
  ).toEqual(["Primary Audience", "Secondary Audience"]);
  expect(
    records.filter((record) => record.group === "reason_to_believe"),
  ).toHaveLength(2);
  expect(records.at(-1)?.excerpt).toContain(
    "## Reason to Believe — Prospects\nThe eligible offer has a price guarantee.",
  );
});

test("adjacent plain labels and inline Markdown headings do not absorb another field", () => {
  const source = `# Campaign: Moving Together
Business Objective: Keep current movers connected.
Audience: Existing customers moving house.
JTBD: Transfer service with less work.
Reason to Believe: Transfer is available in the Xfinity app.
Brand positioning: The connection that keeps moving day manageable.
Supporting evidence: No audience study is attached.
## Business Objective: Win moving prospects.
## Reason to Believe: Eligible offers include WiFi equipment.`;
  const records = extractStudioIMCRecords(source);
  expect(
    records
      .filter((record) => record.group === "business_objective")
      .map((record) => record.text),
  ).toEqual(["Keep current movers connected.", "Win moving prospects."]);
  expect(
    records
      .filter((record) => record.group === "reason_to_believe")
      .map((record) => record.text),
  ).toEqual([
    "Transfer is available in the Xfinity app.",
    "Eligible offers include WiFi equipment.",
  ]);
  expect(
    records.find((record) => record.group === "job_to_be_done")?.text,
  ).toBe("Transfer service with less work.");
  expect(
    records.find((record) => record.group === "brand_positioning")?.text,
  ).toBe("The connection that keeps moving day manageable.");
  expect(
    records.find((record) => record.group === "research_evidence")?.text,
  ).toBe("No audience study is attached.");
});
