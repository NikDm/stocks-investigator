# 10 — Refresh an opportunity before the US opening on demand

Status: resolved
Type: task
Blocked by: 09

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Add an authorized manual re-review action and scope it according to 02/03. Fetch newly available evidence and permitted premarket observations within the existing budgets. Publish a new assessment version with an explicit comparison to the morning version, including changes in attractiveness and invalidation.

Show data timestamps/delay. Delayed, stale or missing prices leave current entry conditions unvalidated and direct the investor to check Trading 212 live. Preserve frozen evaluation cohorts and apply the separate-version/cohort contract to refreshes; never rewrite the morning record.

Acceptance: repeated requests cannot cause unbounded cost or overlapping publication; failures preserve the prior version with a visible failed refresh; changes are traceable; news arriving after the refresh cutoff is not backdated. Verify stale-price behavior, authorization and immutable history.

### Refined implementation contract — issue 03

Implement authorized queued refresh for morning three plus up to ten active tracked names, deduplicated, under [architecture](../architecture.md). No additional eligible universe, market reranking, replacement candidates or trading tools. Reuse morning metrics/baseline; new evidence and delayed premarket observations have their own acquisition/cutoff times.

Enforce one active refresh, at most two accepted runs per session, ten-minute cooldown and shared daily/monthly budget reservations across manual/scheduled work. HTTP returns a durable run ID and next-five-minute-tick delay. Disable requests that cannot fit before cutoff; only completion strictly before scheduled open-minus-five-minutes freezes a separate matched refresh AI/baseline cohort. Late/incomplete work is research-only. Morning artifacts remain unchanged.

Show comparison, evidence/market changes, failed refresh status, explicit delayed/current-entry-unvalidated warning and instruction to check Trading 212 live. Missing prices never imply unchanged conditions. Verify duplicate requests, overlap, unknown billed calls, cutoff equality, post-cutoff news and stale prices through proposed refresh-command/publication seams; confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.


## Answer

Implemented local authorized queued pre-opening refresh through the user-approved refresh-command/publication seams. Private JSON and CSRF-protected form commands return a durable run ID/next-tick delay, deduplicate concurrent requests, retain command aliases, enforce one active refresh, two accepted runs/session and ten-minute cooldown, and disable requests without enough bounded ticks before cutoff. The frozen deduplicated morning-three/active-tracking scope reuses morning metrics, universe and baseline; no reranking, replacement candidates or trading tools were added.

Checkpointed evidence/issuer/model work and delayed SIP minute observations share scheduled-work budget reservations and the fenced coordinator. Unknown billed calls retain charges and abstain. Publication atomically appends immutable assessment/comparison records, matched cohort manifests and tracked lifecycle updates, then certifies actual primary-readback availability. Only complete results observed strictly before open-minus-five-minutes expose separate evaluated refresh cohorts; equality, late recovery, incomplete work and missing receipts are research-only. Morning artifacts stay unchanged; post-cutoff evidence cannot be backdated. Tracking overlap retains its recorded thesis independently of the morning assessment. Confirmed recorded invalidation immediately persists, without renewing tracking or rewriting the original thesis/history, and the following scheduled check can continue the version chain.

Private views show evidence/attractiveness/invalidation changes, new/prior/morning version links, failed-refresh status, dated raw morning-close versus premarket fractional comparison, observation acquisition/event times, minimum delay and minute volume. Raw comparisons explicitly leave intervening corporate actions unverified. Stale/missing/delayed prices always leave current entry unvalidated and direct the investor to check Trading 212 live.

Validation: **104 tests / 28 files passed**, including eight refresh integration tests; strict typecheck, local migration, dry-run Worker bundle, diff whitespace check and encrypted restore passed. The recovery fixture now includes populated refresh requests, command aliases, pending work, reports, versions, cohorts and receipts. [Independent Standards/Spec review](../refresh-review.md) found three Spec defects and two Standards heuristics; fixes were independently re-reviewed with zero remaining actionable findings. [Runbook](../../../docs/refresh.md) documents commands, conservative time reservations and evaluation-read requirements.

Limitations: hosted combined CPU/heap/query/network throughput and real provider/model delivery/quality remain unmeasured; source registration remains SEC-only and opaque invalidation conditions still need manual interpretation. Existing provider retention/account, cost, private hosting, independent backup/key custody and observed morning-readiness gates remain open. Jobs remain disabled by default. No paid call, deployment, provisioning, provider outreach or trade occurred.
