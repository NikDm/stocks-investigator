# 13 — Optionally record actual purchases separately from opportunity selection

Status: needs-triage
Type: task
Blocked by: 09

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Add optional manual purchase records with entry date and price, linked to an opportunity where applicable. Keep ownership and tracking separate. Record quantity only if an agreed minimal scope needs it; portfolio sizing, allocation analysis, broker synchronization and order placement are excluded.

Acceptance: selecting a candidate never creates a purchase; entering/removing a purchase never changes the frozen research baseline or hypothetical outcomes; actual entry data is clearly distinguished from reference prices. Refine edit/correction history and minimal fields before implementation. This convenience ticket does not block any core research/evaluation milestone.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
