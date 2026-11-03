# 04 — Create the private hosted application foundation

Status: needs-triage
Type: task
Blocked by: 03

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the architecture selected in 03: minimum application shell, persistence/migrations, private single-user access, configuration/secrets handling, a job entry point and health/run status. Provide reproducible local setup and deployment instructions. Do not introduce unused infrastructure.

Acceptance: unauthorized requests cannot access reports or trigger jobs; secrets remain server-side; migrations and startup work; scheduled/manual jobs share the selected contract; required logs omit secrets. Include meaningful checks of access boundaries and persistence. Paid provisioning is not implied by this ticket. Refine exact framework, host and deployment checks after 03.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
