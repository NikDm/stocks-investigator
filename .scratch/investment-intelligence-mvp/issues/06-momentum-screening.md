# 06 — Implement deterministic momentum screening and baseline snapshots

Status: claimed
Type: task
Blocked by: 05

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the versioned eligibility, sustained-momentum scoring, ranking and tie-break rules from 02. Persist the screener-only baseline before LLM work, the bounded research pool, exclusions and measured signals with as-of times. Define early-watch market confirmation using the same contract.

Acceptance: identical inputs and rule versions yield identical results; sparse history, splits and invalid data follow the contract; research cannot modify the saved baseline; inputs and cutoff are inspectable. Use worked examples from 02 to verify calculations and ranking. No LLM makes numeric calculations or broker-eligibility decisions.

### Refined implementation contract — issue 03

Expose the deterministic screening boundary from [architecture](../architecture.md): snapshot manifest + `screen-eval-v1` → U_D, exclusions, metrics, full ranks, baseline three and same research queue. Implement all v1 thresholds, raw dollar-volume versus split-adjusted signals, decimal logarithms and 12-place half-even comparisons; no model is called.

Use issue 02's independently worked numeric/identity examples, threshold boundaries, zero/flat returns, missing sessions, conflicting actions and issuer ties. Save baseline/queue before research, including fewer/zero passers and repeated names; permit no backfill after research rejection. Keep early-watch promotion dependent on these same gates and normal queue position. Benchmark full-universe per-security partitions and final compact ranking within 20-second CPU stage targets; deterministic results must match across partitioning and reruns. The UI's rounded numbers must not rerank results.

Proposed seam: screen(snapshot, ruleVersion) and its persisted artifacts; catches reproducibility/calculation behavior, misses market-data completeness and predictive usefulness. Confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-03: Implementation requested via `$implement issue 6`. Dependency 05 is resolved for local work; live operational gates remain open. Implementation/review baseline: `09cbfd18b83b41125ab1622e49efa176d7bf1841`. Proposed screening and persisted-artifact seam submitted for TDD confirmation.
