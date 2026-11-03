# 05 — Capture broker-eligible market snapshots and calendars

Status: resolved
Type: task
Blocked by: 04

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the verified market-data and broker-universe path from 01 using rules from 02. Persist versioned daily eligible universes and timestamped observations, instrument mappings and exclusions. Include US trading dates and the Europe/Zagreb report schedule contract.

Acceptance: reruns do not duplicate snapshots; missing/stale/partial data is visible; unsupported instruments are excluded with reasons; identifiers and corporate actions follow the contract; rate/request limits are respected; historical snapshots are not overwritten by today's universe. Preserve required opening/reference and future evaluation data from the first operational run. Check provider mapping, partial-data recovery and calendar edge cases.

### Observed morning freshness — carried from issue 01

On 2026-11-03 the user explicitly agreed to close feasibility research with morning punctuality unverified and carry the actual pre-08:00 check here. Before claiming report readiness, run the full eligible-universe acquisition **before 08:00 Europe/Zagreb** over several sessions, recording start/completion/retrieval times, expected previous completed exchange session, per-symbol coverage/missing reasons, explicit SIP feed, action/adjustment version, retries and pagination. Include or separately exercise DST mismatch, holidays and early closes. A session-date bar timestamp does not prove publication time. Assert visible partial/stale/unavailable reporting when the expected session is absent; never backdate observations. See [practical feasibility evidence](../coverage-check.md).

### Refined implementation contract — issue 03

Implement the market-capture boundary in [architecture](../architecture.md) using [screen-eval-v1](../screening-evaluation-contract.md) and the complete [identity audit](../coverage-check.md), not a suffix-derived subset. Keep source, as-of symbol, feed, raw/split basis, acquisition and event times, mapping/action versions and coverage reasons. Refresh catalogues per report, quarantine ambiguity and preserve removed identities.

- Persist normalized immutable observations and manifests, avoiding duplicated 90-session windows. Acquire the 90-session seed with pagination/checkpoints; implement the 61-session qualification input, without future corrections rewriting past inputs. Respect individual provider buckets and architecture request/byte/deadline limits.
- From the first operational report, collect primary-venue Q official opening auctions for every saved U_D after open+45 minutes ET, through the next exchange-report deadline. No daily/minute/open-price proxy. Keep conflicts, absent venues/references and duplicate provenance explicit.
- Collect raw closes/actions for historical U_D members through H30 even after removal from today's broker catalogue; resolve renames/successors with dated evidence. Unknown consideration/OTC/terminal outcomes remain gaps. Capture initial calculation inputs by the next report deadline and append later revisions.
- Use the exchange calendar and both IANA zones; distinguish expected previous session from merely latest returned data. Demonstrate bounded recovery from pagination failure, 429, stale expected-session data, split changes and ambiguous identity. Measure memory, SQL batching and elapsed/CPU work on the full audit-scale universe.
- For actual morning readiness, observe at least three US report sessions before 08:00 Zagreb with start/completion/coverage evidence. Exercise DST mismatch, holiday and early-close fixtures separately where no live boundary occurs. Three observations demonstrate operation, not an SLA. If access/time prevents observation, record the open gate and do not claim punctual readiness.

Proposed seam: market capture from provider responses to persisted snapshot/reference/coverage manifests. Catches data and calendar contracts; misses future provider uptime. Confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-03: Implementation requested explicitly via `$implement issue 5`. Dependency 04 is resolved for local work; its deployment gates remain in force. Baseline for implementation/review: `dd239074bd3ef8a9531e14ee7cd1109c76026991`. Proposed market-capture test seam submitted for user confirmation under the TDD skill before new tests.


## Answer

Local market-capture implementation delivered on 2026-11-03. **Live morning readiness remains unverified; no deployment or paid provisioning occurred.** [Capture runbook](../../../docs/market-capture.md), [independent review and resolutions](../market-capture-review.md).

- User confirmed the proposed provider-response → persisted snapshot/reference/coverage seam under TDD. Red→green tests cover immutable dated universes, nonstandard broker tickers, structural exclusions/ambiguity, exact 61-session raw/split qualification, stale expected sessions, pagination/429 recovery, decimal provenance, DST/holiday/early-close scheduling, primary-venue Q auctions, split revisions, removed members, outage recovery and successor obligations. Provider HTTP fixtures exercise the actual command runtime through persisted manifests.
- Complete broker/provider catalogues and listed/unlisted ISIN mapping evidence are saved in bounded pages. Reconciled identity/action evidence is dated and append-only; unresolved issuer/type/listing identities remain quarantined. No suffix subset or automatic acceptance of the old audit was introduced. Explicit SIP/as-of/basis/source, mapping/action versions and real acquisition times survive replay. Raw/split values normalize once; snapshots and collection receipts reference them.
- Durable fenced capture stages, idempotent page checkpoints, per-provider persisted buckets, counted reservations, bounded transport/freshness retries and failed-batch partitioning respect configured limits. Missing successful responses recheck only missing symbols before the deadline. Initial seeds can checkpoint across days instead of raising request ceilings or reducing coverage.
- Saved U_D members receive after-open official-auction collection and raw-close/action obligations through H30, surviving broker removal. Missing contiguous sessions recover after outages with original per-session deadlines; late inputs remain revisions. Dated rename reviews preserve stable IDs; sourced successor links collect distinct successor IDs and merge inherited holding windows even when the successor already belonged to an older universe. Unknown action consideration, successors, venues or terminal outcomes remain gaps. Future outcome arithmetic stays with 11.
- Private snapshot/progress API and CSRF-protected command enqueue use the existing Access boundary. Market scheduling is opt-in behind `MARKET_ENABLED=false` by default, and remains research-only. Both IANA zones and an exchange calendar determine previous session, report deadline, opening window and next-report cutoff.

### Verification

Strict typecheck, final **35-test / 6-file full suite**, local migrations 0002–0003, Worker dry-run bundle and encrypted disposable restore all passed. Restore compares every table's row totals/hash, integrity and foreign keys, including actual market observations/receipts, pending pagination/retries, identity/successor evidence and references; tampered ciphertext is rejected. No remote database was touched.

The full audit-scale market harness retained **5,078 securities × 90 sessions × two bases = 914,040 observations**, in **1,829 pages**, and qualified all 5,078 through **102 bounded stages**. Final run: approximately **123.8 seconds** including evaluation planning; maximum measured capture/qualification stage **157 ms**, maximum normalized page **154,001 bytes**, whole-universe evaluation planning **4,845 ms** with 51 auction batches. The unchanged foundation harness also retained its 457,020 inputs. Initial scale checks exposed unindexed full-history scans; indexed batch/security/kind lookups fixed them without shrinking the universe.

The final complete local test process tree measured **128.372 s wall**, **130.624 s user CPU**, **32.175 s system CPU**, and **702,624 KiB peak resident memory**. These include test/framework/native SQLite work across the full suite. They are **not** Worker JS heap measurements, billed per-invocation CPU, remote D1 throughput, provider timing, or proof of the 128 MiB production heap limit. Real hosted combined-workload measurements remain an operational gate.

Review reported three Spec correctness findings (freshness recovery, intermediate-session recovery and existing-successor window extension) and one Standards judgment call (parallel collection-state maps). All were fixed, regression-tested and confirmed resolved independently.

### Open operational gates

The required **three observed US report sessions before 08:00 Europe/Zagreb have not occurred**. Do not claim punctual delivery from fixtures, a session-date timestamp, or this local benchmark. Record actual starts/completions/retrievals, expected sessions, full-symbol coverage/reasons, SIP/basis/action versions, retries and pagination when operational access/time permits. DST mismatch, holidays and early closes have fixture coverage only.

Current real issuer/listing/action reconciliation, provider quotas/access, full hosted CPU/heap/query/deadline behavior and the foundation's deployment/billing/private-access/independent-backup/key-custody gates remain unverified. The runbook documents configuration, bounded recovery, request/storage monitoring and explicit partial/unavailable behavior. No provider credentials were accessed for live acquisition, and no values were backdated. Local implementation acceptance is separate from those live gates, as this ticket permits.
