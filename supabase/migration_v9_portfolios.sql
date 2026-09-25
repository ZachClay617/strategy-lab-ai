-- Strategy Lab AI v9 migration. Run this ONCE in Supabase SQL Editor.
-- Adds AI-managed portfolio tracking ("Autopilot" style): a user describes what they want in
-- plain language, the AI builds/maintains a real-symbol portfolio against that description,
-- and every change (manual or AI) is kept in a permanent log per portfolio.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text not null,
  weight numeric not null default 0,
  added_by text not null default 'user',
  added_at timestamptz not null default now()
);

create table if not exists public.portfolio_log (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor text not null,
  action text not null,
  message text not null,
  detail jsonb
);

alter table public.portfolios enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_log enable row level security;

drop policy if exists "portfolios own" on public.portfolios;
create policy "portfolios own" on public.portfolios for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "portfolio_holdings own" on public.portfolio_holdings;
create policy "portfolio_holdings own" on public.portfolio_holdings for all
  using (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.user_id=auth.uid()))
  with check (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.user_id=auth.uid()));

drop policy if exists "portfolio_log own" on public.portfolio_log;
create policy "portfolio_log own" on public.portfolio_log for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant all on public.portfolios to authenticated;
grant all on public.portfolio_holdings to authenticated;
grant all on public.portfolio_log to authenticated;
