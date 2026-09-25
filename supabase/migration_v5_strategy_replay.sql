-- Strategy Lab AI v5 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets the Successful Strategy Log replay the exact candles a saved
-- strategy was tested on (paper-trading tests now run on a randomly
-- chosen historical date range instead of always the same window).
alter table public.strategies add column if not exists candles jsonb not null default '[]'::jsonb;
alter table public.strategies add column if not exists test_start_at timestamptz;
alter table public.strategies add column if not exists test_end_at timestamptz;
