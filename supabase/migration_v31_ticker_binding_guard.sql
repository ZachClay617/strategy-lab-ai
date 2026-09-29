-- Strategy Lab AI v31 migration.
-- DO NOT RUN THIS until it has been reviewed and explicitly approved to
-- apply — see SECURITY_REMEDIATION_PLAN.md (Batch 4) and
-- SECURITY_REMEDIATION_BATCH_4_RESULTS.md for what this does, why, and how
-- it was tested (against a disposable local Postgres instance, not
-- production) before being written here.
--
-- Problem this closes: live_positions and trade_notifications rows were
-- only ever checked by Row Level Security for "does this row belong to me,"
-- never for "does this row's symbol/market actually match the strategy it
-- references." A logged-in user (or anyone scripting direct calls with
-- their own valid login) could write a position/notification claiming a
-- ticker their referenced strategy was never actually validated on, or even
-- reference a strategy that belongs to a different user entirely. This adds
-- both checks at the database level, so it holds no matter what any client
-- (including a modified one) sends.
--
-- What changes for legitimate use: nothing. Every existing code path
-- (lib/tradeConfirm.ts, app/trade-signals/page.tsx) already only ever
-- writes a strategy's own symbol/market for that same user's own strategy —
-- this trigger simply makes that a guarantee instead of an assumption.
--
-- Rollback (run this to fully undo, no data is affected either way):
--   drop trigger if exists enforce_symbol_match on public.live_positions;
--   drop trigger if exists enforce_symbol_match on public.trade_notifications;
--   drop function if exists public.enforce_strategy_symbol_match();

create or replace function public.enforce_strategy_symbol_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  strat_symbol text;
  strat_market text;
  strat_user uuid;
begin
  -- Nothing to check if this row doesn't reference a strategy at all.
  if new.strategy_id is null then
    return new;
  end if;

  -- security definer so this lookup always sees the real strategy row
  -- regardless of whose strategy it is — without this, RLS would hide a
  -- strategy belonging to a different user and silently let the check pass.
  select symbol, market, user_id into strat_symbol, strat_market, strat_user
  from public.strategies
  where id = new.strategy_id;

  if strat_symbol is null then
    raise exception 'strategy % does not exist', new.strategy_id;
  end if;

  if strat_user is distinct from new.user_id then
    raise exception 'strategy % does not belong to user % — a position/notification can only reference your own strategy', new.strategy_id, new.user_id;
  end if;

  if new.symbol is distinct from strat_symbol or new.market is distinct from strat_market then
    raise exception 'symbol/market (%/%) does not match strategy % (%/%) — a strategy may only be used for the ticker it was researched on',
      new.symbol, new.market, new.strategy_id, strat_symbol, strat_market;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_symbol_match on public.live_positions;
create trigger enforce_symbol_match
  before insert or update on public.live_positions
  for each row execute procedure public.enforce_strategy_symbol_match();

drop trigger if exists enforce_symbol_match on public.trade_notifications;
create trigger enforce_symbol_match
  before insert or update on public.trade_notifications
  for each row execute procedure public.enforce_strategy_symbol_match();
