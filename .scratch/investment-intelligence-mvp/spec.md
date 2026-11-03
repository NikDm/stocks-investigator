# Investment intelligence MVP

Status: needs-triage

## Purpose

A personal, hosted research dashboard that discovers sustained-momentum opportunities in liquid US-listed company shares available on Trading 212, helps the investor manually choose up to 10 opportunities to follow, and reassesses them over a few weeks. It supports decisions and never executes trades.

Source of agreed product choices: [discovery](../../docs/discovery.md). Canonical vocabulary: [CONTEXT](../../CONTEXT.md). This is a planning specification; provider feasibility, screening parameters, and architecture remain open. No implementation is authorized by the discovery session.

## User workflow

1. By 08:00 Europe/Zagreb on US trading days, open an automatically prepared report in a private dashboard.
2. Spend 10–15 minutes reviewing up to three main candidates, a compact early-watch list, and material changes to tracked opportunities. No quota filling.
3. Inspect dated evidence, market-data timestamps, uncertainty, the opportunity thesis, invalidation conditions, and assessment expiry. Facts, interpretations, and unknowns are distinct.
4. Manually select opportunities to track, independently of any purchase. At most 10 are active; archive one before adding an eleventh.
5. Optionally request a pre-opening re-review. Compare the new immutable assessment with the morning version. Delayed data cannot validate current entry conditions; check the live price in Trading 212 before acting.
6. Renew active tracking at its checkpoint, initially 20 trading days after selection. Preserve history and continue fixed-horizon evaluation regardless of tracking state.
7. Review prospective performance and stocks not surfaced by discovery once sufficient outcomes mature.

## Included

- Long-only company shares; liquid smaller companies may qualify. Sustained momentum is the main market pattern.
- Deterministic price/volume screening before bounded agent research; public news, company announcements, and filings provide additional evidence and discovery input.
- Early watch for emerging attention without market confirmation; promotion requires defined confirmation. Unexplained momentum is allowed and labeled, while evidence-backed candidates receive priority.
- Explicit, conditional assessments against recorded theses. Evidence can justify an insufficient-evidence result or a downgraded conclusion. Strong market signals do not override contradictory evidence.
- Immutable assessment versions with information cutoffs, citations, market-data timestamps, changes, and supported price conditions. No unsupported numeric precision or invented causal explanations.
- Daily updates cover material market changes and developments in the underlying explanation; repeated coverage is not independent confirmation.
- Hosted operation and private dashboard access; visible run failures, data freshness, and cost controls.
- Independent opportunity assessments, not portfolio fit or position sizing.
- Prospective evaluation captured from the first operational run: eligible universe, signal/rule version, screener-only shortlist, AI shortlist, and as-of evidence.
- Primary evaluation horizon: 20 trading days; supporting horizons: 10 and 30. Include interim downside and compare like-for-like with screener-only results.
- Standardized next US regular-session opening reference, pre-opening selection freeze, and explicit execution-cost allowance. Exact fields, cutoff and allowance must be resolved before implementation. Later revisions retain separate records.
- Simple retrospective of best performers within saved eligible universes, labeled not surfaced where applicable; no assumption that every winner was detectable.
- Optional recording of actual purchases, separately from discovery evaluation; schedule after the core workflow.

## Excluded

Automatic trading; short selling; ETFs; options; leveraged/inverse products; crypto; portfolio allocation and concentration checks; alerts and continuous monitoring; Gmail/newsletter and Reddit ingestion; email delivery; conversational chat; historical reconstruction before operation; weekend and exchange-holiday reports.

## Constraints and design boundaries

- Initial total operating ceiling: EUR 50/month, potentially lowered later. Include data, search, LLMs, hosting, storage and applicable taxes/currency assumptions in estimates. No paid subscriptions or provisioning during planning.
- AgentCore is optional; prefer simpler, cheaper solutions meeting requirements. MCP, pgvector, NestJS, AWS queues and managed agents are candidates, not requirements.
- Deterministic code owns calculations, eligibility, calendars, state transitions, versioning and budgets. Bounded agents investigate evidence and explain conclusions. Final interfaces await the architecture ticket.
- Discovery and research must not be described as proven investment edge. Research usefulness and review effort are evaluated independently of relative returns.
- No provider selection is final until coverage, delay, rate limits, permitted retention and recurring cost have been checked against official documentation.

## Milestones without calendar commitments

1. **Resolve feasibility** — tickets 01–03: verified data path, explicit rules/evaluation contract, minimal architecture and implementation-ready follow-up tickets.
2. **First usable morning loop** — tickets 04–08: private hosted dashboard, daily market snapshots, screening, evidence-backed research and scheduled morning reports. Capture prospective evaluation inputs from day one.
3. **Track and reassess** — tickets 09–10: lifecycle, material changes and manual pre-opening re-review.
4. **Evaluate usefulness** — tickets 11–12: outcome calculations, baseline comparison and not-surfaced performers as horizons mature.
5. **Optional convenience** — ticket 13: actual purchase records, independent of research selection.

## Acceptance gates

- A weak or failed run produces an honest empty/partial/unavailable result, never a fabricated shortlist or a stale report labeled current.
- Reports meet the agreed content and freshness contracts; supporting evidence can be traced to its source and time.
- Re-review adds a version and identifies changes without rewriting prior conclusions.
- Delayed or missing data leaves current entry validation explicitly unresolved.
- Tracking respects its cap and renewal policy; evaluation remains independent of purchases and archiving.
- Evaluation cannot use information acquired after the relevant decision cutoff to rewrite selections or evidence.
- Measured review effort and research usefulness are recorded alongside returns/downside. Do not infer statistical outperformance from a handful of outcomes.
- Costs stay within the selected cap; exhaustion degrades visibly instead of silently overspending.

## Unresolved before implementation

See the map and investigation tickets. Proposed numeric thresholds and implementation choices must be labeled as proposals until resolved. Changes to an agreed product boundary return to the investor as one focused question at a time. Routine reversible implementation decisions can be made by the implementation agent once authorized.
