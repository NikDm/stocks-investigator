# Issue 10 review

Fixed point: `dfc414d0ef6c60960bf51967fc02630415da1d34` (the current branch at implementation start). Reviewed the working-tree diff and new files before committing. Two independent fresh-context reviewers examined Standards and Spec in parallel, then re-reviewed the fixes.

## Standards

Initial review found no hard documented-standard violations and two design heuristics: duplicated model-flow code and scattered timing policy. Timing policy is now centralized in `src/refresh/policy.ts`, with mirrored atomic admission limits documented in the migration. The reviewer withdrew the duplication suggestion after checking the intentional boundary: `dispatchModel` owns shared timeout/cancellation/usage reconciliation; callers own their distinct durable checkpoints, repair and abstention states. Final independent report: **no remaining actionable Standards findings**.

## Spec

Initial review found three defects: refresh invalidation stayed report-local, deduplication discarded the tracked thesis when it overlapped the morning queue, and no dated market delta was displayed. Fixed by retaining tracked and morning assessment identities separately, atomically publishing tracked invalidation/version/history (including model disagreement or failure), retaining original thesis reasoning and checkpoint, supporting the next daily version chain, and storing/rendering the dated raw-price fractional comparison with its corporate-action limitation. Regression coverage exercises a different morning thesis, issuer-text invalidation, original immutable history, the following scheduled check and stale-price rendering. Final independent report: **no remaining substantive Spec findings**; strict typecheck passes.

Final totals: Standards 0 open; Spec 0 open. Operational/live-data gates remain documented in `docs/refresh.md` and earlier runbooks.

Validation: 104 tests / 28 files passed; strict typecheck, local D1 migration, dry-run bundle and populated encrypted restore passed.
