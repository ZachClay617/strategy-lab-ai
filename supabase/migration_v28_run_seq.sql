-- Strategy Lab AI v28 migration. Run this ONCE in the Supabase SQL Editor.
-- Gives every research run a unique, sequential ID # per user account
-- (#1, #2, #3, ...), the same way migration_v26 numbered strategies.
-- Assigned server-side via a trigger so it works no matter which client
-- inserts the row (research_runs.id is a client-generated uuid, not a
-- database default, so this can't just be derived from insertion order at
-- read time), and stays gap-free per user even with concurrent inserts (the
-- update on profiles takes a row lock).

alter table public.profiles add column if not exists next_run_seq integer not null default 1;
alter table public.research_runs add column if not exists seq integer;

create or replace function public.assign_run_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
begin
  if new.seq is not null then
    return new;
  end if;
  update public.profiles set next_run_seq = next_run_seq + 1
    where id = new.user_id
    returning next_run_seq - 1 into next_seq;
  if next_seq is null then
    select coalesce(max(seq),0)+1 into next_seq from public.research_runs where user_id = new.user_id;
  end if;
  new.seq := coalesce(next_seq,1);
  return new;
end;
$$;

drop trigger if exists research_runs_assign_seq on public.research_runs;
create trigger research_runs_assign_seq before insert on public.research_runs
  for each row execute function public.assign_run_seq();

-- Backfill existing runs with sequential numbers per user, oldest first.
with numbered as (
  select id, row_number() over (partition by user_id order by started_at asc) as rn
  from public.research_runs where seq is null
)
update public.research_runs r set seq = numbered.rn
from numbered where r.id = numbered.id;

-- Keep each user's counter ahead of whatever was just backfilled.
update public.profiles p set next_run_seq = greatest(
  p.next_run_seq,
  coalesce((select max(seq)+1 from public.research_runs r where r.user_id = p.id),1)
);

create index if not exists research_runs_user_seq_idx on public.research_runs(user_id, seq);
