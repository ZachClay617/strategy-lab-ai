-- Strategy Lab AI v16 migration. Run this ONCE in the Supabase SQL Editor.
-- Stores each generated Company Analysis Report so users can revisit past
-- reports without regenerating them (which also avoids paying for the AI
-- call again).
create table if not exists public.company_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  company_name text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists company_reports_user_idx on public.company_reports(user_id, created_at desc);

alter table public.company_reports enable row level security;
create policy "company_reports own" on public.company_reports for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant select, insert, update, delete on public.company_reports to authenticated;
