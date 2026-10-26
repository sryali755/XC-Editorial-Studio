import { test, expect } from "@playwright/test";
import { phase1Fixture } from "../fixtures/phase1-input-pack";
import { componentHarness, nodes } from "../helpers/phase1-component-harness";
import { outputSchemas } from "../../lib/ai/schemas";

test("an empty RTB proposal cannot appear selected or ready", () => {
  const { session, versions } = phase1Fixture("gateway_source_text.txt");
  versions.reasonToBelieve.data = {
    ...outputSchemas.rtb.parse(versions.reasonToBelieve.data),
    xcAdaptation: null,
    proposedJTBD: null,
  };
  const app = componentHarness(session, async () => {
    throw Error("Generation forbidden in rendering test");
  });
  const card = nodes(
    app.tree,
    (element) =>
      element.type === "article" &&
      String(element.props.className).includes(
        "studio-preparation-reasonToBelieve",
      ),
  )[0];
  expect(card).toBeTruthy();
  const selection = nodes(
    card,
    (element) => element.type === "input" && element.props.type === "checkbox",
  )[0];
  expect(selection.props.disabled).toBe(true);
  expect(selection.props.checked).toBe(false);
  expect(app.html()).toContain("no XC adaptation");
});

test("the actual prep component renders the proposed JTBD separately from original JTBD and RTB framing", () => {
  const { session, versions } = phase1Fixture("gateway_source_text.txt");
  const job =
    "When I consider upgrading, I want to understand the benefits, so I can decide with confidence.";
  versions.reasonToBelieve.data = {
    ...outputSchemas.rtb.parse(versions.reasonToBelieve.data),
    proposedJTBD: job,
  };
  const app = componentHarness(session, async () => {
    throw Error("Generation forbidden");
  });
  const html = app.html();
  expect(html).toContain("PROPOSED JTBD · NOT APPROVED");
  expect(html).toContain(job);
  expect(html).toContain("Not supplied as a distinct JTBD.");
  expect(html).toContain("PROPOSED XC FRAMING");
  expect(html).toContain("Include these proposals in the Dynamic Input Pack");
});
