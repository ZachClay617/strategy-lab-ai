# Payments & Subscriptions — Implementation Plan

**Status:** Not started
**Written:** 2026-09-29 (planning model: Opus)
**Intended executor:** Sonnet, working phase by phase
**Repo:** `strategy_lab_ai_supabase_vercel_v3` · production domain `https://strategylabai.net`

---

## 0. How to use this document

Read this section fully before touching any code.

### Execution protocol

1. **Work one Phase at a time, in order.** Phases 1→9 have hard dependencies. Do not skip ahead.
2. **Every phase ends with a `VERIFY` block.** Run it. If it fails, fix before moving on. Do not report a phase complete because the code was written — report it complete because the VERIFY passed.
3. **Every phase ends with a `COMMIT` line.** Use it verbatim (plus the attribution footer the harness gives you). Commit at each phase boundary so a bad phase can be reverted alone.
4. **Phases marked 🧍 HUMAN are not yours.** They are Stripe Dashboard clicks and secret values only Zach can do. When you reach one, stop, print the checklist, and wait. Do not fabricate key values, price IDs, or claim a dashboard step is done.
5. **Do not invent Stripe API shapes.** This plan was written against a verified copy of `stripe@22.6.2`. If something doesn't typecheck, read the real `.d.ts` in `node_modules/stripe/esm/resources/` rather than guessing.
6. **Do not put secrets in `NEXT_PUBLIC_*`.** The repo README already calls this out. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and all `STRIPE_PRICE_*` values are server-only.
7. **Never run migrations yourself.** You write the `.sql` file; Zach pastes it into the Supabase SQL Editor. That is the established pattern in this repo (see every file in `supabase/` and the comment header style they all use). Match that header style exactly.

### What "done" means for this whole project

A logged-out visitor can sign up, hit a paywall, pay with a real card, and within seconds have their Supabase row say `pro` — and a user who opens devtools and types SQL at the browser Supabase client **cannot** give themselves `pro`. If the second half isn't true, the first half doesn't matter.

---

## 1. Verified context — what this app is today

Everything in this section was read from the repo, not assumed. Trust it.

### Stack

| Thing | Version / fact |
|---|---|
| Next.js | **16.3.6** (App Router) |
| React | 19.3.0 |
| `@supabase/supabase-js` | 2.117.1 |
| TypeScript | strict, `@/*` → `./*` |
| Host | Vercel, domain `strategylabai.net` |
| Cron | GitHub Actions hitting `/api/cron/*` with `?secret=$CRON_SECRET` |
| Rate limiting | `lib/rateLimit.ts`, Upstash Redis with in-memory fallback |

### Next.js 16 breaking changes that matter here

- **`middleware.ts` is deprecated → renamed `proxy.ts`.** This plan does **not** use either. Gating is per-route, in the route handler. Do not add a `middleware.ts`.
- **Edge runtime is deprecated.** `app/api/company-report/route.ts` sets `export const runtime = 'edge'` for a specific reason (Yahoo blocks Vercel's Lambda IPs — read its comment). **Leave that alone.** Every new route you write in this plan is Node.js — do **not** add a `runtime` export to any new file.
- Route handlers otherwise unchanged: `await request.text()` gives you the raw body, which is exactly what Stripe signature verification needs. No `bodyParser` config exists or is needed.

### Auth model — read this twice

**There is no server-side auth anywhere in this app right now.**

- `lib/supabase.ts` exports a single browser client built from `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Every page is `'use client'` and talks to Postgres directly. Security is 100% Postgres RLS.
- **Every API route under `app/api/` is completely unauthenticated.** They are throttled by IP (`clientIp(req)`) and nothing else. Anyone can `curl` `/api/company-report/narrative` today and burn Anthropic credits.
- The cron routes are the only authenticated ones, and they use a shared secret + `SUPABASE_SERVICE_ROLE_KEY`.

**Consequence:** entitlement gating cannot be done in React. It has to be done in Postgres (for direct browser writes) and in the route handlers with a verified JWT (for API calls). Section 4 covers this.

### Existing tables (all `public`, all RLS-enabled)

`profiles` · `research_runs` · `strategies` · `run_events` · `capital_events` · `portfolios` · `portfolio_holdings` · `portfolio_log` · `portfolio_snapshots` · `portfolio_realized_trades` · `company_reports` · `live_positions` · `trade_notifications` · `watchlist_symbols` · `cron_heartbeats` · `yahoo_auth_cache`

Latest migration is `supabase/migration_v30_cron_heartbeat.sql`. **Your new migrations start at v31.**

### ⚠️ Two landmines in the existing schema

**Landmine 1 — `profiles` is fully user-writable.**

```sql
create policy "profiles own" on public.profiles for all
  using (auth.uid()=id) with check (auth.uid()=id);
```

`for all` includes `UPDATE`, on every column. If you put a `plan` column on `profiles`, any user can self-upgrade with one line in the browser console:

```js
await supabase.from('profiles').update({plan:'elite'}).eq('id', myId)
```

**Therefore: no billing state goes on `profiles`. Not `plan`, not `stripe_customer_id`, not anything.** It all lives in a separate `subscriptions` table that `authenticated` can only `SELECT`.

**Landmine 2 — default privileges auto-grant every new table to `authenticated`.**

`supabase/migration_v4_grants.sql` ran this:

```sql
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
```

Any table created afterward **by the same role** silently gets full CRUD for logged-in users. A `create table ... ; alter table ... enable row level security;` is *not* enough, because the new billing tables need an `auth.uid()`-scoped SELECT policy — and with `for all` semantics plus an inherited INSERT/UPDATE grant, a user could forge rows.

**Therefore: every new billing table gets an explicit `revoke all ... from authenticated;` immediately after creation, then a narrow `grant select`.** This is written into the Phase 1 migration. Do not remove it.

### Where real money is spent

Two routes call `api.anthropic.com` (model `claude-sonnet-5`):

| Route | Runtime | `max_tokens` | Current protection |
|---|---|---|---|
| `app/api/company-report/narrative/route.ts` | node | 12000 | IP: 4/min, 20/hr |
| `app/api/portfolio-research/route.ts` | node | 2000 | IP: 10/min, 60/hr |

`app/api/company-report/route.ts` (edge) and `app/api/market/route.ts` only hit Yahoo — free, and already IP-throttled. **Do not gate those two.** Gating the edge route would mean touching the deprecated edge runtime for no revenue reason, and the data is worthless without the narrative anyway.

The third real cost is the `/api/cron/live-signals` job, which loops over **every** `strategies` row with `favorite=true` across all users every 5 minutes. That scales linearly with favorites, so favorites count is a real entitlement, not a fake one.

### Existing design system (reuse, don't invent)

`app/globals.css` is one 335-line file, no Tailwind, no CSS modules. Use these existing classes for all new UI:

`shell` · `hero` · `eyebrow` · `panel` · `panel-title` · `grid` · `grid-col` · `section-label` · `run` (primary button) · `primary` · `ghost` · `badge` · `pill` · `msg banner` · `tiny` · `muted` · `metrics` · `empty` · `cta-glow` · `online-badge`

CSS variables: `--bg #060815` · `--panel #0d1224` · `--line #202947` · `--text #eef2ff` · `--muted #8d98b7` · `--cyan #57e8ff` · `--purple #8b72ff` · `--good #5de1a4`

Code style in this repo is dense — minimal spaces around `=`, one-line functions, comments that explain *why* rather than *what*. Match it. Read `app/account/page.tsx` before writing any new page; it is the closest template to the billing page you'll build.

### Legal assets already on disk

`legal/` (currently **untracked** in git) contains:

```
1_Investment_and_Trading_Disclaimer.docx
2_Terms_of_Service.docx
3_Privacy_Policy.docx
4_Refund_and_Cancellation_Policy.docx
5_Legal_Review_Memo.docx
```

Stripe requires reachable Terms and Refund/Cancellation URLs for a subscription business, and a financial-research product draws extra scrutiny during account review. Phase 11 turns these into real pages. Flagging now so it isn't a surprise at go-live.

---

## 2. Decision: which processor

You asked to choose between Stripe and a Merchant-of-Record (Paddle / Lemon Squeezy).

### Recommendation: **Stripe, with Stripe Tax enabled.**

| | Stripe (+ Stripe Tax) | Paddle / Lemon Squeezy (MoR) |
|---|---|---|
| Fee | 2.9% + 30¢; Stripe Tax +0.5% on taxed txns | ~5% + 50¢ |
| Who is merchant of record | **You** | Them |
| Tax registration | **You register & file**; Stripe Tax calculates, collects, and monitors thresholds for you | They register & file; nothing for you |
| Promo codes (your `FOUNDER100` requirement) | First-class: Coupons + Promotion Codes, redemption caps, expiry, plan restriction | Supported but less flexible |
| Customer self-serve portal | Hosted Billing Portal, zero code | Varies |
| Reversible later | Yes — you own the customer relationship | Migrating off an MoR is painful |

**Why Stripe wins for this specific product:**

- The `FOUNDER100` flow you described works exactly as you wrote it, natively, with no special-casing in the Supabase sync. That was your stated preference and Stripe is the best fit for it.
- 2.1% + 20¢ cheaper per transaction. At $29/mo that's ~$0.80/subscriber/month kept.
- The stack is already Vercel + Node; Stripe's test mode, CLI, and test clocks make the "test the full flow before going live" item on your checklist genuinely achievable locally.
- Reversible. MoR is a one-way door.

**The honest catch — read before committing:**

Stripe Tax does **not** make you tax-compliant. It calculates and collects correctly, and it *monitors* when you cross a registration threshold, but **you** must register in each jurisdiction and file the returns.

- **US:** most states have economic nexus thresholds (commonly ~$100k in sales or ~200 transactions/yr). Early on you're almost certainly under them everywhere except your home state. Low burden.
- **EU / UK:** **there is no threshold for digital services sold to consumers.** VAT is owed from the very first €1 sale. If you sell to EU/UK consumers, you must register (EU: the non-Union OSS scheme, a single registration covering all member states; UK: separate registration).

**So the real decision is a narrower one:**

- Selling **US-first**, EU/UK later → **Stripe.** Clear win.
- Selling **globally from day one** and you do not want to touch an OSS registration → **Paddle** is genuinely worth the extra ~2%.
- A middle path that keeps Stripe's advantages: launch with Stripe, and either (a) restrict checkout to US/CA at first, or (b) register for EU OSS + UK VAT once the first non-US customer appears — Stripe Tax will tell you when.

### 🧍 DECISION GATE

**This plan assumes Stripe from Phase 1 onward.**

If Zach picks Paddle or Lemon Squeezy instead, **stop and re-plan.** Phases 3–7 and 10–11 change materially (different SDK, different webhook event names, no Stripe Tax step, different promo-code model). Phases 1–2, 8, and 9 mostly survive. Do not try to adapt this document on the fly.

> Side note on Lemon Squeezy: it was acquired by Stripe. If it is under consideration, verify current new-merchant onboarding status before committing — do not assume it's still an independent long-term option.

---

## 3. Pricing tiers and what's gated

### Tiers

| | **Free** | **Pro** | **Elite** |
|---|---|---|---|
| Price | $0 | **$29/mo** or **$290/yr** (2 months free) | **$99/mo** or **$990/yr** |
| Positioning | Try the research engine | The real product | Power user / small firm |

### Entitlement matrix

These are the **starting numbers**. Every one of them lives in a database table (`public.plan_limits`) so Zach can change any of them from the Supabase SQL Editor without a deploy. Nothing here is hardcoded in TypeScript.

| Meter key | What it limits | Free | Pro | Elite | Enforced by |
|---|---|---|---|---|---|
| `portfolios` | Rows in `portfolios` | 1 | 10 | 100 | Postgres trigger |
| `watchlist_symbols` | Rows in `watchlist_symbols` | 3 | 25 | 150 | Postgres trigger |
| `favorite_strategies` | `strategies` rows with `favorite=true` | 2 | 25 | 150 | Postgres trigger |
| `ai_company_report` | Anthropic narrative calls / month | 1 | 30 | 200 | Route + `consume_quota()` |
| `ai_portfolio_research` | Anthropic portfolio calls / month | 0 | 30 | 200 | Route + `consume_quota()` |
| `research_variations` | Max `variations` per research run | 10 000 | 1 000 000 | 1 000 000 | Client clamp + trigger |

Notes on the choices:

- **`favorite_strategies` is the load-bearing one.** Every favorited strategy is re-evaluated by the cron job every 5 minutes, forever. Free at 2 is deliberate.
- **`ai_portfolio_research` is 0 on Free.** The AI portfolio builder is the clearest "this is the paid thing" moment in the app; giving it away once teaches people it's free. One free *company report* is the better taster — it produces a document they'll want to keep.
- **`research_variations`** caps the free tier's research runs at 10k instead of 1M. This costs *you* nothing (the engine runs in the user's browser) but it's a real, felt limit and it protects the Yahoo endpoints from a free user running a 1M-variation job. Use `-1` in `plan_limits` to mean unlimited.
- **Elite is capped, not "unlimited."** Never sell unlimited against a metered upstream API. 200/mo at ~$0.10–0.15 a narrative is ~$25 of Anthropic cost against $99 revenue — a sane margin. Say "200/month" in the marketing copy, not "unlimited."

### The one thing that is never gated

Nothing already created by a user is ever deleted, hidden, or made unreadable when they downgrade or lapse. A lapsed Pro user with 8 portfolios keeps reading all 8 — they just cannot create a 9th until they're back under the Free limit of 1. This is implemented as "limits apply on **create**, never on **read**," and it is why the triggers in Phase 5 are `BEFORE INSERT`/`BEFORE UPDATE` only. Deleting a paying-then-lapsed customer's data is how you earn a chargeback.

---

## 4. Architecture

### The four enforcement layers

```
┌─────────────────────────────────────────────────────────────────┐
│ L4  React UI: disabled buttons, upgrade prompts, usage meters   │  ← UX only. Trivially bypassed. Never trusted.
├─────────────────────────────────────────────────────────────────┤
│ L3  Postgres triggers on INSERT/UPDATE                          │  ← Catches direct browser→Postgres writes
│     (portfolios, watchlist_symbols, strategies.favorite)        │     (the app's normal write path)
├─────────────────────────────────────────────────────────────────┤
│ L2  Route handlers: verify Supabase JWT → consume_quota()       │  ← Catches API calls. The money layer.
│     (narrative, portfolio-research)                             │
├─────────────────────────────────────────────────────────────────┤
│ L1  public.subscriptions — written ONLY by service_role         │  ← Source of truth. Users can SELECT, never write.
│     (the Stripe webhook)                                        │
└─────────────────────────────────────────────────────────────────┘
```

L3 exists because this app writes to Postgres straight from the browser. L2 exists because the API routes are wide open. **L4 alone is worthless** — that's the whole reason this plan is structured the way it is.

### Money flow

```
Browser                    /api/stripe/checkout            Stripe                 /api/stripe/webhook            Postgres
   │                              │                          │                            │                          │
   │ POST {plan,interval} ───────►│                          │                            │                          │
   │   + Bearer <supabase jwt>    │                          │                            │                          │
   │                              │ getUser(jwt) ────────────┼───────────────────────────►│ (verify user exists)     │
   │                              │ find-or-create Customer ►│                            │                          │
   │                              │ checkout.sessions.create►│                            │                          │
   │◄──── {url} ──────────────────│   client_reference_id    │                            │                          │
   │                              │   = supabase user id     │                            │                          │
   │ redirect to Stripe ──────────┼─────────────────────────►│                            │                          │
   │                              │                          │ user pays / enters promo   │                          │
   │                              │                          │─── checkout.session.completed ──►│                    │
   │                              │                          │─── customer.subscription.* ─────►│ re-fetch sub from  │
   │                              │                          │                            │     Stripe, upsert      │
   │                              │                          │                            │     subscriptions ──────►│
   │◄── redirect /account/billing?checkout=success ──────────│                            │                          │
   │ poll subscriptions until plan changes (~1-3s)                                                                    │
```

### Key design decisions, and why

**Re-fetch, don't trust the payload.** Stripe does not guarantee webhook ordering. A `customer.subscription.updated` can land before the `created` it supersedes. So on *any* subscription-shaped event, the handler ignores the embedded object and calls `stripe.subscriptions.retrieve(id)` to get current truth, then upserts. Slightly more API calls; completely immune to ordering bugs. Worth it.

**`current_period_end` is NOT on `Subscription`.** ⚠️ In the API version this SDK pins (`2026-08-26.dahlia`), `current_period_start` / `current_period_end` were **moved off `Subscription` onto `SubscriptionItem`**. Verified against `node_modules/stripe/esm/resources/Subscriptions.d.ts` (absent) and `SubscriptionItems.d.ts` line 54 (present). Read it as:

```ts
const periodEnd = subscription.items.data[0]?.current_period_end ?? null
```

Every Stripe tutorial older than ~2025 says `subscription.current_period_end`. Those are wrong for this SDK and will be `undefined` at runtime with no type error if you cast loosely. **This is the single most likely bug in this whole project.**

**Idempotency via a `stripe_events` table.** Stripe retries. Insert the event id first; on unique-violation, return 200 and stop.

**Price IDs are server-only.** The client sends `{plan:'pro', interval:'monthly'}`; the route maps that to a `STRIPE_PRICE_*` env var. Never put price IDs in `NEXT_PUBLIC_*` and never accept a `price_id` from the client — that lets someone check out at the price of their choosing.

**`plan_limits` is the single source of truth for numbers.** `lib/plans.ts` holds only *copy* (display name, blurb, feature bullets, which env var holds the price ID) — **zero enforced numbers**. The pricing UI reads the numbers from `plan_limits` at runtime. This makes it impossible for the marketing page and the enforcement layer to drift apart, which is the classic failure mode here.

### Complete file manifest

**New files (11):**

```
supabase/migration_v31_billing.sql          Phase 1 — tables, functions, grants
supabase/migration_v32_plan_triggers.sql    Phase 5 — row-limit triggers
lib/plans.ts                                Phase 2 — display copy only
lib/entitlements.ts                         Phase 2 — server-side plan/quota helpers
lib/authedUser.ts                           Phase 2 — JWT verification for routes
lib/stripe.ts                               Phase 3 — Stripe singleton + price map
app/api/stripe/checkout/route.ts            Phase 4
app/api/stripe/webhook/route.ts             Phase 6
app/api/stripe/portal/route.ts              Phase 7
app/pricing/page.tsx + layout.tsx           Phase 9
app/account/billing/page.tsx + layout.tsx   Phase 9
```

**Modified files (6):**

```
package.json                                add stripe
.env.example                                document new vars
app/api/company-report/narrative/route.ts   Phase 8 — auth + quota
app/api/portfolio-research/route.ts         Phase 8 — auth + quota
app/components/NavBar.tsx                   Phase 9 — plan badge
app/account/page.tsx                        Phase 9 — link to billing
README.md                                   Phase 12 — setup steps
```

**Untouched (do not edit):** `app/research/engine.ts`, `lib/market.ts`, `lib/strategySignals.ts`, `lib/companyReport.ts`, `lib/companyNarrative.ts`, every `app/api/cron/*`, `app/api/market/route.ts`, `app/api/company-report/route.ts`.

---

## 5. Environment variables

Add to Vercel (Production **and** Preview) and to local `.env.local`. Also append to `.env.example` **with empty values and a comment** matching the existing file's style.

| Var | Scope | Example / note |
|---|---|---|
| `STRIPE_SECRET_KEY` | server | `sk_test_…` local, `sk_live_…` prod |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` — **different for the CLI vs the deployed endpoint** |
| `STRIPE_PRICE_PRO_MONTHLY` | server | `price_…` |
| `STRIPE_PRICE_PRO_YEARLY` | server | `price_…` |
| `STRIPE_PRICE_ELITE_MONTHLY` | server | `price_…` |
| `STRIPE_PRICE_ELITE_YEARLY` | server | `price_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **already exists** (used by cron routes) |
| `NEXT_PUBLIC_SITE_URL` | public | `https://strategylabai.net` prod, `http://localhost:3000` local |

`NEXT_PUBLIC_SITE_URL` is the only new public one and it holds no secret — Checkout needs absolute `success_url` / `cancel_url`, and hardcoding the domain would break local testing.

---

# PHASE 0 — 🧍 HUMAN: Stripe Dashboard setup

**Executor: print this list, then stop. You cannot do any of it.**

Everything is in **Test mode** first (toggle top-right of the Stripe Dashboard).

1. **Create the Stripe account.** Business type, bank account, identity. A financial-research SaaS may get extra review — start this early, it can take days.
2. **Create two Products** (Product catalog → Add product):
   - `Strategy Lab AI — Pro`
   - `Strategy Lab AI — Elite`
3. **Add two recurring prices to each** (4 total):
   | Product | Price | Interval |
   |---|---|---|
   | Pro | $29.00 USD | Monthly |
   | Pro | $290.00 USD | Yearly |
   | Elite | $99.00 USD | Monthly |
   | Elite | $990.00 USD | Yearly |
4. **Copy all four `price_…` IDs.** These become `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_YEARLY`.
5. **Copy the test secret key** (Developers → API keys) → `STRIPE_SECRET_KEY`.
6. **Configure the Billing Portal** (Settings → Billing → Customer portal):
   - ✅ Allow customers to cancel subscriptions → **at end of billing period**
   - ✅ Allow switching plans → add all four prices as switchable
   - ✅ Allow updating payment method
   - ✅ Show invoice history
   - Set the return URL to `https://strategylabai.net/account/billing`
   - **Save.** The portal 500s if it was never configured.
7. **Set branding** (Settings → Branding): logo, the `#57e8ff` accent, business name.
8. **Install the Stripe CLI** locally: `brew install stripe/stripe-cli/stripe` then `stripe login`.

**Hand back to the executor:** the 4 price IDs, `STRIPE_SECRET_KEY`. (`STRIPE_WEBHOOK_SECRET` comes later — Phase 6.)

---

# PHASE 1 — Database foundation

**Creates:** `supabase/migration_v31_billing.sql`

Write exactly this file. Match the existing migration header style (see `supabase/migration_v30_cron_heartbeat.sql`).

```sql
-- Strategy Lab AI v31 migration. Run this ONCE in the Supabase SQL Editor.
-- Adds subscription billing: who is on which plan, what the plans allow, how
-- much of a metered allowance each user has consumed this month, and a record
-- of which Stripe webhook events have already been processed.
--
-- SECURITY NOTE, do not remove the REVOKEs below. migration_v4_grants.sql set
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to authenticated;
-- so EVERY table created in this schema afterwards is automatically fully
-- writable by any logged-in user. Billing state must never be user-writable —
-- otherwise a user grants themselves 'elite' from the browser console with one
-- line. Each table below therefore revokes the inherited grant and re-grants
-- only SELECT. All writes happen through the Stripe webhook using the service
-- role key, which bypasses RLS and has its own grant.

-- ---------------------------------------------------------------- plan_limits
-- Single source of truth for every enforced number. Deliberately a table and
-- not a TypeScript constant so limits can be tuned from the SQL Editor with no
-- deploy. lib/plans.ts holds display copy ONLY and must never hardcode these.
-- limit_value = -1 means unlimited.
create table if not exists public.plan_limits (
  plan text not null,
  meter text not null,
  limit_value integer not null,
  primary key (plan, meter)
);

insert into public.plan_limits (plan, meter, limit_value) values
  ('free',  'portfolios',             1),
  ('free',  'watchlist_symbols',      3),
  ('free',  'favorite_strategies',    2),
  ('free',  'ai_company_report',      1),
  ('free',  'ai_portfolio_research',  0),
  ('free',  'research_variations',    10000),
  ('pro',   'portfolios',             10),
  ('pro',   'watchlist_symbols',      25),
  ('pro',   'favorite_strategies',    25),
  ('pro',   'ai_company_report',      30),
  ('pro',   'ai_portfolio_research',  30),
  ('pro',   'research_variations',    1000000),
  ('elite', 'portfolios',             100),
  ('elite', 'watchlist_symbols',      150),
  ('elite', 'favorite_strategies',    150),
  ('elite', 'ai_company_report',      200),
  ('elite', 'ai_portfolio_research',  200),
  ('elite', 'research_variations',    1000000)
on conflict (plan, meter) do update set limit_value = excluded.limit_value;

alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits readable" on public.plan_limits;
-- Not user-specific and not sensitive: it is the pricing page's own data, and
-- the pricing page must render for logged-out visitors too.
create policy "plan_limits readable" on public.plan_limits for select using (true);
revoke all on public.plan_limits from anon, authenticated;
grant select on public.plan_limits to anon, authenticated;
grant all on public.plan_limits to service_role;

-- -------------------------------------------------------------- subscriptions
-- One row per user, created lazily on first checkout. Absence of a row means
-- 'free'. comp_plan is a manual override for friends/press/support credits —
-- it wins over Stripe and needs no Stripe object at all.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free',
  status text not null default 'inactive',
  price_id text,
  interval text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  comp_plan text,
  comp_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions read own" on public.subscriptions;
-- SELECT only, on purpose. There is deliberately no insert/update/delete policy
-- for ordinary users: the Stripe webhook writes every row via service_role.
create policy "subscriptions read own" on public.subscriptions for select
  using (auth.uid() = user_id);
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- ------------------------------------------------------------- usage_counters
-- Monthly metered usage. period_start is the first day of the UTC month, so a
-- user's allowance resets on the 1st regardless of when they subscribed. This
-- is simpler to reason about (and to explain in the UI) than aligning to each
-- customer's own billing anchor, and it always resets in the user's favour.
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  meter text not null,
  period_start date not null,
  used integer not null default 0,
  primary key (user_id, meter, period_start)
);

alter table public.usage_counters enable row level security;
drop policy if exists "usage_counters read own" on public.usage_counters;
create policy "usage_counters read own" on public.usage_counters for select
  using (auth.uid() = user_id);
revoke all on public.usage_counters from anon, authenticated;
grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;

-- -------------------------------------------------------------- stripe_events
-- Webhook idempotency. Stripe retries on any non-2xx and can deliver the same
-- event more than once even on success; the handler inserts the id here first
-- and bails out on conflict.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- No policy at all: nothing but service_role ever touches this.
revoke all on public.stripe_events from anon, authenticated;
grant all on public.stripe_events to service_role;

-- ------------------------------------------------------------- current_plan()
-- Resolves a user's effective plan. Used by the row-limit triggers (v32), by
-- the API routes, and by the UI. Order of precedence:
--   1. an unexpired comp_plan override
--   2. a Stripe subscription in a plan-granting status
--   3. 'free'
-- 'past_due' still grants access on purpose: Stripe retries a failed payment
-- for days, and yanking a paying customer's features the hour their card
-- expires is how you turn a renewal hiccup into a cancellation.
create or replace function public.current_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.comp_plan from public.subscriptions s
      where s.user_id = p_user_id
        and s.comp_plan is not null
        and (s.comp_expires_at is null or s.comp_expires_at > now())),
    (select s.plan from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active','trialing','past_due')),
    'free'
  );
$$;
grant execute on function public.current_plan(uuid) to authenticated, service_role;

-- -------------------------------------------------------------- plan_limit_of()
-- The limit a given plan has for a given meter. Unknown pairs return 0 (deny)
-- rather than null, so a typo'd meter name fails closed, not open.
create or replace function public.plan_limit_of(p_plan text, p_meter text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select limit_value from public.plan_limits where plan = p_plan and meter = p_meter),
    0
  );
$$;
grant execute on function public.plan_limit_of(text, text) to authenticated, service_role;

-- ------------------------------------------------------------ consume_quota()
-- Atomically checks and increments a monthly meter. The check and the
-- increment are one statement so two concurrent requests can never both slip
-- past the last unit of an allowance. Returns the decision plus the numbers the
-- caller needs to build a useful error message.
--   { allowed: bool, used: int, limit: int, plan: text, resets_at: date }
create or replace function public.consume_quota(p_user_id uuid, p_meter text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
begin
  v_plan := public.current_plan(p_user_id);
  v_limit := public.plan_limit_of(v_plan, p_meter);

  if v_limit < 0 then
    -- Unlimited: still record usage so the numbers stay honest for analytics.
    insert into public.usage_counters(user_id, meter, period_start, used)
    values (p_user_id, p_meter, v_period, 1)
    on conflict (user_id, meter, period_start)
      do update set used = public.usage_counters.used + 1
    returning used into v_used;
    return jsonb_build_object('allowed', true, 'used', v_used, 'limit', -1,
                              'plan', v_plan, 'resets_at', (v_period + interval '1 month')::date);
  end if;

  -- One statement: the WHERE on the DO UPDATE means the row is only bumped when
  -- there is headroom, and RETURNING tells us whether that happened.
  insert into public.usage_counters(user_id, meter, period_start, used)
  values (p_user_id, p_meter, v_period, 1)
  on conflict (user_id, meter, period_start)
    do update set used = public.usage_counters.used + 1
    where public.usage_counters.used < v_limit
  returning used into v_used;

  if v_used is null then
    -- The conflicting row existed and was already at the limit.
    select used into v_used from public.usage_counters
      where user_id = p_user_id and meter = p_meter and period_start = v_period;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit,
                              'plan', v_plan, 'resets_at', (v_period + interval '1 month')::date);
  end if;

  -- The fresh-insert path bypasses the WHERE above, so a limit of 0 has to be
  -- caught here: roll the row back to 0 and deny.
  if v_used > v_limit then
    update public.usage_counters set used = v_limit
      where user_id = p_user_id and meter = p_meter and period_start = v_period;
    return jsonb_build_object('allowed', false, 'used', v_limit, 'limit', v_limit,
                              'plan', v_plan, 'resets_at', (v_period + interval '1 month')::date);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit,
                            'plan', v_plan, 'resets_at', (v_period + interval '1 month')::date);
end;
$$;
-- Only the service role may spend quota. Never grant this to `authenticated`:
-- the browser could then burn its own counter, or worse, someone else's.
revoke all on function public.consume_quota(uuid, text) from anon, authenticated;
grant execute on function public.consume_quota(uuid, text) to service_role;
```

### 🧍 HUMAN
Paste `supabase/migration_v31_billing.sql` into the Supabase SQL Editor and run it. Report success or the error text.

### VERIFY

Run in the SQL Editor. Expected results noted inline.

```sql
-- 1. current_plan on a user with no row → 'free'
select public.current_plan((select id from auth.users limit 1));

-- 2. limits load
select * from public.plan_limits order by plan, meter;   -- 18 rows

-- 3. quota spends and then denies. Free allows 1 ai_company_report.
select public.consume_quota((select id from auth.users limit 1), 'ai_company_report');  -- allowed:true, used:1
select public.consume_quota((select id from auth.users limit 1), 'ai_company_report');  -- allowed:false, used:1

-- 4. a zero limit denies on the very first call
select public.consume_quota((select id from auth.users limit 1), 'ai_portfolio_research'); -- allowed:false, used:0, limit:0

-- 5. clean up the test counters
delete from public.usage_counters;

-- 6. THE IMPORTANT ONE — authenticated must NOT be able to write subscriptions
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'subscriptions' and grantee = 'authenticated';
-- Expected: exactly one row, SELECT. If INSERT/UPDATE/DELETE appear, the
-- REVOKE did not take — stop and fix before continuing.
```

**COMMIT:** `Add billing schema: subscriptions, plan limits, usage quotas`

---

# PHASE 2 — Plan config and server-side helpers

**Creates:** `lib/plans.ts`, `lib/authedUser.ts`, `lib/entitlements.ts`

### `lib/plans.ts` — display copy only

> **Rule: no enforced number appears in this file.** Limits live in `public.plan_limits`. If you find yourself typing `30` here, stop — the UI should read it from the database.

```ts
// Display metadata for the pricing and billing pages. Deliberately contains NO
// enforced limits: every number a user is actually held to lives in the
// public.plan_limits table so it can be changed from the Supabase SQL Editor
// without a deploy, and so the marketing copy can never drift away from what
// the code enforces. The pricing page reads the numbers from that table and
// interpolates them into the bullets below.

export type PlanId = 'free' | 'pro' | 'elite'
export type Interval = 'monthly' | 'yearly'

export type PlanCopy = {
  id: PlanId
  name: string
  blurb: string
  priceMonthly: number | null   // display only — Stripe is the real price
  priceYearly: number | null
  // Which env var holds each Stripe price ID. Resolved server-side only.
  priceEnv: Record<Interval, string> | null
  // {meter} placeholders are replaced with the live plan_limits value.
  bullets: string[]
}

export const PLANS: Record<PlanId, PlanCopy> = {
  free: {
    id: 'free', name: 'Free', blurb: 'Explore the research engine.',
    priceMonthly: 0, priceYearly: 0, priceEnv: null,
    bullets: [
      'Up to {research_variations} strategy variations per run',
      '{portfolios} portfolio',
      '{watchlist_symbols} watchlist symbols',
      '{favorite_strategies} favorited strategies with live signal checks',
      '{ai_company_report} AI company report per month',
      'AI portfolio research not included',
    ],
  },
  pro: {
    id: 'pro', name: 'Pro', blurb: 'The full research platform.',
    priceMonthly: 29, priceYearly: 290,
    priceEnv: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', yearly: 'STRIPE_PRICE_PRO_YEARLY' },
    bullets: [
      'Up to {research_variations} strategy variations per run',
      '{portfolios} portfolios',
      '{watchlist_symbols} watchlist symbols',
      '{favorite_strategies} favorited strategies with live signal checks',
      '{ai_company_report} AI company reports per month',
      '{ai_portfolio_research} AI portfolio research runs per month',
    ],
  },
  elite: {
    id: 'elite', name: 'Elite', blurb: 'For heavy, daily use.',
    priceMonthly: 99, priceYearly: 990,
    priceEnv: { monthly: 'STRIPE_PRICE_ELITE_MONTHLY', yearly: 'STRIPE_PRICE_ELITE_YEARLY' },
    bullets: [
      'Everything in Pro, at {portfolios} portfolios',
      '{watchlist_symbols} watchlist symbols',
      '{favorite_strategies} favorited strategies with live signal checks',
      '{ai_company_report} AI company reports per month',
      '{ai_portfolio_research} AI portfolio research runs per month',
      'Priority support',
    ],
  },
}

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'elite']
export const isPaidPlan = (p: string): p is 'pro' | 'elite' => p === 'pro' || p === 'elite'
```

### `lib/authedUser.ts` — JWT verification for route handlers

This is the piece that does not exist anywhere in the app yet. Every gated route uses it.

```ts
// Verifies the Supabase access token a browser sends on a gated API route.
// Until now every route under app/api/ was completely unauthenticated (IP rate
// limiting only) — anything that can spend money or consume a paid allowance
// has to know WHO is calling, not just how often.
//
// The browser attaches the token it already holds:
//   const {data:{session}} = await supabase.auth.getSession()
//   fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
//
// Verification goes through supabase.auth.getUser(token), which validates the
// signature and expiry server-side. Never decode the JWT yourself and trust the
// `sub` claim — an unverified JWT is just a string the caller made up.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cachedAdmin: SupabaseClient | null = null

/** Service-role client. Bypasses RLS — never hand this to the browser. */
export function adminClient(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  cachedAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return cachedAdmin
}

export function bearerToken(req: { headers: { get(n: string): string | null } }): string | null {
  const h = req.headers.get('authorization')
  if (!h?.startsWith('Bearer ')) return null
  const t = h.slice(7).trim()
  return t || null
}

export type AuthedUser = { id: string; email: string | null }

/** Returns the verified user, or null if the token is missing/invalid/expired. */
export async function getAuthedUser(req: { headers: { get(n: string): string | null } }): Promise<AuthedUser | null> {
  const token = bearerToken(req)
  if (!token) return null
  const admin = adminClient()
  if (!admin) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
```

### `lib/entitlements.ts` — plan + quota for routes

```ts
// Server-side entitlement checks. Everything here runs with the service role,
// and every number comes from Postgres (plan_limits / consume_quota) — this
// module deliberately hardcodes no limits of its own.
import { adminClient } from './authedUser'

export type QuotaResult = {
  allowed: boolean
  used: number
  limit: number       // -1 = unlimited
  plan: string
  resets_at: string
}

export async function planFor(userId: string): Promise<string> {
  const admin = adminClient()
  if (!admin) return 'free'
  const { data, error } = await admin.rpc('current_plan', { p_user_id: userId })
  if (error) { console.error('current_plan failed', error); return 'free' }
  return (data as string) || 'free'
}

/**
 * Atomically spends one unit of a monthly meter. Call this ONLY immediately
 * before doing the paid work — it increments whether or not the work then
 * succeeds, which is the safe direction (a failed Anthropic call costing a
 * user one report beats an unmetered retry loop costing us hundreds).
 */
export async function consumeQuota(userId: string, meter: string): Promise<QuotaResult> {
  const admin = adminClient()
  if (!admin) return { allowed: false, used: 0, limit: 0, plan: 'free', resets_at: '' }
  const { data, error } = await admin.rpc('consume_quota', { p_user_id: userId, p_meter: meter })
  if (error) {
    // Fail CLOSED. This gate exists to stop paid API spend; a database blip
    // must not become free unlimited Anthropic calls. (Note this is the exact
    // opposite of lib/rateLimit.ts's fail-open choice, which is right there —
    // a Redis outage should not 500 the whole app — and wrong here.)
    console.error('consume_quota failed', error)
    return { allowed: false, used: 0, limit: 0, plan: 'free', resets_at: '' }
  }
  return data as QuotaResult
}

/** 402 body for a caller who is out of allowance. The UI renders `message`. */
export function quotaExceededPayload(q: QuotaResult, what: string) {
  const resets = q.resets_at ? new Date(q.resets_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'next month'
  return {
    body: {
      error: 'quota_exceeded',
      plan: q.plan, used: q.used, limit: q.limit, resetsAt: q.resets_at,
      message: q.limit === 0
        ? `${what} isn't included on the ${q.plan} plan. Upgrade to unlock it.`
        : `You've used all ${q.limit} of your ${what} for this month (resets ${resets}). Upgrade for a higher monthly allowance.`,
    },
    status: 402 as const,
  }
}

export function unauthorizedPayload() {
  return { body: { error: 'unauthorized', message: 'Please log in to use this feature.' }, status: 401 as const }
}
```

### VERIFY

```bash
npx tsc --noEmit
```

Zero errors. (This is the standard typecheck for the whole plan — `package.json` has no test or lint script.)

**COMMIT:** `Add plan config, JWT verification, and entitlement helpers`

---

# PHASE 3 — Stripe SDK wiring

### Install

```bash
npm install stripe@^22.6.2
```

### `lib/stripe.ts`

```ts
// Stripe server client. Node-only: never import this from a 'use client' file
// — STRIPE_SECRET_KEY must never reach the browser.
//
// The SDK's pinned API version is 2026-08-26.dahlia. Two consequences worth
// knowing before you write any Stripe code against it:
//   1. Omitting `apiVersion` uses the SDK's pinned version, which is what the
//      bundled TypeScript types describe. Pinning it explicitly to anything
//      else means the types stop matching reality.
//   2. current_period_start / current_period_end were MOVED off Subscription
//      onto SubscriptionItem. See subscriptionPeriodEnd() below. Every older
//      Stripe tutorial reads subscription.current_period_end; on this version
//      that is `undefined` at runtime.
import Stripe from 'stripe'

let cached: Stripe | null = null

export function stripeClient(): Stripe {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  cached = new Stripe(key, { typescript: true, maxNetworkRetries: 2 })
  return cached
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Resolves {plan, interval} to a Stripe price ID from server-only env vars.
 * The client sends a plan name, never a price ID — accepting a price_id from
 * the browser would let a caller check out at any price in the account.
 */
export function priceIdFor(plan: string, interval: string): string | null {
  const map: Record<string, string | undefined> = {
    'pro:monthly': process.env.STRIPE_PRICE_PRO_MONTHLY,
    'pro:yearly': process.env.STRIPE_PRICE_PRO_YEARLY,
    'elite:monthly': process.env.STRIPE_PRICE_ELITE_MONTHLY,
    'elite:yearly': process.env.STRIPE_PRICE_ELITE_YEARLY,
  }
  return map[`${plan}:${interval}`] || null
}

/** Reverse lookup: which {plan, interval} does a price ID correspond to? */
export function planForPriceId(priceId: string | null | undefined): { plan: string; interval: string } | null {
  if (!priceId) return null
  const pairs: [string, string, string | undefined][] = [
    ['pro', 'monthly', process.env.STRIPE_PRICE_PRO_MONTHLY],
    ['pro', 'yearly', process.env.STRIPE_PRICE_PRO_YEARLY],
    ['elite', 'monthly', process.env.STRIPE_PRICE_ELITE_MONTHLY],
    ['elite', 'yearly', process.env.STRIPE_PRICE_ELITE_YEARLY],
  ]
  for (const [plan, interval, id] of pairs) if (id && id === priceId) return { plan, interval }
  return null
}

/**
 * The period end for a subscription, as an ISO string.
 * ⚠️ On API version 2026-08-26.dahlia this lives on the SUBSCRIPTION ITEM, not
 * the subscription. Verified in node_modules/stripe/esm/resources/
 * SubscriptionItems.d.ts (`current_period_end: number`) and absent from
 * Subscriptions.d.ts. Do not "simplify" this to sub.current_period_end.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const secs = sub.items?.data?.[0]?.current_period_end
  return typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null
}

export function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
}
```

### VERIFY

```bash
npx tsc --noEmit
node -e "console.log(require('stripe/package.json').version)"   # 22.6.x
node -e "console.log(require('stripe/cjs/apiVersion.js').ApiVersion)"  # 2026-08-26.dahlia
```

If the API version differs from `2026-08-26.dahlia`, re-check whether `current_period_end` is on `Subscription` or `SubscriptionItem` in the installed `.d.ts` files before continuing.

**COMMIT:** `Add Stripe client with price mapping and period-end helper`

---

# PHASE 4 — Checkout session route

**Creates:** `app/api/stripe/checkout/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, adminClient } from '@/lib/authedUser'
import { stripeClient, isStripeConfigured, priceIdFor, siteUrl } from '@/lib/stripe'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

// No `runtime` export on purpose: Node is the default in Next 16 and the Edge
// runtime is deprecated. The Stripe SDK's default HTTP client is Node's.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('stripe-checkout', clientIp(req), [
    { limit: 10, windowMs: 60_000, label: 'burst' },
    { limit: 40, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!rl.ok) { const p = rateLimitedPayload(rl); return NextResponse.json(p.body, { status: p.status, headers: p.headers }) }

  if (!isStripeConfigured()) return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })

  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: 'Please log in first.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const plan = String(body?.plan || '')
  const interval = String(body?.interval || 'monthly')
  // Only a plan name is accepted. Never take a price ID from the client.
  const priceId = priceIdFor(plan, interval)
  if (!priceId) return NextResponse.json({ error: 'Unknown plan or billing interval.' }, { status: 400 })

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 })
  const stripe = stripeClient()

  // --- Find or create the Stripe Customer -----------------------------------
  // The mapping is stored in our own table, not looked up by email: emails are
  // mutable and two Stripe customers can share one. Creating a duplicate
  // customer on every checkout is the classic bug here.
  const { data: existing } = await admin.from('subscriptions')
    .select('stripe_customer_id').eq('user_id', user.id).maybeSingle()

  let customerId = existing?.stripe_customer_id || null
  if (customerId) {
    // Guard against a customer deleted in the Dashboard (common while testing).
    try {
      const c = await stripe.customers.retrieve(customerId)
      if ((c as any).deleted) customerId = null
    } catch { customerId = null }
  }
  if (!customerId) {
    const created = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = created.id
    const { error: upsertErr } = await admin.from('subscriptions')
      .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' })
    if (upsertErr) { console.error('could not persist stripe_customer_id', upsertErr); return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 }) }
  }

  // --- Create the Checkout Session ------------------------------------------
  const base = siteUrl()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Both of these carry the Supabase user id so the webhook can map back even
    // if the subscriptions row were somehow missing. Belt and braces.
    client_reference_id: user.id,
    subscription_data: { metadata: { supabase_user_id: user.id } },
    metadata: { supabase_user_id: user.id, plan, interval },
    // This is what makes FOUNDER100 work — it renders the promo-code box.
    allow_promotion_codes: true,
    success_url: `${base}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing?checkout=cancelled`,
    // Stripe Tax. Harmless before Tax is switched on in the Dashboard; once it
    // is on, customer_update.address is REQUIRED whenever an existing customer
    // is passed, or the call errors. See Phase 11.
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    tax_id_collection: { enabled: true },
  })

  if (!session.url) return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 })
  return NextResponse.json({ url: session.url })
}
```

**Note on `allow_promotion_codes` + `automatic_tax`:** these are compatible. If `automatic_tax` errors before Phase 11 (Tax not yet enabled on the account), temporarily set `enabled: false` and leave a `// TODO Phase 11` — do not delete `customer_update`.

### VERIFY

`npx tsc --noEmit` clean. Full behavioural test comes in Phase 12 — this route can't be meaningfully exercised until the webhook exists.

**COMMIT:** `Add Stripe Checkout session route`

---

# PHASE 5 — Row-limit enforcement in Postgres

This is the layer that stops the actual bypass. The app writes `portfolios`, `watchlist_symbols`, and `strategies.favorite` **directly from the browser** — no API route is involved, so no route handler can gate them.

**Creates:** `supabase/migration_v32_plan_triggers.sql`

```sql
-- Strategy Lab AI v32 migration. Run this ONCE in the Supabase SQL Editor.
-- Enforces per-plan row limits inside Postgres.
--
-- Why triggers and not React: this app writes portfolios, watchlist symbols and
-- strategy favorites straight from the browser to Postgres (see
-- app/portfolios/page.tsx, app/trade-signals/page.tsx, app/research/page.tsx).
-- There is no server route in between, so a disabled button in React stops
-- nobody with a devtools console open. The UI still disables those buttons for
-- a good experience; THIS is what actually holds.
--
-- Deliberately INSERT/UPDATE only. Nothing here ever deletes or hides data a
-- user already created: someone who downgrades from Pro keeps reading all ten
-- of their portfolios, they just can't add an eleventh. Destroying a former
-- customer's work is how you earn a chargeback.

-- Raised as a distinct SQLSTATE so the client can tell a plan limit apart from
-- an ordinary constraint violation. supabase-js surfaces it as error.code.
-- 'P0001' is plpgsql's generic raise_exception; a custom code is clearer.
create or replace function public.enforce_plan_row_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meter text := TG_ARGV[0];
  v_plan text;
  v_limit integer;
  v_count integer;
  v_user uuid;
begin
  -- The owning user differs per table: portfolios/watchlist/strategies all have
  -- user_id, so NEW.user_id is right for every table this is attached to.
  v_user := NEW.user_id;
  if v_user is null then return NEW; end if;

  v_plan := public.current_plan(v_user);
  v_limit := public.plan_limit_of(v_plan, v_meter);
  if v_limit < 0 then return NEW; end if;   -- unlimited

  if v_meter = 'portfolios' then
    select count(*) into v_count from public.portfolios where user_id = v_user;
  elsif v_meter = 'watchlist_symbols' then
    select count(*) into v_count from public.watchlist_symbols where user_id = v_user;
  elsif v_meter = 'favorite_strategies' then
    select count(*) into v_count from public.strategies where user_id = v_user and favorite = true;
  else
    return NEW;
  end if;

  if v_count >= v_limit then
    raise exception using
      errcode = 'SLA01',
      message = format('PLAN_LIMIT:%s:%s:%s', v_meter, v_plan, v_limit);
  end if;

  return NEW;
end;
$$;

-- portfolios ------------------------------------------------------------------
drop trigger if exists portfolios_plan_limit on public.portfolios;
create trigger portfolios_plan_limit
  before insert on public.portfolios
  for each row execute function public.enforce_plan_row_limit('portfolios');

-- watchlist_symbols -----------------------------------------------------------
drop trigger if exists watchlist_plan_limit on public.watchlist_symbols;
create trigger watchlist_plan_limit
  before insert on public.watchlist_symbols
  for each row execute function public.enforce_plan_row_limit('watchlist_symbols');

-- strategies.favorite ---------------------------------------------------------
-- An UPDATE, not an INSERT: strategies are created unfavorited and toggled
-- later. The WHEN clause means the trigger only fires on the false→true edge,
-- so unfavoriting always works and re-saving an already-favorited row is free.
drop trigger if exists strategies_favorite_plan_limit on public.strategies;
create trigger strategies_favorite_plan_limit
  before update on public.strategies
  for each row
  when (NEW.favorite = true and coalesce(OLD.favorite, false) = false)
  execute function public.enforce_plan_row_limit('favorite_strategies');

-- research_runs.variations_requested ------------------------------------------
-- Costs us nothing to run (the engine is in the user's browser) but a free
-- account launching a 1,000,000-variation job hammers the shared Yahoo
-- endpoints that every paying user depends on.
create or replace function public.enforce_variations_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := public.plan_limit_of(public.current_plan(NEW.user_id), 'research_variations');
begin
  if v_limit < 0 then return NEW; end if;
  if NEW.variations_requested > v_limit then
    raise exception using
      errcode = 'SLA01',
      message = format('PLAN_LIMIT:research_variations:%s:%s',
                       public.current_plan(NEW.user_id), v_limit);
  end if;
  return NEW;
end;
$$;

drop trigger if exists research_runs_variations_limit on public.research_runs;
create trigger research_runs_variations_limit
  before insert on public.research_runs
  for each row execute function public.enforce_variations_limit();
```

### 🧍 HUMAN
Run `supabase/migration_v32_plan_triggers.sql` in the SQL Editor.

### VERIFY

```sql
-- As a free user (no subscriptions row), the 2nd portfolio must fail.
-- Substitute a real user id.
insert into public.portfolios(user_id, name) values ('<USER_ID>', 'limit test 1');
insert into public.portfolios(user_id, name) values ('<USER_ID>', 'limit test 2');
-- Expected on the 2nd (free limit is 1): ERROR  PLAN_LIMIT:portfolios:free:1
-- If the user already had portfolios, the FIRST one may fail instead — also correct.

-- Grant a comp plan and confirm the limit lifts:
insert into public.subscriptions(user_id, plan, status, comp_plan)
  values ('<USER_ID>', 'free', 'inactive', 'pro')
  on conflict (user_id) do update set comp_plan = 'pro';
insert into public.portfolios(user_id, name) values ('<USER_ID>', 'limit test 2');  -- succeeds

-- Clean up
delete from public.portfolios where name like 'limit test%';
update public.subscriptions set comp_plan = null where user_id = '<USER_ID>';
```

**Also verify from the browser**, which is the path that matters: log in, open the console on `/portfolios`, and try to insert past the limit via `supabase.from('portfolios').insert(...)`. It must fail with code `SLA01`.

**COMMIT:** `Enforce per-plan row limits with Postgres triggers`

---

# PHASE 6 — Stripe webhook

The most important file in this project. Everything that grants access flows through it.

**Creates:** `app/api/stripe/webhook/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { adminClient } from '@/lib/authedUser'
import { stripeClient, isStripeConfigured, subscriptionPeriodEnd, subscriptionPriceId, planForPriceId } from '@/lib/stripe'

// Node runtime (the default in Next 16 — do NOT add `export const runtime`).
// Stripe signature verification needs the exact raw bytes of the body, which
// `await req.text()` gives us. Next's App Router never pre-parses a route
// handler's body, so no bodyParser config is needed or possible.
export const dynamic = 'force-dynamic'

// Statuses that grant paid access. 'past_due' is intentional: Stripe retries a
// failed charge for days, and revoking a paying customer's access the hour
// their card expires converts a renewal hiccup into a cancellation. Kept in
// sync with public.current_plan() in migration_v31 — change both together.
const GRANTING = new Set(['active', 'trialing', 'past_due'])

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) { console.error('STRIPE_WEBHOOK_SECRET missing'); return NextResponse.json({ error: 'not_configured' }, { status: 503 }) }

  const raw = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const stripe = stripeClient()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e: any) {
    // A bad signature means the caller is not Stripe. 400, and never read the body.
    console.error('stripe webhook signature verification failed', e?.message)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) { console.error('service role not configured'); return NextResponse.json({ error: 'not_configured' }, { status: 500 }) }

  // --- Idempotency ----------------------------------------------------------
  // Stripe retries on any non-2xx and may deliver the same event twice even
  // after a 200. Claim the id first; a conflict means we already handled it.
  const { error: claimErr } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
  if (claimErr) {
    if (claimErr.code === '23505') return NextResponse.json({ received: true, duplicate: true })
    console.error('could not record stripe event', claimErr)
    // Fall through and process anyway: at-least-once beats dropping a payment.
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break
        const userId = session.client_reference_id || session.metadata?.supabase_user_id
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (!userId || !subId) { console.error('checkout.session.completed missing user or subscription', session.id); break }
        await syncSubscription(admin, stripe, subId, userId)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription
        await syncSubscription(admin, stripe, sub.id, sub.metadata?.supabase_user_id || null)
        break
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Re-sync so status and period_end reflect the payment outcome. Works
        // unchanged for $0 invoices from a 100%-off promo code.
        const inv = event.data.object as Stripe.Invoice
        const subId = (inv as any).subscription
        const id = typeof subId === 'string' ? subId : subId?.id
        if (id) await syncSubscription(admin, stripe, id, null)
        break
      }

      default:
        break
    }
  } catch (e: any) {
    // 500 so Stripe retries. Log loudly — a silent failure here is a paying
    // customer who never gets access.
    console.error('stripe webhook handler failed', event.type, event.id, e?.message, e)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/**
 * Writes the canonical subscription state for one Stripe subscription.
 *
 * Re-fetches from Stripe instead of trusting event.data.object, because Stripe
 * does NOT guarantee webhook ordering — an `updated` can arrive before the
 * `created` it supersedes, and trusting the payload would then persist stale
 * state permanently. One extra API call buys immunity to that whole class of bug.
 */
async function syncSubscription(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  stripe: Stripe,
  subscriptionId: string,
  userIdHint: string | null,
) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve the Supabase user: metadata → hint → our own customer-id mapping.
  let userId = sub.metadata?.supabase_user_id || userIdHint || null
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
    userId = data?.user_id || null
  }
  if (!userId) {
    // Last resort: the Customer object's own metadata (set at creation).
    const cust = await stripe.customers.retrieve(customerId)
    if (!(cust as any).deleted) userId = (cust as Stripe.Customer).metadata?.supabase_user_id || null
  }
  if (!userId) { console.error('could not map stripe subscription to a supabase user', subscriptionId, customerId); return }

  const priceId = subscriptionPriceId(sub)
  const mapped = planForPriceId(priceId)
  const granting = GRANTING.has(sub.status)

  // Downgrade to 'free' rather than nulling the row: keeping the row preserves
  // stripe_customer_id, so a resubscribe reuses the same Stripe customer and
  // their invoice history stays in one place.
  const plan = granting && mapped ? mapped.plan : 'free'

  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan,
    status: sub.status,
    price_id: priceId,
    interval: mapped?.interval ?? null,
    // ⚠️ SubscriptionItem, not Subscription — see lib/stripe.ts.
    current_period_end: subscriptionPeriodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) { console.error('subscription upsert failed', userId, error); throw new Error(error.message) }
  console.log('subscription synced', { userId, plan, status: sub.status, subscriptionId: sub.id })
}
```

### 🧍 HUMAN — local webhook secret

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It prints `Ready! Your webhook signing secret is whsec_…`. Put that in `.env.local` as `STRIPE_WEBHOOK_SECRET`. **Leave this terminal running** during all local testing.

> The deployed endpoint gets a **different** `whsec_`. That's Phase 13.

### VERIFY

With `npm run dev` and `stripe listen` both running:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

- `stripe listen` shows `200` for each.
- Dev server logs show `subscription synced` (or a clear "could not map…" for `stripe trigger` fixtures, which have no real Supabase user — that's expected and fine).
- Re-running the same event id returns `{received:true, duplicate:true}`.
- `select * from public.stripe_events order by received_at desc limit 5;` has rows.

**Bad-signature check:**

```bash
curl -i -X POST localhost:3000/api/stripe/webhook -H 'stripe-signature: t=1,v1=bogus' -d '{}'
```

Must be `400 invalid_signature`.

**COMMIT:** `Add Stripe webhook handler syncing subscription state to Supabase`

---

# PHASE 7 — Billing portal route

**Creates:** `app/api/stripe/portal/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, adminClient } from '@/lib/authedUser'
import { stripeClient, isStripeConfigured, siteUrl } from '@/lib/stripe'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// Self-serve cancel / upgrade / payment method / invoices. All of it is
// Stripe's hosted UI — nothing here to build or maintain. Cancellations made
// in the portal come back to us as customer.subscription.updated/deleted,
// which the Phase 6 webhook already handles, so there is no second code path.
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('stripe-portal', clientIp(req), [{ limit: 20, windowMs: 3_600_000, label: 'hourly' }])
  if (!rl.ok) { const p = rateLimitedPayload(rl); return NextResponse.json(p.body, { status: p.status, headers: p.headers }) }

  if (!isStripeConfigured()) return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })

  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 })

  const { data } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
  if (!data?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_customer', message: "You don't have a billing account yet — subscribe first." }, { status: 400 })
  }

  try {
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl()}/account/billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    // Overwhelmingly the cause: the portal was never configured in the
    // Dashboard (Settings → Billing → Customer portal → Save). Say so plainly
    // instead of surfacing Stripe's opaque message.
    console.error('billing portal session failed', e?.message)
    return NextResponse.json({ error: 'portal_failed', message: 'Could not open the billing portal. If this persists, contact support.' }, { status: 502 })
  }
}
```

### VERIFY

`npx tsc --noEmit` clean. Behavioural test in Phase 12.

**COMMIT:** `Add Stripe billing portal route`

---

# PHASE 8 — Gate the two AI routes

Both routes currently accept any anonymous caller. Add auth + quota **in front of** the existing IP rate limit's work, keeping the rate limit as the outer DoS guard.

### 8a — `app/api/company-report/narrative/route.ts`

Insert after the existing rate-limit block, before `const bundle = await req.json()`:

```ts
// Anyone could call this route anonymously until now, spending real Anthropic
// credits with no account attached. The IP rate limit above is still the first
// line of defence (it stops a flood before we do any database work); this is
// the one that ties spend to a paying account.
const user = await getAuthedUser(req)
if (!user) { const p = unauthorizedPayload(); return NextResponse.json(p.body, { status: p.status }) }

const quota = await consumeQuota(user.id, 'ai_company_report')
if (!quota.allowed) { const p = quotaExceededPayload(quota, 'AI company reports'); return NextResponse.json(p.body, { status: p.status }) }
```

Add to the imports:

```ts
import { getAuthedUser } from '@/lib/authedUser'
import { consumeQuota, quotaExceededPayload, unauthorizedPayload } from '@/lib/entitlements'
```

### 8b — `app/api/portfolio-research/route.ts`

Same pattern, after the rate-limit block, with meter `'ai_portfolio_research'` and label `'AI portfolio research runs'`.

### 8c — Client callers must send the token

Two call sites need the header. Both are in `'use client'` pages that already hold a Supabase session.

**`app/company-report/page.tsx` ~line 135** — currently:

```ts
const nr = await fetch('/api/company-report/narrative', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(j) })
```

becomes:

```ts
const {data:{session:s}}=await supabase!.auth.getSession()
const nr = await fetch('/api/company-report/narrative', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(s?.access_token?{Authorization:`Bearer ${s.access_token}`}:{}) },
  body: JSON.stringify(j),
})
if(nr.status===402||nr.status===401){const e=await nr.json().catch(()=>null);setError(e?.message||'Upgrade required.');setUpgradePrompt(true);return}
```

**`app/portfolios/page.tsx` ~line 348** — same treatment on the `/api/portfolio-research` call inside `runResearch()`.

> Read the surrounding error handling in each file first and match its existing state variables (`setError`, `setMsg`, …) rather than introducing new ones. `app/company-report/page.tsx` and `app/portfolios/page.tsx` do not use the same names.

Add an `upgradePrompt` boolean to each page's state and render, on `true`:

```tsx
{upgradePrompt&&<p className="msg banner">{error} <a href="/pricing">See plans →</a></p>}
```

### VERIFY

```bash
# Anonymous must now be rejected — this previously spent real money.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/company-report/narrative \
  -H 'content-type: application/json' -d '{"overview":{"name":"x"}}'
# Expected: 401

curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/portfolio-research \
  -H 'content-type: application/json' -d '{"description":"tech"}'
# Expected: 401
```

Then in the browser, logged in as a free user: generate a company report. The first succeeds; the second returns 402 with the upgrade message. Confirm with:

```sql
select * from public.usage_counters where meter = 'ai_company_report';
```

**COMMIT:** `Require an account and spend quota on the two AI routes`

---

# PHASE 9 — User-facing UI

Three pieces. Use existing CSS classes throughout — **add no new CSS** unless something genuinely has no existing equivalent, and if so append it to the end of `app/globals.css` in that file's dense style.

### 9a — `app/pricing/page.tsx` (+ `layout.tsx`)

Public, works logged out. Model it on `app/account/page.tsx`'s structure.

- `layout.tsx`: 7 lines, `export const metadata: Metadata = { title: 'Pricing' }` — copy `app/account/layout.tsx` exactly.
- Fetch `plan_limits` client-side (readable by `anon`) and interpolate the `{meter}` placeholders in `PLANS[x].bullets`. **Do not hardcode any number in the JSX.**
- Monthly/yearly toggle. On yearly show "2 months free".
- Three `.panel` cards in a `.grid`. Highlight Pro with `.cta-glow` on its button.
- Button behaviour:
  - logged out → `router.push('/research')` (that page hosts the auth form) with a note to come back
  - logged in, on that plan → disabled, label `CURRENT PLAN`
  - otherwise → `startCheckout(plan, interval)`

```ts
async function startCheckout(plan:string,interval:string){
  if(!supabase)return
  setBusy(true);setMsg('')
  const {data:{session:s}}=await supabase.auth.getSession()
  if(!s){router.push('/research');return}
  const r=await fetch('/api/stripe/checkout',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({plan,interval})})
  const j=await r.json().catch(()=>null)
  setBusy(false)
  if(!r.ok||!j?.url){setMsg(j?.message||j?.error||'Could not start checkout. Please try again.');return}
  window.location.href=j.url
}
```

### 9b — `app/account/billing/page.tsx` (+ `layout.tsx`)

Logged-in only. Mirror the `if(!supabase)` / `if(!session)` guards from `app/account/page.tsx` verbatim.

Content:
- **Current plan panel** — plan name, status, renews-or-ends date from `current_period_end`, and if `cancel_at_period_end` a `.msg banner`: "Your plan ends on {date}. You keep full access until then."
- **Usage panel** — for each metered meter, `used / limit` this month plus a `.progress` bar (the class already exists). Read `usage_counters` + `plan_limits` directly; both are user-readable.
- **Manage billing button** → POST `/api/stripe/portal` with the Bearer header → `window.location.href = j.url`. Only render it when a `stripe_customer_id` exists.
- **Upgrade/downgrade** → link to `/pricing`.

**The post-checkout poll.** Stripe redirects back before the webhook has necessarily landed. Without this the user sees "Free" right after paying and panics:

```ts
// Checkout redirects here the moment Stripe finishes, which can be a second or
// two before the webhook lands and flips the row to 'pro'. Poll briefly so the
// user never sees "Free" on the screen they just paid on.
useEffect(()=>{
  if(new URLSearchParams(window.location.search).get('checkout')!=='success')return
  setMsg('Payment received — activating your plan…')
  let tries=0,dead=false
  const id=setInterval(async()=>{
    tries++
    await loadBilling()
    // loadBilling sets planRef.current; stop as soon as it is paid, or give up.
    if(dead)return
    if(planRef.current!=='free'){clearInterval(id);setMsg('Your plan is active. Welcome aboard.')}
    else if(tries>=10){clearInterval(id);setMsg('Payment received. Your plan is taking a moment to activate — refresh in a few seconds, or contact support if it persists.')}
  },1500)
  return ()=>{dead=true;clearInterval(id)}
},[])
```

Use a ref alongside state for the plan — reading React state inside the interval closure gives you the stale value.

### 9c — Navigation and cross-links

- **`app/components/NavBar.tsx`** — the plan badge. This component already polls `trade_notifications` every 15s on an interval; add the plan to the **same** effect rather than adding a second interval. Render `<span className="pill">PRO</span>` next to Account for paid plans; render nothing for free (a "FREE" badge is just noise).
- **`app/account/page.tsx`** — in the right-hand panel, after the `SESSION` section label, add a `BILLING` section with a `.ghost` link to `/account/billing`.
- **`app/pricing`** — do **not** add to the main nav; the nav is already seven items wide and wraps on mobile. Reach it from the billing page and from upgrade prompts.

### VERIFY

```bash
npx tsc --noEmit
npm run build
```

Then, with the dev server running:
- `/pricing` renders logged out; all numbers match `select * from public.plan_limits;`
- `/account/billing` shows "Free" and 0-usage bars for a new account
- No console errors; no horizontal scroll at 375px width

**COMMIT:** `Add pricing page, billing page, and plan badge`

---

# PHASE 10 — Promo codes (`FOUNDER100`)

Zach's spec, unchanged: a 100%-off coupon → promotion code → entered at Checkout → $0 → same webhook flow, no special-casing in the Supabase sync. `allow_promotion_codes: true` is already set in Phase 4, so **no code changes are needed here.** This phase is Dashboard work plus one decision.

### 🧍 HUMAN — create the coupon and code

Dashboard → Product catalog → Coupons → Create.

| Field | Founder (permanent) | Launch promo (temporary) |
|---|---|---|
| Type | Percentage · **100%** | Percentage · e.g. 50% |
| Duration | **Forever** | **Repeating**, 3 months |
| Applies to | Specific products → Pro (and/or Elite) | Same |

Then → Promotion codes → Create, attached to that coupon:

- **Code:** `FOUNDER100`
- **Max redemptions:** e.g. 50 ← always set this; an uncapped 100%-off code that leaks is unbounded free access
- **Expires:** e.g. 90 days out
- **First-time customers only:** on, if it's an acquisition offer

### The one real gotcha

A 100%-off **forever** coupon means Stripe collects **no payment method** at checkout. That's usually what you want for a founder grant — but if the coupon is ever **repeating** instead, the subscription hits month 4 with no card on file and immediately goes `past_due`.

Choose per code:

- **`duration: forever`** → fine as-is. Nothing to change.
- **`duration: repeating`** → the customer must supply a card up front. Add to the Checkout session in Phase 4:
  ```ts
  payment_method_collection: 'always',
  ```
  Subscription mode defaults to `always`, so this only needs stating explicitly if something later sets it to `'if_required'`. Do not set `'if_required'` on a repeating discount.

### Why this needs no sync changes (confirming Zach's read)

A 100%-off subscription still produces `checkout.session.completed` → `customer.subscription.created` → `invoice.paid` with `amount_paid: 0`, and `subscription.status === 'active'`. The Phase 6 handler keys off `status` and `price_id`, neither of which the discount touches. **It just works.**

### The alternative worth knowing

For a handful of comps (a friend, a journalist, a support credit), don't make a code at all — use the `comp_plan` column from Phase 1:

```sql
insert into public.subscriptions (user_id, plan, status, comp_plan, comp_expires_at)
values ('<USER_ID>', 'free', 'inactive', 'pro', null)
on conflict (user_id) do update set comp_plan = 'pro', comp_expires_at = null;
```

`current_plan()` ranks `comp_plan` above Stripe, so it works instantly with no Stripe object, no invoice, and no expiring card. Set `comp_expires_at` for a time-boxed grant. Use codes for campaigns; use `comp_plan` for individuals.

### VERIFY

Test-mode checkout, enter `FOUNDER100`, confirm the total reads $0.00, complete it, and check:

```sql
select plan, status, current_period_end from public.subscriptions where user_id = '<USER_ID>';
-- plan 'pro', status 'active'
```

**COMMIT:** *(no code change expected — if `payment_method_collection` was added)* `Require a payment method for repeating-discount checkouts`

---

# PHASE 11 — Stripe Tax and legal pages

### 🧍 HUMAN — enable Stripe Tax

1. Dashboard → **Tax** → complete setup.
2. Set the **origin address** (where the business operates from).
3. Set the **default tax category** for both products to the SaaS / digital-services code. In the Dashboard's tax-code picker search "software as a service" — at time of writing that is `txcd_10103000`. **Use whatever the picker shows; do not paste a code from memory.**
4. Add tax **registrations** for every jurisdiction you're registered in (at minimum your home US state). Stripe only collects where you've registered.
5. Turn on **threshold monitoring** so Stripe emails you when you approach nexus somewhere new.

Re-read §2 on EU/UK: **no threshold for digital services sold to consumers — VAT is owed from the first sale.**

### Code

`automatic_tax`, `customer_update`, and `tax_id_collection` are already in the Phase 4 checkout call. Verify a checkout now shows a tax line for an address in a registered jurisdiction.

> If checkout starts erroring with a message about the customer's address, that's Stripe requiring `customer_update: { address: 'auto' }` when an existing `customer` is passed with `automatic_tax` on. It is already there — confirm it wasn't removed.

### Legal pages

`legal/` holds five `.docx` files and is **untracked in git**. Stripe wants reachable Terms and Refund/Cancellation URLs, and a financial-research product attracts extra review.

1. Decide with Zach whether `legal/` should be committed. The `.docx` sources probably should be; confirm before `git add`.
2. Convert to routes — simplest that fits this codebase: a `app/legal/[slug]/page.tsx` reading from a `lib/legalContent.ts` of exported strings. No new dependency, no build step. (The `docx` package is already a dependency but it's an *encoder* used for strategy exports, not a reader — do not try to parse `.docx` at runtime with it.)
3. Routes: `/legal/terms`, `/legal/privacy`, `/legal/refund-policy`, `/legal/disclaimer`.
4. Footer links on `/pricing` and `/account/billing`.
5. 🧍 Dashboard → Settings → Branding → set the Terms of Service and Privacy Policy URLs so they appear on the Checkout page itself.

> Ask Zach before publishing any legal text. There is a `5_Legal_Review_Memo.docx` in that folder; it may contain conditions on how the other four are used. **Read it first, and do not paraphrase, summarize, or "clean up" legal copy — publish it verbatim or not at all.**

**COMMIT:** `Add legal pages and enable Stripe Tax on checkout`

---

# PHASE 12 — Full test protocol

Do not skip. This is the "test the full flow before going live" item, expanded.

### Setup

```bash
# terminal 1
npm run dev
# terminal 2
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

`.env.local` on test keys (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` = the `whsec_` from `stripe listen`.

### Test cards

| Card | Behaviour |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0025 0000 3155` | requires 3D Secure |
| `4000 0000 0000 9995` | declined (insufficient funds) |
| `4000 0000 0000 0341` | attaches, then fails on first charge |

Any future expiry, any CVC, any postcode.

### T1 — Happy path

1. New account via `/research`.
2. `/pricing` → Pro monthly → Subscribe.
3. `4242…`, complete.
4. Land on `/account/billing?checkout=success`.
5. ✅ "activating your plan…" appears, then flips to active **within ~3s**.
6. ✅ `select plan,status,current_period_end,cancel_at_period_end from subscriptions where user_id='…'` → `pro`, `active`, a date **~1 month out and not null**.
   > A **null `current_period_end` means `subscriptionPeriodEnd()` is reading the wrong object.** That is the SubscriptionItem gotcha from §4. Fix before continuing.
7. ✅ NavBar shows the PRO pill.

### T2 — Entitlements actually lift

As the now-Pro user:
- Create portfolios 2 and 3 → succeed (free cap was 1).
- Add 10 watchlist symbols → succeed.
- Generate 2+ AI company reports → succeed; `usage_counters.used` increments.
- Run AI portfolio research → succeeds (it was 0 on free).

### T3 — Free user is actually blocked

Second, unsubscribed account:
- 2nd portfolio → error `SLA01` / `PLAN_LIMIT:portfolios:free:1`.
- 4th watchlist symbol → blocked.
- 3rd strategy favorite → blocked.
- 2nd AI company report → **402**, upgrade prompt shown.
- AI portfolio research → 402 on the first attempt.

### T4 — Bypass attempts must all fail 🔒

The whole point. Run every one as the **free** user, in the browser console on any logged-in page.

```js
// 1. Self-upgrade via the subscriptions table
await supabase.from('subscriptions').update({plan:'elite'}).eq('user_id', (await supabase.auth.getUser()).data.user.id)
// MUST fail: no UPDATE grant / no policy.

// 2. Insert a fake subscription row
await supabase.from('subscriptions').insert({user_id:(await supabase.auth.getUser()).data.user.id, plan:'elite', status:'active'})
// MUST fail.

// 3. Zero out your own usage counter
await supabase.from('usage_counters').update({used:0}).eq('meter','ai_company_report')
// MUST fail.

// 4. Raise your own plan limit
await supabase.from('plan_limits').update({limit_value:9999}).eq('plan','free')
// MUST fail.

// 5. Beat the row-limit trigger by going direct
await supabase.from('portfolios').insert({user_id:(await supabase.auth.getUser()).data.user.id,name:'bypass'})
// MUST fail with SLA01.

// 6. Spend someone else's quota
await supabase.rpc('consume_quota',{p_user_id:'<OTHER_USER_ID>',p_meter:'ai_company_report'})
// MUST fail: consume_quota is not granted to authenticated.
```

```bash
# 7. Anonymous API call
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/company-report/narrative \
  -H 'content-type: application/json' -d '{"overview":{"name":"x"}}'   # 401

# 8. Forged JWT
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/company-report/narrative \
  -H 'Authorization: Bearer not.a.real.token' -H 'content-type: application/json' -d '{"overview":{"name":"x"}}'   # 401

# 9. Checkout at a price of your choosing
curl -s -X POST localhost:3000/api/stripe/checkout -H 'content-type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"plan":"pro","interval":"monthly","price_id":"price_whatever"}'
# MUST ignore price_id entirely and use the env-var price.
```

**If any of 1–9 succeeds, stop the whole project and fix it. A billing system that can be bypassed from the console is worse than no billing system, because you'll believe it works.**

### T5 — Portal and cancellation

1. Billing → Manage billing → portal opens.
2. Cancel (at period end) → back on the billing page.
3. ✅ `cancel_at_period_end = true`, `status` still `active`, banner shows the end date.
4. ✅ Pro features still work (this is the point of not cutting access immediately).
5. Reactivate in the portal → banner clears.

### T6 — Renewal and dunning (test clocks)

Dashboard → Billing → **Test clocks**. Create one, attach a customer, advance past the period end.

- ✅ `invoice.paid` arrives, `current_period_end` advances a month.
- With `4000 0000 0000 0341`: ✅ `invoice.payment_failed` → `status: past_due` → **access retained** (by design).
- Advance until Stripe gives up → ✅ `status: canceled`, `plan: free`, features revoked, **user data all still present**.

### T7 — Promo code

Checkout with `FOUNDER100` → total $0.00 → completes → `plan: pro`, `status: active`.

### T8 — Webhook robustness

- Replay an event from the Dashboard → second delivery returns `duplicate: true`, DB unchanged.
- Stop the dev server, `stripe trigger customer.subscription.updated`, restart, then resend from the CLI → state converges.

### T9 — Edge cases

- Cancel *during* Stripe Checkout → lands on `/pricing?checkout=cancelled`, no subscription row change.
- Two browser tabs both starting checkout → one Stripe customer, not two (`select count(*) from subscriptions where stripe_customer_id is not null;`).
- Delete the test Customer in the Dashboard, then check out again → the Phase 4 `deleted` guard creates a fresh one instead of 500ing.

### T10 — Build

```bash
npx tsc --noEmit && npm run build
```

**COMMIT:** `Verify full checkout, webhook, entitlement, and bypass-resistance test suite`

---

# PHASE 13 — Go live

### 🧍 HUMAN — pre-flight

- [ ] Stripe account fully activated (identity + bank verified)
- [ ] Toggle Dashboard to **Live mode**
- [ ] Recreate the 4 prices in Live mode — **test price IDs do not work in live** → 4 new `price_…`
- [ ] Recreate coupons/promotion codes in Live mode — same story
- [ ] Reconfigure the Billing Portal in Live mode — **it is a separate config**
- [ ] Configure Stripe Tax registrations in Live mode
- [ ] Copy the live secret key

### 🧍 HUMAN — create the production webhook endpoint

Dashboard (Live) → Developers → Webhooks → Add endpoint.

- **URL:** `https://strategylabai.net/api/stripe/webhook`
- **Events:**
  ```
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  customer.subscription.paused
  customer.subscription.resumed
  invoice.paid
  invoice.payment_failed
  ```
- Copy the **signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` in Vercel Production. **This is not the CLI's secret.**

### 🧍 HUMAN — Vercel environment variables (Production)

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…        (from the endpoint above, NOT the CLI)
STRIPE_PRICE_PRO_MONTHLY=price_…     (LIVE ids)
STRIPE_PRICE_PRO_YEARLY=price_…
STRIPE_PRICE_ELITE_MONTHLY=price_…
STRIPE_PRICE_ELITE_YEARLY=price_…
NEXT_PUBLIC_SITE_URL=https://strategylabai.net
```

⚠️ **Vercel Deployment Protection will silently break the webhook.** If the project has password or SSO protection on, Stripe's POST gets an auth page, not the route, and every delivery fails. Either disable protection for production or add a bypass for `/api/stripe/webhook`. The GitHub Actions crons already work, which suggests protection is off — **confirm rather than assume.**

### 🧍 HUMAN — the real-card test (the last item on Zach's checklist)

1. Deploy.
2. From a **normal browser, not test mode**, sign up as a fresh user.
3. Subscribe to Pro with a **real card**.
4. ✅ Access granted within seconds.
5. ✅ Dashboard → Webhooks → the endpoint shows all deliveries **200**.
6. ✅ `select * from subscriptions where user_id='…'` correct — and `current_period_end` **not null**.
7. Open the portal, cancel, ✅ `cancel_at_period_end = true`.
8. Dashboard → refund the charge, then cancel the subscription immediately.
9. ✅ Access revoked on the next webhook.

### Post-launch monitoring

- Stripe → Webhooks → watch the failure rate for the first week. Any non-200 is a customer who paid and may not have access.
- 🧍 Set a Stripe email alert for failed webhook deliveries.
- Weekly for the first month:
  ```sql
  -- Paid in Stripe but missing here = a webhook that never landed
  select user_id, plan, status, current_period_end, updated_at
    from public.subscriptions where status != 'inactive' order by updated_at desc;

  -- Anyone bumping their ceiling = a pricing signal
  select u.user_id, u.meter, u.used, public.plan_limit_of(public.current_plan(u.user_id), u.meter) as lim
    from public.usage_counters u
   where u.period_start = date_trunc('month', now() at time zone 'utc')::date
   order by u.used desc limit 20;
  ```

**COMMIT:** `Document production Stripe setup in README`

---

## Appendix A — Gotcha index

Ranked by how likely they are to bite, worst first.

1. **`current_period_end` is on `SubscriptionItem`, not `Subscription`** (API `2026-08-26.dahlia`). Every pre-2025 tutorial is wrong. Symptom: a null `current_period_end` with no type error. → `lib/stripe.ts` `subscriptionPeriodEnd()`.
2. **`profiles` is fully user-writable.** Never put billing state there. → §1 Landmine 1.
3. **New tables inherit full CRUD for `authenticated`** from `migration_v4_grants.sql`'s default privileges. Every billing table must `revoke` explicitly. → §1 Landmine 2.
4. **The test `whsec_` ≠ the production `whsec_`** ≠ the `stripe listen` one. Three different secrets.
5. **Test price IDs don't exist in live mode.** Recreate all four.
6. **Vercel Deployment Protection silently 401s Stripe's webhook.**
7. **Webhooks are not ordered.** Always re-fetch the subscription; never trust `event.data.object`.
8. **Billing Portal 500s if never configured**, and Test and Live are separate configurations.
9. **`automatic_tax` + an existing `customer` requires `customer_update: { address: 'auto' }`.**
10. **A 100%-off *repeating* coupon collects no card** unless `payment_method_collection: 'always'` — month 4 goes `past_due`.
11. **Never accept `price_id` from the client.** Plan name in, env-var price out.
12. **Edge runtime is deprecated in Next 16.** Add no `runtime` export to new routes. The one existing `runtime = 'edge'` (company-report) is deliberate — leave it.
13. **`middleware.ts` is now `proxy.ts`.** This plan uses neither.
14. **`consume_quota` must never be granted to `authenticated`** or a user can spend anyone's allowance.
15. **`quotaExceededPayload` returns 402, not 403.** The UI distinguishes "not logged in" (401) from "out of allowance" (402) and shows different prompts.

## Appendix B — Quick reference

**Meters:** `portfolios` · `watchlist_symbols` · `favorite_strategies` · `ai_company_report` · `ai_portfolio_research` · `research_variations`

**Plan-granting statuses:** `active` · `trialing` · `past_due` — defined in *two* places (`public.current_plan()` and the `GRANTING` set in the webhook). **Change both together.**

**Status codes:** `401` not logged in · `402` out of allowance / not on plan · `429` rate limited · `503` Stripe not configured

**Trigger error:** SQLSTATE `SLA01`, message `PLAN_LIMIT:<meter>:<plan>:<limit>`

**Useful SQL:**

```sql
-- Comp a user
insert into public.subscriptions (user_id, plan, status, comp_plan)
values ('<UID>','free','inactive','pro')
on conflict (user_id) do update set comp_plan='pro', comp_expires_at=null;

-- Reset someone's monthly usage
delete from public.usage_counters
 where user_id='<UID>' and period_start = date_trunc('month', now() at time zone 'utc')::date;

-- Change a limit (no deploy needed)
update public.plan_limits set limit_value=50 where plan='pro' and meter='ai_company_report';

-- What plan is this user actually on?
select public.current_plan('<UID>');
```

## Appendix C — Phase checklist

```
[ ] 0   🧍 Stripe Dashboard: products, 4 prices, portal config, CLI
[ ] 1      migration_v31_billing.sql        → VERIFY the authenticated-grant check
[ ] 2      plans.ts, authedUser.ts, entitlements.ts
[ ] 3      npm i stripe, lib/stripe.ts      → VERIFY pinned API version
[ ] 4      /api/stripe/checkout
[ ] 5      migration_v32_plan_triggers.sql  → VERIFY from the browser console
[ ] 6      /api/stripe/webhook              → VERIFY with stripe trigger
[ ] 7      /api/stripe/portal
[ ] 8      gate the two AI routes + client Bearer headers
[ ] 9      /pricing, /account/billing, NavBar badge
[ ] 10  🧍 FOUNDER100 coupon + promotion code
[ ] 11  🧍 Stripe Tax + legal pages
[ ] 12     full test protocol — T4 (bypass) is mandatory
[ ] 13  🧍 go live: live keys, live prices, prod webhook, real-card test
```
