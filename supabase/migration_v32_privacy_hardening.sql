-- Strategy Lab AI v32 migration. Run this ONCE in the Supabase SQL Editor.
--
-- 1) Closes the email-enumeration hole from migration_v17: the
--    get_email_for_username() function was executable by the anonymous role,
--    so anyone on the internet could turn a guessed username into that
--    user's email address. Username login and password reset now resolve
--    usernames server-side (see /api/auth/login and /api/auth/reset-password,
--    which use the service-role key and never reveal the email), so the
--    function is no longer needed at all.
drop function if exists public.get_email_for_username(text);

-- 2) Self-service account deletion, promised by Privacy Policy §8.1.
--    Deleting the auth.users row cascades through every user table
--    (profiles, research_runs, strategies, run_events, capital_events,
--    portfolios and their children, company_reports, live_positions,
--    trade_notifications, watchlist_symbols) via the existing
--    "on delete cascade" foreign keys.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
