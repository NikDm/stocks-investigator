# Data feasibility — initial investigation 2026-11-01

## Current evidence — 2026-11-03

Start with the [practical full-universe checks](coverage-check.md) and [public-research/cost recheck](public-research-check.md). They supersede historical account-access, permissions-gate and attribution statements below. The user explicitly chose to proceed with Alpaca for this personal noncommercial application; do not reopen agreement collection or send the provider-question draft. This is a project decision, not provider consent. Live catalogue, historical SIP and corporate-action access are verified; all 5,078 US-schedule STOCK identities have been checked, with explicit unresolved cases and 90-session coverage evidence. Pre-08:00 delivery has not been observed, because today's checks started after that deadline. No adapters, paid resources or subscriptions have been created.

Recommended combination remains Trading 212 metadata + Alpaca Basic historical SIP + OpenFIGI + SEC/issuer evidence + bounded Brave discovery. Massive Basic grouped daily bars is an untested optional fallback, not an automatic substitute. Budget illustration is EUR 32.50/month including a 25% reserve at USD/EUR parity; a published-price model example fits the $15 allowance, while ticket 03 still must select/evaluate/cap the actual model and workload. Brave snippet archival needs storage rights; independently retrieved evidence has source-specific retention constraints. The user decision about Alpaca does not establish other providers' consent.

The remainder is the dated investigation history. Its former gates are superseded only where the current evidence explicitly says so. Ticket 01 is resolved as feasibility research with the documented limitations. The user explicitly moved observed pre-08:00 delivery verification to ticket 05. Ticket 02 is now ready for its rule contract; ticket 03 still depends on 02. Do not interpret feasibility as complete all-symbol coverage or operational readiness.

## Initial investigation

Research for [ticket 01](issues/01-data-feasibility.md), against the [specification](spec.md). Official public documentation was reviewed on this date. Prices and entitlements can change. No subscription, account, resource, adapter or application was created; no authenticated market-data response or investor account eligibility was tested. Documentation examples are not verification of this account's access.

## Finding

The full daily universe is economically plausible within EUR 50/month using **Trading 212 metadata + Alpaca Basic historical SIP + OpenFIGI + SEC/company sources + bounded Brave Search**. This is the recommended path to verify, not a selected provider combination. **Permitted use, immutable retention, account access and actual universe coverage remain blocking gates.** Documentation alone does not establish a permitted, complete operational solution. Keep ticket 01 unresolved and tickets 02–03 blocked.

Fallback: Massive Basic grouped daily bars plus Alpaca delayed historical SIP for optional premarket research, if permissions for both are established. Massive Starter can remove dependence on Alpaca for delayed intraday bars, but leaves little budget headroom and has an explicit display-only default in its terms. No handpicked universe is proposed.

## Broker universe and identity

Trading 212 documents authenticated live and demo APIs for Invest and Stocks ISA. The instruments endpoint returns all accessible instruments, refreshed every ten minutes, limited to one request per 50 seconds; exchange schedules have one request per 30 seconds. Instrument fields include broker ticker, ISIN, type, currency, name, workingScheduleId and extendedHours. One catalogue and one schedule request per trading day should suffice. The investor's account type, API availability and account restrictions remain unverified. Demo catalogue access would not prove live eligibility. A catalogue entry is evidence of accessible metadata, not an assurance that a particular purchase can currently execute. See [API scope](https://docs.trading212.com/api/instruments), [endpoint schema](https://docs.trading212.com/api/instruments/instruments) and [key availability](https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key).

Proposed mapping: preserve the broker ticker and ISIN in each dated catalogue; resolve ISIN using OpenFIGI, constrain to the US listing, retain listing/composite/share-class FIGIs plus provider symbol and validity dates. An ISIN alone does not identify a trading venue; a company CIK does not distinguish share classes. Never strip `_US_EQ` and assume the remainder is a provider symbol. Validate common shares, ADRs/share classes, exchange and currency; quarantine ambiguous matches and publish counts/reasons rather than silently shrink coverage. Product treatment of ADRs/preferred shares needs ticket 02 clarification. Preserve removed instruments and symbol aliases for evaluation.

OpenFIGI supports identifier mapping, with 10 jobs/request and 25 requests/minute without a key, or 100 jobs/request and 250 requests/minute with one. A 6,000-instrument initial mapping is 600 unauthenticated requests, at least 24 minutes; thereafter map changes only. FIGI identifiers and associated metadata are openly reusable; this does not license the market data subsequently attached to them. Sources: [mapping documentation](https://www.openfigi.com/api/documentation), [reuse FAQ](https://www.openfigi.com/about/faq), [permanent identifiers](https://www.openfigi.com/v2assets/figi-allocation-rules-Cl_spCC6.pdf).

## Two practical combinations and a paid fallback

| Combination | Daily broad screening | Delayed premarket | Limits and cost | Blocking caveat |
| --- | --- | --- | --- | --- |
| A: Trading 212 + Alpaca Basic + OpenFIGI + SEC/IR + Brave | Historical SIP bars explicitly requested, including daily OHLC/volume | Historical SIP trades/bars ending at least 15 minutes ago | Alpaca Basic $0; 200 historical calls/minute; history since 2016 | Account/entitlements, delisted completeness and hosted storage/non-display/LLM permission unverified |
| B: same common sources + Massive Basic daily + Alpaca Basic premarket | One grouped market response per date, intersected with dated broker universe | Alpaca historical SIP | Massive Basic $0, 5 calls/minute, 2 years REST history | Both licences/access needed; Massive display-only default; exact EOD release time before 08:00 Zagreb unverified |
| C: same common sources + Massive Starter | Same grouped daily endpoint | 15-minute delayed intraday aggregates | $29/month, unlimited API calls, 5 years history | Permission unresolved; narrow all-in budget; flat files arrive too late for morning report |

Alpaca's [plan table](https://docs.alpaca.markets/us/docs/about-market-data-api) distinguishes free Basic from $99/month Algo Trader Plus. Paid real-time SIP is outside this budget. The [FAQ](https://docs.alpaca.markets/us/docs/market-data-faq) explicitly permits historical SIP queries without a subscription when `end` is at least 15 minutes old. **IEX is only one exchange: its volume cannot represent consolidated US market volume.** Request `feed=sip` explicitly and treat an entitlement failure as unavailable, never silently substitute IEX. SIP covers reported consolidated activity, subject to trade-condition aggregation rules, corrections and missing observations; it is not a guarantee every symbol has a bar.

Alpaca's [bar endpoint](https://docs.alpaca.markets/us/reference/stockbars) accepts multiple symbols and up to 10,000 total bars per page, with pagination, raw/split/dividend adjustment choices and dated symbol mapping. [Massive grouped bars](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary) include US-stock OHLC/volume in one date request, Basic EOD or Starter 15-minute delay, and split adjustment. Massive advertises consolidated venue coverage and active/delisted stocks on its [stock page](https://massive.com/stocks). These coverage claims require a measured join against the broker list; neither source proves complete coverage of the investor's account.

## Opening reference, session times and corporate actions

An OHLC field named `open` is not automatically the agreed regular-session reference or official primary-exchange opening auction. Alpaca documents [trade-condition rules](https://docs.alpaca.markets/us/v1.1/docs/market-data-faq) and [extended-hours bars](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data). Before selection, verify regular-session semantics; a proposed alternative is the first qualifying consolidated trade/bar at or after 09:30 America/New_York, retrieved later, with missing prints explicit. Ticket 02 must agree the exact field and freeze cutoff. Preserve both raw observations and adjustment version; later splits must not rewrite published assessments.

For optional pre-opening re-review, query only a bounded cohort of at most 10 tracked opportunities plus three main candidates. Record trade/bar event time, retrieval time, feed, session and configured delay. A bar timestamp marks an interval, not necessarily the last trade. No print is unavailable, not a zero price or fresh quote. A 15-minute cutoff plus a small clock margin avoids requesting unavailable recent SIP. Delayed prices cannot validate current entry conditions. At 08:00 Zagreb it is ordinarily 02:00 New York, or 03:00 during DST mismatch: that morning's 04:00 premarket need not have begun. The morning report should use the previous completed session; premarket belongs to the later optional re-review.

Alpaca provides splits, dividends, mergers, name changes and worthless removals but explicitly gives **no creation-time guarantee** in its [corporate-actions API](https://docs.alpaca.markets/us/reference/corporateactions-1). Rename mapping can lag until the following day ([FAQ example](https://docs.alpaca.markets/us/v1.1/docs/market-data-faq)). Do not presume a delisted stock disappears harmlessly: retain identity, acquisition consideration and unresolved outcomes, and prevent survivorship bias. Complete delisting/merger proceeds and action timeliness have not been verified for either combination. No source examined establishes a complete, timely terminal-price service within budget.

Use exchange trading days and early closes, not weekdays. Alpaca's [calendar](https://docs.alpaca.markets/us/reference/legacycalendar) exposes sessions; cross-check against [NYSE published holidays and hours](https://www.nyse.com/trade/hours-calendars). Schedule with Europe/Zagreb and America/New_York timezones and account for DST mismatch. Calendar entitlements, exceptional closures and future-year refresh remain operational checks.

Massive's [daily flat files](https://massive.com/docs/flat-files/stocks/day-aggregates) are not included in Basic and are documented as updated at 11:00 ET for the previous day. That is after 08:00 Zagreb. Do not use that delivery mechanism for the morning deadline; grouped REST freshness must be tested separately.

## Public research and evidence retention

Brave Search currently lists $5/1,000 Search requests, $5 monthly credit and 50 queries/second. Count Web and News against the same bounded search budget. Do not rely on the credit: it requires account setup and attribution, and the [help page](https://api-dashboard.search.brave.com/documentation/resources/help-feedback) says card validation is required even for zero prepaid balance. Sources: [current pricing](https://brave.com/search/api/) and [pricing announcement](https://brave.com/blog/most-powerful-search-api-for-ai/). Search is discovery of evidence, not proof of a causal explanation or a licensed full-news archive.

SEC offers unauthenticated submissions/XBRL JSON and linked filings, including 8-K/10-Q/10-K and foreign-issuer forms. Use stable CIK/accession/document URLs with acquisition timestamps, not just mutable search snippets. See [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). Pace below the SEC's [10 requests/second ceiling](https://www.sec.gov/filergroup/announcements-old/new-rate-control-limits), identify the application, cache and fetch only changed filings. Add issuer investor-relations announcements/RSS where access permits. US listing does not imply every issuer files the same forms; CIK mappings and company-source URLs need validation.

Retention is a release gate, not an inference from API availability:

- **Alpaca:** [general terms](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) support personal noncommercial use and incorporate other agreements. These do not by themselves establish permission for indefinite raw-data retention, hosted automated screening, or transmission to an external LLM. Check actual subscriber/exchange agreements and obtain clarification where needed.
- **Massive:** [market-data terms](https://massive.com/legal/market-data-terms-of-service) default to display-only absent a subsequent agreement. Automated screening/derived assessments, cloud copies, archival retention and external LLM processing cannot be assumed permitted. Do not treat Starter as a solution until this is resolved.
- **Brave:** its [FAQ](https://brave.com/search/api/) allows result storage only with a plan including storage rights; the examined public pricing did not prove that entitlement for the proposed account. Brave results do not confer third-party publisher rights. Store result text only after entitlement is established.
- **Company/news/filings:** retain URLs, accession IDs, timestamps, hashes, factual notes and minimal justified excerpts; evaluate each source's terms before storing full text or sending it to a model. SEC API accessibility does not establish universal copyright ownership over every attached exhibit. A URL/hash alone cannot reconstruct evidence that later changes; if source-text storage is disallowed, immutable cited reasoning remains possible but exact evidence replay is a limitation requiring an explicit product decision.

The original [Brave use case](https://brave.com/search/api/use-cases/#market-research-agent) and [AWS sample repository](https://github.com/aws-samples/sample-brave-demos) demonstrate search/AgentCore integration, not stock-data eligibility or investment edge. The sample README's 2,000-free-query claim conflicts with current Brave pricing; use current provider terms. The [referenced AWS re:Post article](https://repost.aws/articles/ARLNfaFmWvRNe0I9webR9DnQ) returned HTTP 403 in this research session, so its contents were not verified. No sample deployment was run.

## Request and cost model

Planning assumptions, not observed universe size: N = all eligible broker company-share listings, modelled at 6,000 and stress-tested at 10,000; 22 trading days/month; 90-session seed; 10 active tracked opportunities; three researched candidates/day; one manual re-review/day at most. No news search per universe member: deterministic market screening precedes research. A bounded broad-news query allowance supplies early-watch intake without guaranteeing exhaustive attention coverage.

| Work | Estimated volume |
| --- | --- |
| Broker metadata | 44 requests/month; 2/trading day |
| Alpaca full daily universe | With conservative batches of 100 symbols: 60/day at N=6,000, 100/day at N=10,000, or 1,320–2,200/month before retries |
| Alpaca 90-session seed | About 60–100 requests if each 100-symbol batch fits 9,000 bars; pagination/retries can increase this; at 200/min theoretical minimum under one minute, use slower pacing |
| Massive grouped daily | 22 raw requests/month, or 44 raw + adjusted; 90–180 initial history calls. At 5/min, 18–36 minutes for seed |
| Actions, identity changes, calendars | Allow 10 API requests/day plus an initial FIGI mapping; exact pagination depends on observed responses |
| Optional premarket cohort | Up to 13 symbols; budget 15 requests/re-review including pagination, 330/month. Request only a bounded recent interval |
| Public research | 3 new candidates × 3 searches + 10 tracked × 1 + 3 broad-news searches = 22/day; reserve 8/day for re-review: 660/month, with a hard cap of 1,000 = $5 gross |
| SEC/issuer retrieval | Allow 50 lightweight fetches/day = 1,100/month plus change-only document downloads; no whole-universe daily filing polling required |

These are deliberately conservative batch assumptions; URL limits, pages returning fewer bars, new-listing history gaps and retries must be measured. The 200/min Alpaca rate is adequate in arithmetic, but is not a delivery SLA. Reject incomplete/stale runs visibly.

Budget illustration uses **1 USD = EUR 1.00**, **25% consumption-tax reserve**, no free credits and no verified invoice/tax status. These are conservative planning assumptions, not current FX or a tax determination. EUR cost = USD subtotal × 1.00 × 1.25; at this reserve the pretax ceiling is $40. A 2% payment FX fee would further reduce headroom.

| Monthly allocation | A/B | C |
| --- | --- | --- |
| Market data | $0 | $29 |
| Search hard cap | $5 | $5 |
| Hosting allowance | $5 | $5 |
| Storage/backup allowance | $1 | $1 |
| LLM hard allowance | $15 | $0 remaining at tax-reserved ceiling |
| Subtotal / with 25% reserve | $26 / EUR 32.50 | $40 / EUR 50 before any LLM |
| Headroom under EUR 50 | EUR 17.50 | EUR 0 |

The LLM amount is an allocation, **not a verified model quote or proof of sufficient quality**. Example bounded workload: 286 candidate/tracked assessment units/month, around 2.86M input and 0.286M output tokens at 10k/1k each, plus at most 22 cohort re-reviews of 30k/3k: total about 3.52M input and 0.352M output. Ticket 03 must select and price a model, tool overhead and retries within $15; cap exhaustion yields partial/insufficient research. No provider choice is implied. Paid Starter would require much lower search/LLM/hosting allowances or lower verified tax/FX; it is not established feasible at full scope.

Hosting reference: [Cloudflare Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) starts at $5/month; compute limits, scheduled workload and private authentication still need design. [R2](https://developers.cloudflare.com/r2/pricing/) and [D1](https://developers.cloudflare.com/d1/platform/pricing/) provide small-storage allowances; paid D1 includes 5 GB. At 6,000 × 22 × 250 bytes, daily market rows add roughly 33 MB/month, before signals/indexes/backups. Budget up to 1 GB/month for market, evidence and backups; 12 months can exceed included allowances. Retain compact daily full-universe snapshots and assessment evidence, avoid full-universe minute data, and measure storage growth. Storage affordability never substitutes for provider retention permission.

## Outstanding gates and smallest possible compromise

1. Confirm the investor has a supported Trading 212 live Invest/ISA account with metadata API availability; a redacted instrument sample/export is enough initially, no secrets in chat.
2. Verify lawful hosted screening, raw/derived storage duration, historical replay and external LLM transmission for the actual Alpaca/Brave plans (and Massive if used). Inspect actual agreements; ask provider support only when authorized. No outreach occurred.
3. With already-authorized access, measure the full broker/provider join, sample share classes/ADRs/new listings/delistings/actions, previous-session availability before 08:00 Zagreb, and delayed premarket timestamps. No credential search or authenticated example was run during this public-doc investigation.
4. Resolve the exact opening reference/action/missing-outcome contract in ticket 02; select and price LLM/hosting in ticket 03. Git restoration is a separate workspace prerequisite for implementation, not evidence of data feasibility.

**No necessary universe compromise has yet been demonstrated.** Try the no-subscription broad-market paths first. If the only uncovered requirement is premarket entitlement, the smallest proposed compromise is to retain full-universe daily screening and allow pre-opening re-review from news/filings with pricing explicitly unavailable; this changes the expected refresh capability and is not agreed. It does not fix retention or delisting gaps. If permitted evidence retention cannot be established, there is no compliant workaround shown here and no implementation-ready combination.

The single most useful question now: **Does your Trading 212 live Invest account expose API access with instrument-metadata permission?** A yes/no answer establishes the first account-specific gate without asking for credentials or prematurely changing the product scope. If a scope compromise later becomes necessary, ask it separately before treating it as accepted.

## Live Trading 212 check — 2026-11-02

With user-supplied local credentials, GET requests to the live `/equity/metadata/instruments` and `/equity/metadata/exchanges` endpoints both returned HTTP 200. The catalogue contained 17,237 instruments: 10,515 STOCK, 6,702 ETF and 20 WARRANT. Of the STOCK entries, 5,858 had the `_US_EQ` ticker suffix; all of those had an ISIN. Exchanges returned 17 entries. See [sanitized check summary](trading212-access-check.json). No account, portfolio or order endpoints were requested; credentials were not included in the output or saved results.

This verifies live metadata access. The suffix count is an initial mapping input, not the final eligible company-share universe or a guarantee of purchase execution. Share-class/listing validation, market-provider coverage, storage/use permissions and remaining feasibility gates still apply. Earlier statements about account access being untested are superseded by this check.

## Alpaca follow-up — 2026-11-02

See [detailed primary-source investigation](alpaca-investigation.md) for updated account-entitlement caveats, observed-universe request math, daily volume/open semantics, free OTC limitations and specific agreement clauses. This supplements the earlier general permissions discussion; no authenticated Alpaca test or provider selection has occurred.
