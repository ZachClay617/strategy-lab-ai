-- Strategy Lab AI v14 migration. Run this ONCE in the Supabase SQL Editor.
-- Adds account-settings fields (display name, avatar, preferred currency)
-- to the existing profiles table. No new grants needed — migration_v4
-- already granted select/insert/update/delete on public.profiles to
-- the authenticated role, and RLS policy "profiles own" already scopes
-- every row to its owner.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists currency text not null default 'USD';
