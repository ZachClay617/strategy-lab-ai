-- Strategy Lab AI v11 migration. Run this ONCE in Supabase SQL Editor.
-- Manually added holdings now track shares owned instead of a manually typed
-- weight; weight for these holdings is computed from shares * current price.
alter table public.portfolio_holdings add column if not exists shares numeric;
