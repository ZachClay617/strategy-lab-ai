-- Strategy Lab AI v21 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets the user favorite a saved company report.
alter table public.company_reports add column if not exists favorite boolean not null default false;
