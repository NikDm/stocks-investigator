# 03 — Choose a minimal hosted architecture and refine implementation tickets

Status: resolved
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

## Answer

Completed architecture research on 2026-11-03. The [design](../architecture.md) and [primary-source comparison](../architecture-sources.md) recommend one strict TypeScript Worker/Hono application, D1 and short checkpointed Cron stages, versus VPS/SQLite and managed app/Postgres alternatives. Private Access, SQL boundaries, jobs, immutable report/cohort publication, full-universe reference/action capture, hard shared source/model/spend limits, source trust controls, explicit failure states, observability and restore procedures are specified. Direct Haiku 4.5 tool use is proposed with a pinned model and pre-operation quality/account checks; MCP/AgentCore add no required MVP capability.

The consequential trade-off is recorded in [proposed ADR 0001](../../../docs/adr/0001-managed-sql-and-checkpointed-jobs.md), using the domain-modeling format. It is a recommendation, not an investor-approved deployment. The all-in planning estimate is EUR 45/month at assumed USD/EUR parity, including $28 base allocations, 25% tax/FX reserve and EUR 10 contingency; actual billing/variable usage and backup destination remain 04 acceptance gates.

Refined every downstream ticket 04–13 with concrete boundaries, budget/concurrency/data-history behavior and proposed public verification seams. Only 04 is ready-for-agent because its dependencies are resolved; 05–13 remain needs-triage pending their recorded predecessors. No future test seam is represented as user-confirmed. The next /implement invocation authorizes its selected feature; paid provisioning still needs a concrete reviewable approval.

Validation: checked local document links, dependency/status consistency, independent budget arithmetic and Git whitespace; the two-axis review compares against session-start cdec01c. This documentation-only repository has no package manifest, executable application, typechecker or test suite, so focused/full software tests and TDD are inapplicable. Runtime performance, observed pre-08:00 delivery, private deployment, source safety integration, model availability/quality and recovery targets are explicitly unverified; implementation tickets own those checks. No resources, subscriptions, provider outreach, adapters or application code were created.
