# 02 — Define reproducible screening and evaluation rules

Status: resolved
Type: research
Blocked by: 01

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

What explicit rules make sustained momentum and its outcomes reproducible with the feasible data?

Produce a domain-level contract, with worked examples, covering company-share eligibility and broker mapping; liquidity/price/data-history limits; sustained momentum lookbacks and relative-strength/volume measures; deterministic baseline ranking and tie-breaking; bounded research candidate count and final maximum of three; early-watch intake, independent-source handling, and market-confirmed promotion; novelty versus repeat candidates; insufficient data handling; measurable material changes; thesis expiry versus tracking renewal; invalidation and what remains active; and capacity of the compact early-watch list.

Resolve opening reference field and pre-opening freeze time, morning versus refreshed evaluation cohorts, the 10/20/30-trading-day endpoints, execution-cost allowance, missing sessions, corporate actions, delistings, and interim downside definition. Label reference returns as hypothetical; define consistently computable observations and limitations when intraday paths are unavailable. Use saved eligible universes for not-surfaced performers. Establish a simple review-time/usefulness feedback measure.

Offer concrete defaults justified by data availability; avoid optimizing thresholds on future outcomes. User-specific risk limits must not be invented. If a decision changes product scope, ask one question at a time. Publish rule versions and examples sufficient to refine downstream tickets; no implementation.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

### 2026-11-03 feasibility handoff

Issue 01 is resolved as research; this ticket is now unblocked. Use [full-universe evidence](../coverage-check.md) and [cost/source comparison](../public-research-check.md). Define share-class/type eligibility, identity conflict/unlisted reconciliation, minimum history/coverage and missing-outcome rules from the actual exception ledger. Historical opening-auction observations are available in samples as well as minute bars; choose and version an explicit reference/venue/condition contract. Actual morning punctuality was moved by the user to 05 and remains unverified. Do not interpret provider asset presence, a broker suffix, or successful HTTP status as complete eligible coverage.

## Answer

Completed 2026-11-03 as research, with no application implementation. [Versioned screening/evaluation contract](../screening-evaluation-contract.md) defines company-share identity/type eligibility, 61-session quality/liquidity gates, sustained momentum and deterministic ranking, bounded research/early watch, novelty, material changes, expiry/invalidation/renewal, official-opening reference and freezes, separate refresh cohorts, hypothetical 10/20/30-session outcomes, costs, action/missing-data arithmetic, daily-close downside, saved-universe review and usefulness feedback. Seven worked examples cover signals, bounds, timing, outcomes and lifecycle. [Primary-source semantics check](../screening-data-semantics.md) supports provider-field choices.

Numeric thresholds are prospective versioned design defaults, not optimized predictors or investor risk limits. Limitations remain explicit: account executability, unresolved identities, auction/action completeness, source replay rights and unmeasured morning punctuality (05). Documentation arithmetic/link checks and two-axis review apply; no application typechecker or test suite exists. 03 must refine downstream tasks before they become ready-for-agent; no downstream implementation was performed.
