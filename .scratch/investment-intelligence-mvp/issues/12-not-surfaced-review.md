# 12 — Show prospective strong performers not surfaced by discovery

Status: claimed
Type: task
Blocked by: 11

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Build a simple retrospective over saved eligible universes and matured 10/20/30-day cohorts. Rank performance with the same reference/cost policy and distinguish stocks surfaced by the screener, researched/rejected by AI, on early watch, and absent from both.

Show only contemporaneously recorded signals/evidence when explaining historical detectability. Later analysis is labeled retrospective. Do not label every winning stock a detectable missed opportunity. Include data coverage, interim downside and reasons when known; today's broker universe must not replace the saved universe.

Acceptance: a stock absent from the historical eligible universe is not counted as a miss; early-watch and rejected candidates remain distinguishable; insufficient history produces an honest pending/coverage state; no hindsight narrative is presented as a historical prediction.

### Refined implementation contract — issue 03

Use only saved morning U_D and revisioned outcomes from 11. Rank resolved H20 cost-adjusted results descending, stable identity ascending for ties, top ten; H10/H30 are supporting views. Display complete denominator, unresolved reasons and daily-close downside; no present-day eligibility filter. Implement multiple historical flags: AI-main, baseline-only, early-watch-only, researched/rejected, outside research cap, momentum-gate failure; separate refresh provenance. `Not surfaced` means absent from morning AI main, not automatically detectable.

Read contemporaneous inputs/evidence by immutable IDs and cutoff. Evidence acquired later is labeled hindsight; excluded/missing-history securities remain in a separate coverage ledger. Verify equal-return tie order, a removed broker member, early-watch/rejected overlap and missing outcomes. Proposed seam: saved universe/outcomes → retrospective view, catching hindsight/membership errors but not proving detectability; confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Implementation authorized via `$implement issue 12`. Dependency 11 is resolved. Proposed TDD seam confirmation requested before adding tests.

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
