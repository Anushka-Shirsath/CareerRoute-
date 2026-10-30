# Measured performance

See `full_dataset_validation.json` for raw local measurements and `data_coverage.json` for actual counts. The supplied dataset was exercised on SQLite and a local PostgreSQL instance, including source-linked offering reads, matching, cost unknowns, shortlist persistence, share creation/revocation and deletion.

The initial timing sample measures the intentionally empty **Pune Polytechnic** search because its district fields are absent. It must not be described as the latency of a populated statewide ranking query. Sample size is seven; the reported local p95 uses the maximum of that small sample. It is not a deployed SLA.

PostgreSQL database size was approximately 263 MiB after v7 reconciliation, before Supabase platform overhead. No landing-page LCP, browser bundle size or deployed API p50/p95 exists while UI/deployment are deferred.
