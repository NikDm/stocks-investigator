# Investment intelligence MVP plan

## Notes

- **Current handoff (2026-11-04):** [Issue 01](issues/01-data-feasibility.md#current-completion--2026-11-03) is resolved as research. All 5,078 US-schedule STOCK inputs have identity/coverage audit records; gaps and provider limitations remain explicit. The user chose to carry observed pre-08:00 delivery verification into [05](issues/05-market-snapshots.md#observed-morning-freshness--carried-from-issue-01). [Issue 02](issues/02-screening-and-evaluation-contract.md#answer) is resolved with a versioned domain contract; 03 is resolved as architecture research: [design](architecture.md), [source comparison](architecture-sources.md), and [proposed ADR](../../docs/adr/0001-managed-sql-and-checkpointed-jobs.md). 04 is resolved as a local synthetic foundation with explicit unverified production gates ([answer](issues/04-hosted-foundation.md#answer)); 05 is resolved as local market capture with live readiness gates still open ([answer](issues/05-market-snapshots.md#answer)); 06 is resolved as local deterministic screening ([answer](issues/06-momentum-screening.md#answer)); 07 is resolved as local bounded research ([answer](issues/07-bounded-evidence-research.md#answer)); 08 is resolved as local morning publication/dashboard ([answer](issues/08-morning-dashboard.md#answer)); 09 is resolved as local tracking; 10 is resolved as local queued pre-opening refresh; 11 is resolved as local prospective evaluation; 12 is resolved as local not-surfaced review; 13 is resolved as local optional purchase recording. Nothing has been provisioned.
- User chose Alpaca for private personal noncommercial research. Agreement interpretation is a documented limitation, not a repeated provider-clarification gate. No outreach, paid subscriptions or provisioning authorized.
- Use the supplied implement skill for the selected issue. Research tickets authorize investigation, not application adapters. Ticket 03 refines dependent implementation tickets before marking them ready-for-agent.
- Read [spec](spec.md), [discovery](../../docs/discovery.md) and [glossary](../../CONTEXT.md). Use `claimed` / `resolved` for active execution/completion and the documented triage strings for planned work.
- Work is milestone-based, without estimates or a weekly time commitment. The local Worker/D1 foundation exists after 04; no paid resources have been created.
- Current work is on the source workspace’s `main` branch; its Git metadata is now populated. The earlier `/tmp/stocks-investigator-integration` checkout is historical, not the current commit destination. No changes pushed.

## Milestones

1. Feasibility and design: 01–03.
2. First usable morning discovery loop: 04–08, including evaluation input capture from its first operational run.
3. Tracking and manual re-review: 09–10.
4. Prospective evaluation and not-surfaced review: 11–12. Ticket 11 can proceed after 08 independently of tracking work; outcomes mature over time.
5. Optional purchase recording: 13, after 09.

## Tickets

| ID | Feature | Type | Blocked by | Triage |
| --- | --- | --- | --- | --- |
| 01 | [Verify affordable market data and public research access](issues/01-data-feasibility.md) | research | — | resolved |
| 02 | [Define reproducible screening and evaluation rules](issues/02-screening-and-evaluation-contract.md) | research | 01 | resolved |
| 03 | [Choose a minimal hosted architecture and refine implementation tickets](issues/03-minimal-architecture.md) | research | 01, 02 | resolved |
| 04 | [Create the private hosted application foundation](issues/04-hosted-foundation.md) | task | 03 | resolved |
| 05 | [Capture broker-eligible market snapshots and calendars](issues/05-market-snapshots.md) | task | 04 | resolved |
| 06 | [Implement deterministic momentum screening and baseline snapshots](issues/06-momentum-screening.md) | task | 05 | resolved |
| 07 | [Research candidates and publish immutable evidence-backed assessments](issues/07-bounded-evidence-research.md) | task | 06 | resolved |
| 08 | [Deliver the scheduled morning review in the private dashboard](issues/08-morning-dashboard.md) | task | 07 | resolved |
| 09 | [Track selected opportunities and publish material changes](issues/09-opportunity-tracking.md) | task | 08 | resolved |
| 10 | [Refresh an opportunity before the US opening on demand](issues/10-manual-prereview.md) | task | 09 | resolved |
| 11 | [Calculate fixed-horizon outcomes and compare with the screener](issues/11-prospective-evaluation.md) | task | 08 | resolved |
| 12 | [Show prospective strong performers not surfaced by discovery](issues/12-not-surfaced-review.md) | task | 11 | resolved |
| 13 | [Optionally record actual purchases separately from opportunity selection](issues/13-purchase-recording.md) | task | 09 | resolved |

## Decisions-so-far

- Issue 13 is resolved locally: optional actual purchase records, append-only corrections/removal, authenticated commands and private forms, separate from tracking/frozen research/hypothetical outcomes. [Answer](issues/13-purchase-recording.md#answer), [runbook](../../docs/purchases.md), [review](purchase-review.md). Final 127 tests / 37 files, typecheck, Worker dry run and encrypted backup/restore pass. No deployment occurred.

- [Issue 12 local not-surfaced review completed, 2026-11-04](issues/12-not-surfaced-review.md#answer): saved-universe top-ten H20 ranking with stable identity ties, H10/H30 coverage, unresolved reasons, daily-close downside, overlapping historical discovery flags and cutoff-checked immutable evidence references. Separate refresh provenance and exclusions/history ledger preserve the original denominator and do not infer detectability. **123 tests / 36 files**, strict typecheck and Worker dry-run build pass; the 5,078-member harness verifies final-page leaders, removed broker members, ties and missing outcomes. [Independent review](not-surfaced-review.md): zero outstanding Standards/Spec findings. [Runbook](../../docs/not-surfaced-review.md) retains hosted capacity, live completeness, hindsight and existing operational limitations. Nothing deployed or provisioned; jobs remain disabled.

- [Issue 11 local prospective evaluation completed, 2026-11-03](issues/11-prospective-evaluation.md#answer): all frozen-universe members retain H10/H20/H30 outcomes with separate acquisition cutoffs, decimal action-aware raw-price wealth, costs/sensitivity and complete/partial daily-close downside. Explicit corrections append immutable provenance-linked revisions; auction identity, source reversions and corrected action dates preserve history and comparison parity. Private morning/refresh comparisons report coverage/reasons, resolved-only statistics, overlap/paired coverage, abstention and separate feedback denominators. Indexed partitions preserve all 5,078 members. **119 tests / 33 files**, strict typecheck, local migrations, Worker bundle and populated encrypted restore pass. [Independent review](outcome-review.md): zero remaining Standards/Spec findings. [Runbook](../../docs/outcomes.md) preserves operator reconciliation, unavailable terminal facts, unmeasured hosted throughput and existing deployment/budget/morning gates. Jobs remain disabled; nothing was deployed or provisioned. Issue 12 is unblocked for readiness review.

- [Issue 10 local manual pre-opening refresh completed, 2026-11-03](issues/10-manual-prereview.md#answer): private durable queued commands, concurrent deduplication, one-active/two-per-session/cooldown enforcement, conservative tick admission, shared budgets and unknown-call recovery. Separate immutable assessment/comparison versions and matched cohorts use strict primary-readback timing; late/incomplete work remains research-only and morning history stays frozen. Recorded tracked theses survive overlap, confirmed invalidation persists immediately, and daily tracking continues the new chain. Dated delayed/stale/missing premarket observations and raw-price comparisons always leave entry unvalidated. **104 tests / 28 files**, strict typecheck, local migration, bundle and populated encrypted restore pass. [Independent review](refresh-review.md) has zero remaining actionable findings. [Runbook](../../docs/refresh.md) preserves unmeasured hosted throughput, live model/data, cost and existing deployment/morning gates. Jobs remain disabled; nothing was deployed or provisioned.

- [Issue 09 local tracking completed, 2026-11-03](issues/09-opportunity-tracking.md#answer): identity/revision/idempotency commands, atomic ten-slot capacity, explicit archive, session-20 checkpoint and next-session manual renewal; invalidation/expiry remain separate from occupancy. Scheduled bounded material/no-change/incomplete checks share discovery evidence and the existing spend pool, append immutable assessment/history and appear in private report/lifecycle controls. H30 collection survives archival. All **96 tests / 27 files** pass, with strict typecheck, local migration, final bundle and encrypted restore verified. [Independent review](tracking-review.md) fixed 4 Spec findings and 2 Standards heuristics, independently confirmed resolved. [Runbook](../../docs/tracking.md) records SEC/event/predicate limitations and unmeasured combined hosted throughput, live quality, costs and morning/deployment gates. Issue 10 owns manual pre-opening re-review.


- [Issue 08 local morning review completed, 2026-11-03](issues/08-morning-dashboard.md#answer): atomic report/AI/baseline freeze referencing exact saved U_D, primary-first sequential readback receipts with conservative late recovery, exchange-calendar scheduling and overdue visibility, private dated/cited dashboard with frozen symbols and disabled tracking, optional review feedback with explicit no-response and independent denominators. Full **84 tests / 20 files**, typecheck, local migration, bundle and encrypted restore pass; all [independent review](morning-review.md) findings resolved. [Runbook](../../docs/morning-review.md) preserves live hosted capacity/private access/model/cost/backup gates, three observed pre-08:00 sessions and human review-time verification. Jobs remain disabled; no paid call or deployment. Issues 09 and 11 are unblocked for readiness review.

- [Issue 07 local bounded research completed, 2026-11-03](issues/07-bounded-evidence-research.md#answer): checkpointed typed source/model tools, shared durable request/token/spend reservations and unknown-call recovery, validated cited immutable assessments/corrections, supported/unexplained ordering without backfill, three-query/filings short-note early watch with durable expiry/promotion/contradiction history. All **77 tests / 17 files** pass, including the full 5,078-security / 914,040-observation harness with **13 model turns and 24 source fetches** from simulated providers; research stages satisfy 1,500 ms individual and 15,000 ms ten-stage guards. Typecheck, local D1 migrations, bundle and encrypted restore pass. [Review](research-review.md) findings are resolved. [Runbook](../../docs/research.md) keeps live account/model-quality evaluation, SEC-only retrieval coverage, combined hosted workload and existing morning-readiness gates explicit. Research/jobs remain disabled; no paid call or deployment occurred. Issue 08 is unblocked for readiness review.

- [Issue 06 local deterministic screening completed, 2026-11-03](issues/06-momentum-screening.md#answer): decimal/half-even momentum gates, whole-universe median, stable full ranks, issuer-distinct immutable baseline and identical top-three research queue, early-watch market confirmation, frozen input/sighting provenance, checkpointed metrics and atomic compact ranking. All 53 tests pass; full 5,078-security benchmark measured max screening stage 417 ms, final ranking 299 ms and ten slowest stages together 3,791 ms. Typecheck, bundle and encrypted restore pass. [Review](screening-review.md) findings are resolved. [Runbook](../../docs/screening.md) retains hosted CPU/heap/combined-workload validation and the existing live morning gates; no deployment or model work occurred.

- [Issue 05 local market capture completed, 2026-11-03](issues/05-market-snapshots.md#answer): immutable broker decisions/normalized raw and split observations, complete catalogue/FIGI evidence, explicit reconciliation/coverage gaps, exchange/IANA scheduling, bounded pagination/freshness/rate/budget recovery, official primary-venue Q references and saved-universe H30 collection with removed-member/outage/successor recovery. Final 35 tests pass, including all 914,040 audit-scale market observations and full-universe reference planning; typecheck, local migrations, bundle and encrypted restore pass. [Review](market-capture-review.md) findings resolved. [Runbook](../../docs/market-capture.md) retains real identity/action reconciliation, hosted capacity/deployment and three actual pre-08:00 sessions as open gates. Market jobs remain disabled by default; no live readiness or provisioning claimed.

- [Issue 04 local foundation completed, 2026-11-03](issues/04-hosted-foundation.md#answer): strict TypeScript Worker/Hono + D1 migrations, verified private JWT/CSRF access, durable fenced coordinator, atomic immutable publication and shared budget reservations. All 18 local tests pass, including 457,020 daily rows and full 5,078-member universe; local startup/Cron, migration, production dry-run and encrypted disposable restore passed. [Independent review](foundation-review.md) findings were fixed and verified. [Operations](../../docs/operations.md) records live account/domain/Access, quote/tax/FX/variable exposure, independent backup/key custody and hosted runtime gates; no deployed application or paid resources are claimed.

- [Issue 03 completed, 2026-11-03](issues/03-minimal-architecture.md#answer): [minimal architecture](architecture.md) recommends one TypeScript Worker + D1 + checkpointed five-minute Cron, single-identity Access and direct bounded Haiku 4.5 tools, against VPS/SQLite and managed app/Postgres alternatives. Immutable SQL publication, whole-universe outcome capture, concurrency/fencing, trust boundaries, shared spend limits and recovery are specified. [Proposed ADR](../../docs/adr/0001-managed-sql-and-checkpointed-jobs.md) records the trade-off without claiming investor approval. Planning total EUR 45/month includes domain, assumed tax/FX and contingency. 04–13 have concrete acceptance/seam proposals; only unblocked 04 is ready-for-agent. No software/deployment/model benchmark is claimed.

- [Issue 02 completed, 2026-11-03](issues/02-screening-and-evaluation-contract.md#answer): [screen-eval-v1](screening-evaluation-contract.md) defines eligibility, sustained-momentum ranking, three-candidate research/final cap, five-entry early watch, lifecycle/material changes, primary-venue official-open references, 09:25 ET normal freeze, separate refresh cohorts, hypothetical fixed-horizon/action/cost/downside arithmetic, coverage denominators and usefulness feedback. Defaults are prospective design choices; no application code or personal risk limits were introduced. 03 is unblocked but must refine dependent tickets.

- [Issue 01 completed, 2026-11-03](issues/01-data-feasibility.md#completed-research--2026-11-03): [full-universe evidence](coverage-check.md) and [current source/cost comparison](public-research-check.md) support the Alpaca Basic historical-SIP path at an illustrative EUR 32.50/month, including model/search/hosting/storage and tax/FX assumptions. The 5,858-suffix input count was not the universe; all 5,078 US-schedule STOCK records now have an exception-aware identity audit. No complete all-symbol, terminal-outcome or morning SLA is claimed. Massive Basic is an optional untested fallback. User moved observed morning punctuality to 05; 02 owns deterministic eligibility/evaluation rules and 03 owns actual model/architecture selection.

- Historical, superseded by the completed checks above: [Data feasibility investigation, 2026-11-01](data-feasibility.md): full-universe historical SIP is economically plausible; account access, permitted retention/non-display/LLM use, measured coverage and freshness remain unresolved. Ticket 01 is needs-info, not resolved; no provider or scope compromise is selected.

- [Agreed product scope](../../docs/discovery.md): market-first sustained-momentum research for long-only US-listed company shares available on Trading 212, with evidence-backed independent assessments and a few-week holding period.
- [Specification](spec.md): hosted private dashboard, 08:00 Europe/Zagreb report, optional manual pre-opening re-review, up to three main candidates and 10 tracked opportunities, no alerts or trading.
- [Evaluation](spec.md): immutable records, prospective screener comparison, 10/20/30-trading-day horizons with 20 primary, opening reference and interim downside. Research usefulness is distinct from investment edge.
- Total initial operating ceiling EUR 50/month. AgentCore remains optional; Alpaca is the user-chosen data path. Issue 03 proposes Workers/D1 and pinned Haiku 4.5, with actual account/runtime/quality validation in 04/07.
- No calendar commitment: the investor chooses tickets as time permits. No application code, paid resources or subscriptions were created during planning.
- [ADR 0001](../../docs/adr/0001-managed-sql-and-checkpointed-jobs.md) is proposed, recording managed SQL/checkpointed jobs versus VPS/managed alternatives; deployment approval is not implied.

## Fog

- Operational pre-08:00 freshness measurement: 05 (explicit user disposition); reconciliation of identity/type/history exceptions and terminal outcomes: 02/05. Current evidence, budget and remaining source-retention limitations: [01](coverage-check.md).
- Broker-account eligibility and symbol identity, including availability changes: 01–02.
- Screening thresholds and early-watch defaults are resolved in [v1](screening-evaluation-contract.md); predictive usefulness remains prospective and unproven.
- Lifecycle/material-change rules are resolved in v1 and interfaces/downstream tasks are refined by 03; implementation and public-seam confirmation await their tickets.
- Evaluation conventions are resolved in v1; auction/action coverage gaps and terminal outcomes remain explicit operational limitations for 05/11.
- Architecture and model/tool limits are specified by 03; live runtime/private access/backups and account-specific billing remain the explicit deployment gates recorded by 04, 07 implements local source-fetch enforcement; live model availability/quality and combined hosted research workload remain operational gates. Morning delivery remains unmeasured in 05; no deployment SLA or source-replay guarantee is claimed.
- Whether actual results demonstrate selection value: prospective evidence from 11–12, not a prerequisite claim.

## Comments

Historical planning and investigation notes below are superseded by the current handoff. Reopen a resolved product choice explicitly if feasibility requires changing it; ask the investor one focused question at a time. Routine reversible implementation choices need not restart product discovery.

### 2026-11-02 access verification

Trading 212 live metadata access verified: 17,237 instruments, including 5,858 STOCK entries with US ticker suffixes, and 17 exchanges. [Sanitized check](trading212-access-check.json). Final eligibility/mapping and other ticket 01 gates remain unresolved.

### 2026-11-02 Alpaca findings

[Alpaca investigation](alpaca-investigation.md) documents the free historical-SIP path, request math for 5,858 broker stocks, daily-bar semantics and account/terms/coverage gates. No paid subscription is justified by current evidence. Ticket 01 remains needs-info; actual account type and applicable agreements are the next input.

### 2026-11-03 Alpaca access verification

[Authenticated sample checks](alpaca-access-check.json) verified historical SIP daily bars, extended-session minute bars and paper calendar access with HTTP 200. [Limitations and remaining gates](alpaca-investigation.md#authenticated-access-check--2026-11-03). Ticket 01 remains unresolved.

### 2026-11-03 Nasdaq terms

[User-supplied agreement reviewed](alpaca-investigation.md#user-provided-nasdaq-agreement--reviewed-2026-11-03). Personal analysis supported; precise retention/cloud/LLM authorization remains dependent on applicable combined terms. Nasdaq PDF need not be supplied again.

### 2026-11-03 NYSE terms

[NYSE document reviewed](alpaca-investigation.md#user-provided-nyse-agreement--reviewed-2026-11-03); both user-supplied exchange forms are now checked. Remaining agreement review: applicable Alpaca terms/supplements. Neither exchange document establishes third-party LLM permission.

### 2026-11-03 combined agreement disposition

[Alpaca customer agreement reviewed](alpaca-investigation.md#user-provided-alpaca-customer-agreement--reviewed-2026-11-03). All three supplied forms checked; section 30 leaves reproduction permission unresolved. [Concrete provider question prepared](alpaca-permissions-question.md), not sent. No permission or provider selection inferred.
