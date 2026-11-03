# Issue 07 implementation review

Baseline: `35f0c024715e0b39da42132a84dce56619b6a185`. Review covered the staged implementation against that baseline and subsequent working-tree fixes before commit. The two independent agents used fresh contexts; neither edited files. The required review's commit diff was adapted to `git diff --cached <baseline>` because the implement workflow requires review before the final commit.

## Standards

No clear hard-rule violations or ADR contradictions were found. Two actionable Fowler baseline heuristics were reported as judgment calls:

1. **Duplicated Code — model dispatch lifecycle.** Intake and main research repeated model reservation, pending checkpointing, a timeout/abort race, usage settlement and cleanup. Policy changes required synchronized edits in two security-sensitive paths.
2. **Duplicated Code — evidence selection policy.** Tools, initial publication and correction publication independently selected acquired evidence with the same cutoff/order/limit and schema parsing.

Resolution: `src/research/model-call.ts` owns the shared timeout, cancellation and known-usage settlement operation. Each caller retains its explicit checkpoint/repair/recovery decisions. `src/research/evidence.ts` owns recent evidence selection and explicit historical citation pinning. Both publication paths and tools use it. The Standards reviewer independently confirmed both findings resolved and found no remaining actionable concerns.

## Spec

Four initial correctness findings were reported, followed by one focused lifecycle finding; no scope creep was found:

1. **P2 — Supported/unexplained classification and ordering.** The domain contract requires supported theses first, then explicitly unexplained conditional theses, with the original screening rank within each group. The initial implementation only filtered baseline order.
2. **P1 — Unknown publication times.** The contract states that unknown publication time cannot establish a time-sensitive claim. The initial validator allowed all null-dated claims.
3. **P2 — Evidence history window.** Selecting the oldest 50 records would eventually hide every newly acquired revision or contradiction and break cached-evidence change review.
4. **P2 — Reworded coverage and expiry.** A whole-document text hash cannot establish a distinct underlying event; changed wrappers/wording could restart the five-session watch clock.
5. **Same-batch contradiction precedence.** A negative note followed by a positive note for the same event could remove and re-admit it; an old disproven event could also remove a distinct retained new event.

Resolutions:

- Explicit thesis classification and deterministic supported-first ordering now preserve the frozen order within groups. Supported theses need a cited fact and reasoned connection; unexplained conditional theses cite supplied market metrics and retain an explanation gap. Contradictory facts withhold acceptance.
- Time-sensitive facts/claims require known publication times. Null-dated facts may serve only explicitly timeless background/context, never supporting facts. Structured opening/event dependencies shorten expiry using application-owned timestamps.
- The shared evidence policy reads the newest 50 records and pins explicitly cited older IDs for publication/corrections. A regression acquires 51 revisions across two days and verifies the newest change remains visible.
- Only application-owned canonical event keys may establish a distinct event. Without one, the conservative issuer event identity cannot reset on text changes. Durable first-appearance history prevents re-admission of an expired event after an inactive gap. A distinct independently verified key can start a new interval.

Current and historical disproven event pairs are now combined before processing notes, so a contradiction cannot be undone by note order and only the matching event is removed. A regression covers both same-event conflict and a distinct retained verified event.

The Spec reviewer independently confirmed all five findings addressed and found no additional must-fix issues. Its prompt wording nit about unexplained acceptance was also corrected. The reviewer's attempted targeted test run hit the sandbox's loopback `EPERM` before any tests executed; the primary agent ran the tests successfully with the required local-runtime permission.

Standards: **2 original heuristics, 0 remaining**; original worst concern was duplicated model timeout/accounting policy. Spec: **5 correctness findings, 0 remaining**; original worst concern was unknown publication dates supporting time-sensitive claims. Both axes remain separate.

The full-universe acceptance harness additionally exposed a security-ID versus broker-ticker integration bug. The publisher now resolves queue security IDs through the indexed frozen market-decision/ranking relationship to the exact metrics row. Smaller research fixtures use distinct `BROKER_A`/`A` identifiers and reproduced red before the fix. The Spec reviewer independently checked this lookup, the lower bound on the frozen market cutoff, initial-seed paid-research exclusion and cutoff-qualified watch history.

Final validation: **77 tests / 17 files** pass in **172.61 seconds**, including full-universe capture/screening and the bounded 13-turn / 24-fetch research fixture. Strict typecheck, local D1 migrations, final Worker dry-run bundle and encrypted disposable restore also pass. Seed and morning captures run sequentially under the real broker spacing policy; only the morning publishes daily research/watch artifacts.
