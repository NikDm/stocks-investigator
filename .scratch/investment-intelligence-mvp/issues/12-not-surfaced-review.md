# 12 — Show prospective strong performers not surfaced by discovery

Status: resolved
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

Implementation authorized via `$implement issue 12`. Dependency 11 is resolved. The investor explicitly approved the saved universe/outcomes → retrospective view TDD seam and confirmed review base `3384dc8`.

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.


## Answer

Implemented the prospective saved-universe → retrospective view at the investor-approved TDD seam. Open **Not-surfaced review** from a dated prospective evaluation, or `/retrospective/<morning-id>`.

- Ranks the top ten resolved H20 cost-adjusted outcomes by descending decimal return and ascending stable identity for ties. H10/H30 supporting outcomes and complete-denominator coverage remain visible; pending, unresolved and awaiting-calculation members retain their reasons. Each leader shows complete/partial daily-close downside and H20 revision ID, cutoff, recorded time and immutable calculation history.
- Reads only the saved morning eligible universe and revisioned outcomes. Current broker membership, tracking and purchase state cannot change the denominator. Historical exclusions and screening/history gaps appear in a separate reason-counted, 100-entry coverage ledger.
- Displays overlapping AI-main, baseline-only, early watch/early-watch-only, researched/rejected, outside-research-cap and momentum-gate-failure flags, plus original research gaps. Refresh publications remain separate provenance and never rewrite morning selections.
- Historical context uses frozen screening signals/input IDs, the morning's original assessment version IDs and exact cited evidence IDs. Acquisition/publication cutoff checks distinguish contemporaneous evidence from hindsight; unavailable evidence IDs remain explicit. No later search or assessment correction supplies a historical explanation. Not surfaced does not imply detectability.
- Screening persistence owns targeted historical row reads and shared row reconstruction after the independent Standards review identified duplication of storage knowledge in the view.

Validation: **123 tests / 36 files passed** in the full suite; final review-refactor screening/retrospective checks, strict typecheck, whitespace checks and Worker dry-run build passed. The 5,078-member retrospective harness verifies final-page leaders, top-ten truncation, equal-return ordering, historical exclusions, removed broker members, new current-only members and missing outcomes. Additional tests cover honest pending H10/H20/H30 coverage and overlapping early-watch/rejected flags with hindsight labeling.

[Independent review](../not-surfaced-review.md): Standards **0 outstanding findings** (one heuristic resolved); Spec **0 findings**. [Runbook](../../../docs/not-surfaced-review.md) documents navigation, provenance, coverage and limits. The view makes bounded 100-member reads across all three horizons; runtime grows with the saved denominator. Local scale verification does not establish hosted combined-workload capacity, live data completeness, detectability or predictive edge. Existing deployment/private-access/budget/backup/morning gates remain open. Nothing was deployed or provisioned; jobs remain disabled.
