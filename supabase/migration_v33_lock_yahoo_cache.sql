-- Strategy Lab AI v33 migration. Run this ONCE in the Supabase SQL Editor.
-- Locks down the shared Yahoo crumb cache. migration_v4 set default
-- privileges that automatically grant full CRUD on every newly created
-- table to the `authenticated` role, and migration_v15 created
-- yahoo_auth_cache WITHOUT enabling row level security — so any logged-in
-- user could read the shared Yahoo session cookie/crumb or poison the
-- cache for everyone. Only the server (service_role) ever needs this table.
alter table public.yahoo_auth_cache enable row level security;
revoke all on public.yahoo_auth_cache from authenticated;
revoke all on public.yahoo_auth_cache from anon;
-- service_role keeps its grant from migration_v15 and bypasses RLS.
