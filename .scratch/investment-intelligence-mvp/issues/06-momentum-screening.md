# 06 — Implement deterministic momentum screening and baseline snapshots

Status: needs-triage
Type: task
Blocked by: 05

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the versioned eligibility, sustained-momentum scoring, ranking and tie-break rules from 02. Persist the screener-only baseline before LLM work, the bounded research pool, exclusions and measured signals with as-of times. Define early-watch market confirmation using the same contract.

Acceptance: identical inputs and rule versions yield identical results; sparse history, splits and invalid data follow the contract; research cannot modify the saved baseline; inputs and cutoff are inspectable. Use worked examples from 02 to verify calculations and ranking. No LLM makes numeric calculations or broker-eligibility decisions.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
