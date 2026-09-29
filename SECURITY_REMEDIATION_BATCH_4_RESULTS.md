# SECURITY_REMEDIATION_BATCH_4_RESULTS.md

**Batch:** 4 — Supabase RLS/schema/migration/cron-hardening proposals
**Status: FILES PREPARED AND TESTED LOCALLY — NOT APPLIED ANYWHERE.** Nothing in this batch has touched your real Supabase project, or any staging project. Applying either migration below requires your separate, explicit approval (see the APPROVAL REQUEST at the end of this file).

## Exact changed-file list

New files:
- `supabase/migration_v31_ticker_binding_guard.sql`
- `supabase/migration_v32_yahoo_cache_rls.sql`

Nothing else was touched. No existing table, existing migration file, RLS policy, or grant was modified.

## What this batch does, in plain English

**`migration_v31_ticker_binding_guard.sql` — this is the actual fix for the rule you care about most.**

Right now, the database only checks "is this your own row" — it never checks "does this row's ticker actually match the strategy it's attached to." This migration adds that second check directly inside the database, so it holds true no matter what any app code, browser, or script tries to do. Specifically, it teaches the database two new rules for the two tables that track live buy/sell activity (`live_positions` and `trade_notifications`):

1. **A position/notification's ticker must match its strategy's own ticker.** If someone tries to save "strategy X, ticker TSLA" when strategy X was actually only ever tested on AAPL, the database itself refuses the write with a clear error — instead of just trusting whatever the app sent.
2. **(A closely related bonus check I added while building this)** A position/notification must reference a strategy that actually belongs to that same user. This wasn't explicitly called out in the original plan, but it's the same kind of gap — without it, a user could theoretically attach a position to someone else's strategy ID, which defeats the ticker-binding guarantee in a different way. Flagging this clearly since it's slightly more than what Finding 1 originally described, even though it uses the exact same mechanism.

**Nothing changes for normal, legitimate use** — every real place in the app that writes these rows already only ever sends a strategy's own ticker for that same user's own strategy. This migration turns that "always true today" into "can never be false," permanently.

**`migration_v32_yahoo_cache_rls.sql`** — a small consistency fix (Finding 6). One technical table (a shared cache of a login token used to talk to Yahoo Finance — not user data) was missing a setting every other table in your database has turned on. It's not currently exploitable (nobody has access to it today regardless), this just closes a "what if someone changes something else later and assumes this was already protected" gap.

## How this was tested — and why you can trust it without running it on your real database yet

I did **not** test this by connecting to your Supabase project. Instead, I built a completely separate, throwaway test database on my own local machine (not connected to the internet, not your data, destroyed immediately after testing) with the same table structure as the real ones, applied this exact migration file to it, and then tried to break it on purpose:

| Test | What I tried | What happened |
|---|---|---|
| 1 | Insert a position with the strategy's own, correct ticker (AAPL) | **Succeeded**, as it should |
| 2 | Insert a position for the same AAPL strategy but claiming ticker TSLA | **Rejected** by the database, with a clear error message |
| 3 | Insert a position under one user's account but pointing at a different user's strategy | **Rejected** |
| 4 | Same "correct ticker" test on the notifications table | **Succeeded**, as it should |
| 5 | Same "wrong ticker" test on the notifications table | **Rejected** |
| 6 | A notification with no strategy attached at all (this happens for manual actions) | **Succeeded**, unaffected — proving this fix doesn't break unrelated functionality |

Final check: after all 6 tests, I counted the rows that actually got saved — exactly 1 position and 2 notifications, exactly matching the tests that were *supposed* to succeed. Nothing that should have been blocked got through.

This is real, working proof — not a guess — that the fix does exactly what it's supposed to, and doesn't break anything else. What it does **not** prove is that it behaves identically inside your actual Supabase project (which has some plumbing this scratch database doesn't — real Row Level Security policies, real `auth.users`, etc.) — that's exactly what a staging test (see the approval request below) would confirm before production.

## Tests not run, and why

- **Against your actual Supabase project (staging or production).** Not done, and won't be without your explicit approval — this is exactly the kind of "runs a database migration" action the ground rules require me to stop and ask about first.
- **A full end-to-end test through the real website UI.** Same reason — needs a real deployment talking to a real (ideally staging) database.

## Test mocks used

None — this was tested against a real (but throwaway, local-only) PostgreSQL database, which is the only way to meaningfully prove trigger/SQL logic works. No mocking was involved or needed.

## Remaining risks

1. **Not yet proven against your real Supabase project specifically.** Supabase adds its own layer on top of plain Postgres (RLS policies, the `authenticated`/`service_role` roles, etc.) that my scratch test didn't fully replicate — I'm confident it will behave the same way (the trigger logic doesn't depend on Supabase-specific behavior), but "confident" isn't "proven" until it's run somewhere real.
2. **The added "must be your own strategy" check is new scope**, not originally spelled out in Finding 1 — flagged above so you're aware, even though I believe it's clearly the right call.
3. Once applied, if any future feature ever legitimately needs to write a position/notification with a different symbol than its strategy (I don't believe one exists, and don't recommend building one, since that would violate the rule you told me matters most), this trigger would need to be revisited.

## Required staging validation

**Before this goes anywhere near your real (production) database, I'd strongly recommend running it against a staging/practice Supabase project first** — this was one of the open questions from the very first plan I wrote: do you have one? If not, creating a free second Supabase project (or a separate schema) just for testing is the safest path, and I'm happy to walk you through that when you're ready.

## Required owner/provider actions

**Applying either migration file requires you to run it inside Supabase's SQL Editor yourself, or explicitly tell me to.** I do not have access to run SQL against your Supabase project, and per the ground rules I'm following, I would not do so even if I could without your explicit, scoped approval. See the formal request below.

## Rollback instructions

- `migration_v31_ticker_binding_guard.sql`: if applied and you ever want to undo it —
  ```sql
  drop trigger if exists enforce_symbol_match on public.live_positions;
  drop trigger if exists enforce_symbol_match on public.trade_notifications;
  drop function if exists public.enforce_strategy_symbol_match();
  ```
  This removes the check entirely; no data is deleted or changed either way.
- `migration_v32_yahoo_cache_rls.sql`: `alter table public.yahoo_auth_cache disable row level security;`

## Confirmation

No remote service, production data, paid API, deployment, cron job, environment variable, provider dashboard, or your actual Supabase database was touched or called. All testing above ran against a disposable PostgreSQL database created and destroyed entirely within this local session, with fabricated test data — never your real project, never your real users' data.

---

## APPROVAL REQUEST — applying `migration_v31_ticker_binding_guard.sql`

1. **Action requested:** Run this SQL file's contents (a function + two triggers) against a Supabase project's SQL Editor.
2. **Target environment:** Ideally a staging/practice Supabase project first (see "Blockers" below — I don't yet know if you have one). If you tell me to skip straight to production, that's your call to make, but it's not what I'd recommend as the first run.
3. **Exact action:** Paste the full contents of `supabase/migration_v31_ticker_binding_guard.sql` into the Supabase SQL Editor and run it.
4. **Files/services/data affected:** Two existing tables (`public.live_positions`, `public.trade_notifications`) gain a new trigger each; one new function is created. No existing row is read, changed, or deleted.
5. **Security benefit:** Closes Finding 1 (Critical) — makes the "AAPL strategy only works on AAPL" rule a database-enforced guarantee instead of a client-trust assumption, and additionally blocks referencing another user's strategy.
6. **Potential risk:** Very low. No downtime (instant, non-locking DDL at this table size). No login impact. No cost impact. No data impact (additive only). The only behavior change is that a write which *should never have been possible anyway* (per your own stated rule) now gets a clear database error instead of silently succeeding.
7. **Preconditions/backups:** None strictly required (this is non-destructive), but I'd recommend running it on staging first if one exists.
8. **Rollback plan:** The three `drop` statements listed above — instant, no data impact.
9. **Safest alternative:** Run it on a staging/practice Supabase project first, confirm the app still works normally end-to-end (favoriting strategies, confirming buy/sell signals), then run it in production.
10. **Exact approval phrase:** *"Approve this migration in staging only"* (if you have/create a staging project) or *"Approve Supabase RLS/trigger migration v31 in production"* (if you'd rather skip straight there — your call).

## APPROVAL REQUEST — applying `migration_v32_yahoo_cache_rls.sql`

Same shape as above, much lower stakes (a single `enable row level security` statement on a table with no current public access). Approval phrase: *"Approve migration v32 in production"* (low-risk enough that staging-first isn't essential, but I'll do whichever you prefer).
