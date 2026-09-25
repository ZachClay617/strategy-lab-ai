-- Strategy Lab AI v13 migration. Run this ONCE in Supabase SQL Editor.
-- The portfolios/portfolio_holdings/portfolio_log/portfolio_snapshots tables were
-- only ever granted to the `authenticated` role, never explicitly to `service_role`.
-- service_role bypasses row-level security, but it still needs an ordinary table
-- GRANT to read/write at all — without it, the service-role-authenticated cron
-- endpoint (/api/cron/portfolio-snapshots) fails with "permission denied for
-- table portfolios" even when using the correct secret key.
grant all on public.portfolios to service_role;
grant all on public.portfolio_holdings to service_role;
grant all on public.portfolio_log to service_role;
grant all on public.portfolio_snapshots to service_role;
