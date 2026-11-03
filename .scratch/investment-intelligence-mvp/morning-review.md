# Issue 08 independent review

Baseline: `3c4ce7562fbcd835c084b53b11c49beb0419eace`. Implementation commit: `2e8807f`; follow-up fixes reviewed in the working tree. Standards and Spec were reviewed independently by fresh agents under the code-review skill.

## Standards

No documented-standard breaches or contradictions with ADR 0001 found.

Two judgment-based maintainability suggestions:

- **Primitive Obsession**: `due.state.startsWith('Overdue')` coupled scheduled correctness to dashboard wording. Resolved by an explicit `overdue` boolean; display copy no longer controls recording.
- **Duplicated Code**: external URL protocol validation/escaping appeared in two renderers. Resolved with a shared `sourceHref` helper.

The Standards reviewer independently confirmed both resolutions and found no new documented-standard/ADR issue. Its additional regex-escaping concern came from escaped tool output: direct character inspection confirmed the original regex spelling, and typecheck plus route tests pass.

## Spec

Two P2 usability findings:

- **Account availability disclosure**: the contract says “Show account availability as unverified unless account-specific evidence exists.” Resolved with an explicit report disclosure requiring investor confirmation in Trading 212; catalogue presence is not presented as account eligibility.
- **Opaque candidate identifiers**: the issue requires “The UI supports the 10–15 minute review goal.” Stable IDs alone required opening the raw snapshot to identify a stock. Publication now freezes the dated provider symbol, broker ticker, venue and identity date from immutable eligible decisions for main/watch members. Main and early-watch headings display the symbol and broker ticker, with stable identity preserved separately.

The Spec reviewer independently confirmed both fixes and found no new spec issue. HTTP regression assertions failed before the fix and pass afterward. No confirmed atomicity, availability-certification, scheduling/recovery, feedback or scope-creep defect remained. A primary-first sequential session observes the report transaction's bookmark before verifying its same-transaction cohorts and previously committed immutable references.

Initial findings: Standards 2 heuristics, Spec 2 P2 issues. Final unresolved: Standards 0, Spec 0.

## Verification

Full local suite: **84 tests / 20 files**, **176.61 seconds**. Focused review-fix rerun: **7 tests / 3 morning files**. Strict typecheck, local D1 migrations, Worker dry-run bundle and encrypted backup/restore pass. Restore preserves morning reports, cohorts, receipts, overdue events and explicit no-response feedback and rejects tampered ciphertext. No remote service or paid resource was modified.

The environment left the new commit and twelve tree objects as zero-byte files after resume. They were reconstructed from the unchanged staged index/content and recorded commit metadata, checking exact original object hashes before writing; `git fsck --no-reflogs` then passed (pre-existing dangling blobs are harmless). No branch history was rewritten.
