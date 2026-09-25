-- Strategy Lab AI v3 migration. Run this ONCE in Supabase SQL Editor after the original schema.
alter table public.profiles add column if not exists starting_balance numeric not null default 1000000000000000000;
alter table public.profiles add column if not exists current_balance numeric not null default 1000000000000000000;
alter table public.research_runs add column if not exists tested_count integer not null default 0;
alter table public.research_runs add column if not exists qualified_count integer not null default 0;
alter table public.research_runs add column if not exists summary text;
alter table public.research_runs add column if not exists best_strategy_name text;
alter table public.research_runs add column if not exists best_reason text;
alter table public.research_runs add column if not exists failure_reason text;
update public.profiles set starting_balance=1000000000000000000, current_balance=1000000000000000000 where starting_balance=1000000 or current_balance=1000000;
update public.research_runs set starting_balance=1000000000000000000, current_balance=1000000000000000000 where starting_balance=1000000 or current_balance=1000000;
