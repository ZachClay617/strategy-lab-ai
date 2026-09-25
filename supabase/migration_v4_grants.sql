-- Strategy Lab AI v4 migration. Run this ONCE in the Supabase SQL Editor.
-- Fixes: "permission denied for table ..." (Postgres error 42501) on every
-- read/write, which is why the Successful Strategy Log and Research Run
-- History never showed data. Row Level Security policies alone are not
-- enough; Postgres also requires an explicit GRANT to the role.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.research_runs,
  public.strategies,
  public.run_events,
  public.capital_events
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;
