-- Strategy Lab AI v24 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets a user add multiple tickers to watch on the Trade Signals page at
-- once, so buy/sell detection runs across all of them simultaneously instead
-- of one symbol at a time.
create table if not exists public.watchlist_symbols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  market text not null default 'Stocks',
  created_at timestamptz not null default now(),
  unique(user_id,symbol,market)
);
create index if not exists watchlist_symbols_user_idx on public.watchlist_symbols(user_id);

alter table public.watchlist_symbols enable row level security;
drop policy if exists "watchlist_symbols own" on public.watchlist_symbols;
create policy "watchlist_symbols own" on public.watchlist_symbols for all
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update, delete on public.watchlist_symbols to authenticated;
