-- Strategy Lab AI v20 migration. Run this ONCE in the Supabase SQL Editor.
-- Adds an optional gender field to the profiles table for account settings.
-- No new grants needed — migration_v4 already granted select/insert/update/
-- delete on public.profiles to the authenticated role, and RLS policy
-- "profiles own" already scopes every row to its owner.
alter table public.profiles add column if not exists gender text check (gender in ('male','female'));
