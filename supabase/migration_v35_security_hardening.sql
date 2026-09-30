-- Strategy Lab AI v35 migration. Run this ONCE in the Supabase SQL Editor.
--
-- Closes four database-level gaps found in the pre-launch security review.
-- Everything here is defence in depth: none of it is a known live breach, and
-- all of it removes a way one could happen later without anybody noticing.
--
-- Safe to re-run (every statement is idempotent) and it does not touch any
-- user data — only privileges, policies, and one retention job.


-- ---------------------------------------------------------------------------
-- 1. Stop granting every future table to every logged-in user.
-- ---------------------------------------------------------------------------
-- migration_v4_grants.sql set default privileges so that ANY table created in
-- the public schema from then on was automatically readable AND writable by
-- every authenticated user, before anyone remembered to turn on row-level
-- security for it. That is a footgun that already fired once: yahoo_auth_cache
-- (v15) shipped without RLS, so until v33 locked it down, any logged-in user
-- could read or poison the shared market-data session cookie.
--
-- After this, a new table is private until its migration explicitly grants
-- access — which every table's migration here already does.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated;
alter default privileges in schema public
  revoke usage, select on sequences from authenticated;


-- ---------------------------------------------------------------------------
-- 2. Bind realized trades to the portfolio, not just to the user.
-- ---------------------------------------------------------------------------
-- The v18 policy checks only `auth.uid() = user_id`, so a user could insert a
-- realized trade carrying their own user_id but SOMEONE ELSE'S portfolio_id
-- (foreign keys are not subject to RLS). The hourly snapshot job aggregates
-- realized trades by portfolio_id with the service role, so such a row would
-- be folded into the victim's return chart. It requires knowing a portfolio's
-- UUID, which is never exposed — but the policy should not depend on that.
--
-- This mirrors the policy portfolio_holdings already uses.
drop policy if exists "portfolio_realized_trades own" on public.portfolio_realized_trades;
create policy "portfolio_realized_trades own" on public.portfolio_realized_trades
  using (
    auth.uid() = user_id
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid())
  );

-- Same shape, same reason, for the per-portfolio change log.
drop policy if exists "portfolio_log own" on public.portfolio_log;
create policy "portfolio_log own" on public.portfolio_log
  using (
    auth.uid() = user_id
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 3. Make profiles.email read-only to its owner.
-- ---------------------------------------------------------------------------
-- The "profiles own" policy is `for all`, so a user can UPDATE any column of
-- their own row — including `email`, which is the column /api/auth/login and
-- /api/auth/reset-password resolve a username to. Changing it does not let
-- anyone into another account (the password is still required, and a reset
-- goes to an address they could have typed anyway), but identity data that two
-- auth routes trust should not be client-writable, and it can silently drift
-- out of sync with auth.users.
--
-- Column-level grants are the right tool: the policy still decides WHICH row,
-- this decides which columns of it.
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  avatar_url,
  currency,
  username,
  gender,
  current_balance,
  starting_balance,
  next_strategy_seq,
  next_run_seq,
  accepted_legal_at,
  accepted_legal_version
) on public.profiles to authenticated;

-- Keep profiles.email following auth.users automatically, so nothing depends
-- on the client having written it correctly.
create or replace function public.sync_profile_email() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- One-time backfill for any row that already drifted.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;


-- ---------------------------------------------------------------------------
-- 4. Retention for portfolio_snapshots.
-- ---------------------------------------------------------------------------
-- One row per portfolio per hour, forever, is 8,760 rows/portfolio/year and
-- grows without bound. The chart reads at most the most recent ~960 and draws
-- anything older from daily closes, so keeping more than about a year of
-- hourly detail buys nothing. This thins snapshots older than 90 days down to
-- one per day, and drops anything past two years.
--
-- Run it manually now and then, or schedule it with pg_cron if that extension
-- is enabled on your project (see the commented-out line at the bottom).
create or replace function public.prune_portfolio_snapshots() returns integer
  language plpgsql security definer set search_path = public as $$
declare
  removed integer;
begin
  with ranked as (
    select id,
           row_number() over (
             partition by portfolio_id, date_trunc('day', taken_at)
             order by taken_at desc
           ) as rn
    from public.portfolio_snapshots
    where taken_at < now() - interval '90 days'
  )
  delete from public.portfolio_snapshots s
  using ranked r
  where s.id = r.id and r.rn > 1;
  get diagnostics removed = row_count;

  delete from public.portfolio_snapshots where taken_at < now() - interval '2 years';
  return removed;
end $$;

revoke all on function public.prune_portfolio_snapshots() from public, anon, authenticated;
grant execute on function public.prune_portfolio_snapshots() to service_role;

-- Optional, if the pg_cron extension is enabled on this project:
-- select cron.schedule('prune-portfolio-snapshots', '17 4 * * *', 'select public.prune_portfolio_snapshots()');


-- ---------------------------------------------------------------------------
-- 5. Verification — run these and check the output.
-- ---------------------------------------------------------------------------
-- Every table in the public schema should report relrowsecurity = true:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;
--
-- These should both be false (the shared market-data cache must not be
-- reachable by logged-in users):
--   select has_table_privilege('authenticated', 'public.yahoo_auth_cache', 'select');
--   select has_table_privilege('authenticated', 'public.yahoo_auth_cache', 'update');
--
-- This should be false (email is no longer client-writable):
--   select has_column_privilege('authenticated', 'public.profiles', 'email', 'update');
