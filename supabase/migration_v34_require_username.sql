-- Strategy Lab AI v34 migration. Run this ONCE in the Supabase SQL Editor.
-- Makes username mandatory, format-checked, and case-insensitively unique,
-- and moves username/full_name/gender capture into the signup trigger itself
-- so a valid username is required atomically at account creation — not just
-- as a client-side UI convention. If the trigger rejects the username, the
-- whole transaction (including the new auth.users row) rolls back, so a bad
-- signup never leaves behind an orphaned, username-less account.

-- 1. Backfill any pre-existing rows that have no username yet, so the
--    NOT NULL constraint below doesn't break existing accounts. The
--    generated placeholder is derived from the user's own id, so it's
--    guaranteed unique and satisfies the format rule below.
update public.profiles
set username = 'user_' || substr(replace(id::text, '-', ''), 1, 12)
where username is null or btrim(username) = '';

-- 2. Replace the old plain UNIQUE constraint (case-sensitive, added in
--    migration_v17) with a case-insensitive unique index, so "Alice" and
--    "alice" can no longer both be registered — closing a gap where the
--    old constraint allowed a case collision that get_email_for_username's
--    case-insensitive lookup could not distinguish between.
alter table public.profiles drop constraint if exists profiles_username_key;
drop index if exists profiles_username_lower_idx;
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- 3. Enforce the format rule (3-20 chars, starts with a letter, only
--    letters/digits/underscores) and require a value.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$');
alter table public.profiles alter column username set not null;

-- 4. Capture username/full_name/gender straight from the signup call's
--    metadata (see app/login/page.tsx: supabase.auth.signUp({ options:
--    { data: { username, full_name, gender } } })) so the profile row is
--    created with a valid username in the same transaction as the auth
--    user, instead of relying on a second client-side upsert call that
--    could fail or be skipped.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
  uname text := btrim(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if uname = '' then
    raise exception 'Username is required.' using errcode = '23514';
  end if;
  if uname !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then
    raise exception 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores.' using errcode = '23514';
  end if;

  begin
    insert into public.profiles (id, email, username, full_name, gender)
    values (
      new.id,
      new.email,
      uname,
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(new.raw_user_meta_data->>'gender', '')
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    raise exception 'That username is already taken.' using errcode = '23505';
  end;

  return new;
end; $$;

-- 5. Lets the client check availability before submitting the form, for a
--    friendly inline message instead of a raw signup error. Security
--    definer + returns only a boolean, so it can't be used to enumerate
--    any other profile data (mirrors get_email_for_username's approach).
create or replace function public.is_username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(btrim(uname))
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
