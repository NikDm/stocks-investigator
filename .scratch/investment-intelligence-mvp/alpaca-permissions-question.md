# Alpaca market-data permission clarification — draft, not sent

Subject: Basic historical SIP data — private personal research app permissions

I have an Alpaca account and can retrieve historical stock bars using `feed=sip`. I am evaluating Basic data for a private application used only by me to research my own investments, with no trading, public redistribution, clients or commercial use.

The proposed application would:

- Download daily OHLCV for roughly 5,858 US stock listings, with bounded delayed premarket requests for selected stocks.
- Calculate momentum/ranking signals deterministically.
- Run on a hosted server with authenticated single-user access.
- Retain dated raw observations, derived signals, assessment records and backups for prospective 10/20/30-trading-day evaluation and reproducibility. Storage duration is not yet selected; please state any maximum and post-termination requirements.
- Potentially send selected raw observations or derived signals to a third-party LLM API for inference, without model training. Exact model provider/payload will be chosen after permission is established. Please distinguish raw data from derived signals and identify any approved processor conditions.

Section 30 of the V26.2026.07 Customer Agreement requires written consent for reproduction/distribution, and the Nasdaq/NYSE subscriber forms restrict access/furnishing to others. Please clarify:

1. Which agreements and subscriber classification apply to my account and delayed historical SIP use? Does the brokerage Customer Agreement apply if my account is Paper Only?
2. Does my existing entitlement permit the private automated calculations, hosted deployment and persistent snapshots/backups described above? What retention, attribution, security, non-display or additional licensing conditions apply?
3. Is the third-party inference use permitted? If only some payloads or providers qualify, what are the conditions?
4. If additional written consent or exchange authorization is needed, can you provide it or identify the correct process and recurring fees?

Please distinguish permissions granted by Alpaca from any separate exchange permissions I must obtain. I am not requesting a subscription purchase or account upgrade.
