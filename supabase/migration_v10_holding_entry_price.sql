-- Strategy Lab AI v10 migration. Run this ONCE in Supabase SQL Editor.
-- Portfolio holding return was being computed by matching the holding's added_at
-- timestamp against daily price bars, which broke for holdings added intraday
-- (no bar for "today" yet), silently falling back to the OLDEST bar in the whole
-- fetched window and producing wildly wrong % changes. Storing the real price at
-- the moment a holding is added fixes this: return = current price / entry_price - 1.
alter table public.portfolio_holdings add column if not exists entry_price numeric;
