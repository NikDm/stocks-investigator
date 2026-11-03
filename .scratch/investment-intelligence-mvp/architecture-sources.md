# Hosted architecture source check — 2026-11-03

Research for [issue 03](issues/03-minimal-architecture.md), read alongside the [public research check](public-research-check.md) and [screening/evaluation contract](screening-evaluation-contract.md). These are public-document findings and proposed design implications, not a deployment, authenticated entitlement check, performance measurement or user-approved architecture decision. Prices are USD before tax unless stated.

The final [architecture design](architecture.md) chooses five-minute ticks with ≤20-second CPU stages rather than this source check’s illustrative hourly schedule. Its EUR 45 all-in plan also adds domain allowance and contingency; the narrower comparison totals below exclude those additions.

## Recommendation from this check

Propose one TypeScript Workers application, D1, Cron and Cloudflare Access Free, with a durable database work ledger and bounded stages. This fits a single private investor better than buying separate always-on application, worker and database instances. Do not place the full universe, every research item and all retries in one fifteen-minute invocation. Keep deterministic screening/state/publication separate from adaptive evidence research within the application. Direct provider HTTP and a small application-owned tool loop suffice; MCP or AgentCore would add protocol/runtime work without establishing any required capability.

The main consequential limitation is D1's 10 GB database ceiling and Workers' bounded job runtime. A VPS is the credible alternative if ordinary Node libraries, long ingest jobs or less constrained local SQL become more valuable than managed operations. Managed app/Postgres/Cron is also viable, but spends more of the EUR 50 envelope before research.

## Workers: execution and cost

Paid HTTP Workers allow up to five minutes CPU (default thirty seconds), 128 MB per isolate. Scheduled invocations have fifteen minutes wall time. Cron CPU is thirty seconds for intervals below one hour and fifteen minutes for intervals of at least one hour. Network waits do not consume CPU. HTTP has no wall limit while connected, but disconnection can cancel work; `waitUntil()` only extends thirty seconds. Paid subrequests default to 10,000 per invocation; six connections may simultaneously wait for headers. These are distinct constraints, not a promise that a large job will complete. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Paid Workers starts at $5/month, includes ten million requests and thirty million CPU milliseconds; overage is $0.30/million requests and $0.02/million CPU milliseconds. Static-asset requests are free/unlimited. Configurable per-invocation CPU ceilings help constrain cost but are not a total application monthly spend cap. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Cron expressions use UTC; configuration propagation can take up to fifteen minutes. A UTC expression does not automatically follow Zagreb DST. Proposed dispatcher: run hourly, derive due work using `Europe/Zagreb`, and use the US exchange session calendar separately. For example, begin report work at local 05:00 and use hourly recovery ticks at 06:00 and 07:00 before the contract's 08:00 deadline. The actual acquisition cutoff must precede publication and be fixed in the run record. A provider being unavailable at that cutoff means explicit missing/stale evidence. Hourly ticks retain the documented larger CPU allowance; application stages should still target under ten minutes wall time with explicit earlier timeouts. [Cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/). The local-time schedule and stage target here are design proposals, not provider guarantees.

Manual web requests should only insert a due work item. The next dispatcher claims it; display that delay honestly. Never promise a detached long job through an HTTP response. If immediate execution later becomes necessary, evaluate a durable execution product deliberately instead of relying on a connected browser.

## D1: capacity, atomicity and recovery implications

Paid D1 permits 10 GB/database, thirty-day Time Travel, 1,000 binding queries per invocation, 100 bound parameters/query and a two-megabyte row/blob. Queries and entire batch calls must resolve within thirty seconds. `batch()` counts as one binding query even with multiple statements, but individual SQL limits remain. From 2026-11-04 a fifty-megabyte query-result ceiling applies. D1 executes a database's queries one at a time; large queries block others. Therefore chunk inserts, index lookups, bound result sizes and avoid long analytics on the serving database. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Paid allowance is twenty-five billion rows read/month, fifty million written/month and 5 GB storage; excess rates are $0.001/million read, $1/million written and $0.75/GB-month. Index maintenance increases billed writes. Reads count rows scanned, so an unindexed query can be expensive even when returning few rows. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Time Travel is continuous point-in-time recovery; it is operational recovery, not an immutable historical-version model or independent disaster-recovery copy. Restoring rewinds the database, so reconcile already incurred external API spend and already published versions before resuming. Pause work during operator-led recovery and test restoration with synthetic data. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). D1 supports SQL exports/imports; exports have documented restrictions, including virtual tables, and should be restoration-tested against the actual schema. [Import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Proposed daily independent encrypted export, retained outside the live database/account failure boundary, with seven daily and four weekly copies; quarterly restore drill, first drill before production. Reserve $1/month initially for backup/storage; this is an allowance, not a priced backup service. Keep immutable assessments, provenance and compact bars in D1; do not copy arbitrary large source documents into rows. Object storage is justified only for retained evidence/export sizes that warrant it. Monitor storage at 50%, plan migration/archive at 70%, and stop discretionary bulk ingestion before 85%. The prior 1 GB/month planning allowance would exceed one D1 database inside a year; it cannot be treated as indefinitely compatible. Never delete assessment/evaluation history merely to fit the ceiling.

For deadline certification, read committed artifacts from the primary database: default non-session queries route to primary, or an explicit `withSession("first-primary")` starts with the latest primary version. Do not certify publication using an unconstrained replica read. [D1 replication and sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/).

## Private access

Cloudflare's current plans table offers Zero Trust Free at $0 for up to fifty users and up to twenty-four-hour standard log retention. It fits one investor but is not a long-term application audit log. [Cloudflare plans](https://www.cloudflare.com/plans/). Protect the whole application and API with a single allowed identity and validate Access JWT signature, audience, issuer and expiry at the application boundary. A header's presence alone is insufficient. [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Disable or protect alternate preview/worker hostnames and test unauthenticated access to each deployed entry point. A custom domain, if required by the chosen deployment, needs its own registration allowance; workers.dev/private-access compatibility must be proven before selecting a domain-free budget.

## Alternative: one small VPS, SQLite and timer

An official price anchor is DigitalOcean Basic: $6/month for one shared vCPU, 1 GiB RAM and 25 GiB SSD; the smaller $4/512 MiB machine has less useful headroom for a Node app and imports. Shared CPU varies. [Droplet pricing](https://www.digitalocean.com/pricing/droplets). Proposed stack: one TypeScript service, one SQLite file, systemd scheduled job, private identity gateway, and off-machine backups. No managed per-invocation CPU/wall cap is imposed by this architecture; set explicit service/application timeouts and memory bounds. This is an architectural property, not a host uptime guarantee.

Systemd calendar timers support timezones; `Persistent=true` can catch a missed calendar trigger after downtime, and an already-active service is not restarted by its timer. Keep the same database lease/idempotency rules for manual and scheduled work regardless. [Timer source](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.timer.xml), [calendar/time source](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.time.xml). Use SQLite's online backup API or a documented consistent export, rather than copying only a live database file while writers continue. [SQLite backup API](https://www.sqlite.org/backup.html).

Proposed infrastructure allowance: $6 compute plus $2 backups/storage/domain amortization = $8/month. Actual independent backup provider, domain and taxes remain to be quoted. Operator owns OS/security upgrades, disk monitoring, service restart, TLS/access setup, recovery and machine loss. That burden is why this check favors Workers despite the VPS's simpler long-job execution model.

## Alternative: managed application, Postgres and Cron

Render is a concrete representative. Its published price table lists the smallest paid web service at $7/month, paid Postgres compute at $6/month with 1 GB included and expandable storage $0.30/GB. [Render pricing table](https://render.com/pricing?trk=article-ssr-frontend-pulse_little-text-block), [Render's database pricing explanation](https://render.com/articles/managed-postgresql-pricing-2026). These prices were visible in indexed first-party table content; the main page's dynamic rendering did not expose the full table in this reader, so recheck the checkout quote before purchase.

Cron uses UTC, is billed by active seconds with a $1/month minimum per job, and stops runs after twelve hours. Only one run of a given Cron job executes at once: a scheduled run waits for the active one, whereas a manual trigger cancels the active run. These semantics still require checkpoint/idempotency design. [Render Cron](https://render.com/docs/cronjobs). Paid Postgres recovery on a Hobby workspace covers three days, seven on Pro; restoration creates a separate instance and cannot recover to within ten minutes of now. Free Postgres has no recovery capability. [Render backups](https://render.com/docs/postgresql-backups).

Allow at least $15/month infrastructure: $7 app + $6 database + $1 Cron + $1 storage/backup reserve, excluding domain and material overages. Unlike Workers' invocation CPU budget, this is an allocated-instance model; no separate short Cron CPU limit was found in the reviewed documentation. It buys conventional runtime and managed database recovery, while introducing separately configured services, networking/secrets and more fixed cost.

## Model and bounded tool use

The official Haiku 4.5 page currently identifies `claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`, at $1/million input and $5/million output tokens, 200K context and 64K maximum output. It labels the model **active (legacy)**; the current lineup includes Haiku 5.5. Pin the snapshot and check Models API/account availability before implementation; the older page's “not sooner than October 15, 2026” retirement statement is not a new guaranteed support window. [Haiku 4.5 documentation](https://platform.claude.com/docs/en/models/haiku-4-5/overview).

Client tools execute in the application and return `tool_result` messages; the model requests tools but does not need direct credentials/network authority. Application-owned tools can therefore enforce source, request and spend limits before executing. This verifies an interface suitable for bounded adaptive research, not investment reasoning quality. [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview). Tool schemas and appended results consume tokens; pricing lists Haiku 4.5 tool-system overhead (496 tokens for auto/none, 588 for any/tool). Count full multi-turn histories, not just new source text. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

Propose the 4.5 snapshot as the conservative cost baseline already used in the public-research check, with no automatic upgrade/fallback to a different model. Before operational use, evaluate citation accuracy, unsupported causal claims, insufficient-evidence behavior, malicious source instructions and schema refusal handling on representative fixtures. A cheaper newer model is an optional separately evaluated revision, not evidence to increase research volume.

A $15 gross monthly LLM ceiling can reserve worst-case tokens before each request, reconcile reported usage, and stop admissions when exhausted. Disable optional thinking initially; count it as output if enabled later. The prior estimate of 3.52M input/0.352M output costs $5.28, or $10.56 at twice those tokens. That is arithmetic, not measured usage. Keep provider-hosted paid search/fetch tools disabled; use already budgeted application search/fetch tools.

## Comparable monthly planning totals

| Component | Workers proposal | VPS alternative | Managed alternative |
| --- | ---: | ---: | ---: |
| Hosting and initial backup/storage allowance | $6 | $8 | $15 |
| Market data baseline | $0 | $0 | $0 |
| Gross search ceiling | $5 | $5 | $5 |
| Gross LLM ceiling | $15 | $15 | $15 |
| Subtotal | $26 | $28 | $35 |
| With 25% reserve at assumed USD/EUR parity | EUR 32.50 | EUR 35 | EUR 43.75 |

Search/market costs derive from the [prior source check](public-research-check.md); this table is a planning calculation. Reserve is a heuristic for taxes/FX/overage, not a tax or exchange-rate claim. Domain and paid identity requirements must fit the remaining room. No provider subscription, search storage rights, backup target, runtime latency or 08:00 freshness SLA was authenticated here.
