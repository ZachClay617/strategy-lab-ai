-- Strategy Lab AI v26 migration. Run this ONCE in the Supabase SQL Editor.
-- Gives every qualifying strategy a unique, sequential ID # per user account
-- (#1, #2, #3, ...), so a specific strategy is easy to find/reference when
-- deciding what to favorite. Assigned server-side via a trigger so it works
-- no matter which client inserts the row, and stays gap-free per user even
-- with concurrent inserts (the update on profiles takes a row lock).

alter table public.profiles add column if not exists next_strategy_seq integer not null default 1;
alter table public.strategies add column if not exists seq integer;

create or replace function public.assign_strategy_seq()
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
  update public.profiles set next_strategy_seq = next_strategy_seq + 1
    where id = new.user_id
    returning next_strategy_seq - 1 into next_seq;
  if next_seq is null then
    select coalesce(max(seq),0)+1 into next_seq from public.strategies where user_id = new.user_id;
  end if;
  new.seq := coalesce(next_seq,1);
  return new;
end;
$$;

drop trigger if exists strategies_assign_seq on public.strategies;
create trigger strategies_assign_seq before insert on public.strategies
  for each row execute function public.assign_strategy_seq();

-- Backfill existing strategies with sequential numbers per user, oldest first.
with numbered as (
  select id, row_number() over (partition by user_id order by created_at asc) as rn
  from public.strategies where seq is null
)
update public.strategies s set seq = numbered.rn
from numbered where s.id = numbered.id;

-- Keep each user's counter ahead of whatever was just backfilled.
update public.profiles p set next_strategy_seq = greatest(
  p.next_strategy_seq,
  coalesce((select max(seq)+1 from public.strategies s where s.user_id = p.id),1)
);

create index if not exists strategies_user_seq_idx on public.strategies(user_id, seq);
