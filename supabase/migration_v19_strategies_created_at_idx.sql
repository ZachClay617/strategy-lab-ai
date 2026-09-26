-- Run once in the Supabase SQL Editor.
-- The Research page now loads strategies ordered by created_at (most recent
-- runs first) instead of by score, so that a new run's qualified strategies
-- always show up in the Successful Strategy Log even if they score lower
-- than older strategies. Without an index on created_at, Postgres has to
-- sort the whole table (including large candles/trades/equity JSONB
-- columns) on every load, which was hitting the statement timeout and
-- making the log/history appear empty.
create index if not exists strategies_user_created_idx on public.strategies(user_id, created_at desc);
