# Issue 05 implementation review

Fixed point: `dd239074bd3ef8a9531e14ee7cd1109c76026991` (the implementation starting commit recorded in the ticket).

Initial diff: `git diff dd239074bd3ef8a9531e14ee7cd1109c76026991...HEAD`, containing `548f608 Implement issue 05 market capture and immutable universes`. Follow-up review inspected the subsequent recovery changes in the working tree before their final commit. Independent Standards and Spec agents ran in parallel, as required by the implement/code-review skills. No deployment or morning-readiness claim was reviewed as established fact.

## Standards

Initial report:

> Standards: no findings.
>
> The changes follow the repository’s documented vocabulary, single-context documentation layout, local issue conventions, and ADR boundary between immutable artifacts and resumable state. The implementation explicitly retains the ADR’s deployment and workload-validation gates.
>
> No baseline code smell was sufficiently actionable to report as a finding. No separate correctness concern established during this standards review.

Incremental review identified one judgment call:

> **Data Clumps — `src/market/evaluation.ts`.** The hunk introduces four parallel maps: `union`, `firstSessions`, `lastSessions`, and `holdingWindows`. Every saved member and successor must populate all four, and downstream code assumes their synchronization with non-null assertions. Bundle these into one map of `{ identity, firstSession, lastSession, holdingWindows }` so membership and collection obligations stay together.

Resolution: collection obligations now live in one `Map<string, CollectionMember>`. Follow-up reviewer confirmation:

> Confirmed resolved. `Map<string, CollectionMember>` now keeps each identity and its collection obligations together, eliminating the parallel-map synchronization concern. Successor updates also write a complete bundled member.

## Spec

Initial findings:

> **P1 — Missing data never receives the required recovery attempts.** Issue 05 requires “bounded recovery from … stale expected-session data”; architecture requires opening references to “retry boundedly through the next exchange-report deadline.” The worker commits every successful response and completes its task when pagination ends, including an empty response or one missing D. There is no coverage-based requeue. Bars published minutes later remain excluded, and an initially absent opening auction freezes as missing despite becoming available before its deadline. Keep transport completion separate from coverage completion and schedule bounded missing-symbol retries.
>
> **P1 — Collection recovery skips intermediate close sessions.** Issue 05 requires “Collect raw closes/actions for historical U_D members through H30 even after removal from today's broker catalogue.” The runtime schedules only the latest completed session, and evaluation requests exactly that single date. After a multi-session outage, intermediate closes are never planned. A removed security cannot recover them through routine history acquisition either. Persist an endpoint cursor or enumerate missing exchange sessions for active historical members, preserving missed initial deadlines while appending recovered observations.

Resolutions: a committed final provider page plans idempotent bounded missing-symbol freshness checks before advancing its checkpoint. Outcome acquisition enumerates missing contiguous holding-session ranges, retains per-session initial cutoffs, labels late inputs as revisions, and preserves removed/matured members through their saved H30 obligations. Both regressions were reproduced red before their fixes passed.

Follow-up finding:

> Skipping links when `union.has(link.successor_id)` prevents extending an existing successor’s collection window with its parent’s obligations. A successor whose own cohort ends on session 30 can stop collecting then even though a parent cohort requires it through session 49. Merge the parent’s applicable holding windows into existing successors and propagate extensions through successor chains.

Resolution: successor windows merge with existing windows and propagate through chains. A regression test first failed, then passed. Final reviewer confirmation:

> Confirmed resolved. Existing successors inherit and merge parent holding windows, and repeated passes propagate extensions through chains. No new concrete blocker found in this fix.

Standards: 1 judgment-call finding resolved, no documented-standard breaches. Spec: 3 correctness findings resolved; the worst original findings concerned missing-data and outage recovery. No remaining review findings.
