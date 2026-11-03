# Investment intelligence MVP plan

## Notes

- **Current handoff (2026-11-03):** [Issue 01](issues/01-data-feasibility.md#current-completion--2026-11-03) is resolved as research. All 5,078 US-schedule STOCK inputs have identity/coverage audit records; gaps and provider limitations remain explicit. The user chose to carry observed pre-08:00 delivery verification into [05](issues/05-market-snapshots.md#observed-morning-freshness--carried-from-issue-01). [Issue 02](issues/02-screening-and-evaluation-contract.md#answer) is resolved with a versioned domain contract; 03 is now unblocked and remains needs-triage pending architecture/refinement work.
- User chose Alpaca for private personal noncommercial research. Agreement interpretation is a documented limitation, not a repeated provider-clarification gate. No outreach, paid subscriptions or provisioning authorized.
- Use the supplied implement skill for the selected issue. Research tickets authorize investigation, not application adapters. Ticket 03 refines dependent implementation tickets before marking them ready-for-agent.
- Read [spec](spec.md), [discovery](../../docs/discovery.md) and [glossary](../../CONTEXT.md). Use `claimed` / `resolved` for active execution/completion and the documented triage strings for planned work.
- Work is milestone-based, without estimates or a weekly time commitment. No application code or paid resources have been created.
- Git source-workspace metadata is empty/read-only. Current integration checkout: `/tmp/stocks-investigator-integration`, branch `integration/investment-intelligence-mvp`. No changes pushed.

## Milestones

1. Feasibility and design: 01–03.
2. First usable morning discovery loop: 04–08, including evaluation input capture from its first operational run.
3. Tracking and manual re-review: 09–10.
4. Prospective evaluation and not-surfaced review: 11–12. Ticket 11 can proceed after 08 independently of tracking work; outcomes mature over time.
5. Optional purchase recording: 13, after 09.

## Tickets

| ID | Feature | Type | Blocked by | Triage |
| --- | --- | --- | --- | --- |
| 01 | [Verify affordable market data and public research access](issues/01-data-feasibility.md) | research | — | resolved |
| 02 | [Define reproducible screening and evaluation rules](issues/02-screening-and-evaluation-contract.md) | research | 01 | resolved |
| 03 | [Choose a minimal hosted architecture and refine implementation tickets](issues/03-minimal-architecture.md) | research | 01, 02 | needs-triage |
| 04 | [Create the private hosted application foundation](issues/04-hosted-foundation.md) | task | 03 | needs-triage |
| 05 | [Capture broker-eligible market snapshots and calendars](issues/05-market-snapshots.md) | task | 04 | needs-triage |
| 06 | [Implement deterministic momentum screening and baseline snapshots](issues/06-momentum-screening.md) | task | 05 | needs-triage |
| 07 | [Research candidates and publish immutable evidence-backed assessments](issues/07-bounded-evidence-research.md) | task | 06 | needs-triage |
| 08 | [Deliver the scheduled morning review in the private dashboard](issues/08-morning-dashboard.md) | task | 07 | needs-triage |
| 09 | [Track selected opportunities and publish material changes](issues/09-opportunity-tracking.md) | task | 08 | needs-triage |
| 10 | [Refresh an opportunity before the US opening on demand](issues/10-manual-prereview.md) | task | 09 | needs-triage |
| 11 | [Calculate fixed-horizon outcomes and compare with the screener](issues/11-prospective-evaluation.md) | task | 08 | needs-triage |
| 12 | [Show prospective strong performers not surfaced by discovery](issues/12-not-surfaced-review.md) | task | 11 | needs-triage |
| 13 | [Optionally record actual purchases separately from opportunity selection](issues/13-purchase-recording.md) | task | 09 | needs-triage |

## Decisions-so-far

- [Issue 02 completed, 2026-11-03](issues/02-screening-and-evaluation-contract.md#answer): [screen-eval-v1](screening-evaluation-contract.md) defines eligibility, sustained-momentum ranking, three-candidate research/final cap, five-entry early watch, lifecycle/material changes, primary-venue official-open references, 09:25 ET normal freeze, separate refresh cohorts, hypothetical fixed-horizon/action/cost/downside arithmetic, coverage denominators and usefulness feedback. Defaults are prospective design choices; no application code or personal risk limits were introduced. 03 is unblocked but must refine dependent tickets.

- [Issue 01 completed, 2026-11-03](issues/01-data-feasibility.md#completed-research--2026-11-03): [full-universe evidence](coverage-check.md) and [current source/cost comparison](public-research-check.md) support the Alpaca Basic historical-SIP path at an illustrative EUR 32.50/month, including model/search/hosting/storage and tax/FX assumptions. The 5,858-suffix input count was not the universe; all 5,078 US-schedule STOCK records now have an exception-aware identity audit. No complete all-symbol, terminal-outcome or morning SLA is claimed. Massive Basic is an optional untested fallback. User moved observed morning punctuality to 05; 02 owns deterministic eligibility/evaluation rules and 03 owns actual model/architecture selection.

- Historical, superseded by the completed checks above: [Data feasibility investigation, 2026-11-01](data-feasibility.md): full-universe historical SIP is economically plausible; account access, permitted retention/non-display/LLM use, measured coverage and freshness remain unresolved. Ticket 01 is needs-info, not resolved; no provider or scope compromise is selected.

- [Agreed product scope](../../docs/discovery.md): market-first sustained-momentum research for long-only US-listed company shares available on Trading 212, with evidence-backed independent assessments and a few-week holding period.
- [Specification](spec.md): hosted private dashboard, 08:00 Europe/Zagreb report, optional manual pre-opening re-review, up to three main candidates and 10 tracked opportunities, no alerts or trading.
- [Evaluation](spec.md): immutable records, prospective screener comparison, 10/20/30-trading-day horizons with 20 primary, opening reference and interim downside. Research usefulness is distinct from investment edge.
- Total initial operating ceiling EUR 50/month. AgentCore is optional; Alpaca is the user-chosen market-data path, while architecture and the actual model await ticket 03.
- No calendar commitment: the investor chooses tickets as time permits. No application code, paid resources or subscriptions were created during planning.
- No ADR has been created: consequential technical choices remain unresolved. Ticket 03 records qualifying decisions with their alternatives and rationale when made.

## Fog

- Operational pre-08:00 freshness measurement: 05 (explicit user disposition); reconciliation of identity/type/history exceptions and terminal outcomes: 02/05. Current evidence, budget and remaining source-retention limitations: [01](coverage-check.md).
- Broker-account eligibility and symbol identity, including availability changes: 01–02.
- Screening thresholds and early-watch defaults are resolved in [v1](screening-evaluation-contract.md); predictive usefulness remains prospective and unproven.
- Lifecycle/material-change rules are resolved in v1; 03 must refine interfaces and downstream tasks.
- Evaluation conventions are resolved in v1; auction/action coverage gaps and terminal outcomes remain explicit operational limitations for 05/11.
- Architecture, model/tool budgets, source trust boundaries, private access, deployment and failure recovery: 03.
- Whether actual results demonstrate selection value: prospective evidence from 11–12, not a prerequisite claim.

## Comments

Historical planning and investigation notes below are superseded by the current handoff. Reopen a resolved product choice explicitly if feasibility requires changing it; ask the investor one focused question at a time. Routine reversible implementation choices need not restart product discovery.

### 2026-11-02 access verification

Trading 212 live metadata access verified: 17,237 instruments, including 5,858 STOCK entries with US ticker suffixes, and 17 exchanges. [Sanitized check](trading212-access-check.json). Final eligibility/mapping and other ticket 01 gates remain unresolved.

### 2026-11-02 Alpaca findings

[Alpaca investigation](alpaca-investigation.md) documents the free historical-SIP path, request math for 5,858 broker stocks, daily-bar semantics and account/terms/coverage gates. No paid subscription is justified by current evidence. Ticket 01 remains needs-info; actual account type and applicable agreements are the next input.

### 2026-11-03 Alpaca access verification

[Authenticated sample checks](alpaca-access-check.json) verified historical SIP daily bars, extended-session minute bars and paper calendar access with HTTP 200. [Limitations and remaining gates](alpaca-investigation.md#authenticated-access-check--2026-11-03). Ticket 01 remains unresolved.

### 2026-11-03 Nasdaq terms

[User-supplied agreement reviewed](alpaca-investigation.md#user-provided-nasdaq-agreement--reviewed-2026-11-03). Personal analysis supported; precise retention/cloud/LLM authorization remains dependent on applicable combined terms. Nasdaq PDF need not be supplied again.

### 2026-11-03 NYSE terms

[NYSE document reviewed](alpaca-investigation.md#user-provided-nyse-agreement--reviewed-2026-11-03); both user-supplied exchange forms are now checked. Remaining agreement review: applicable Alpaca terms/supplements. Neither exchange document establishes third-party LLM permission.

### 2026-11-03 combined agreement disposition

[Alpaca customer agreement reviewed](alpaca-investigation.md#user-provided-alpaca-customer-agreement--reviewed-2026-11-03). All three supplied forms checked; section 30 leaves reproduction permission unresolved. [Concrete provider question prepared](alpaca-permissions-question.md), not sent. No permission or provider selection inferred.
