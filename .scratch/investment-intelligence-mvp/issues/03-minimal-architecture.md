# 03 — Choose a minimal hosted architecture and refine implementation tickets

Status: needs-triage
Type: research
Blocked by: 01, 02

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

What is the smallest maintainable hosted design that meets the verified contracts and budget?

Compare a TypeScript application plus database and scheduled worker/job with managed alternatives. Evaluate deployment, private access, job execution limits, source fetch/search tools, model choice, operational cost and recovery. Explain whether MCP adds value; AgentCore is optional. Do not assume vector search, microservices, SQS, S3 or AWS are necessary. Distinguish bounded adaptive research/tool use from deterministic screening and state management.

Specify boundaries for storage, jobs, report publication and frontend/API. Design bounded source requests, model/tool/token/spend limits, retries, overlapping/manual runs, idempotency, cutoff timestamps, immutable assessments, and retained evidence permitted by providers. Treat fetched content as untrusted data: prevent instruction following from sources, arbitrary URL/internal-network fetching, secret exposure and unauthorized tools. No trading permissions; broker access is read-only if needed.

Provide failure behavior, access/secrets controls, lightweight observability, backups and an estimated total monthly cost including a reserve. Record an ADR only for a real, consequential architecture trade-off, using the domain-modeling format. Refine downstream task acceptance criteria into implementation-ready tickets and mark their triage states appropriately. No provisioning or code. Do not represent proposed choices as user-approved decisions. The next /implement invocation provides implementation authorization for its selected feature.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.
