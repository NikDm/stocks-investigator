# Foundation operations

## State and publication

`runs`, `pipeline` and `pages` are durable mutable work state. A singleton pipeline lease serializes ownership, expires after 90 seconds, increments its fencing generation on acquisition and renews before each stage. Each write batch first asserts the current run/owner/generation and unexpired lease through a SQL CHECK; a stale writer aborts the entire batch. A crash before a page commit leaves no checkpoint; a crash after commit resumes at the next page. An identical page replay is allowed, changed content is rejected, and published pages cannot change.

`input_versions` stores reusable immutable versioned inputs, including raw daily rows, opening observations, actions, catalogue/calendar and identity records. Revisions append with predecessor IDs. Decimal prices are strings. `artifacts` provides typed envelopes for snapshot input references, full saved-universe membership, reference/action capture, dispositions, cohorts and assessments. Provider-specific semantics, enforced cohort eligibility and exchange-session scheduling belong to 05–08; these records do not certify evaluated selections.

Publishing inserts the report and all staged artifacts in one D1 atomic batch. Duplicate artifacts or any input after the cutoff abort it. SQL guards prevent updates/deletes of reports, artifacts and receipts. Published report/cohort content never changes. An interrupted acknowledgement can leave a complete research report without a receipt. Recovery reads the primary, verifies the manifest and artifact count, and appends an idempotent receipt with the actual readback completion time. It cannot certify earlier availability. Every current foundation report is research-only. Future evaluated queries must enforce the contract's session/deadline and matching receipt/hash, not simply the existence of a receipt.

The coordinator drains up to 64 bounded synthetic pages per tick, starts no stage with fewer than 45 seconds in its 240-second wall envelope, and starts publication only with ten seconds remaining. Each stage has a 45-second timeout and passes a 35-second work deadline/abort signal to its executor. Future external calls must observe that deadline and use a ≤20-second timeout. At most four independent tasks run through `mapBounded`. Each stage reserves a conservative 250 ms CPU allocation, 16 seconds for 64 stages plus four seconds overhead. This is a synthetic-stage engineering allocation, not a measured hosted CPU guarantee. Wrangler enforces **20,000 ms aggregate CPU for the entire invocation**, below the five-minute Cron 30-second cap. CPU exhaustion kills the invocation; the last committed page remains recoverable. Production CPU, memory, end-to-end wall behavior and real executors must be measured before readiness. No per-stage CPU reset is assumed.

Attempt count increments durably before work. Success resets the page's attempt count; transient failure defers to a later tick with exponential backoff/jitter and the later provider Retry-After time, and stops after three attempts. Permission/schema failures terminate immediately. A crash after dispatch retains its counted attempt. Error history uses fixed `stage_failed`/`tick_failed` codes; raw errors, JWTs, identity, URLs, provider text and credentials are never logged. Stage events retain run/generation/page/time; run status exposes cursor, retry time and failure. No alerts/email are configured.

## Budgets and secrets

Budget reservations use integer resource units (requests, tokens or microdollars), UTC day/month keys and atomic conditional balances. Both limits must exist before a reservation succeeds. Unknown usage retains its full reservation; actual usage can be reconciled once and cannot exceed the reserve. Each retry needs its own attempt ID. Reserve every resource's worst-case charge **before** dispatch; do not dispatch unless all reservations succeed. Redeploy/retry does not reset the ledger. A restored ledger cannot know unexported usage: keep jobs disabled until reconciled with provider statements. Foundation synthetic work has no paid calls. Provider adapters and their price-version/token rules remain gated by 05/07.

Server bindings:

| Binding | Handling |
| --- | --- |
| `DB` | D1 binding, never browser-configured |
| `APP_ORIGIN` | Exact canonical scheme/host/port; reject all alternate origins |
| `ACCESS_ISSUER` | Exact HTTPS Access team issuer; trusted cert endpoint derived from it |
| `ACCESS_AUDIENCE` | Access application audience |
| `ALLOWED_EMAIL` | Server secret: single exact allowed Access identity |
| `CSRF_SECRET` | Server secret: random ≥32 characters; signed identity-bound 30-minute CSRF tokens |
| `JOBS_ENABLED` | `false` until setup and reconciliation complete |
| `LOCAL_JWKS` | Generated local public keys, accepted only at the fixed loopback origin; absent in production |

No provider secrets are loaded or required. Do not copy the repository's `.env` into Worker bindings. Future provider keys must remain server bindings and pass explicit HTTPS/method/host/path read-only policies: no orders, accounts, positions or trading routes. Currently the only outbound application request is GET of the configured Access JWKS. There is no general fetch proxy, model dispatcher or provider adapter. Redirect-safe source retrieval belongs to issue 07; do not enable it before its independent policy exists.

Access must enforce the same single-user allow policy at the edge. The Worker independently verifies RS256 signature, issuer, audience, expiry and exact email on every route. It rejects authenticated requests outside the canonical origin. Production workers.dev/preview URLs are disabled. Browser mutations additionally require exact Origin and an identity-bound signed CSRF token. Body sizes are bounded, source/report content is escaped, and private responses use no-store and restrictive CSP. Raw request logging is disabled in Wrangler observability to avoid paths/identity leaking; enable only reviewed structured logging.

## Deployment gate and concrete configuration

`wrangler.production.example.jsonc` is a concrete deploy template with deliberate non-account placeholders. Local setup, migrations and bundle checks do not create any resources. Before paid provisioning, record:

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Account/domain/Access | Actual account ID, D1 ID, owned domain/zone, working identity provider, single-user allow policy and audience | Not supplied/verified |
| Quote | Account-specific Workers/D1/Access/domain/backup charges, VAT treatment, billing currency and FX cushion | Unverified; planning estimate below only |
| Exposure | Provider usage limits/alerts; D1 read/write/storage and Workers request/CPU overages; residual uncapped platform charges | Needs account review |
| Backup | Named permitted off-platform destination, space/retention costs, upload method, independent key custody and recovery owner | Not established |
| Hosted verification | Unauthorized report/job probes on custom/alternate domains, missing/expired JWT, preview disabled, Cron CPU/memory/wall traces | Local checks only |
| Recovery | Real permitted export + encrypted off-platform upload + disposable import, hashes/row totals/foreign keys/cohorts/pending reservations | Synthetic exercise passed; remote path unverified |

Planning envelope from [architecture sources](../.scratch/investment-intelligence-mvp/architecture-sources.md): data $0, search $5, Workers $5, storage/backup $1, model reserve $15, domain $2 = $28/month. Assumed USD/EUR parity plus 25% tax/FX ($7) plus EUR 10 contingency = **EUR 45**, below EUR 50 only under those assumptions. This is not an account-specific quote. Access/identity/domain availability, taxes and actual FX could change it. The $1 backup allowance has no chosen vendor. Do not enable deployment until a dated account quote includes these and explains variable-charge exposure; if baseline exceeds EUR 50, return a concrete scope/cost choice to the investor.

After those gates and deployment approval:

1. Create the approved D1 database and Access application; configure a single allowed identity, no bypass/service-token rule. Fill a private copy of the production template with the verified account, database, domain, issuer and audience. Keep `JOBS_ENABLED=false`, no `LOCAL_JWKS`, workers.dev/preview disabled. Keep private deploy configs out of version control if they contain identity.
2. Set `ALLOWED_EMAIL` and `CSRF_SECRET` with `wrangler secret put ... --config <config>`; never place secret values in commands, Git or exports. Use a scoped deploy token outside the repo if needed.
3. Export/verify a pre-migration backup. Apply `wrangler d1 migrations apply stocks-investigator --remote --config <config>`. Dry-run the bundle, deploy, and probe health/reports/mutations with missing/wrong/valid JWTs, expired tokens, foreign Origin and invalid CSRF. Check preview and workers.dev cannot bypass auth.
4. Verify a scheduled synthetic run, overlap/recovery, primary receipt and real usage traces. Enable jobs only after ledger reconciliation. This milestone still runs synthetic work; operational morning discovery waits for 05–08.

Deployment commands must use `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`. Rollback: disable jobs first, use `wrangler rollback <verified-version> --config <config>` for compatible code. SQL migrations are forward-only; a Worker rollback does not undo a migration. Test schema compatibility before rolling back; otherwise deploy a forward repair. Restore to a new disposable D1 first, never overwrite live state to test.

## Daily review and recovery

Review `/api/status` and the dashboard for last completed run, queued/running age, page cursor, next retry and fixed failure code. The foundation schedules one daily synthetic smoke run and resumes pending work every five minutes. Flag no smoke completion within 24 hours and running state older than ten minutes for manual inspection. Later morning-session missing/late rules are owned by 08. Compare dashboard storage (`meta.size_after`) to the provider console; warn at 2 GB, stop optional retention at projected 3 GB, preserve manifests and denominators. Capacity-triggered archival is not installed yet.

Review provider usage/storage/bills daily during startup and monthly thereafter: warn at EUR 35 projected all-in cost, stop optional work at EUR 40 projected operational cost and pause new paid dispatch if needed to preserve reserve. Query rows-read/written and Worker CPU/request metrics in the provider console; no separate paid monitoring infrastructure is installed. Monitor daily/monthly budget remaining and unknown reservations. Retain structured stage history 90 days once a reviewed cleanup job is added; until then monitor its growth without deleting decision history.

For a failed run, repair configuration/data and wait for a due retry. After three failures, use an explicit new command key; prior run/checkpoints/history stay recorded. An expired owner resumes under a new generation. If an artifact committed but receipt did not, recovery can only attest the current readback time. Never backdate publication, refill missing selections, or refund unknown external usage.

## Encrypted backup and disposable restore

The independent destination and custody are outstanding deployment gates. The supplied tooling does not upload anywhere. Create a 32-byte key using `node scripts/backup.mjs keygen <private-key-path>` outside the repository. Keep one independently recoverable encrypted/key-manager copy, with access controlled separately from Cloudflare and the archive destination. Do not put the key beside backups or in D1. Agree who can recover it before operating.

Export the permitted database with Wrangler D1 export to a private temporary SQL file. Use the local/remote flag and verified config explicitly; never include provider secrets in the DB. Seal it with `node scripts/backup.mjs seal <export.sql> <archive.aes> <key-path>`. AES-256-GCM authenticates a random nonce/header and compressed SQL; the sidecar manifest records SHA-256 checksums. Transfer the archive and manifest to the approved off-platform destination, remove temporary plaintext, and retain seven daily/four weekly copies within the approved allocation. Daily export/upload scheduling is intentionally pending the actual destination/custody decision, not claimed operational.

For a disposable restore: `node scripts/backup.mjs open <archive.aes> <disposable.sql> <key-path>`, then `python3 scripts/verify-restore.py <original-export.sql> <disposable.sql>`. The verifier imports both trusted exports into disposable SQLite databases and checks SQL checksums, every table's ordered row hash/count, integrity and foreign keys. Without the original export, compare decrypted SQL checksum to the manifest and compare table summaries to a separately saved trusted summary. Import into a new disposable D1 to additionally verify remote runtime/migration behavior. Keep jobs disabled, reconcile pending reservations/external usage, record lost intervals as explicit gaps, then approve cutover. RPO ≤24h and one-day recovery are unverified operating targets.

`npm run backup:check` creates an entirely synthetic export with a published cohort/receipt and an unresolved reservation, encrypts/decrypts it with a disposable random key, verifies every table and removes all temporary files. Repeat after schema changes and quarterly once operating. It proves local cryptographic/logical recovery, not independent off-site custody or provider import.
