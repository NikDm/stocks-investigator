# 07 — Research candidates and publish immutable evidence-backed assessments

Status: needs-triage
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
