# SECURITY_REMEDIATION_BATCH_5_RESULTS.md

**Batch:** 5 — Provider/dashboard action (GitHub Actions cron secret transport)
**Approved by:** Zachary ("give migration then start batch 5")

## Exact changed-file list

Edited files:
- `.github/workflows/live-signals-cron.yml`
- `.github/workflows/portfolio-snapshots-cron.yml`
- `app/api/cron/live-signals/route.ts`
- `app/api/cron/portfolio-snapshots/route.ts`

New files:
- `app/api/cron/live-signals/route.test.ts`
- `app/api/cron/portfolio-snapshots/route.test.ts`

Not touched: everything else. No database, no dependency, no other route.

## What changed, in plain English

Two background jobs quietly ping your site every 5-15 minutes to check for buy/sell signals and update portfolio charts, even when nobody's on the site. They've always proven they're allowed to do that by sending a shared password (`CRON_SECRET`) — but until now, that password was being put directly into the web address itself (`...?secret=yourpassword`), which is the kind of thing that tends to get captured in server/hosting logs just by virtue of being part of the URL.

This batch changes both jobs to send that password a more standard, discreet way (in a request header, the same way login tokens are normally sent) instead of in the URL — and updates your site to only accept it that way going forward, closing off the old, leakier method entirely.

**Important — this has not gone live yet.** These changes are sitting in the same branch as everything else. GitHub only actually *runs* scheduled jobs from your site's real production branch, so your live background jobs are completely unaffected right now — they're still running exactly as they did before, on the old method. This only takes effect once this whole branch is deployed to production (Batch 6), which needs its own separate approval, same as always.

## Why both sides had to change together

If only the website stopped accepting the old method (without the background job also switching to the new method), your buy/sell signal checks and portfolio snapshots would start silently failing every 5-15 minutes until both pieces were live at once. Building them together in the same batch/deploy avoids that entirely.

## Security issue this addresses

Finding 3 from the original plan — reduces the chance that this shared password ever ends up sitting in a log file somewhere it doesn't need to be.

## Tests run and results

- **`npx tsc --noEmit`** — zero errors.
- **`npx vitest run`** — **21/21 tests pass** (6 new tests added specifically for this change: for both cron routes, proving (a) the old "password in the URL" method is now correctly rejected, (b) a request with nothing at all is rejected, and (c) a request with the password sent the new, correct way passes the authorization check).
- **`npm run build`** — succeeds, all 14 routes compile.

## Tests not run, and why

- **An actual live GitHub Actions run against the real cron endpoints.** Not done — that only happens automatically once this branch reaches production, which hasn't happened yet. When it does, the very next scheduled run (within 5-15 minutes) will be the real-world proof this works, and I'd recommend checking the GitHub Actions "Actions" tab shows a green run shortly after that deploy.

## Test mocks used

None needed for the new tests — `CRON_SECRET` is set to a throwaway test value inside the test file itself (not your real one), and the tests stop at the authorization check itself (a request that gets past auth naturally stops at "Supabase not configured" in this test environment, before any real database call, since no real Supabase credentials exist here).

## Remaining risks

1. **Not yet proven end-to-end against your real, deployed site** — this is normal for a change that only takes effect on deploy, and is exactly what to watch for right after Batch 6.
2. This is a one-way door in the sense that once deployed, the old "password in URL" method stops working entirely — if for any reason the GitHub Actions secret and this code ever get out of sync during a future change, the jobs would start failing loudly (a 401), not silently — which is actually the safer failure mode.

## Required staging validation

Same as the rest of this plan — verify on a preview deployment if possible, and specifically watch the GitHub Actions "Actions" tab for a green run within 5-15 minutes of this reaching production.

## Required owner/provider actions

None beyond what's already been done — the GitHub Actions secret itself (`CRON_SECRET`) doesn't need to change at all; only *how* it's sent changed, not its value.

## Rollback instructions

- `.github/workflows/live-signals-cron.yml`, `.github/workflows/portfolio-snapshots-cron.yml`, `app/api/cron/live-signals/route.ts`, `app/api/cron/portfolio-snapshots/route.ts` — revert to their pre-Batch-5 versions (re-adds the query-param fallback). `git revert` this batch's commit does all four at once, keeping them in sync.
- `app/api/cron/live-signals/route.test.ts`, `app/api/cron/portfolio-snapshots/route.test.ts` — delete the files.

## Confirmation

No remote service, production data, deployment, GitHub Actions run, cron job execution, environment variable value, or provider dashboard was touched or called. The `.github/workflows/*.yml` edits are ordinary file changes on a feature branch — GitHub Actions schedules only fire from the production branch, so nothing about your live background jobs changed as a result of this batch.
