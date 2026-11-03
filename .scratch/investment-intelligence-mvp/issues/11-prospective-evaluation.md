# 11 — Calculate fixed-horizon outcomes and compare with the screener

Status: resolved
Type: task
Blocked by: 08

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement outcome calculation from saved universes, rule versions, baseline and AI selections using 02's reference prices, cost allowance and cutoff policy. Primary horizon is 20 trading days; supporting horizons are 10 and 30. Include interim downside under the documented data limitations.

Calculate returns for all evaluated selections, not only purchased/tracked winners. Handle missing data, corporate actions and delistings explicitly. Report cohort size, maturity, coverage, returns, downside, AI/screener overlap and the separately captured usefulness/review effort. Preserve immutable decisions while allowing explicitly versioned corrections to data/calculations.

Acceptance: immature horizons show pending rather than zero; excluded or unavailable outcomes remain counted and explained; actual purchases do not alter reference outcomes; no future evidence changes historical selection. Verify hand-computable examples and comparison parity. Do not claim statistical edge from a small sample.

### Refined implementation contract — issue 03

Expose the outcome boundary in [architecture](../architecture.md), using the retained 05/08 universe, auction/action/raw-close inputs. Calculate every frozen U_D member for not-surfaced review as well as baseline/AI members; today's catalogue and purchase state cannot change membership. Initial calculations close at v1's next-report acquisition deadline; later data/corrections append provenance-linked revisions without changing decisions.

Implement session-S-as-one H10/H20/H30, verified primary Q entry, action-aware raw-price wealth, entitled dividends/cash successors, 10bp-per-side costs and 0/25bp sensitivity. Use issue 02's independent split/dividend/merger/missing-middle/endpoint examples, not implementation-derived expected values. Pending, unresolved reference/endpoint/action and complete versus partial daily-close downside remain distinct; no endpoint shifting or delisting-as-zero.

Display resolved/total and reason counts, mean/median among resolved only, overlap and matched paired coverage, separate morning/refresh comparisons and response-denominator usefulness/time. Empty AI is abstention. Bound partitions/query scans under D1/Worker limits. Proposed seam: frozen inputs → outcome revisions/comparison views, catching arithmetic/coverage/history but missing unavailable terminal evidence and statistical edge; confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Implementation authorized by the investor via `$implement issue 11`; the proposed frozen-inputs → outcome revisions/comparison views test seam was explicitly approved.

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

## Answer

Implemented the local frozen-inputs → outcome revisions/comparison views boundary at the investor-approved test seam.

- Every saved U_D member receives H10/H20/H30 evaluation work, independently of current catalogue, tracking, purchases or selection. Session S is one; opening acquisition and endpoint/action acquisition retain their separate next-report deadlines. Initial results close at those cutoffs even when calculated later. Explicit reasoned corrections append provenance-linked immutable revisions without changing decisions.
- Decimal raw-price wealth includes verified splits, entitled gross dividend receivables, cash/stock/mixed conversions, spin-offs and cash-only terminal holdings. The 10bp-per-side convention and 0/25bp sensitivity are identical for all members. Auction venue/condition/nanosecond identity, same-event corrections, reversion to earlier source content and corrected action dates remain auditable. Unverified timing/currency/rights, missing successor prices and unknown terminal facts remain action gaps. Zero raw prices never establish a worthless cancellation.
- Pending, missing reference/endpoint/action, awaiting-calculation and complete/partial daily-close downside remain distinct. Same-day dependent actions require verified order; disposed predecessors cannot invalidate an otherwise complete path. No endpoint shifting, stale fill or delisting-as-zero is used.
- Private comparison views show resolved/total, reason counts, resolved-only mean/median, downside coverage, sensitivity, overlap and matched paired coverage. Morning and certified complete refreshes remain separate; AI abstention and baseline rejections/research gaps retain their denominators. Usefulness/time statistics preserve response and timing denominators independently of returns. History pages retain calculation inputs, hashes, reasons and source identifiers.
- Collection ticks plan frozen universes and calculate at most 240 work rows in 20-member partitions. Indexed acquisition receipts and bounded event-identity lookups follow date corrections without whole-history scans. Member/history reads paginate at 100. Explicit overflow remains a gap rather than silently dropping members.

Verification: **119 tests / 33 files**, strict typecheck, local D1 migrations 0009/0010, Worker dry-run build and populated authenticated encrypted backup/restore pass. The full 5,078-member frozen-universe harness verifies bounded calculation and complete denominator pagination; hand-computable cost/split/dividend/merger/missing-path examples, individual/partition parity and historical correction regressions pass. SQLite query plans confirm indexed interval, action-event and receipt lookups. Final full-suite verification ran in isolation with the original timing budgets unchanged; earlier overlapping/mismatched-bundle attempts were superseded by the clean final run.

[Independent review](../outcome-review.md): Standards **0** remaining findings (two duplication heuristics resolved); Spec **0** remaining findings (seven correctness/performance issues resolved). [Runbook](../../../docs/outcomes.md) documents inspection, operator action reconciliation/corrections, bounded work and limitations.

No live terminal-action completeness, hosted combined-workload capacity, morning SLA or statistical selection edge is claimed. Provider process-date/late reporting and unavailable terminal evidence remain explicit limitations; unknown outcomes remain counted. Existing deployment/private-access/cost/backup gates remain open. Jobs remain disabled; nothing was deployed, provisioned or purchased. Issue 12 can now proceed to readiness review.
