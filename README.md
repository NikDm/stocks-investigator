# Stocks Investigator

Private investment research foundation: one strict TypeScript Hono Worker, D1 migrations and a checkpointed five-minute Cron coordinator. Local market capture, deterministic momentum screening and bounded evidence research are implemented. Live morning discovery and model-quality verification remain pending. Nothing is hosted or provisioned by this implementation.

## Local setup

Requires Node 24+ and npm; the restore exercise also needs Python 3 with its standard SQLite module. Install the pinned lockfile:

```sh
npm ci
npm run db:migrate
node scripts/local-auth.mjs
npm run dev
```

In another terminal:

```sh
curl --header @.wrangler/local-auth-header http://127.0.0.1:8787/health
curl --header @.wrangler/local-auth-header http://127.0.0.1:8787/
```

The local setup generates a fresh signing key, verifies signed JWTs, and writes a two-hour token to a private ignored file. It accepts these keys only at `http://127.0.0.1:8787`; there is no production authentication bypass. The private signing key is discarded. To renew, remove the generated `.dev.vars` only if it contains no custom settings, then rerun the generator. Browser use in production relies on Access injecting the assertion; curl is the local foundation interface.

Wrangler commands explicitly disable `.env` loading, keeping existing provider credentials out of this application. `.dev.vars`, `.wrangler`, exports and keys must never be committed. The local generator refuses to overwrite an existing `.dev.vars`.

## Commands and checks

```sh
npm run typecheck
npm test -- test/http.test.ts
npm test -- test/publication.test.ts
npm test -- test/coordinator.test.ts
npm test -- test/load.test.ts
npm run backup:check
npm run deploy:check
npm test
```

Tests run in local workerd against real D1 migrations, with generated signing keys and synthetic data. The representative load preserves all 5,078 securities × 90 sessions (457,020 versioned daily input rows), plus a 5,078-member immutable universe. It partitions input writes into ≤500 rows / 256 KiB and report staging into ≤50 rows / 256 KiB. Browser reads paginate 100 artifacts; all records remain stored. This harness validates storage/partition boundaries, not remote provider latency, hosted CPU or morning timeliness.

For a manual command, GET `/api/csrf` with authentication, then POST JSON `{"key":"your-unique-command","pages":4}` to `/api/runs` with `Origin: http://127.0.0.1:8787`, `Content-Type: application/json` and the returned token in `X-CSRF-Token`. `pages` is 1–200 and describes synthetic work. The response is 202 with a durable run ID and delay to the next tick (up to five minutes). Repeating a key returns its original run; changing its payload returns 409. HTTP never starts detached jobs. GET `/api/status` shows runs, storage and budget balances. All routes, including health and unknown paths, require authentication.

Wrangler's scheduled testing endpoint is local tooling only: start `npm run dev -- --test-scheduled`, then use its local `/__scheduled` endpoint to exercise a tick. In production there is no HTTP job-dispatch endpoint. The daily synthetic scheduled command and manual commands use the same SQL coordinator. This is not the exchange-session/morning scheduler from issue 08.

## Design and operation

[Operations and deployment](docs/operations.md) describes security bindings, publication, budgets, recovery, deploy/rollback and the outstanding production gates. [Issue 04 evidence](.scratch/investment-intelligence-mvp/issues/04-hosted-foundation.md#answer) records the delivered milestone and limitations. Domain language is in [CONTEXT.md](CONTEXT.md).

Market capture (issue 05) is documented in [the capture runbook](docs/market-capture.md). It is disabled by default and remains research-only; live identity reconciliation, runtime measurements and three observed pre-08:00 sessions are outstanding.

Deterministic screening (issue 06) is documented in [the screening runbook](docs/screening.md), including decimal rules, immutable baseline/queue, checkpointing, inspection and remaining operational gates.

Bounded evidence research (issue 07) is documented in [the research runbook](docs/research.md), including shared budget reservations, registered-source safety, immutable assessments and early-watch history. It is disabled by default; live account/model-quality and combined hosted workload gates remain open.

Morning review (issue 08) is documented in [the morning runbook](docs/morning-review.md). Tracked opportunities (issue 09), including the ten-slot cap, explicit renewal/archive, immutable material-change checks and private controls, are documented in [the tracking runbook](docs/tracking.md).

Manual pre-opening re-review (issue 10) is documented in [the refresh runbook](docs/refresh.md), including private queued commands, tracked/morning comparisons, conservative request windows, delayed-price warnings and separate immutable refresh cohorts.

Prospective fixed-horizon evaluation (issue 11) is documented in [the outcomes runbook](docs/outcomes.md), including immutable calculation revisions, action reconciliation, coverage, separate morning/refresh comparisons and review-effort denominators.
