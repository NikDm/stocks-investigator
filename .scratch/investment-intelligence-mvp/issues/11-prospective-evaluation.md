# 11 — Calculate fixed-horizon outcomes and compare with the screener

Status: needs-triage
Type: task
Blocked by: 08

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement outcome calculation from saved universes, rule versions, baseline and AI selections using 02's reference prices, cost allowance and cutoff policy. Primary horizon is 20 trading days; supporting horizons are 10 and 30. Include interim downside under the documented data limitations.

Calculate returns for all evaluated selections, not only purchased/tracked winners. Handle missing data, corporate actions and delistings explicitly. Report cohort size, maturity, coverage, returns, downside, AI/screener overlap and the separately captured usefulness/review effort. Preserve immutable decisions while allowing explicitly versioned corrections to data/calculations.

Acceptance: immature horizons show pending rather than zero; excluded or unavailable outcomes remain counted and explained; actual purchases do not alter reference outcomes; no future evidence changes historical selection. Verify hand-computable examples and comparison parity. Do not claim statistical edge from a small sample.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
