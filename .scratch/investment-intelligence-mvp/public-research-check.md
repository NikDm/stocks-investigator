# Public research and cost recheck — 2026-11-03

Supplement to [data feasibility](data-feasibility.md) for [issue 01](issues/01-data-feasibility.md). This is a public-document check, not an authenticated search/hosting test. No subscriptions, resources, provider outreach or adapters were created. The issue's current handoff records the user's decision to proceed with Alpaca; its remaining use/retention interpretations are limitations, not renewed permission gates.

## Recommendation

Continue with Trading 212 metadata, Alpaca Basic historical SIP, SEC filings and issuer announcements, plus bounded Brave Search discovery. Retain Massive Basic grouped daily bars as an optional independent daily fallback requiring its own account and operational test. It does not solve terminal outcomes or prove morning availability. Keep the full eligible broker universe; research only screened candidates and up to ten tracked opportunities. No necessary universe compromise follows from public research cost.

Search supports discovery of sources, not an exhaustive news archive or a causal explanation. Missing or inaccessible supporting sources must produce explicit insufficient evidence/unexplained momentum. Avoid making saved search snippets the assessment's sole evidence: prefer independently retrieved filings and issuer pages.

## What official documentation establishes

**Search.** Brave's current dashboard lists prepaid Search at **$5/1,000 requests**, including Web, news and LLM context; **50 requests/second** and **$5 monthly credit**. Its separate Answers product adds answer/token charges and is unnecessary for this budget. Budget gross charges without credits. [Brave pricing](https://api-dashboard.search.brave.com/app/plans).

Brave's landing page advertises up to $20 free monthly calls across products and says card details prevent abuse. Its FAQ permits saved results only under a plan with storage rights. That headline does not justify assuming $20 of Search credit or storage entitlement. [Brave FAQ](https://brave.com/search/api/).

The September 1, 2026 terms, section 3.2, prohibit creating a database or retaining Search Results beyond transient application operation by default; the definition includes third-party content and generated outputs. They also restrict model training/evaluation/improvement. This differs from transient inference grounding, but does not establish a right to archive payloads. Section 4.4 currently makes attribution optional; the older claim that credit requires attribution is not supported by these current terms. No storage-rights entitlement was verified. Record discovered source URLs from independent retrieval and source-authored factual notes; do not assume copying search snippets is permitted indefinitely. [Brave terms](https://api-dashboard.search.brave.com/terms-of-service).

**Filings.** SEC submissions and XBRL JSON require no account/key and update as filings disseminate; supported forms include domestic and foreign-issuer reports. These are complementary evidence, not a complete news service. [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). SEC also documents company/latest-filings RSS and daily/quarterly indexes, allowing change-driven intake instead of polling thousands of issuers individually. [Developer resources](https://www.sec.gov/about/developer-resources). Downloads are free, requests must identify the application/contact, and the ceiling is ten requests/second across machines. Filings can subsequently be corrected or removed: archive acquisition timestamps, accession/document identifiers and hashes where appropriate. Public access alone does not confer rights to every third-party exhibit. [EDGAR access policy](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data).

**Free discovery alternative.** GDELT describes its database as free/open, with downloadable event/knowledge-graph data and live BigQuery datasets updated every fifteen minutes. It is a possible secondary broad-attention feed. This review did not validate a bounded DOC API entitlement/rate limit, issuer matching, publisher-text rights or reliability; no assumption of a turnkey replacement for Brave is justified. Avoid full-dataset ingest or paid BigQuery scans in this budget. [GDELT data](https://gdeltproject.org/data.html). Issuer IR pages/RSS are another practical primary-source supplement, but feeds, terms and identity must be checked issuer by issuer; no uniform issuer service was established here.

**Market plans.** Alpaca lists Basic at $0, history since 2016, 200 historical requests/minute and a latest-fifteen-minute exclusion; paid Plus is $99/month. Basic real-time IEX is partial venue coverage and must not substitute for explicit historical SIP. [Alpaca plan documentation](https://docs.alpaca.markets/us/docs/about-market-data-api). Actual supplied-credential sample success is recorded separately in [the access check](alpaca-access-check.json), not established by this public browsing.

Massive Basic is $0, five requests/minute, end-of-day and two years of history. Starter is $29/month, unlimited calls, fifteen-minute delay and five years. [Massive plans](https://massive.com/stocks). Grouped daily OHLC/volume for all US stocks is available in one date request on Basic; split adjustment is configurable and OTC is excluded unless requested. The reviewed page gives no precise Basic release-time SLA proving delivery before 08:00 Zagreb. [Grouped daily documentation](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary). These are documented fallback capabilities, not measured completeness, storage permissions or account access.

## Bounded workload and budget assumptions

The old **5,858 US-suffix inputs** remain a conservative bound in this table. The full exchange join finds **5,078 NYSE/NASDAQ-schedule STOCK records** before security-type/identity eligibility; **22 trading days/month**, conservative batches of 100, 90 seed sessions, three new candidates/day and ten tracked opportunities. Missing bars, pagination and retries increase requests.

| Work | Planning volume |
| --- | --- |
| Alpaca daily universe | 59 requests/day; 1,298/month before retries |
| Alpaca seed | About 59 requests if each batch fits 9,000 returned daily bars; retain pagination |
| Massive daily fallback | 22 date calls/month, or 44 raw plus adjusted; 90–180 seed calls, at least 18–36 minutes at five/minute |
| Full-universe opening references | Allow another 51 requests/day for 5,078 inputs, 1,122/month before pagination/retries; needed for like-for-like not-surfaced evaluation, not just selected candidates |
| Bounded delayed re-review | Up to 13 symbols, allow 15 requests/day = 330/month |
| Search | 3 candidates × 3 + 10 tracked × 1 + 3 broad queries + 8 re-review reserve = 30/day = 660/month; hard cap 1,000 = $5 gross |
| SEC/issuer retrieval | Allow 50 lightweight fetches/day = 1,100/month, plus changed documents; cap bytes and retries separately |

For hosting, Workers Paid starts at $5/month and includes ten million requests and thirty million CPU milliseconds; network waits do not by themselves imply equivalent CPU consumption. Architecture must still fit scheduled-task limits and authentication requirements. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

R2 Standard includes 10 GB-month, one million Class A and ten million Class B operations/month; excess storage is $0.015/GB-month, with free Internet egress. [R2 pricing](https://developers.cloudflare.com/r2/pricing/). Paid D1 includes 5 GB, fifty million monthly rows written and twenty-five billion read; excess storage is $0.75/GB-month. Indexes add writes/storage. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

At an assumed 250 bytes per daily row, 5,858 × 22 adds **32.2 MB/month** before indexes, snapshots, evidence and backups. Another compact 250-byte opening-reference record per 5,078 inputs adds about **27.9 MB/month**; preserve the selected event/venue and missing-reference status without retaining whole-universe minute histories. A conservative **1 GB/month aggregate growth** allowance reaches 12 GB after a year, beyond some included capacity, but compact object archives remain cheap. This is arithmetic, not a measured encoding or evidence size; avoid universe-wide minute retention. Reserve $1/month storage/backup initially and measure growth/operations.

| Allocation | Alpaca / optional free Massive | Paid Massive Starter replacement |
| --- | --- | --- |
| Market / Search / hosting / storage | $0 / $5 / $5 / $1 | $29 / $5 / $5 / $1 |
| LLM allocation | $15 | $0 |
| Subtotal | $26 | $40 |
| With assumed 25% tax reserve, USD=EUR parity | EUR 32.50 | EUR 50 |

Parity and tax reserve are conservative assumptions, not current FX, an invoice or tax advice; payment FX fees need headroom. A concrete price sanity check is Claude Haiku 4.5 direct API at $1/M input and $5/M output tokens: the estimated 3.52M input/0.352M output workload is **$5.28/month**, or **$10.56 with a 2× retry/tool-token allowance**, within $15. This is a budget feasibility example, not a model selection, quality evaluation or account entitlement test; count all tool/agent turns and any billable thinking/output, and avoid unbudgeted provider search tools. Ticket 03 must select, evaluate and cap the actual model/workload. [Anthropic model pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Haiku product pricing](https://www.anthropic.com/claude/haiku). Paid Starter leaves no LLM headroom under this illustration and is not the recommended default.

## Original reference recheck

The [Brave use case](https://brave.com/search/api/use-cases/#market-research-agent) and [AWS demo repository](https://github.com/aws-samples/sample-brave-demos) were re-opened on 2026-11-03. They demonstrate market/company research and direct HTTP or MCP integration with AgentCore; they do not establish broker security mapping, a complete market feed, archival rights or investment edge. No deployment scripts were run. The [referenced AWS re:Post article](https://repost.aws/articles/ARLNfaFmWvRNe0I9webR9DnQ) again returned HTTP 403; its contents remain unverified. These remain optional architecture candidates for ticket 03.

## What remains unverified

No Brave key, result payload, storage-rights plan, SEC fetch from the future hosting environment, issuer-feed coverage, or Cloudflare deployment was tested. API quotas are not delivery guarantees. Public source discovery is affordable in arithmetic; exact evidence replay requires retaining source material where allowed and explicitly recording gaps when only links/notes can be retained. The user's Alpaca decision does not establish Brave or publisher storage consent. Full-universe mapping, corporate-action outcomes and observed pre-deadline freshness are separate practical checks; this note does not close issue 01 on its own.
