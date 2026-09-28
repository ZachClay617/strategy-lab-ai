-- Strategy Lab AI v30 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets the app tell whether the background /api/cron/live-signals job is
-- actually still running on schedule (GitHub Actions auto-disables a
-- scheduled workflow after 60 days of repo inactivity, and a rotated
-- CRON_SECRET on one side without the other silently breaks it) — the cron
-- endpoint stamps this table on every successful run, and the Trade Signals
-- page reads it to warn if background checks have gone stale.

create table if not exists public.cron_heartbeats (
  name text primary key,
  last_run_at timestamptz not null default now()
);

alter table public.cron_heartbeats enable row level security;
-- Not user-specific or sensitive (just "did the job run"), so any logged-in
-- user can read it; only service_role (the cron endpoint) ever writes it.
drop policy if exists "cron_heartbeats read" on public.cron_heartbeats;
create policy "cron_heartbeats read" on public.cron_heartbeats for select using (true);
grant select on public.cron_heartbeats to authenticated;
grant all on public.cron_heartbeats to service_role;
