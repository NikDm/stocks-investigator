# Issue 06 review

Fixed point: `09cbfd18b83b41125ab1622e49efa176d7bf1841`. Initial implementation: `bb07ff2`. Two independent reviewers followed the code-review skill; subsequent fixes remain on the same branch.

## Standards

No documented-standard violations. Two heuristic findings:

1. **Possible Duplicated Code:** screening repeated capture's raw-price/liquidity calculation and gates. A shared `liquidity` calculation now supplies measured values and eligibility to both boundaries; the capture/screening half-even regression passes.
2. **Possible Primitive Obsession:** string fields represented bounded screening outcomes. Literal unions now define momentum gates, dispositions, market confirmation and run status. Typecheck and screening tests pass.

## Spec

1. **P1 — Stale normalized provenance:** “Use explicit historical `sip`, dated symbol resolution, and split-adjusted daily bars as acquired by the run cutoff.” Content-addressed identical bars can retain an earlier query's action version. Screening now joins exact selected IDs to the frozen snapshot's sightings and uses its acquisition/action version, with an indexed lookup. A red→green persisted-artifact regression captures identical bars under action versions v1/v2, retaining identical input IDs and selections while preserving each historical version.
2. **P2 — Shared invocation CPU allowance:** “stages share the invocation CPU budget rather than each receiving 20 seconds.” The market drain now reserves conservative CPU work across every phase from one 16-second allowance, leaving 4 seconds for overhead. Screening reserves 1.5 seconds/stage; dispatch stops before exhausting CPU or SQL allowance. The full-universe benchmark checks individual stages against 1.5 seconds and the ten slowest measured stages together against 15 seconds. These are conservative local reservations, not production CPU metering; hosted combined-workload verification remains open.

No scope creep found. Queue size, issuer deduplication, immutable baseline, no-backfill behavior and early-watch confirmation gates matched the local scope. Daily positive-day counting follows exact positive close changes; the contract did not clearly require rounding that count's input signs.

Initial totals: Standards 0 hard violations / 2 heuristics; Spec 2 correctness findings (P1 provenance, P2 CPU allowance). Both sets were addressed; independent follow-up and final checks are recorded in the ticket answer.

## Follow-up

Both reviewers independently confirmed the fixes at `67e9cf0`, with zero outstanding findings for local scope, conditional on the benchmark assertions. Standards: 0 outstanding; Spec: 0 outstanding.

The first final full-suite attempt passed all smaller tests but stalled in the scale test after the provenance change. SQLite EXPLAIN showed a whole-snapshot receipt scan before iterating selected IDs. The final query uses explicit CROSS JOIN loop ordering: selected IDs → normalized primary-key lookup → `market_sighting_input(snapshot_id,input_id,acquired_at)` lookup. EXPLAIN confirms all index keys are used. The Spec reviewer independently confirmed unchanged join/filter/aggregation semantics. The stalled run was stopped, targeted 18 screening tests passed again, and the full suite was repeated; final evidence is in the ticket answer.

Final verification: 53 tests in 8 files pass. All-universe screening: max stage 417 ms, ranking 299 ms, ten slowest stages 3,791 ms. Standards: 0 outstanding; Spec: 0 outstanding.
