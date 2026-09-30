-- Strategy Lab AI v32 migration.
-- DO NOT RUN THIS until it has been reviewed and explicitly approved to
-- apply — see SECURITY_REMEDIATION_PLAN.md (Batch 4).
--
-- Every other table in this schema has Row Level Security explicitly
-- enabled; public.yahoo_auth_cache (added in migration_v15) never did.
-- Today this is not actually exploitable — no grant was ever given to
-- anon/authenticated on this table, only to service_role (which bypasses
-- RLS anyway) — but leaving RLS off is inconsistent with every other table
-- and is a risk if a future migration ever grants broader access "by
-- analogy with the other tables," assuming RLS was already protecting it.
-- This is a pure consistency/defense-in-depth fix with no behavior change.
--
-- Rollback: alter table public.yahoo_auth_cache disable row level security;

alter table public.yahoo_auth_cache enable row level security;
