# 13 — Optionally record actual purchases separately from opportunity selection

Status: resolved
Type: task
Blocked by: 09

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Add optional manual purchase records with entry date and price, linked to an opportunity where applicable. Keep ownership and tracking separate. Record quantity only if an agreed minimal scope needs it; portfolio sizing, allocation analysis, broker synchronization and order placement are excluded.

Acceptance: selecting a candidate never creates a purchase; entering/removing a purchase never changes the frozen research baseline or hypothetical outcomes; actual entry data is clearly distinguished from reference prices. Refine edit/correction history and minimal fields before implementation. This convenience ticket does not block any core research/evaluation milestone.

### Refined implementation contract — issue 03

Add optional authenticated manual purchase records through the private HTTP boundary. Minimal fields: stable security identity, purchase date, positive USD entry price, optional linked opportunity and optional short note; quantity, broker sync and portfolio calculations are deferred. Label date-only records as date precision, not a fabricated execution instant, and distinguish actual entries from hypothetical references.

Create append-only corrections/removal tombstones linked to original record and acquisition time; do not erase history or change any assessment/cohort/outcome. Use CSRF, server validation, expected revision and idempotency key. Tracking does not imply purchase; recording/removing one does not create/archive tracking. Verify purchase isolation and correction history at the proposed authorized purchase-command seam after confirming TDD seams; this feature remains optional and never gates core evaluation.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-04: Implementation authorized; dependency 09 resolved. User confirmed authorized purchase-command HTTP TDD seam. Review baseline: `531a1ca64d2d00ceda014ded73d4ba02c628e054`.

## Answer

Delivered locally on 2026-11-04: optional authenticated actual purchase records, independently of tracking and research evaluation. [Runbook](../../../docs/purchases.md), [independent Standards/Spec review](../purchase-review.md).

- Private dashboard forms and JSON commands record stable security identity, date-precision purchase date and positive decimal USD actual entry price, with an optional same-security tracked-opportunity link and short note. Unlinked purchases do not require tracking. Quantity, portfolio calculations, broker synchronization and order placement remain excluded.
- Corrections append complete field revisions; removal appends a terminal tombstone. Every revision retains the original record ID/acquisition time and its own server acquisition time. Security identity corrections use explicit removal and a separate purchase. Paginated history survives removal; SQL guards prohibit historical update/delete.
- Access authentication, Origin/CSRF checks, strict server validation, expected revisions and identity-scoped idempotency keys protect both form and JSON commands. Concurrent conflicting corrections cannot both publish; eight concurrent identical retries return the same original revision. Malformed prices return validation errors, rather than database/unavailable errors.
- Actual entries are labeled separately from hypothetical evaluation references. HTTP tests show selection creates no purchase and linked purchase creation/correction/removal leaves tracking, frozen research and hypothetical outcomes unchanged. No scheduled/core evaluation path depends on purchases.

Verification: final full suite **127 tests / 37 files pass (219.17 seconds)**, including four purchase HTTP tests at the user-confirmed seam; strict typechecking, final Worker build dry run, and encrypted disposable backup/restore with populated purchase correction/removal history pass. Independent Standards review found no code issues; the one Spec idempotency-race finding was fixed and independently confirmed resolved. Both reviewers confirmed the corrective commit.

No deployment or provisioning occurred. Purchase security IDs and entries are manually recorded, not broker/execution-verified. Browser rendering was outside the agreed test seam. Existing production readiness and live morning-usefulness gates remain unchanged; this optional feature does not gate core evaluation.
