# Project discovery

Product choices captured through the discovery interview. The investor requested a milestone-based plan and will pick up features as time allows, without a calendar or weekly time commitment. Data feasibility and technical design remain investigation work; implementation has not started.

## Product vision

A personal research dashboard that automatically discovers sustained-momentum stock opportunities for a few-week holding period, supports manual selection and evidence-backed reassessment, and measures research usefulness and prospective outcomes. It supports investment decisions without executing trades.

The sequenced plan, bounded specification, and local tickets live in [.scratch/investment-intelligence-mvp](../.scratch/investment-intelligence-mvp/map.md).

## Resolved choices

- Automatically discover potential investments; the investor manually selects which to follow.
- Track selected investments over time to assess how the opportunity changes and whether it remains attractive.
- Manual selection starts tracking an opportunity and does not imply a purchase. An actual purchase can be recorded separately and optionally with its entry date and price.
- Tracking has an explicit renewal checkpoint, initially 20 trading days after selection. At that point mark the opportunity as needing renewal and continue active research only upon manual renewal. Preserve invalidated theses and prior assessments; renewed reasoning gets a new assessment version. Fixed-horizon performance evaluation continues independently of active tracking. Exact handling of invalidation before the checkpoint remains unresolved.
- Limit active tracking to 10 opportunities, retaining archived history without a product-level count limit. Adding an eleventh requires archiving an existing opportunity. Daily updates emphasize material changes rather than full new reports for every stock; storage and retention costs remain bounded by the operating budget.
- Give explicit assessments of tracked opportunities against a recorded thesis: why momentum might continue, the expected holding period, and evidence that would invalidate the reasoning. Assessments must express uncertainty and may conclude that evidence is insufficient.
- Conflicting or insufficient evidence can withhold or downgrade a positive assessment even when market signals are strong. Keep the candidate visible with evidence gaps, disagreements, and what would resolve them. Unexplained momentum alone is not automatic disqualification; conclusions must be supported by the stated reasoning.
- Include conditional guidance: when the opportunity remains attractive, what invalidates it, and when the assessment expires. Price levels require supporting market data and a stated method rather than unsupported LLM precision.
- Assess opportunities independently in the MVP. Portfolio-aware assessments, concentration checks, risk-allocation enforcement, and position sizing are deferred; optional purchase recording remains separate.
- Evaluate discovery quality using both subsequent returns and interim downside, separately from actual purchase results. Use 20 trading days as the primary horizon, with 10 and 30 trading days as supporting views. The precise downside measure remains unresolved.
- Use a standardized reference price at the next US regular-session opening for evaluation, identically for AI and screener-only shortlists, with an explicit execution-cost allowance. Freeze evaluated selections before that opening; subsequent revisions retain separate records. This is a comparison convention, not an assumed executable price. Actual purchases use their recorded entry prices. Exact price field, cutoff, and cost allowance remain unresolved.
- Evaluate the AI-researched shortlist against a retained screener-only shortlist using the same eligible universe, decision times, and horizons. Compare returns and downside, and assess whether research usefully rejects weak candidates; the baseline runs without requiring an additional investor review.
- Initial acceptance values useful, traceable research and a manageable review workload independently of investment outperformance. Time savings and better understanding can justify the AI layer even without demonstrated selection improvements. Improved returns/downside versus the screener remain a hypothesis to evaluate over time; a few successful picks are insufficient evidence.
- Preserve every published assessment as an immutable version, including morning reports and manual re-reviews, with information cutoff, cited evidence, and market-data timestamps. Updates explain changes rather than overwrite earlier reasoning. Evidence-retention mechanics and provider permissions remain unresolved.
- Initial discovery focus: momentum and emerging attention.
- Primary market pattern: sustained momentum across multiple sessions, rather than sudden one-day breakouts. Exact lookback windows and confirmation criteria remain unresolved.
- Use market-first discovery: deterministic price/volume screening narrows the eligible universe before agent research. News is an additional source of evidence and candidates; broad market screening takes priority over Gmail/newsletter ingestion.
- Allow both momentum with supporting evidence and unexplained momentum; prioritize evidence-backed candidates and explicitly label unknown explanations. A plausible explanation must not be presented as a confirmed cause.
- Include an early-watch category for emerging attention without market confirmation. Promotion to the main momentum shortlist requires market confirmation; its measurable criteria remain unresolved.
- Initial asset class: stocks.
- MVP instruments: long-only company shares. Exclude ETFs, options, leveraged and inverse products; short selling is deferred until after the MVP.
- Initial market universe: US-listed stocks available through Trading 212. Account-specific availability and how to verify it remain unresolved.
- Prioritize liquidity; small companies may qualify if they meet the eventual liquidity threshold. Highly speculative, thinly traded stocks are not the discovery priority.
- Intended holding period: a few weeks, superseding the earlier days-to-weeks framing.
- Investor review cadence: once per day.
- Deliver opportunities in the European morning; the investor can act around the US market opening.
- Morning report deadline: 08:00 Europe/Zagreb on US trading days, using timezone-aware scheduling and the US trading calendar. Defer weekend and exchange-holiday reports.
- Support an optional, manually triggered re-review before the US opening to reassess opportunities with information available at that time. Refresh scope remains unresolved.
- Pre-opening re-review may use delayed premarket pricing, with timestamps and delay clearly displayed, and premarket volume where available. This supersedes the earlier requirement for current premarket pricing: delayed, stale, or unavailable pricing cannot validate current entry conditions. The investor checks the live price in Trading 212 before acting. Research updates remain useful independently of entry validation. Provider feasibility remains unverified.
- MVP monitoring is review-only: surface changes during scheduled reviews and manual re-reviews. Defer alerts and continuous monitoring; show assessment timestamps and expiry clearly.
- Material changes include weakening or strengthening market behavior as well as changes in the underlying explanation. Deterministic rules flag measurable changes; research interprets them against the thesis. Repeated coverage of the same information is not independent supporting evidence. Exact measures and thresholds remain unresolved.
- Target a 10–15 minute morning review: up to three main candidates, a compact early-watch list, and material changes to tracked opportunities. Return fewer candidates or none when evidence is weak; deeper research is available on demand.
- MVP delivery surface: a private web dashboard with automatically generated morning reports and manual re-review. Morning delivery means availability in the dashboard. Defer email delivery and a chat interface.
- Run on hosting independently of the investor's computer. Hosting and private access must fit within the overall operating budget; provider and deployment architecture remain unselected.
- Include a simple retrospective view of best-performing stocks to explore missed opportunities. Its universe and evaluation method remain unresolved.
- Build that retrospective prospectively: retain daily eligible universes, signals, and shortlists, then compare subsequent performers. Historical reconstruction before system operation is out of MVP scope. Label absent performers as “not surfaced”; detectability requires evidence available at the time.
- No automatic trade execution.
- MVP sources: market data, public web research and news, and company announcements or filings. Defer Gmail/newsletter ingestion and Reddit integrations.
- Initial total operating budget ceiling: €50/month across market data, LLMs, search, and hosting, subject to lowering later. Provider feasibility and allocation are not yet verified.

## Open decisions

- Verify broker-account eligibility, market-data coverage, delay, licensing and cost within the agreed budget (ticket 01).
- Define measurable liquidity, sustained-momentum ranking, early-watch intake/promotion, candidate novelty, and material-change rules (ticket 02).
- Resolve invalidation behavior, expiry versus renewal, opening reference price, cutoff, execution-cost allowance, interim downside calculation, and missing/corporate-action data policies (ticket 02).
- Select a minimal hosted architecture, bounded research design, model/tool budgets, access controls and failure recovery after feasibility work (ticket 03).
- Assess whether prospective outcomes demonstrate useful selection improvements; do not assume investment edge before evidence accumulates (tickets 11–12).

## Technology selection constraint

AgentCore is optional. Prefer a cheaper solution when it meets the product needs; learning AgentCore does not justify making it an MVP dependency. No replacement architecture has been selected.
