-- Strategy Lab AI v29 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets users rename a research run (not just a saved strategy). Plain nullable
-- column — the UI falls back to "SYMBOL · MARKET" when it's unset.

alter table public.research_runs add column if not exists name text;
