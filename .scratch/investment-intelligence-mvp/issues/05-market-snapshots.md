# 05 — Capture broker-eligible market snapshots and calendars

Status: needs-triage
Type: task
Blocked by: 04

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the verified market-data and broker-universe path from 01 using rules from 02. Persist versioned daily eligible universes and timestamped observations, instrument mappings and exclusions. Include US trading dates and the Europe/Zagreb report schedule contract.

Acceptance: reruns do not duplicate snapshots; missing/stale/partial data is visible; unsupported instruments are excluded with reasons; identifiers and corporate actions follow the contract; rate/request limits are respected; historical snapshots are not overwritten by today's universe. Preserve required opening/reference and future evaluation data from the first operational run. Check provider mapping, partial-data recovery and calendar edge cases.

### Observed morning freshness — carried from issue 01

On 2026-11-03 the user explicitly agreed to close feasibility research with morning punctuality unverified and carry the actual pre-08:00 check here. Before claiming report readiness, run the full eligible-universe acquisition **before 08:00 Europe/Zagreb** over several sessions, recording start/completion/retrieval times, expected previous completed exchange session, per-symbol coverage/missing reasons, explicit SIP feed, action/adjustment version, retries and pagination. Include or separately exercise DST mismatch, holidays and early closes. A session-date bar timestamp does not prove publication time. Assert visible partial/stale/unavailable reporting when the expected session is absent; never backdate observations. See [practical feasibility evidence](../coverage-check.md).

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
