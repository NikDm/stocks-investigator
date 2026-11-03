# Issue 04 code review

Fixed point: `249ecf4a1ee1a07057dee28d9f96c4a9a2150021`. Reviewed implementation commit: `0717b5b`, using `git diff 249ecf4...HEAD`. Standards and Spec ran in independent fresh-context agents under the code-review skill. Follow-up reviewed the working-tree fixes before final commit.

## Standards

Documented standards: no clear violations. The single-context domain layout is preserved, the relevant ADR is not contradicted, and `Status: claimed` follows the execution workflow expressly documented in `docs/agents/issue-tracker.md`. Deployment limitations are explicit.

Baseline judgment call:

- **Duplicated Code — `src/coordinator.ts`:** Both stage execution and publication separately fetch attempts, enforce the three-attempt cap, fail the run, and increment attempts. A shared operation would keep retry policy consistent as these paths evolve. Optional refactor, not a documented-standard violation.

Concrete correctness finding:

- **P2 — Reload the checkpoint after acquiring ownership:** `next()` reads the run before `claim()`, but execution subsequently starts from that original `run.cursor`. Another invocation can acquire the lease, commit pages, and release it between those calls. The delayed invocation then successfully acquires a new generation but starts at its stale cursor. The synthetic executor changes `acquiredAt`, so replaying an already committed page produces a different hash, aborts `stage()`, and charges a failed attempt instead of continuing from the durable checkpoint. Reload the run after successful acquisition, or return its current checkpoint atomically from `claim()`.

Follow-up: both findings resolved. `drain()` reloads after ownership; atomic `beginAttempt()` now centralizes cap/failure handling. Reviewer confirmed no new standards concerns. The lease/concurrency tests cover the shared boundary; the precise stale-read interleaving was verified by code review, not by a dedicated race regression.

## Spec

- **P2 — Retry policy cannot distinguish permanent failures or honor Retry-After.** Requirement: “Never retry auth/permission/schema failures blindly” and use “bounded exponential backoff with jitter and Retry-After.” The coordinator catches every executor failure identically; persistence requeues every failure until three attempts and computes its own delay without server retry guidance. An authentication or schema error therefore repeats automatically, and a rate-limited request can resume earlier than the provider permits. The coordinator needs typed terminal/retryable outcomes and a persisted retry-not-before value before provider executors can safely use this contract.

Follow-up: resolved. Permission/schema failures terminate immediately; transient failures persist the later of backoff and the supplied retry-not-before timestamp. A new coordinator regression verifies terminal permission failure after one attempt and a one-hour retry delay. The Spec reviewer confirmed the fix and no further findings.

Initial findings: Standards 2 (worst P2 correctness; one optional duplication heuristic), Spec 1 (P2 retry contract). All addressed; remaining findings: Standards 0, Spec 0. Live-deployment gates remain explicitly unverified and are not claimed complete.
