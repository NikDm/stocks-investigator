# Issue 11 implementation review

Fixed point: `2c9cfa8d2da0d068b44665bcf14b5e6d1fe2acf0` (the commit immediately before issue 11). Independent Standards and Spec agents reviewed `git diff 2c9cfa8d2da0d068b44665bcf14b5e6d1fe2acf0...HEAD` at implementation commit `bca6b39`, then independently verified working-tree corrections. No deployment or live data calls were performed.

## Standards

Initial report found no unambiguous documented code-standard violations. Two duplication heuristics were identified: `members()` and `member()` independently constructed pending/gap placeholders; batched and individual outcome loading independently resolved official opening references.

Both duplication findings are resolved: `uncalculated()` serves both member reads, and `openingReference()` plus `openingInputs()` share reference qualification and loading across individual and partition calculations.

No remaining documented Standards violations identified. Claimed tracker state was appropriate while review remained active; completion bookkeeping is handled in the ticket and map.

## Spec

The independent review identified the following requirements needing correction:

1. Missing successor endpoint prices must be `unresolved action`, rather than ordinary missing endpoints.
2. A sourced correction to a historical Q event must repair that reference while preserving the initial result.
3. A corrected action effective date must supersede the old dated event rather than remain unresolved or double-count.
4. Revision resolution must preserve distinct auction venues, conditions and nanosecond timestamps; unrelated later records cannot suppress a qualifying primary Q or hide a conflict.
5. Source corrections reverting to previously retained content must use acquisition receipts rather than the original content's creation timestamp.
6. Receipt joins must use indexed observation lookups, with bounded action event-history lookup rather than global retained-sighting scans.
7. Same-day ordering checks must cover parent/successor dependencies while ignoring dividends/actions on disposed predecessors.

Verified the latest loader and migration. Receipt lookups now have an `input_id`-leading index; daily reads stay within the holding window, and action corrections follow a capped set of event identities across changed dates. Overflow remains explicit rather than silently truncating results.

The previously reported correction, successor classification, and query-scan issues are addressed. No remaining actionable spec findings identified. Final test completion remains with the implementing agent and is recorded in the ticket.

Final summary: Standards 0 remaining findings (2 resolved heuristics); Spec 0 remaining findings (7 resolved correctness/performance issues). No remaining worst issue in either axis. Hosted throughput, live terminal evidence and prospective statistical usefulness remain documented operational limitations.

Validation completed by the implementing agent: all **119 tests / 33 files** pass in a fresh isolated full-suite run with unchanged timing limits; strict typecheck, both local migrations, final Worker dry-run and populated encrypted restore pass.
