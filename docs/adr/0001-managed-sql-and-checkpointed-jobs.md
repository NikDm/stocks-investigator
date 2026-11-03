---
status: proposed
---

# Managed SQL and checkpointed jobs for the private morning review

For the [MVP architecture](../../.scratch/investment-intelligence-mvp/architecture.md), propose a single TypeScript Cloudflare Worker with D1 and short checkpointed Cron stages instead of a VPS with SQLite or separately paid application/Postgres/worker services: this trades runtime and database limits for fewer unattended operating responsibilities within EUR 50/month. Persist immutable assessment/cohort artifacts separately from resumable job state, with atomic publication and application-owned source/spend enforcement; the model may interpret evidence but cannot own eligibility, calculations, lifecycle or publication. This is a research recommendation, not investor approval or provisioning authorization; ticket 04 must validate runtime throughput, private access, recovery and actual costs before deployment, and a measured incompatibility reopens this trade-off rather than shrinking the market universe.
