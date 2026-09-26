-- Strategy Lab AI v18 migration. Run this ONCE in the Supabase SQL Editor.
-- Records closed (sold) holdings so a portfolio's total return reflects
-- realized gains/losses from past trades too, not just currently open
-- positions — a real all-time return instead of only "what I'm holding now."
create table if not exists public.portfolio_realized_trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  shares numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  realized_pl numeric not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);
create index if not exists portfolio_realized_trades_portfolio_idx on public.portfolio_realized_trades(portfolio_id, closed_at);

alter table public.portfolio_realized_trades enable row level security;
create policy "portfolio_realized_trades own" on public.portfolio_realized_trades
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update, delete on public.portfolio_realized_trades to authenticated;
grant all on public.portfolio_realized_trades to service_role;
