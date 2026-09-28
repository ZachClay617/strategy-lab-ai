-- Strategy Lab AI v27 migration. Run this ONCE in Supabase SQL Editor.
-- Same gap migration_v13 fixed for the portfolios tables: strategies,
-- live_positions and trade_notifications were only ever granted to the
-- `authenticated` role, never explicitly to `service_role`. service_role
-- bypasses row-level security, but it still needs an ordinary table GRANT to
-- read/write at all — without it, the service-role-authenticated cron
-- endpoint (/api/cron/live-signals) fails with "permission denied for table
-- strategies" even when using the correct secret key and service role key.
grant all on public.strategies to service_role;
grant all on public.live_positions to service_role;
grant all on public.trade_notifications to service_role;
