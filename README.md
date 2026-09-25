# Strategy Lab AI — Supabase + Vercel

This version adds persistent Supabase storage, long/short research simulation, an animated candlestick research arena, live stock market-data visualization, detailed test/rejection explanations, a persistent successful-strategy log, and detailed research-run history.

## Important
The research capital is a simulated balance of $1,000,000,000,000,000,000 (one quintillion dollars). It is not real money. The live market chart does not place orders. Actual paper/live execution will require exchange/broker adapters and risk controls later.

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` for a fresh project, or run `supabase/migration_v3.sql` in an existing Strategy Lab project.
3. Create `.env.local` from `.env.example` using your Supabase Project URL and Publishable Key.
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:3000`.

Never put a Supabase secret/service-role key in the browser or in a `NEXT_PUBLIC_*` variable.
