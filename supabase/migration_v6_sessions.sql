-- Strategy Lab AI v6 migration. Run this ONCE in the Supabase SQL Editor.
-- Successful strategies can now show multiple test sessions (each its
-- own 3-hour 9:00-12:00 ET chart with dated trades), not just one.
alter table public.strategies add column if not exists sessions jsonb not null default '[]'::jsonb;
