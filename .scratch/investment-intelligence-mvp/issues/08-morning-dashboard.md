# 08 — Deliver the scheduled morning review in the private dashboard

Status: resolved
Type: task
Blocked by: 07

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Compose market snapshots, screening and research into an automatic report ready by 08:00 Europe/Zagreb on US trading days. Build the private report view: up to three main candidates, compact early watch, thesis/evidence details, freshness and run status. Include tracking selection controls using the lifecycle boundary to be completed in 09. Do not require a chat interface.

Persist frozen selections, rule versions, cutoffs and screener/AI cohorts before the decision deadline from 02, so evaluation inputs exist from the first usable run. Late runs must not acquire an earlier cutoff retroactively. Expose retries/partial runs honestly and show whether a report is from the current trading day. Include lightweight usefulness/review-effort feedback.

Acceptance: empty results are valid; repeated jobs do not publish contradictory duplicates; exchange holidays and timezone transitions follow the contract; stale data is labeled; private access holds. A real or permitted representative end-to-end run demonstrates screening through cited report publication. The UI supports the 10–15 minute review goal. Exact deployment readiness follows 03.

### Refined implementation contract — issue 03

Compose capture → baseline → research → atomic report/cohort publication through the [architecture coordinator](../architecture.md). Five-minute UTC ticks derive local due times: begin 06:30 Zagreb, research closes 07:50, target publication 07:55, deadline 08:00. Stage failures checkpoint; missing current report is independently visible on a browser visit. Use the US session calendar, not European weekdays.

- Publish committed assessment references, up to three main candidates, five early-watch entries, baseline, exact U_D manifest, research dispositions and cohort freeze atomically. Capture evaluation inputs before enabling routine reports, including 05's scheduled opening/action/endpoint collection. Cohort qualification starts timing-unverified. Use the architecture’s postcommit strong-readback receipt protocol: only actual observed report availability by 08:00 qualifies; ambiguous/lost completion recovered after the deadline remains research-only. Receipt certifies already readable immutable artifacts and never rewrites membership.
- Display empty/partial/unavailable/late, expected session, acquisition/feed/delay/expiry, retained previous dated report, evidence gaps, budgets and failures. Show new/repeat/promoted and traceable facts versus interpretations. No stale report becomes current.
- Capture optional minutes/usefulness/understanding/effort/decision note and explicit no-response; display response denominators independently of outcomes. Tracking controls remain hidden/disabled with an explanation until 09, rather than writing incomplete lifecycle state.
- Exercise a representative end-to-end report, holiday/DST mismatch, delayed publication, interrupted transaction and replay. Verify route privacy and reviewer navigation through citations in the 10–15 minute workflow. Document real-host and morning-observation gates still open; no synthetic run proves uptime.

Proposed seams: report publication and private dashboard HTTP plus existing coordinator. Catch atomic cohorts, clock semantics and feedback; miss investment results and unobserved uptime. Confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-03: Implementation requested via `$implement issue 8`; dependency 07 is resolved for local work. Baseline: `3c4ce7562fbcd835c084b53b11c49beb0419eace`. Awaiting confirmation of the proposed publication, private HTTP and coordinator test seams and review baseline. Production observation/deployment gates remain open.

2026-11-03: User replied “agreed”, confirming the report-publication, private-dashboard HTTP and existing-coordinator TDD seams and baseline `3c4ce7562fbcd835c084b53b11c49beb0419eace`.

## Answer

Local morning-review implementation delivered on 2026-11-03 at the confirmed report-publication, private-dashboard HTTP and coordinator seams. [Runbook](../../../docs/morning-review.md), [independent Standards/Spec review](../morning-review.md).

- Existing capture → screening → bounded research → evaluation planning now publishes an immutable morning report and matching AI/baseline cohorts atomically. Saved U_D/input IDs remain referenced through the frozen market snapshot and exact screening input hash. Main assessment versions, all dispositions, up to five early-watch entries, novelty and dated symbol/broker identities are frozen with the report. No quota filling or backfill; missing research preserves the baseline. Opening-reference collection must be planned for the full eligible universe before publication; existing endpoint/action collection continues independently.
- Postcommit primary-first sequential readback verifies report/cohort hashes and membership, saved universe and immutable assessment versions before sampling the actual observation clock. Only a matching receipt observed by 08:00 qualifies timing. Missing receipt is unverified; ambiguous completion recovered after the deadline stays late/research-only. Replay cannot revise membership or invent earlier availability. Report/cohort interruption rolls back atomically.
- Five-minute ticks derive Zagreb times and US sessions from the saved calendar; known holidays skip morning creation. Acquisition closes at 07:45, research at 07:50, publication targets 07:55 and deadline is 08:00. Overdue ticks record missing current reports; browser status independently detects overdue, pending, closed and unknown-calendar states. Stage failures preserve checkpoints and use bounded retries; frozen qualification resumes idempotently. Seed and collection jobs do not become morning reports.
- The private dashboard renders current/previous dated reports, partial/empty/unavailable/late states, feed/acquisition/market timestamps and expiry, budgets, failures and retries. Main and compact early-watch cards distinguish cited facts, interpretations and unknowns, conditional thesis, invalidation and source origins. Repeat cards link prior immutable assessments and identify changed content; first main appearance after early watch is labeled promoted/new. Account availability is explicitly unverified; current entry remains unresolved with historical/delayed prices. Tracking is disabled with an issue-09 explanation.
- Optional CSRF-protected HTML/JSON feedback captures minutes/usefulness/understanding/effort/decision note, explicit no-response and missing responses separately. Append-only idempotent submissions retain history; latest responses determine monthly counts, timed/usefulness denominators, median minutes and within-15-minute proportions independently of outcomes.

### Evidence

Full suite: **84 tests / 20 files (176.61 seconds)**. Review fixes additionally pass all **7 morning tests / 3 files**. Strict typecheck, local D1 migrations, dry-run Worker bundle and disposable encrypted backup/restore pass. Representative synthetic source/model fixtures demonstrate screening through cited immutable assessment/report publication and private reviewer navigation. Tests cover missing research, baseline survival, interrupted transaction rollback, replay, post-deadline readback recovery, holidays/autumn DST mismatch, expired reports, forms, no-response and route privacy. Both initial Standards suggestions and both Spec findings were fixed and independently confirmed resolved.

### Remaining operational gates

Jobs, market capture and research remain disabled by default. No deployment, provisioning, billed model call or provider outreach occurred. Combined full-universe hosted CPU/heap/query/network throughput and finish-by-07:50 remain unmeasured; so do actual Access/account/model readiness, independent production backups/key custody and costs. Three real observed pre-08:00 mornings and prospective human review-time/usefulness records remain required. Synthetic navigation cannot prove a 10–15-minute human review or uptime. Existing operations/market/research readiness gates remain in force; no investment edge is claimed. Issue 09 now owns tracking lifecycle work.
