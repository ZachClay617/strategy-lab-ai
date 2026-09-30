# Strategy Lab AI — Supabase + Vercel

This version adds persistent Supabase storage, long/short research simulation, an animated candlestick research arena, live stock market-data visualization, detailed test/rejection explanations, a persistent successful-strategy log, and detailed research-run history.

## Important
The research capital is a simulated balance of $100,000. It is not real money. The live market chart does not place orders, and nothing in the app ever places a real trade. The legal documents published at /terms, /privacy, /disclaimer, and /refunds are sourced from `legal/content/*.md` — keep those in sync with `lib/legal.ts` (LEGAL_VERSION) whenever they change.

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` for a fresh project, or run `supabase/migration_v3.sql` in an existing Strategy Lab project.
3. Create `.env.local` from `.env.example` using your Supabase Project URL and Publishable Key.
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:3000`.

Never put a Supabase secret/service-role key in the browser or in a `NEXT_PUBLIC_*` variable.
