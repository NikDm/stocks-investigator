# 10 — Refresh an opportunity before the US opening on demand

Status: needs-triage
Type: task
Blocked by: 09

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Add an authorized manual re-review action and scope it according to 02/03. Fetch newly available evidence and permitted premarket observations within the existing budgets. Publish a new assessment version with an explicit comparison to the morning version, including changes in attractiveness and invalidation.

Show data timestamps/delay. Delayed, stale or missing prices leave current entry conditions unvalidated and direct the investor to check Trading 212 live. Preserve frozen evaluation cohorts and apply the separate-version/cohort contract to refreshes; never rewrite the morning record.

Acceptance: repeated requests cannot cause unbounded cost or overlapping publication; failures preserve the prior version with a visible failed refresh; changes are traceable; news arriving after the refresh cutoff is not backdated. Verify stale-price behavior, authorization and immutable history.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
