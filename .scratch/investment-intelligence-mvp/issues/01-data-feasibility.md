# 01 — Verify affordable market data and public research access

Status: resolved
Type: research
Blocked by: none

## Current completion — 2026-11-03

Resolved as research. [Practical full-universe evidence](../coverage-check.md) checks all 5,078 US-schedule STOCK identities, retains mapping/coverage exceptions, and verifies 90-session SIP samples, corporate actions, historical renames/delistings, calendar and auction access. [Public-source comparison and all-in budget](../public-research-check.md) recommends the user-selected Alpaca path with an optional untested Massive Basic fallback. Complete all-symbol data and terminal outcomes are not guaranteed. The user explicitly moved observed pre-08:00 delivery measurement into ticket 05; it is not verified by today's after-deadline checks. Ticket 02 can proceed; 03 still depends on 02. No application adapters, paid resources, subscriptions, outreach or trading calls.

## Prior handoff — 2026-11-03

The user explicitly decided to proceed with Alpaca for this private, personal, noncommercial research application. Treat remaining data-use/retention/LLM interpretation questions as documented limitations, **not blockers requiring provider clarification or more agreement collection**. This decision supersedes earlier permission-gate and needs-info statements below; it is a project decision, not a claim of provider consent. Do not send the drafted provider question.

Trading 212 live instrument/exchange access and Alpaca historical SIP daily/minute samples plus paper-calendar access have succeeded. All three supplied Nasdaq, NYSE and Alpaca customer agreements have been reviewed. Credentials are in the local ignored `.env`; never print or commit them.

Continue with practical issue 01 work:

1. Validate full-universe identities and Alpaca coverage against the Trading 212 catalogue; the observed 5,858 US-suffix STOCK entries are mapping inputs, not a finalized eligible universe.
2. Check corporate actions, symbol changes, delistings and missing-outcome behavior.
3. Verify previous-session freshness for the 08:00 Europe/Zagreb report and document opening/volume/premarket semantics and limitations.
4. Finalize the recommended combination, fallback and all-in cost/request/storage estimate within EUR 50/month, including remaining public-research-source feasibility.

Use existing [feasibility findings](../data-feasibility.md), [Alpaca report](../alpaca-investigation.md), [Trading 212 check](../trading212-access-check.json) and [Alpaca check](../alpaca-access-check.json). No paid subscriptions or provisioning authorized. Issue 01 remains open; tickets 02–03 remain blocked until its practical acceptance checks are completed.

Integration checkout: `/tmp/stocks-investigator-integration`, branch `integration/investment-intelligence-mvp`; source workspace `.git` is empty/read-only. Check that the temporary checkout still exists before using it. No changes have been pushed.

## Context

Read [spec](../spec.md), [map](../map.md), [discovery](../../../docs/discovery.md) and [glossary](../../../CONTEXT.md). Resolve dependencies before starting. This ticket is a plan, not authorization to implement during discovery. Downstream task details must be refined by ticket 03 before they are marked ready-for-agent.

## Scope and acceptance

Can a permitted, sufficiently broad data combination meet this product's needs within EUR 50/month total?

Investigate official documentation and small read-only examples where access is already available. Do not buy subscriptions, create paid resources, request credentials unnecessarily, or implement adapters.

Cover Trading 212 instrument-list access and account availability; mapping company shares to a stable external identity; complete daily price/volume coverage and opening prices; delayed premarket prices with timestamps; corporate actions and delisted symbols; calendars; public news/search and company filings. Compare at least two realistic data combinations, including rate limits, request-volume estimates, taxes/currency assumptions, hosting/LLM budget headroom, storage and evidence-retention permissions. Distinguish exchange-wide volume from partial-feed volume.

Read the original references as candidates, not requirements:
- https://repost.aws/articles/ARLNfaFmWvRNe0I9webR9DnQ
- https://brave.com/search/api/use-cases/#market-research-agent
- https://github.com/aws-samples/sample-brave-demos

Deliver a dated source-linked comparison, a recommended combination and fallback, and a request/cost estimate for the full daily universe plus up to 10 tracked opportunities. State explicitly what cannot be satisfied. If the combination is infeasible, propose the smallest product compromise and ask one focused question before treating it as agreed. Do not silently replace broad screening with a handpicked universe.

## Completion

Record the evidence or delivered behavior, relevant checks and limitations in `## Answer`. Update the map with the answer link. Use the repository's claim/completion workflow when work actually starts; do not mark planned work complete.

## Comments

Created from the product discovery interview. Work is milestone-based with no weekly time commitment; the investor picks up features as time allows.

## Answer

### Completed research — 2026-11-03

- [Full-universe checks](../coverage-check.md): all 10,515 broker STOCK records classified by exchange; 5,078 NYSE/NASDAQ-schedule inputs checked by ISIN. The suffix filter had included 784 OTC/non-US records and missed four US records. 5,004 listed-only unique FIGI identities, 66 more unique identities from unlisted retry, three ambiguous and five unidentified; every input remains in the audit.
- SIP history: 4,989 of the 5,004 listed-only unique symbol candidates have previous-session bars; 4,917 have all 90 seed sessions. Record missing/type/listing/identity states explicitly; full catalogue coverage is not promised. Fourteen non-asset symbols were probed separately, demonstrating asset availability differs from market-data availability.
- Live actions, rename/as-of mapping, delisted historical bars, previous-session extended/regular minute bars, opening auctions and holiday/early-close calendars were checked. Complete/timely terminal outcomes are not established; missing outcomes must remain explicit under ticket 02's contract. [Sanitized samples](../market-semantics-check.json).
- [Source/cost recheck](../public-research-check.md): Trading 212 + Alpaca Basic SIP + OpenFIGI + SEC/issuer evidence + bounded Brave discovery; optional Massive Basic daily fallback remains untested. EUR 32.50/month illustration includes data, search, hosting, storage, $15 model allowance and assumed 25% reserve at USD/EUR parity; a published-price model example fits the allowance. Include full-universe opening-reference requests/storage. No paid subscriptions/provisioning.
- Alpaca agreement uncertainty remains a limitation per the user's prior decision. Brave snippet storage rights and issuer-specific retention constraints are distinct; archive independently retrieved permitted source evidence, not an assumed search-results database. No exhaustive public-news or replay guarantee.
- User explicitly chose to carry actual pre-08:00 freshness measurement into [ticket 05](05-market-snapshots.md#observed-morning-freshness--carried-from-issue-01). Today's post-deadline observations do not establish punctuality.
- Validation: full catalogue/identity row accounting, JSON/JSONL parsing, row-file SHA-256, request/pagination/status checks, local document links, budget arithmetic, secret-value exclusion and Git whitespace checks. This research-only repository has no application/typecheck/test suite; no adapter code or tests were added. Independent Standards and Spec reviews against the session's starting commit found no actionable findings.

Earlier answers below are historical and are superseded by this completion.


2026-11-01: [Source-linked feasibility investigation](../data-feasibility.md) compares Alpaca Basic historical SIP, Massive Basic plus Alpaca, and Massive Starter. Broad daily screening appears affordable with free historical SIP, but a permitted complete combination has not been verified. Account-specific broker access, full-universe identity/coverage, pre-deadline freshness, delisting/action outcomes and hosted screening/retention/LLM permissions remain gates. Public documentation was checked; no authenticated examples, accounts, subscriptions, provisioning or adapters were created. Paid Starter leaves no LLM headroom under the conservative tax/FX illustration. No universe or product compromise was agreed.

Trading 212 live metadata access was subsequently verified (see below). Provider permission and coverage checks remain necessary; this ticket is not resolved and dependent tickets remain blocked.

### 2026-11-02 live-access verification

Live instrument and exchange metadata both returned HTTP 200 using user-provided credentials. See [check summary](../trading212-access-check.json) and [updated findings](../data-feasibility.md#live-trading-212-check--2026-11-02). Account metadata access gate verified; ticket remains needs-info for provider permissions and coverage checks. No account/portfolio/order endpoints called.

### 2026-11-02 Alpaca follow-up

User requested an Alpaca investigation. Checking official coverage, account requirements, entitlements, rate limits and data-use terms; no paid subscriptions or support outreach authorized.

### Alpaca investigation result — 2026-11-02

[Primary-source report](../alpaca-investigation.md): Basic historical SIP is documented as free with a 15-minute exclusion and 200 historical requests/minute; approximately 59 requests/day cover the observed 5,858-stock input in planned 100-symbol batches. Paper Only IEX wording leaves actual historical SIP entitlement untested. Daily volume includes eligible extended-hours prints and daily open is not guaranteed to be the official opening auction. No free OTC continuation is established for delisted outcomes. The report distinguishes explicit agreement restrictions from unresolved private-storage/cloud/LLM interpretations. No authenticated Alpaca tests or accounts were created. Next input: whether an Alpaca account exists, its Paper Only/live status, Basic plan and actual applicable agreements (redacted; no secrets in chat). Ticket remains unresolved pending entitlement, permissions and coverage checks.

### 2026-11-03 authenticated Alpaca samples

Historical SIP daily and premarket/opening-minute sample queries and the paper calendar all returned HTTP 200. See [sanitized check](../alpaca-access-check.json) and [report update](../alpaca-investigation.md#authenticated-access-check--2026-11-03). Historical SIP access is verified for the supplied credentials and sample dates. Full-universe coverage/mapping, actions/delistings, morning freshness and applicable storage/transmission terms remain open; ticket stays needs-info. No trading/account endpoints or raw price-value archival.

### 2026-11-03 Nasdaq document review

Reviewed the user-provided Nasdaq Version 2013.1 agreement. [Findings](../alpaca-investigation.md#user-provided-nasdaq-agreement--reviewed-2026-11-03): personal-use permission supports analysis; no numeric retention cap found, but third-party access restrictions and reconstructable-derived-information coverage leave hosted/LLM payload permission unsettled. Nasdaq document supplied; do not request it again. Applicable Alpaca and NYSE/CTA terms still need checking. Ticket remains needs-info.

### 2026-11-03 NYSE document review

[Supplied NYSE Exhibit B reviewed](../alpaca-investigation.md#user-provided-nyse-agreement--reviewed-2026-11-03). Personal nonbusiness use is contemplated; paragraph 5 restricts furnishing to other entities, and paragraph 1 includes derived information. No numeric retention cap found. Nasdaq and NYSE PDFs are now reviewed; applicable Alpaca terms/supplements remain to check. No outreach. Ticket remains needs-info.

### 2026-11-03 Alpaca customer-agreement review

Reviewed supplied V26.2026.07 customer agreement and official current copy. [Findings](../alpaca-investigation.md#user-provided-alpaca-customer-agreement--reviewed-2026-11-03): section 30 separately restricts reproduction and distribution without written consent. All three supplied agreements reviewed; no repeated document request needed. [Clarification draft](../alpaca-permissions-question.md) prepared, not sent. Storage/hosted/LLM scope and actual account applicability need clarification; independent coverage/freshness gates remain open.

### 2026-11-03 user decision

User considers Alpaca appropriate for this personal noncommercial app and asked that permissions uncertainty no longer block progress. Proceed on that basis; retain findings as limitations. Status returned to ready-for-agent for practical feasibility checks. No provider outreach or repeated agreement request needed.

### 2026-11-03 freshness acceptance disposition

During practical checks, the user chose “Carry freshness check into 05.” Feasibility may close with pre-08:00 delivery explicitly unverified; [ticket 05](05-market-snapshots.md#observed-morning-freshness--carried-from-issue-01) now requires the actual pre-deadline measurement. This does not make today's post-deadline samples evidence of morning punctuality. Full-universe identity and coverage checks subsequently completed; see the completion answer above.
