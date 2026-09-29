# SECURITY_REMEDIATION_BATCH_1_RESULTS.md

**Batch:** 1 — Lowest-risk code-only security fixes
**Approved by:** Zachary ("if yes then I APPROVE" — Batch 1 local changes)
**Scope actually implemented:** the items listed for Batch 1 in `SECURITY_REMEDIATION_PLAN.md`, plus two additional existing files (`app/company-report/page.tsx`, `app/portfolios/page.tsx`) that turned out to be a necessary companion change — explained below.

## Exact changed-file list

New files:
- `lib/serverAuth.ts`
- `lib/sanitizeText.ts`
- `next.config.js`

Edited files:
- `app/api/company-report/narrative/route.ts`
- `app/api/portfolio-research/route.ts`
- `lib/companyNarrative.ts`
- `app/company-report/page.tsx`
- `app/portfolios/page.tsx`
- `.env.example`

Not touched (deliberately, explained in the plan): `app/api/cron/live-signals/route.ts`, `app/api/cron/portfolio-snapshots/route.ts`, `.github/workflows/*.yml`, any database/migration/RLS file, `package.json`/`package-lock.json` (no dependency was added or changed).

## What each change does, in plain English

- **`lib/serverAuth.ts` (new):** A small helper that checks "does this request carry a real, currently-logged-in user's token?" It reuses the same public key the browser already uses — it cannot see or touch anything a logged-in user couldn't already see themselves, and it never uses the service-role key.
- **`app/api/company-report/narrative/route.ts` and `app/api/portfolio-research/route.ts`:** Both now call that helper before doing anything else. If there's no valid logged-in user, the route now replies "you must be logged in" (HTTP 401) instead of proceeding to the paid Anthropic call. Each route also now enforces a per-account daily cap (15/day for report narratives, 30/day for portfolio research) on top of the existing per-IP limit, so even a legitimate logged-in account can't call it unlimited times.
- **`app/company-report/page.tsx` and `app/portfolios/page.tsx`:** Before this batch, the website's own calls to those two routes never sent proof of login — so simply adding the login check above would have broken the feature for everyone, not just blocked abusers. These two files now attach the logged-in user's own token to those specific requests, so real users see no change in behavior at all.
- **`lib/sanitizeText.ts` (new) and its use in `lib/companyNarrative.ts` / `app/api/portfolio-research/route.ts`:** Strips anything that looks like an HTML tag out of the AI's written text before it's sent to the browser. This is a "just in case" seatbelt — I did not find any place today where that AI text is rendered unsafely, but this closes the door on that becoming a problem later.
- **`next.config.js` (new):** Turns on standard browser safety headers (blocks the site from being embedded in someone else's page, blocks browsers from guessing file types in a way that can be abused, restricts where scripts/styles/images/connections are allowed to come from). This is the same kind of protection most banking/finance sites turn on by default.
- **`.env.example`:** Added the three missing setting *names* your app actually uses (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`) with no values — just documentation, so a future setup doesn't accidentally skip one.

## Security issue each change addresses

| Change | Finding from the plan |
|---|---|
| Login requirement + per-account cap on both AI routes | Finding 2 (unauthenticated paid-AI routes) and Finding 7 (no per-user cost quota) |
| Frontend token-attaching in both pages | Necessary companion fix so the above doesn't break the app for real users |
| Text sanitizer | Finding 5 (AI output has no explicit sanitization step) |
| Security headers | Finding 4 (no security headers configured) |
| `.env.example` completion | Finding 8 (documentation gap) |

**Not addressed in this batch (by design, per the plan):** Finding 1 (the ticker-binding database gap — needs a database migration, Batch 4) and Finding 3's cron-secret-in-URL (needs the GitHub Actions workflow files changed at the same time as the route, which needs your separate approval — Batch 5).

## Tests run and results

No automated test framework exists in this repository yet (adding one is Batch 2, and installing a new dev dependency needs your separate approval per the ground rules). What I ran instead, all fully local with no external calls:

1. **`npm ci`** — installed the dependencies already declared in `package-lock.json` (nothing added, nothing upgraded) so the checks below could actually run. Result: succeeded, 0 vulnerabilities reported.
2. **`npx tsc --noEmit`** (TypeScript type-check across the whole app) — **passed with zero errors**, confirming every new/edited file is correctly typed and nothing else broke.
3. **`npm run build`** (full Next.js production build) — **succeeded**, and confirmed all 14 routes (including the two edited API routes) compiled and the new `next.config.js` was picked up without error.

I did not run the actual app against a live login (that would require a real Supabase project and a real account, which I don't have access to and shouldn't create without your say-so) — see "Remaining risks" below.

## Tests not run, and why

- **A live "log in, then hit the narrative/portfolio-research endpoints" click-through test.** This needs a real Supabase project with a real test account. I don't have one connected here — this is exactly what Batch 3 (staging validation) is for, and it's listed as a blocker in the plan (does a staging Supabase project already exist?).
- **Automated unit tests with mocked Supabase/Anthropic clients.** This is Batch 2 — it needs a test framework installed first, which needs your separate approval.
- **Anything hitting the real Anthropic API, real Supabase, or real Yahoo Finance.** Never run, by design — this batch is required to avoid any paid or production call.

## Test mocks used

None yet — no test framework exists in this repo (see above). The verification for this batch was type-checking + a production build, not test mocks.

## Remaining risks

1. **Unverified against a real login.** I'm confident in the code (it's a straightforward "check token, else 401" pattern, and both frontend calls now send the token), but I have not clicked through it against a real account. **Please treat this as "should work, not yet proven" until we do a staging/preview check (Batch 3).**
2. **The per-account daily caps (15/day, 30/day) are just my judgment call** on reasonable numbers — you may want them higher or lower once you see real usage.
3. **The CSP in `next.config.js` is deliberately loose** (allows inline scripts/styles) to avoid breaking the app's existing style. It's a real improvement over having nothing, but it's not the tightest possible policy — tightening it further is a reasonable future step, not urgent.
4. **Finding 1 (the ticker-binding gap) is still open.** This batch does not touch it — that's intentionally saved for Batch 4 (a database change) since it needs to be tested against a non-production database first.
5. **The cron-secret-in-URL issue (Finding 3) is still open** — intentionally, to avoid breaking your always-on background jobs until the GitHub Actions workflow files are updated in the same step (Batch 5).

## Required staging validation

Before this reaches production, please (or let me help you) confirm on a Vercel Preview deployment:
- Logged-out request to `/api/company-report/narrative` and `/api/portfolio-research` → should get a "please log in" response, not run the AI.
- Logged-in request through the normal Company Report / Portfolios pages → should work exactly as before, with no visible change.
- Click through a few pages watching the browser console for any CSP warnings/blocks.

## Required owner/provider actions

None required to *ship* this specific batch — everything here is code-only. The only owner action tied to this batch is the staging check above, whenever you're ready to move toward production (that's Batch 3, not something I'll do without you).

## Rollback instructions (per file)

- `lib/serverAuth.ts` — delete the file.
- `lib/sanitizeText.ts` — delete the file.
- `next.config.js` — delete the file.
- `app/api/company-report/narrative/route.ts` — revert to the version before this batch (removes the login check and per-account cap).
- `app/api/portfolio-research/route.ts` — revert to the version before this batch.
- `lib/companyNarrative.ts` — revert to the version before this batch (removes the sanitizer call).
- `app/company-report/page.tsx` — revert to the version before this batch (stops sending the login token — only meaningful to revert together with the route change above).
- `app/portfolios/page.tsx` — revert to the version before this batch (same note as above).
- `.env.example` — revert to the version before this batch (removes the three added variable names — no functional effect either way).

The single safest rollback for all of it at once: `git revert` the commit this batch is recorded under.

## Confirmation

No remote service, production data, paid API, deployment, cron job, environment variable value, provider dashboard, database, migration, or external integration was touched or called while making or testing these changes. `npm ci` contacted the public npm registry only to install already-declared dependencies (no new dependency was added); no other network call was made.
