-- Strategy Lab AI v12 migration. Run this ONCE in Supabase SQL Editor.
-- Stores a portfolio return snapshot every ~15 minutes (written by a server-side
-- cron endpoint, not the browser) so the return-over-time chart keeps plotting
-- points on a fixed schedule even while no one has the site open.
create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at timestamptz not null default now(),
  return_pct numeric not null
);

create index if not exists portfolio_snapshots_portfolio_time_idx
  on public.portfolio_snapshots(portfolio_id, taken_at);

alter table public.portfolio_snapshots enable row level security;

-- Users may only read their own portfolios' snapshots. Writing is done exclusively
-- by the cron endpoint using the Supabase service role key, which bypasses RLS,
-- so there is deliberately no insert policy for ordinary authenticated users.
drop policy if exists "portfolio_snapshots read own" on public.portfolio_snapshots;
create policy "portfolio_snapshots read own" on public.portfolio_snapshots for select
  using (auth.uid()=user_id);

grant select on public.portfolio_snapshots to authenticated;
