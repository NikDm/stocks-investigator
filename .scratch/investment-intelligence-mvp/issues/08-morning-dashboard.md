# 08 — Deliver the scheduled morning review in the private dashboard

Status: needs-triage
Type: task
Blocked by: 07

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Compose market snapshots, screening and research into an automatic report ready by 08:00 Europe/Zagreb on US trading days. Build the private report view: up to three main candidates, compact early watch, thesis/evidence details, freshness and run status. Include tracking selection controls using the lifecycle boundary to be completed in 09. Do not require a chat interface.

Persist frozen selections, rule versions, cutoffs and screener/AI cohorts before the decision deadline from 02, so evaluation inputs exist from the first usable run. Late runs must not acquire an earlier cutoff retroactively. Expose retries/partial runs honestly and show whether a report is from the current trading day. Include lightweight usefulness/review-effort feedback.

Acceptance: empty results are valid; repeated jobs do not publish contradictory duplicates; exchange holidays and timezone transitions follow the contract; stale data is labeled; private access holds. A real or permitted representative end-to-end run demonstrates screening through cited report publication. The UI supports the 10–15 minute review goal. Exact deployment readiness follows 03.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
