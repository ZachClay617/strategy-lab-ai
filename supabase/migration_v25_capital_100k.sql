-- Strategy Lab AI v25 migration. Run this ONCE in the Supabase SQL Editor.
-- AI research capital changed from $10,000,000,000 to $100,000. Updates the
-- column defaults for new accounts/runs, and resets any row still holding
-- the untouched old default back to the new one (accounts that have actually
-- traded and grown/shrunk their balance are left alone).
alter table public.profiles alter column starting_balance set default 100000;
alter table public.profiles alter column current_balance set default 100000;
alter table public.research_runs alter column starting_balance set default 100000;
alter table public.research_runs alter column current_balance set default 100000;
update public.profiles set starting_balance=100000, current_balance=100000 where starting_balance=10000000000 and current_balance=10000000000;
