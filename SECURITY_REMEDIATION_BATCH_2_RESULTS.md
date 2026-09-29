# SECURITY_REMEDIATION_BATCH_2_RESULTS.md

**Batch:** 2 — Local security tests and test infrastructure (mocks only)
**Approved by:** Zachary ("go to batch 2"; separately approved adding `vitest` as a dev dependency)

## Exact changed-file list

New files:
- `vitest.config.mts` — minimal test-runner configuration (so `@/...` imports work the same way they do in the real app).
- `lib/sanitizeText.test.ts`
- `lib/tradeConfirm.test.ts`
- `app/api/company-report/narrative/route.test.ts`
- `app/api/portfolio-research/route.test.ts`

Edited files:
- `package.json` — added `vitest` as a dev dependency and a `test` script.
- `package-lock.json` — updated automatically by `npm install` to record `vitest` and its own dependencies.

Not touched: every application source file from Batch 1 is untouched by this batch (tests only — no production code was changed to make a test pass).

## What this batch does, in plain English

This batch doesn't change how your app behaves at all — it adds a way to **automatically prove** the Batch 1 fixes actually work, and keep proving it every time the code changes in the future, without ever touching your real Anthropic account, real Supabase project, or real users.

- **`lib/sanitizeText.test.ts`** — proves the "seatbelt" text filter from Batch 1 actually removes HTML-tag-shaped content, while leaving normal sentences untouched.
- **`lib/tradeConfirm.test.ts`** — this is the important one for the ticker-binding rule (Finding 1). It uses a fake, in-memory stand-in for your database and proves: (a) when a buy signal is confirmed, the position that gets created always uses that signal's own ticker — never a substituted one; (b) if two clicks/requests try to confirm the exact same signal at the same time, only one of them succeeds (so you never get a duplicate position from a race). This is the "does the code always do the right thing" half of Finding 1 — the other half (the database itself refusing a mismatched ticker no matter what the code does) is Batch 4, still ahead of us.
- **`app/api/company-report/narrative/route.test.ts` and `.../portfolio-research/route.test.ts`** — prove the Batch 1 login requirement and daily cap actually work: a request with no valid login gets rejected before the paid AI is ever called (and I check that "never called" directly, not just guess it), and after enough requests from one logged-in account in one day, further requests get rejected too.

## Security issue each change addresses

| Test file | Finding it guards |
|---|---|
| `lib/sanitizeText.test.ts` | Finding 5 (AI-output sanitization) |
| `lib/tradeConfirm.test.ts` | Finding 1 (ticker-binding) — app-layer half |
| `.../narrative/route.test.ts` | Finding 2 & 7 (unauthenticated paid-AI route, no per-user cap) |
| `.../portfolio-research/route.test.ts` | Finding 2 & 7 |

## Tests run and results

Ran locally, no network access required or used:

```
npx vitest run
```

**Result: 4 test files, 14 tests, all passed.**

Also re-ran, to make sure nothing regressed:
- `npx tsc --noEmit` — zero errors.
- `npm run build` — succeeds, same 14 routes as before.

## Tests not run, and why

- **Anything against a real Supabase login or a real Anthropic call.** Deliberately never done — every external boundary (`getAuthedUserId`, the market-data `fetch`, Anthropic) is mocked/stubbed in these tests specifically so nothing here can touch a live account or cost money.
- **The actual database-level proof for Finding 1** (a real Postgres trigger rejecting a mismatched ticker). That can't be meaningfully tested with mocks — it needs a real (staging) Postgres/Supabase instance, which is Batch 4's job, not this one.
- **A real click-through in a browser.** Still pending a staging/preview environment (Batch 3), same as noted in the Batch 1 results.

## Test mocks used

- `lib/serverAuth.ts`'s `getAuthedUserId` — mocked with `vitest`'s `vi.mock`, so the tests control exactly who's "logged in" without ever contacting Supabase.
- `global.fetch` — stubbed in the portfolio-research test so the "allowed" requests in the daily-cap test never actually reach Yahoo Finance.
- A hand-written fake database client in `lib/tradeConfirm.test.ts` that mimics only the specific chained calls (`.from().insert()...`) the real code makes — never a real Supabase connection.
- `ANTHROPIC_API_KEY` is deliberately left unset in the test environment, which makes the narrative-generation code take its existing, built-in non-AI fallback path — so the "15 allowed requests" test never makes a real Anthropic call either.

## Remaining risks

1. This batch proves the *code* does what it's supposed to. It does not prove the *whole system* does (that needs a staging/preview run — Batch 3).
2. Test coverage here is targeted at the specific findings in the plan, not exhaustive — it's not a full test suite for the entire app, by design (matching the "minimum, focused" instruction).
3. The daily-cap numbers (15/day, 30/day) are exercised exactly as configured; if those limits are changed later, these tests will need the loop counts updated to match, or they'll start failing for the wrong reason (worth remembering, not an urgent risk).

## Required staging validation

None added by this batch itself — same Batch 3 checklist as before still applies before production.

## Required owner/provider actions

None. This batch only added a dev-only tool and test files.

## Rollback instructions (per file)

- `vitest.config.mts`, `lib/sanitizeText.test.ts`, `lib/tradeConfirm.test.ts`, `app/api/company-report/narrative/route.test.ts`, `app/api/portfolio-research/route.test.ts` — delete the files.
- `package.json` / `package-lock.json` — run `npm uninstall vitest` to cleanly remove the dependency and its entry, or `git revert` this batch's commit.

## Confirmation

No remote service, production data, paid API, deployment, cron job, environment variable value, provider dashboard, database, migration, or external integration was touched or called. `npm install` contacted only the public npm registry to fetch the one approved dev dependency (`vitest`) and its own sub-dependencies; every test run afterward made zero network calls (verified by mocking every external boundary the tested code touches).
