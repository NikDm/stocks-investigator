# 04 — Create the private hosted application foundation

Status: resolved
Type: task
Blocked by: 03

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the architecture selected in 03: minimum application shell, persistence/migrations, private single-user access, configuration/secrets handling, a job entry point and health/run status. Provide reproducible local setup and deployment instructions. Do not introduce unused infrastructure.

Acceptance: unauthorized requests cannot access reports or trigger jobs; secrets remain server-side; migrations and startup work; scheduled/manual jobs share the selected contract; required logs omit secrets. Include meaningful checks of access boundaries and persistence. Paid provisioning is not implied by this ticket. Refine exact framework, host and deployment checks after 03.

### Refined implementation contract — issue 03

Use the proposed [architecture](../architecture.md), [source comparison](../architecture-sources.md) and [ADR](../../../docs/adr/0001-managed-sql-and-checkpointed-jobs.md). Build one strict TypeScript Worker/Hono application, D1 SQL migrations, Zod validation and Wrangler local/deployment configuration. Add typecheck, focused Vitest and full-suite commands. No SPA, vector store, queue, MCP or AgentCore dependency. Start with synthetic records; no paid provisioning is authorized.

- Implement a public job coordinator with atomic leases/fencing, 90-second renewable lease, ≤45-second wall stages drained repeatedly within a 240-second wall/20-second aggregate CPU invocation, durable pages, idempotency keys and counted retry/spend reservations. Five-minute Cron dispatch must fit its documented 30-second CPU cap. Demonstrate multiple stages per tick, bounded concurrency and lease renewal; one stage per five-minute tick cannot meet the workload. Manual HTTP commands enqueue work and show the next-tick delay; do not rely on detached HTTP execution.
- Establish SQL write boundaries for immutable artifacts versus staging; prove an interrupted batch cannot expose half a report and a stale lease cannot publish. Schema supports versioned snapshot inputs, full-universe reference/action capture, candidate dispositions, cohorts and budget usage before 08 becomes operational.
- Protect every report/API route with a single allowed Access identity and verified JWT issuer/audience/signature/expiry. Test alternate domains/preview routes, unauthorized mutation, CSRF and escaped rendering. Keep all secrets in server bindings, with read-only endpoint policies and redacted logs; no credentials in fixtures or exports.
- Document local setup, migrations, secret names, deploy/rollback and daily recovery. Validate a synthetic representative load against D1 parameter/query/batch/memory limits and Worker stage limits; preserve the universe by partitioning, not truncating. Define monitoring for usage/storage, missing runs and budgets.
- Prepare a concrete deploy configuration and account-specific quote including access/domain, backups, tax/FX and variable-charge exposure within EUR 50. Establish encrypted backup destination/key custody and perform a disposable restore with hashes/row totals before claiming production readiness. If accounts or paid resources are needed, finish local reviewable work before requesting the necessary deployment approval; readiness is not deployment.

Proposed seams: private HTTP, job coordinator, persistence/publication. Catch auth, concurrency, crash recovery and immutable writes; miss real provider freshness and uptime. Confirm seams under TDD before adding tests. Accept local foundation separately from live deployment only with the unverified deployment gates explicitly recorded; do not claim a hosted application until actually verified.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.


## Answer

Local foundation delivered; **not a hosted or production-ready application**. [Setup](../../../README.md), [operations/deployment/recovery and outstanding gates](../../../docs/operations.md), [production template](../../../wrangler.production.example.jsonc).

- Strict TypeScript Hono Worker, pinned lockfile, Zod validation, local/deploy configuration, D1 migration and synthetic shell. Verified Access JWT issuer/audience/RS256 signature/expiry and single identity; canonical origin, CSRF, bounded bodies, escaped/paginated reports and no-store responses. Local generated signing keys are accepted only on loopback. No provider credentials/adapters or paid calls.
- Public coordinator: durable idempotent scheduled/manual enqueue, singleton 90-second renewable lease, increasing fencing generation and SQL-guarded writes; reloads the durable checkpoint after ownership; multiple stages per tick, four-task concurrency helper, stage/invocation bounds, counted attempts and durable deferred retries. Atomic day/month request/token/spend-resource reservations reject missing limits and preserve unknown usage. Provider dispatch/price semantics remain owned by 05/07.
- Versioned immutable input rows and typed snapshot/universe/reference/action/disposition/cohort/assessment envelopes. Atomic publication includes report and all artifacts; post-cutoff/missing inputs abort publication. SQL immutable guards, frozen pages, primary readback and append-only observed-time receipts prevent partial/stale publication. All foundation reports remain research-only.
- Tests at the three user-confirmed seams prove private access/CSRF/rendering, leases/retries/reservations and immutable/atomic persistence. The representative local D1 load retained all **457,020 daily input rows (5,078 × 90)** and **5,078 universe members** using bounded input/staging pages; successful harness wall time approximately 15 seconds. This is not an actual Cron/provider/CPU/timeliness benchmark.
- Strict typecheck, focused tests and full 18-test suite passed. Local migrations, Worker startup, authenticated health, unauthorized 401 and an actual local scheduled smoke run with durable completed report passed. Worker dry-run bundle passed. Encrypted disposable recovery verifies SQL checksum, every table's row totals/hash, integrity, foreign keys, cohort/receipt and pending reservation; damaged ciphertext is rejected without leaving a restored plaintext file. Example cohort hash: `c82ad01ae462bc5ac76a893673683d335b00ce3d9e2c8eeeb0a476a388b8b7e6`; pending reservation hash: `147762ba790be9c2dd09a415a51497a08c59b8f018d7e029a0151a36feb860f6`.

### Explicit unverified deployment gates

No account/domain has been configured, no resources provisioned, and no live Access, Cron, remote D1 restore, independent encrypted backup destination or key custody established. The EUR 45 estimate remains a planning assumption, **not an account-specific quote**. Provider limits/tax/FX/domain/backup cost and variable-charge exposure require real account evidence before any deployment approval. Hosted aggregate CPU/memory/wall behavior and combined real provider workload remain unmeasured. The operations runbook lists each gate, concrete configuration steps and recovery/monitoring policy. Daily independent backup/upload automation cannot be installed until its destination/custody is agreed. Local foundation acceptance is separate from those production-readiness gates, as permitted by this ticket.

[Independent Standards/Spec review](../foundation-review.md) completed. Fixed the stale pre-claim checkpoint race, consolidated atomic attempt limits, and added terminal permission/schema classification plus persisted Retry-After scheduling. Both reviewers confirmed their findings resolved. Final local checks are recorded below; live deployment remains gated as listed above.
