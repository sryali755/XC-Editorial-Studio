// Independent fictional campaigns. No completed client strategy is input evidence.
export const pipelineCampaigns = {
  renamed: `Project name: Cedar Cycle Membership
Why this work: Local commuters are considering maintaining a bicycle rather than replacing it.
Our commercial goal: Increase membership renewals among eligible city commuters.
Communication goal: Explain the included maintenance service and its limits.
Who are we talking to: Existing members who commute by bicycle and eligible occasional riders.
Consumer barriers: Members may not understand which repairs are included.
Consumer insight: The source proposes that maintenance uncertainty can make cycling feel difficult; no independent survey is supplied.
Customer job: When I plan my commute, I want to understand maintenance support, so I can decide whether membership fits my routine.
Product proof: Scheduled inspections are included at participating service shops; parts are excluded.
Key message: Understand what maintenance support includes.
Call to action: Review membership terms.
Expected assets: Two local display banners.
Creative mandatories: Keep the parts exclusion and participating-shop qualification visible.
Success metrics: Membership renewals and visits to the terms page.
Timelines: Not supplied.`,
  missing: `Campaign: Orchard Collection
Objective: Explain the collection service to residents.
Audience: Residents considering an optional collection subscription.`,
  tables: `| Campaign | River Refill |
| Business goal | Increase repeat visits to participating refill stores. |
| Communication goal | Explain which containers are accepted. |
| Target audiences | Existing store visitors; residents considering their first refill. |
| Proof / RTBs | Staff can weigh eligible containers at participating stores; not every container is accepted. |
| Expected deliverables | One poster and one email. |`,
  whitespace: `Campaign: Library Access
Business objective: Increase use of the local borrowing service.
Audience: Eligible residents comparing borrowing options.
Proof/RTB: Eligible\u00a0residents can borrow\nbooks through participating libraries.\nThe service is described as “local access”; membership rules apply.`,
  wrappedPdf: `## Source page 1
Campaign: Community Repairs
Business Objective: Explain the repair support available to residents.
Target Audience: Residents considering whether to repair existing equipment.
PROOF / RTB:
Scheduled maintenance is included at\nparticipating service locations; replacement parts are excluded.
## Source page 2
Deliverables: A leaflet.
Constraints: Do not promise replacement parts.`,
  multiple: `Campaign: Harbour Travel
Business objective: Explain available local travel passes.
Audience segments:
• Daily commuters who need weekday travel.
• Occasional visitors who need a single day.
Proof:
• The weekday pass covers the supplied weekday timetable only.
• The day pass expires at the stated end of service.
Key messages: Review the relevant pass restrictions.`,
  ambiguous: `Campaign: Oak Trial
Business objective: Explore whether the trial offer is relevant.
Proof and metrics: The source does not distinguish capability claims from evaluation targets.
Opportunity: More detail is required before this can become an audience insight.
Audience: Not supplied.`,
  unusable:
    "Meeting agenda\nWelcome and introductions.\nDiscuss next month's team lunch.\nClosing remarks.",
} as const;
