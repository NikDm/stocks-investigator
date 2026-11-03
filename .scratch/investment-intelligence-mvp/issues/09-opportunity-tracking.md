# 09 — Track selected opportunities and publish material changes

Status: needs-triage
Type: task
Blocked by: 08

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement manual selection independently of ownership, a maximum of 10 active opportunities, archiving/history, and the agreed 20-trading-day renewal checkpoint. Follow the invalidation and expiry rules resolved in 02. Do not silently auto-archive an existing item to make room or silently renew a thesis.

Daily reports summarize material changes in market evidence and thesis evidence for active opportunities, using bounded research and new immutable assessment versions. Missing data is not evidence of no change. Archived/expired/invalidated history remains accessible; fixed-horizon evaluation continues independently. No alerts or continuous monitoring.

Acceptance: cap, archive/renew transitions and simultaneous selections are consistent; repeat stories do not appear as new corroboration; prior versions survive updates; no-change items do not require full repeated reports; failures remain visible. Verify lifecycle and versioning boundaries.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
