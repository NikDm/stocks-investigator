# 09 — Track selected opportunities and publish material changes

Status: resolved
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

## Answer

Local tracking implementation delivered on 2026-11-03 at the approved tracking-command, scheduled coordinator/check and private dashboard HTTP seams. [Runbook](../../../docs/tracking.md), [independent Standards/Spec review](../tracking-review.md).

- Manual selection records a stable security identity and immutable thesis independently of ownership. Authorized commands carry an expected revision and identity-scoped idempotency key. SQL lifecycle events atomically enforce ten occupied slots, counting needs-renewal; simultaneous last-slot selections cannot both succeed. Explicit archive retains all events, assessments and frozen cohorts. Repeated commands return their original result; changed payloads or stale revisions conflict.
- Selection and renewal use the saved exchange calendar, with session-20 regular close as checkpoint. Invalidated/expired assessments never release a slot or reset tracking age. At the checkpoint, needs-renewal pauses source/model research. Manual renewal requires a current accepted assessment and starts the next exchange session. An invalidated thesis requires later, explicitly revised reasoning; a later copy cannot silently restore it. Weekend selection and exact-close boundaries are exercised.
- The scheduled pipeline adds bounded tracking checks between discovery research and evaluation/report publication. Main/tracked overlap shares acquisition; assessment reuse additionally requires the same recorded reasoning and coverage of newly acquired evidence. Other tracked names consume the existing source/model ledger, including reservations, per-pass bounds and repairs. Incomplete sources, budgets, unknown billed calls, missing market data and cutoff failures remain visible. Pending paid work is not automatically replayed or refunded.
- Deterministic decimal market predicates cover close movement, R20 change, gate transitions, volume and recorded close-below conditions. Previously unchecked closes are replayed after missed reports, so an intervening invalidation cannot disappear after recovery. Recorded source-text predicates require the cited origin and confirming text. Opaque prose predicates remain manual-review gaps. Known-event paraphrases/repeated facts are not new corroboration; ambiguous issuer-event identities and unknown publication times are explicit gaps.
- Dated no-change checks retain the original assessment ID/expiry. Material changes append immutable versions, preserving the recorded thesis and every predecessor; incomplete material research publishes insufficient evidence. Confirmed invalidation remains explicit in the tracking projection and linked newly published assessment. No daily update silently replaces the recorded thesis. Missing/superseded/paused checks remain distinct from unchanged.
- Private CSRF-protected controls support selection, explicit archive and renewal. Morning reports freeze tracking checks and link their material changes, gaps, prior/current assessments and full lifecycle pages. Histories remain available after archive/invalidation/expiry; H30 collection still includes an explicitly archived opportunity through the saved-universe boundary. Backup/restore includes populated lifecycle, versions, checks and pending work.

### Verification

**96 tests / 27 files pass (171.37 seconds)**, including 12 tracking tests at the approved seams. Strict typechecking passes; local migration 0007, final Worker dry-run and encrypted disposable backup/restore pass. All four independent Spec findings and both Standards heuristics were fixed and independently confirmed resolved. No confirmed ADR contradiction or scope creep remains.

### Remaining operational gates

Jobs, market capture and model research remain disabled by default. No deployment, provisioning, paid model call or provider outreach occurred. Registered retrieval remains SEC-only; semantic entailment, independently verified event identities, opaque invalidation conditions and live model quality remain bounded-source/model limitations. Combined full-universe plus ten tracked names hosted CPU/heap/query/network throughput, actual shared-budget fit and finish-by-07:50 remain unmeasured. Existing Access/account, independent production backups/key custody, costs and three observed pre-08:00 mornings remain open. Prospective investment outcomes and human review-time/usefulness evidence are not claimed. Issue 10 owns manual pre-opening re-review.
