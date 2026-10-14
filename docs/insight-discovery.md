# Insight Discovery POC

Insight Discovery is an optional research mode that runs alongside the existing creative Round Table. It reuses the current prepared Input Pack but has a separate UI, five investigative prompts, version history, saved findings, threads, and human strategy canvas. It does not change the Round Table agents, creative prompts, brief-line blending, or the existing approval path.

## Enable locally

Set `NEXT_PUBLIC_INSIGHT_DISCOVERY=true` before starting `next dev` or building. The public flag is inlined by Next.js at build time; restart the development server after changing it. If unset or any value other than `true`, the original page renders without the Discovery entry.

When enabled, the Discovery entry is added to the Dynamic XC Input Pack only after the existing preparation outputs are current and ready. The existing “Generate Strategic Perspectives” action continues to open the creative Round Table. Discovery runs in its own overlay and can hand a human-approved brief line into the existing execution and XC Brief stages.

## Evidence and limitations

The five lenses use the same selected Input Pack snapshot. This repository has no authorized live connectors to Tableau, iSpot, ACE, Datorama, Brand Hub, customer research, or external web research. Discovery therefore analyzes supplied context only and marks those sources as not connected. It must not describe those systems as searched. Mock-provider results are visibly marked `DEMO DATA` and are not evidence.

Research state is kept in the current browser tab. Human-written problem, evidence/insight, hypothesis, strategic direction, open questions, and brief-line drafts remain separate from upstream RTB/JTBD fields. Approval explicitly records a human-authored strategy before handing it to the existing downstream workflow.

This is a local POC feature. It does not implement enterprise authorization, source retrieval, production identity integration, or deployment.

## Supplied sources and canonical cards

The supplied-context provider is the current evidence boundary. Discovery validates an exact, case-sensitive, contiguous excerpt against its named source, stable locator, audience, and any claimed date. Generated RTB adaptations, Sparks and research-planning text are not independent evidence. Prepared research can quote original upstream research; it cannot cite its own generated assumptions as proof. The source drawer distinguishes material available before a run from supplied context analyzed after success. External sources remain not connected, including authorized web/case-study retrieval. No documented analogous case means a research gap.

New research runs store their full input-pack snapshot plus canonical cards with `observedFinding`, `evidenceReferences`, `interpretation`, `limitationsOrCounterevidence`, `nextQuestion`, `lens`, run/version identifiers and timestamps. The older model/UI field names remain compatible with historical sessions. Historical findings retain their exact versions and provider; mock cards and connection notes remain visibly DEMO DATA.

## Drafts, threads and writing

Unsent lens, finding and connection messages, routing choices, working notes and canvas fields are saved separately for each source brief in session storage. The previous single-key draft is imported only when its original snapshot fingerprint matches; otherwise it remains archived intact. Cancelled or interrupted runs need an explicit retry. Browser cancellation stops waiting for the response; the server/provider may still finish a request already in progress.

Finding volleys stay in the finding thread, while agent-level volleys stay in the lens thread. Messages retain the investigation question, type, pack version and relevant finding/run reference. Scoped retries repeat the failed action and selected version, keeping drafts and earlier results. Save and Set aside retain exact versions, and saved references can reopen the original run.

The strategy canvas is available during pending or failed Discovery research. Approving it freezes the human problem, synthesis, hypothesis, strategic direction, brief line, open questions and exact saved references. That explicit record supplies the Discovery sections of the existing XC Brief; human synthesis and hypotheses retain their qualifications. Private working notes are retained in the workspace but excluded from the generated brief. Editing Discovery later does not alter a previous approval or final brief until another explicit approval. A Return to Insight Discovery entry remains available from later workflow stages. Upstream RTB/JTBD and their approval status remain separate.

Discovery final briefs use original supplied research and confirmed execution requirements for evidence, messaging, constraints and disclaimers. The approved human canvas supplies strategic content. Generated adaptations, Sparks and model interpretations are not carried into the approved strategy automatically. The existing creative-mode packaging path is unchanged.

## Validation

Run `npm run test:ai`, `npm run lint`, `npm run typecheck`, and `npm run build`. Run browser tests twice, with `NEXT_PUBLIC_INSIGHT_DISCOVERY=false` and `NEXT_PUBLIC_INSIGHT_DISCOVERY=true`, using an unused `PLAYWRIGHT_PORT` to avoid the existing demo server. Discovery-only tests skip in flag-off mode; all legacy specs run in both modes. These deterministic tests verify behavior and failure handling, not live enterprise retrieval.
