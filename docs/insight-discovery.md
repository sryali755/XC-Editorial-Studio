# Insight Discovery POC

Insight Discovery is an optional research mode that runs alongside the existing creative Round Table. It reuses the current prepared Input Pack but has a separate UI, five investigative prompts, version history, saved findings, threads, and human strategy canvas. It does not change the Round Table agents, creative prompts, brief-line blending, or the existing approval path.

## Enable locally

Set `NEXT_PUBLIC_INSIGHT_DISCOVERY=true` before starting `next dev` or building. The public flag is inlined by Next.js at build time; restart the development server after changing it. If unset or any value other than `true`, the original page renders without the Discovery entry.

When enabled, the Discovery entry is added to the Dynamic XC Input Pack only after the existing preparation outputs are current and ready. The existing “Generate Strategic Perspectives” action continues to open the creative Round Table. Discovery runs in its own overlay and can hand a human-approved brief line into the existing execution and XC Brief stages.

## Evidence and limitations

The five lenses use the same selected Input Pack snapshot. This repository has no authorized live connectors to Tableau, iSpot, ACE, Datorama, Brand Hub, customer research, or external web research. Discovery therefore analyzes supplied context only and marks those sources as not connected. It must not describe those systems as searched. Mock-provider results are visibly marked `DEMO DATA` and are not evidence.

Research state is kept in the current browser tab. Human-written problem, evidence/insight, hypothesis, strategic direction, open questions, and brief-line drafts remain separate from upstream RTB/JTBD fields. Approval explicitly records a human-authored strategy before handing it to the existing downstream workflow.

This is a local POC feature. It does not implement enterprise authorization, source retrieval, production identity integration, or deployment.
