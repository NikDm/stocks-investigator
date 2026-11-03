# 09 — Track selected opportunities and publish material changes

Status: claimed
Type: task
Blocked by: 08

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement manual selection independently of ownership, a maximum of 10 active opportunities, archiving/history, and the agreed 20-trading-day renewal checkpoint. Follow the invalidation and expiry rules resolved in 02. Do not silently auto-archive an existing item to make room or silently renew a thesis.

Daily reports summarize material changes in market evidence and thesis evidence for active opportunities, using bounded research and new immutable assessment versions. Missing data is not evidence of no change. Archived/expired/invalidated history remains accessible; fixed-horizon evaluation continues independently. No alerts or continuous monitoring.

Acceptance: cap, archive/renew transitions and simultaneous selections are consistent; repeat stories do not appear as new corroboration; prior versions survive updates; no-change items do not require full repeated reports; failures remain visible. Verify lifecycle and versioning boundaries.

### Refined implementation contract — issue 03

Use the tracking boundary and SQL lifecycle events in [architecture](../architecture.md). Commands include stable identity, expected revision and idempotency key. Atomically enforce ten occupied slots, counting needs-renewal; two simultaneous selections cannot both take the last slot. Archive explicitly, retaining every assessment/cohort.

Implement v1 selection/session-20 close checkpoint, invalidation while active, expiry distinct from renewal, paused needs-renewal research and manual renewal requiring a current assessment and starting next exchange session. No silent slot release or thesis replacement. Run material-change predicates deterministically and share evidence work for tracked/main overlap. Up to ten tracked names consume the existing source/model pool, with incomplete checks visible on exhaustion. Publish dated no-change checks without relabeling expired assessments current; material changes append versions. H10/H20/H30 capture continues regardless of archive/invalidation.

Proposed seam: authorized tracking commands → observable lifecycle/history/report changes. Test concurrency, calendar boundaries and issue 02 lifecycle example after confirming TDD seams; not ownership/portfolio fit.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-03: Implementation requested via `$implement issue 9`; dependency 08 is resolved for local work. Claimed at baseline `997aaf7a68f5565b63bc8d9643fc83cd3b9beaef`. Awaiting confirmation of authorized tracking-command, scheduled tracking-check/coordinator and private dashboard HTTP TDD seams and review baseline before writing tests.

2026-11-03: User approved the authorized tracking-command, scheduled tracking-check/coordinator and private dashboard HTTP TDD seams and review baseline `997aaf7a68f5565b63bc8d9643fc83cd3b9beaef`.
