-- Strategy Lab AI v17 migration. Run this ONCE in the Supabase SQL Editor.
-- Lets users set a username and log in with either their email or username.
alter table public.profiles add column if not exists username text unique;

-- Supabase auth only accepts an email/password pair to sign in, so logging in
-- with a username means resolving it to the matching email first. Since the
-- visitor isn't authenticated yet at that point, RLS on profiles ("profiles
-- own") would normally block this lookup — this function runs with elevated
-- (security definer) privileges to return ONLY the email for a username
-- match, nothing else from the profile.
create or replace function public.get_email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.profiles where lower(username) = lower(uname) limit 1;
$$;

grant execute on function public.get_email_for_username(text) to anon, authenticated;
