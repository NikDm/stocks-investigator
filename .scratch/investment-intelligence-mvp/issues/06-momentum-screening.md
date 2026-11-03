# 06 — Implement deterministic momentum screening and baseline snapshots

Status: resolved
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

2026-11-03: User replied “approve”, confirming `screen(snapshot, ruleVersion)` and persisted artifacts as the TDD seam.


## Answer

Local deterministic screening delivered on 2026-11-03. [Screening runbook](../../../docs/screening.md), [independent Standards/Spec review and resolutions](../screening-review.md). The user confirmed the proposed `screen(snapshot, ruleVersion)` and persisted-artifact seam before new tests.

- Pure `screen` implements `screen-eval-v1` eligibility validation, all sustained-momentum metrics/gates, whole-U_D median relative strength, full passer ranks and deterministic tie-breaks. Pinned decimal.js 10.6.0 uses 90 significant digits, natural logarithms and 12-place half-even comparisons. An unrounded R20 intermediate prevents median/relative-strength rounding drift. Capture and screening share the same raw-price/liquidity calculation and rounding.
- Raw close and contemporaneous raw dollar volume own price/liquidity; split-adjusted closes/volumes own momentum. Missing or conflicting sessions, invalid bars, unresolved actions/identity and observations after cutoff cannot enter selection. Unverified split-volume semantics withhold confirmation and mark the run partial. All broker decisions, exclusions, exact frozen input IDs, source/sighting provenance, as-of session, acquisition/event limits, metrics and reasons remain inspectable.
- Durable fenced per-security partitions precede a separate compact ranking stage. The completed result atomically freezes all ranks, exact denominator, input fingerprint, baseline three (or fewer/zero) and the identical bounded research queue. Append-only SQL triggers protect metrics, ranks and result; research cannot overwrite or backfill the baseline. Repeated names retain their rank. Early-watch confirmation uses the same gates and normal top-three queue; confirmed names outside the queue retain an explicit not-selected reason. Evidence intake/promotion publication and repeat presentation remain issue 07.
- The market runtime checkpoints screening after capture and before evaluation/completion; the private paginated snapshot API exposes saved results. One conservative 16-second invocation-wide work allowance covers all phases, with a 1.5-second screening-stage reservation and 4 seconds left for overhead. No model or additional provider request is used. Migration 0004 and the encrypted disposable restore include all screening artifacts.

### Verification

Final strict typecheck, **53 tests / 8 files**, Worker dry-run bundle, all local test migrations and encrypted disposable backup/restore passed. Restore preserves all three screening tables and rejects tampered ciphertext. No remote database or deployed resource was changed.

The final audit-scale harness retained **5,078 securities × 90 sessions × two bases = 914,040 observations**, with 2,000 sustained paths exercising decimal logarithms. Screening completed in **103 stages / 26,535 ms total**; maximum stage **417 ms**, final compact ranking **299 ms**, and the ten slowest measured stages together **3,791 ms**. Each stage passed the conservative **1,500 ms** reservation assertion, and the combined sample passed its **15,000 ms** reservation assertion. The entire capture/qualification/screening/evaluation-planning fixture took approximately **182.1 seconds**, with capture/qualification maximum stage **179 ms**, maximum page **159,293 bytes**, and evaluation planning **5,659 ms**. The full test suite took **185.71 seconds**. These are local elapsed measurements, not billed Worker CPU, production heap measurements or a delivery SLA.

Red→green checks caught and fixed a capture/screening rounding mismatch, intermediate relative-strength rounding drift and stale normalized action provenance on identical recaptured bars. Tests cover worked returns, every ordering key, issuer ties, sparse/conflicting/invalid history, zero/flat returns, concentration, strict/inclusive thresholds, splits/raw liquidity, partial/unavailable/empty runs, fewer passers, repeated names, cutoff enforcement, immutable baseline/queue and partition/rerun determinism. Independent review found 2 Standards heuristics and 2 Spec correctness issues; all were fixed and independently confirmed resolved. The first final scale attempt exposed an inefficient provenance join plan; explicit indexed join ordering fixed it, targeted tests passed again, and the repeated full suite above passed.

### Remaining operational gates

The foundation/market-capture deployment, hosted combined CPU/heap/D1 capacity, current identity/action reconciliation and **three observed pre-08:00 Europe/Zagreb sessions** remain unverified. Conservative work reservations require validation on the actual hosted workload. Jobs remain disabled by default. No live morning readiness, predictive usefulness, provider completeness, account order availability or provisioning is claimed. These are existing operational gates, not missing local screening implementation.
