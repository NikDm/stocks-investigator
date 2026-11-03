# 05 — Capture broker-eligible market snapshots and calendars

Status: claimed
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
