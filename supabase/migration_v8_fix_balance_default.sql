-- Strategy Lab AI v8 migration. Run this ONCE in Supabase SQL Editor.
-- migration_v3 accidentally set the balance default/backfill to 1,000,000,000,000,000,000
-- (1 quintillion) instead of the app's actual STARTING_CAPITAL of 10,000,000,000 (10 billion).
-- Every login since then has pulled that wrong number from profiles.current_balance and
-- overwritten the correct in-app balance with it, which is the "capital is broken" symptom.
-- This corrects the column defaults and resets any row still holding the bad value.
alter table public.profiles alter column starting_balance set default 10000000000;
alter table public.profiles alter column current_balance set default 10000000000;
alter table public.research_runs alter column starting_balance set default 10000000000;
alter table public.research_runs alter column current_balance set default 10000000000;
update public.profiles set starting_balance=10000000000, current_balance=10000000000 where starting_balance=1000000000000000000 or current_balance=1000000000000000000;
update public.research_runs set starting_balance=10000000000, current_balance=10000000000 where starting_balance=1000000000000000000 or current_balance=1000000000000000000;
