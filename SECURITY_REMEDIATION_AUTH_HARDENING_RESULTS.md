# SECURITY_REMEDIATION_AUTH_HARDENING_RESULTS.md

**Scope:** Follow-up work, prompted by Zachary noticing there was no dedicated `/login` page and seeing a brief "log in at Research page" flash on reload — flagged as a real problem ahead of adding paid subscriptions. Not part of the original numbered batches; tracked here on its own.

**Status: NOT deployed. Sitting on a new branch (`claude/dedicated-login-page-hardening`), pushed for a preview build. Waiting on Zachary's review before this goes anywhere near production**, given this touches routing for every page on the site — a much bigger blast radius than any prior batch if something were subtly wrong.

## What was actually wrong

Confirmed in code, exactly as suspected: there was no `/login` page. The login/signup form was written directly inside `app/research/page.tsx`, and seven other pages each independently checked "is someone logged in?" *in the browser, after the page already started loading* — that gap between "page starts loading" and "browser finishes checking" is the flash that was seen. Nothing was server-verified before a page was sent to the browser.

## What changed

- **New dependency (approved separately):** `@supabase/ssr`, Supabase's own official library for server-verifiable login state.
- **`lib/supabase.ts`:** switched from browser-only (`localStorage`) session storage to cookie-based storage, using `@supabase/ssr`'s `createBrowserClient`. Same exported `supabase` object, same interface — every existing page's Supabase calls work unchanged.
- **`proxy.ts` (new, at the repo root — Next.js's server-side "check this before any page loads" file, called `middleware.ts` in older versions):** the actual fix. Before any protected page is sent to the browser, this checks — on the server, with Supabase itself, not just a cookie's say-so — whether the visitor is logged in. Not logged in and visiting a protected page → redirected to `/login` before that page's content ever exists in the response. Logged in and visiting `/login` → redirected straight to `/home`. This is what actually eliminates the flash, not just hides it better.
- **`app/login/page.tsx` (new):** the login/signup form, moved out of the Research page into its own real, dedicated page and route.
- **`app/research/page.tsx`:** the embedded login form and its handler functions removed (now dead code, since `proxy.ts` guarantees nobody reaches this page logged out).
- **Seven other pages** (`home`, `portfolios`, `notifications`, `account`, `trade-signals`, `company-report`, and the root `/`): their old, independent "log in on the Research page" fallback messages updated — since `proxy.ts` now blocks unauthenticated access before these ever render, these become backstops for the split-second during hydration, not real logged-out states.

## Why this also matters for the future paywall Zachary described

The plan is: sign up → land in the app → get prompted to pay. This exact structure — a single, server-verified gate that decides "can this visitor see this page" before anything renders — is precisely where a future "logged in, but hasn't paid yet" check would plug in later (one more condition inside `proxy.ts`). No payment/billing code was added now — that's separate, future work needing its own provider integration and approval — but the foundation is now shaped correctly for it, rather than needing another redo.

## Tests run and results

- `npx tsc --noEmit` — zero errors.
- `npx vitest run` — 21/21 existing tests still pass (none of this touched the API-route auth logic those tests cover).
- `npm run build` — succeeds; Next.js's own build step parses and validates `proxy.ts` and its route matcher (this would fail the build if the routing logic were structurally broken).

## Tests not run, and why

- **An actual click-through of the login → redirect → protected-page flow.** This needs a real Supabase project's credentials, which aren't available in this sandbox (and shouldn't be — that's exactly the kind of thing that stays only in Vercel's real environment variables). This is why the recommendation is a preview-deployment check before production, same pattern as the rest of this work, but weighted more heavily here given the blast radius.

## Remaining risks / what to specifically check on preview

1. **The core flow:** visit the preview site logged out → should land on `/login`, not flash any other page's content first.
2. **Sign in** → should land on `/home`.
3. **Visit a protected page directly while logged out** (e.g. paste a `/portfolios` link) → should redirect to `/login` immediately, then land back on `/portfolios` after logging in (the `?next=` behavior).
4. **Already logged in, visit `/login` directly** → should bounce straight to `/home`, not show the form.
5. **Sign-up flow** specifically (new account, username, gender fields) — this moved files, worth a full run-through.
6. **"Forgot password"** link — moved along with the rest of the form, worth confirming it still sends the email correctly.

## Rollback

This entire piece of work lives on its own branch, not yet merged — if anything looks wrong on preview, nothing needs undoing; we just don't merge it, or fix forward on the same branch before merging. If it somehow already reached production and needed reverting, the same Vercel "Promote to Production" approach from the Batch 6 checklist applies.

## Follow-up decision: full httpOnly session hardening

Discussed with Zachary whether to go further and make session tokens fully invisible to browser JavaScript (`httpOnly` cookies), which would close even a *theoretical* token-theft path if an XSS vulnerability were ever introduced later. On inspection, this app's architecture makes that a much larger undertaking than a follow-up patch: nearly every page (Research, Portfolios, Trade Signals, Notifications, Account, Home) queries Supabase directly from the browser using the user's own session token, relying on RLS for authorization. A fully `httpOnly` token would be unreadable by that browser-side code, breaking those direct queries — the real fix would require routing all data access through new server-side API endpoints instead, touching nearly every page in the app.

**Decision: hold off.** No actual XSS vulnerability exists in this app today (checked in the original audit — no unsafe HTML/script rendering sink was found), so this would be closing a theoretical gap at a very high implementation cost right now. Revisit as its own dedicated, carefully-scoped project later — a natural time would be alongside the future payment-system build, since that work will already be touching a lot of the same ground.

## Confirmation

No production deployment, database change, or provider setting was touched. This branch has been pushed to GitHub for a preview build only.
