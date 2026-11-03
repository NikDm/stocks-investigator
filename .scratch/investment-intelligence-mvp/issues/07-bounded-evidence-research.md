# 07 — Research candidates and publish immutable evidence-backed assessments

Status: resolved
Type: task
Blocked by: 06

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Implement the bounded researcher selected in 03. It may adaptively seek missing evidence within allowed public search/fetch tools and budgets. Include additional news-driven discovery and early-watch intake as bounded paths defined in 02, not just explanations of screener results.

Publish structured immutable assessments with facts/interpretations/unknowns, source and retrieval/publication times, source independence, thesis, horizon, conditional attractiveness, invalidation, expiry and data freshness. Cite evidence for substantive claims; do not infer causation from price action or invent numeric targets. Contradictory evidence and abstention are supported. Retain permissible evidence or metadata per 01; distinguish original evidence from later revisions.

Acceptance: tool/token/spend limits are enforced; source content cannot change system instructions or access secrets/internal services; duplicates are not independent corroboration; unverifiable citations fail validation; errors/weak evidence yield partial or insufficient-evidence results. Store candidate decisions, including rejections, for prospective evaluation. Verify representative evidence conflicts, tool failures, invalid structured output and publication idempotency.

### Refined implementation contract — issue 03

Implement the research and assessment-publication boundaries in [architecture](../architecture.md), preserving the exact top-three/no-backfill contract. Pin proposed `claude-haiku-4-5-20251001` only after account availability/pricing verification; it is active legacy in the dated source check, with no automatic model upgrade. Evaluate the fixed source/conflict/malicious-content/abstention fixtures before unattended use; model quality remains unverified until then.

- Implement application-owned typed search and registered-source read tools; enforce approved hosts, redirect/DNS/public-IP policy, response types/bytes/time, no credentials in queries/context, no arbitrary model URLs or tools. Reject unsupported fetch safety rather than ship an open proxy. Render sanitized evidence text, never executable source HTML.
- Enforce architecture's shared 30/day and 1,000/month search attempts, 50/day source fetches, per-security 4 turns/12k input/1.2k output/6 tools, aggregate daily/monthly token/turn limits and $15 monthly model ledger. Reserve before dispatch; all retries, repairs, broad intake and later tracking/refresh share it. Unknown billed calls keep their reservation.
- Produce schema-validated facts/interpretations/unknowns, thesis, invalidation, supported price-condition methods, expiry, source independence, citations and timestamps. Validate citations against acquired evidence and cutoff; model output cannot grant itself publication or ranking authority. One bounded repair then explicit gap. Record rejection versus unresearched failure distinctly.
- Broad three-query intake plus changed filings/issuer announcements supports v1 five-place early watch, not five extra full assessments. Require U_D identity/market status, origin deduplication and event evidence; persist expiration/promotion/confirmed-not-selected history. Unsupported/missing sources cause gaps, not invented causal stories.
- Publish assessments append-only through an atomic SQL operation; retain permitted source notes/URLs/hashes and explicit replay gaps, no assumed Brave snippet storage rights. Demonstrate duplicate publication recovery and post-cutoff evidence rejection.

Proposed seams: bounded researcher and assessment publisher. Catch bounds, evidence conflicts and unsafe tool requests; miss universal coverage and proven prompt-injection resistance. Confirm under TDD before new tests.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

2026-11-03: Implementation requested via `$implement issue 7`; dependency 06 is resolved for local work. Baseline: `35f0c024715e0b39da42132a84dce56619b6a185`. Awaiting explicit confirmation of the ticket’s proposed bounded-researcher and assessment-publisher TDD seams before writing tests. Live model/account verification and unattended-quality gates remain distinct from local implementation.

2026-11-03: User replied “confirmed”, approving the bounded-researcher and assessment-publisher TDD seams. Implementation proceeded with red/green checks and independent Standards/Spec review against the recorded baseline.

## Answer

Local bounded research delivered on 2026-11-03. The user confirmed the bounded-researcher and assessment-publisher TDD seams. [Research runbook](../../../docs/research.md), [independent Standards/Spec review and resolutions](../research-review.md).

- A checkpointed researcher follows the exact frozen top-three security-ID queue, resolving broker tickers through the saved identity/ranking relationship. It cannot backfill rejected or unresearched members. Supported and explicitly unexplained conditional theses are distinct; validated supported theses sort first, preserving screening order within groups. The original baseline and full-universe denominator remain immutable.
- Application-owned tools expose bounded ticker/topic search and registered-source reads. Fixed official SEC submissions/archive endpoints support filing and issuer-exhibit intake. Unsupported issuer/publisher hosts, arbitrary/model URLs, redirects, credentials, unsupported content and oversized responses fail closed. Source text is sanitized quoted data, never executable HTML. No browser/account/broker secrets enter model context or queries. This reduces impact without claiming proven prompt-injection immunity.
- One atomic fenced research ledger covers search, source fetch, broad intake, turns, repeated-context tokens, output, model microdollars and retained bytes across all passes. Unknown billed calls retain reservations and are not automatically replayed. Pending pre-dispatch checkpoints survive restarts. Provider usage above a reservation appends a durable halt. One bounded structured-output repair precedes explicit insufficiency. Infrastructure/budget failure remains `unresearched`, separate from evidence-backed rejection.
- Strict assessment validation checks actual acquired evidence, exact quotes, identity, acquisition/publication cutoff, time-sensitive versus unknown-date context, cited interpretations/thesis/invalidation, conditional attractiveness, deterministic price-condition methods, market timestamps and expiry. Historical/delayed prices never validate live entry. Opening or independently registered event dependencies shorten expiry. Published decisions and initial versions commit atomically; duplicate publication recovers the original result, conflicting requests fail, and corrections append linked versions without rewriting the morning selection.
- Broad intake shares three fixed daily searches, up to three rotating verified-issuer filing polls, three document reads and a bounded short-note pass rather than five extra assessments. Five issuer-distinct early-watch places compete under v1 order. Current U_D/market status, exact event citations, publication freshness and issuer origin own admission. App-owned event keys can establish distinct events; without one, conservative issuer identity cannot restart expiry on reworded coverage. Five-session expiry, promotion, confirmed-not-selected, disproven events and first-appearance history survive inactive gaps and outages. Contradictions take precedence within a batch without removing distinct verified newer events.
- Migration 0005 adds immutable source/evidence/assessment/watch history and mutable fenced checkpoints. Evidence retains hashes, sanitized excerpts and explicit replay gaps; Brave snippets/titles are discarded. The recent evidence window prioritizes new revisions while publication pins cited older IDs. Authenticated snapshot inspection exposes committed research/watch artifacts. The market pipeline checkpoints research before evaluation planning; initial seed capture skips daily research/watch publication so it cannot occupy the real morning slot.

### Verification

Final strict typecheck, **77 tests / 17 files (172.61 seconds)**, local D1 migrations, Worker dry-run bundle and encrypted disposable backup/restore pass. Restore preserves pending model reservations/checkpoints, evidence, assessments, corrections and watch history, and rejects tampered ciphertext. No remote database, paid service or deployed resource changed.

The full-universe harness preserves **5,078 securities × 90 sessions × two bases = 914,040 observations**, then exercises **12 main research turns and 18 main tools**, plus the three broad queries and one short-note intake turn. Its shared ledger observes **13 model turns and 24 source fetches**. Every research stage passes the conservative **1,500 ms** local elapsed assertion; the ten slowest stages together pass **15,000 ms**. These simulated providers do not measure real network latency, billed Worker CPU, production heap or model quality.

Independent review identified two Standards duplication heuristics and five Spec correctness findings; all were fixed and independently confirmed resolved. The full-universe harness additionally caught the security-ID/ticker mismatch; a smaller distinct-identifier fixture reproduced red before the fix. Regression coverage includes unknown publication times, source revisions, post-cutoff rejection/atomic rollback, explicit unexplained theses, supported-first order, concurrent reservations, invalid output, unavailable/unknown billed calls, usage halts, stale entry conditions, same-event contradictions, expiry after outages and seed/morning publication isolation.

### Remaining operational gates

Research and jobs remain disabled by default. The proposed `claude-haiku-4-5-20251001` has no automatic upgrade/fallback and cannot become active without current price/fixture verification and an account-specific availability check. No account availability check or billed/live model evaluation was performed. Before unattended use, replay the fixed primary-source, repeated-origin, conflict, no-explanation, malicious-content, missing-source and stale-price scenarios through the actual pinned model and retain failures; deterministic fixtures do not establish live model quality.

The initial safe retrieval adapter supports SEC sources; unsupported publisher/issuer sites and unresolved CIK/event identities remain explicit gaps, not universal news coverage. Full raw-document replay is not claimed. Combined hosted CPU/heap/D1 capacity and finish-before-07:50 behavior, private access/billing/backup gates, live identity/action reconciliation and three observed pre-08:00 sessions remain open. Issue 08 still owns the morning dashboard and observed report/cohort publication certification. No deployment, predictive usefulness or investment edge is claimed.
