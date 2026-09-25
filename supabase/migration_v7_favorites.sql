-- Strategy Lab AI v7 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets the user favorite a research run in the Successful Strategy Log.
alter table public.research_runs add column if not exists favorite boolean not null default false;
