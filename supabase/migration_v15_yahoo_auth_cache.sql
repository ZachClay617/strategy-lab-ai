-- Strategy Lab AI v15 migration. Run this ONCE in the Supabase SQL Editor.
-- Vercel's serverless functions are stateless and share IP ranges across many
-- unrelated deployments. Yahoo Finance's free "crumb" auth endpoint throttles
-- shared cloud IPs much harder than a normal residential IP, so re-fetching a
-- crumb on every cold start was quickly exhausting the shared quota (visible
-- as repeated 429 "Too Many Requests" on the Company Analysis Report feature).
-- This table lets every serverless invocation share and reuse one crumb for
-- several hours instead of each one fetching its own.
create table if not exists public.yahoo_auth_cache (
  id text primary key,
  cookie text,
  crumb text,
  updated_at timestamptz not null default now()
);
grant all on public.yahoo_auth_cache to service_role;
