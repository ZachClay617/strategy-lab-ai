-- Strategy Lab AI v23 migration. Run this ONCE in the Supabase SQL Editor.
-- Backs the new Trade Signals page: tracks open/closed positions the user has
-- confirmed buying or selling, and the buy/sell notifications generated when a
-- favorited strategy signals on the ticker the user is watching. Notifications
-- are written both by the browser (while the Trade Signals page is open) and by
-- a server-side cron endpoint using the service role key, so detection keeps
-- running even when nobody has the site open.

create table if not exists public.live_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  symbol text not null,
  market text not null default 'Stocks',
  status text not null default 'open' check (status in ('open','closed')),
  entry_price numeric not null,
  exit_price numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists live_positions_user_status_idx on public.live_positions(user_id,status);
create index if not exists live_positions_strategy_idx on public.live_positions(strategy_id);

alter table public.live_positions enable row level security;
drop policy if exists "live_positions own" on public.live_positions;
create policy "live_positions own" on public.live_positions for all
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update, delete on public.live_positions to authenticated;

create table if not exists public.trade_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  strategy_name text not null,
  symbol text not null,
  market text not null default 'Stocks',
  action text not null check (action in ('buy','sell')),
  price numeric,
  reason text,
  position_id uuid references public.live_positions(id) on delete set null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trade_notifications_user_time_idx on public.trade_notifications(user_id,created_at desc);

alter table public.trade_notifications enable row level security;
drop policy if exists "trade_notifications own" on public.trade_notifications;
create policy "trade_notifications own" on public.trade_notifications for all
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update, delete on public.trade_notifications to authenticated;
