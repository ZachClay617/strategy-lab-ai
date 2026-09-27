-- Strategy Lab AI v22 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets the user favorite an individual saved strategy (separate from
-- favoriting a whole research run in the Successful Strategy Log).
alter table public.strategies add column if not exists favorite boolean not null default false;
