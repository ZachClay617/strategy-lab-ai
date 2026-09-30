# SECURITY_REMEDIATION_PLAN.md — StrategyLab AI / A-Tamp

**Status:** Phase 1 (read-only analysis). No application code, config, database, or provider settings were changed while producing this document.

**Note on inputs:** `SECURITY_AUDIT_REPORT.md` (referenced in the task brief as having been produced by a third-party AI tool) was not present in this repository checkout. Rather than block on a missing file, this plan is built from a direct, first-hand source-code and Supabase-schema audit of the repository as it exists today (all files under `app/`, `lib/`, `supabase/`, `.github/workflows/`, `package.json`, `.env.example`). Every finding below cites the exact file/line I read. If a separate report exists elsewhere, its findings should be diffed against this plan before Batch 1 starts.

---

## A. Executive decision summary

| # | Finding | Severity | Verification |
|---|---|---|---|
| 1 | Ticker-binding is not enforced at the database layer for `live_positions` / `trade_notifications` writes — only by trusted client code | **Critical** | Verified in code |
| 2 | Two paid-AI-calling routes (`/api/company-report/narrative`, `/api/portfolio-research`) require no authentication — only per-IP rate limits | **Critical (cost/abuse)** | Verified in code |
| 3 | Cron secret (`CRON_SECRET`) is accepted as a URL query parameter, not just an `Authorization` header | **High** | Verified in code |
| 4 | No security headers configured anywhere (no CSP, no `X-Frame-Options`, no `Referrer-Policy`, etc.) | **High** | Verified (absence) |
| 5 | AI-generated narrative/portfolio JSON is trusted from the model and rendered without a schema/allowlist boundary beyond basic filtering | **Medium-High** | Verified in code, partially mitigated |
| 6 | `yahoo_auth_cache` table has no RLS enabled (relies solely on absence of grants to `anon`/`authenticated`) | **Medium** | Verified in code |
| 7 | No per-user cost quota on AI-calling routes (Anthropic key holder has no ceiling beyond IP rate limit) | **High (cost)** | Verified in code |
| 8 | `.env.example` omits `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` — easy to under-provision or accidentally misconfigure in a new environment | **Low (hygiene)** | Verified |

### Plain-English impact

1. **Ticker-binding bypass (Finding 1):** The business rule "an AAPL-favorited strategy can only be used for AAPL" is enforced today only by the JavaScript in `lib/tradeConfirm.ts` and `app/trade-signals/page.tsx`, which pass the notification's `symbol`/`market` straight into an `INSERT` on `live_positions`/`trade_notifications`. Because the browser talks to Supabase directly with the user's own JWT, and Row-Level Security on those tables only checks `auth.uid() = user_id` (never that `symbol` matches the strategy's own stored `symbol`), a user (or anyone using browser dev tools / the Supabase JS client directly) can open a "position" or write a notification for **any symbol** while citing a strategy that was only ever validated on a different ticker. This doesn't move real money (no broker is wired up), but it corrupts the signal/notification history and defeats the core product guarantee the task description calls out as non-negotiable. **This must be fixed with a database constraint/trigger, not just better client code**, because the whole point of the rule is that it must hold even against a modified client.

2. **Unauthenticated paid-AI routes (Finding 2, 7):** `/api/portfolio-research` (calls Anthropic when `ANTHROPIC_API_KEY` is set) and `/api/company-report/narrative` (always calls Anthropic when the key is set) have no login check — anyone on the internet can call them directly. They are rate-limited per IP (4/min, 20/hour for narrative; 10/min, 60/hour for portfolio-research), but IP-based limits are trivially defeated by rotating through cheap proxies/VPNs, and there is no per-user or global daily cost ceiling. This is a direct line from an anonymous internet request to metered Anthropic spend, which is explicitly called out as a top priority to protect against.

3. **Cron secret in URL (Finding 3):** Both cron endpoints accept the shared secret via `?secret=`, and the GitHub Actions workflows call them that way. URLs (including query strings) are commonly captured in hosting/proxy access logs, and Vercel's own request logs will contain the full URL including the secret. This raises the exposure surface of a credential that, if leaked, lets anyone trigger service-role-authenticated writes across every user's `strategies`/`live_positions`/`portfolios` tables (though the routes themselves only do bounded, defined work — they are not a general RCE — the secret's blast radius is "run this specific always-on job on demand," not arbitrary access).

4. **Missing security headers (Finding 4):** No CSP, frame-options, or referrer-policy are set anywhere in the app (no `next.config.js`, no manual header-setting middleware). This doesn't map to a demonstrated exploit today (no known reflected-XSS sink was found), but it removes a defense-in-depth layer against clickjacking and any XSS that is introduced later, and is a near-zero-cost, zero-behavior-change fix.

5. **AI output trust boundary (Finding 5):** `app/api/portfolio-research/route.ts` and `lib/companyNarrative.ts` do reasonably constrain the model's output (portfolio holdings are filtered against a real `validSymbols` allowlist before being trusted; narrative fields are freeform strings). The narrative fields are rendered into the company report UI; I did not find a `dangerouslySetInnerHTML` sink for AI content (the only `dangerouslySetInnerHTML`-style pattern search returned no matches in `app/`), so classic stored-XSS-via-AI-output is not currently demonstrated, but there is no explicit sanitization step either, which the audit brief requires as a defense-in-depth control regardless of whether a sink was found today.

### Would any of these cause…

- **Cross-user data access?** Not verified. RLS on every user-data table I read (`profiles`, `research_runs`, `strategies`, `run_events`, `capital_events`, `portfolios`, `portfolio_holdings`, `portfolio_log`, `portfolio_snapshots` (read-only), `portfolio_realized_trades`, `live_positions`, `trade_notifications`, `watchlist_symbols`, `company_reports`) consistently scopes to `auth.uid() = user_id` (or, for `portfolio_holdings`, to the owning portfolio's `user_id`). No cross-user read/write path was found.
- **Credential exposure?** Not verified as currently exploitable. Service-role key and Anthropic key are only referenced in server-only files (`app/api/cron/*/route.ts`, `lib/yahooAuth.ts`, `app/api/portfolio-research/route.ts`, `lib/companyNarrative.ts`) — never in a `NEXT_PUBLIC_`-prefixed variable or client component. The cron-secret-in-URL issue (Finding 3) is a credential-**handling** weakness, not a confirmed leak.
- **Account takeover?** Not verified; standard Supabase email/password + username-lookup-via-`security definer`-function (`migration_v17_username_login.sql`) looks correctly scoped (returns only `email`, nothing else).
- **Unauthorized writes?** **Yes — Finding 1** is exactly this: unauthorized (rule-violating) writes to `live_positions`/`trade_notifications` are possible today from a standard authenticated user's own session, in violation of the ticker-binding business rule.
- **Arbitrary agent/tool behavior?** Not applicable in the way the audit brief frames it — there is no autonomous "agent with tools" (file access, shell, arbitrary URLs) found anywhere in the codebase. The two Anthropic calls are single-shot JSON-completion prompts with a fixed, hardcoded task and a post-hoc allowlist filter on symbols (portfolio-research). There is no tool-use/function-calling, no user-controlled system prompt, no retrieval from user-controlled URLs.
- **Costly AI/market-data use?** **Yes — Findings 2 and 7.**
- **Notification abuse?** Bounded by Finding 1 (a user can only spam notifications/positions for their own account, not other users').
- **Financial-data leakage?** Not verified; all financial data returned by `/api/market` and `/api/company-report` is already public market data (Yahoo Finance), not private.
- **Service interruption?** Rate limiting (`lib/rateLimit.ts`) fails open to an in-memory per-instance limiter if Redis is unavailable, which is the right choice for availability but means the limiter is only a real global guarantee when Upstash/KV env vars are configured — worth confirming they are set in production (see Blockers).
- **Strategy/signal integrity failure?** **Yes — Finding 1** is precisely this.

### Recommended order of remediation

1. Finding 1 (ticker-binding DB enforcement) — highest business-rule risk, isolated blast radius, fixable with a trigger/constraint + tests.
2. Finding 2 & 7 (auth + cost ceiling on paid AI routes) — highest live-cost risk.
3. Finding 3 (cron secret transport) — credential-hygiene, easy fix, needs a GitHub Actions change (owner-supplied secret usage, not code).
4. Finding 4 (security headers) — cheap, zero-behavior-change, broad defense-in-depth.
5. Finding 5 (AI-output sanitization) — defense-in-depth, no demonstrated exploit today.
6. Finding 6 (yahoo_auth_cache RLS) — low risk (no public grants exist), still worth closing for defense-in-depth.
7. Finding 8 (`.env.example` completeness) — documentation only.

---

## B. Risk-prioritized findings table

### Finding 1 — Ticker-binding not enforced server-side for live positions / notifications

- **Severity:** Critical
- **Verification status:** Verified in code
- **Evidence:**
  - `lib/tradeConfirm.ts:19-21` — `confirmBuySignal` does `client.from('live_positions').insert({ user_id:userId, strategy_id:n.strategy_id, symbol:n.symbol, market:n.market, entry_price:n.price||0 })` where `n.symbol`/`n.market` come from an in-memory object the caller constructs, not a fresh server-verified lookup of the strategy's own `symbol`/`market`.
  - `app/trade-signals/page.tsx:112-117` (`closePositionManually`) similarly writes `trade_notifications` with `symbol:strat.symbol,market:strat.market` sourced from client state.
  - `supabase/migration_v23_live_trading.sql` — RLS policies on `live_positions` and `trade_notifications` are `using (auth.uid()=user_id) with check (auth.uid()=user_id)` only — no check that `symbol`/`market` on the row matches the referenced `strategy_id`'s own `symbol`/`market` in `public.strategies`.
- **Affected feature/table:** Trade Signals page; `public.live_positions`, `public.trade_notifications`; indirectly `public.strategies.favorite`.
- **Realistic attack scenario:** A logged-in user opens browser dev tools (or writes a small script using their own already-issued Supabase JWT) and calls `supabase.from('live_positions').insert({ strategy_id: <their own AAPL strategy id>, symbol: 'TSLA', market: 'Stocks', entry_price: 1, user_id: <their own id> })`. RLS accepts it (they own the row), and the app now believes a strategy validated only on AAPL is "live" on TSLA — polluting their own Trade Signals view, notification history, and any future feature that trusts `live_positions.symbol` as ground truth for "this strategy is authorized for this ticker."
- **Business/user impact:** Violates the core product guarantee (a strategy is only valid for the ticker it was researched on). Corrupts a user's own signal-integrity data; if this table is ever joined into anything broker-facing or into cross-user aggregate reporting/leaderboards in the future, the blast radius grows.
- **Safe remediation approach:** Add a Postgres trigger (`BEFORE INSERT/UPDATE` on `live_positions` and `trade_notifications`) that looks up `strategy_id`'s `symbol`/`market` from `public.strategies` and raises an exception if the row's own `symbol`/`market` don't match (when `strategy_id` is not null). This enforces the rule at the only layer that can't be bypassed by a modified client — the database itself — with zero behavior change for every legitimate call path (which already only ever writes the strategy's own symbol).
- **Needs:** Supabase migration (new trigger function) — **database change, requires approval to apply**; local migration **file** can be authored and reviewed now. Regression tests can be written against a mocked Postgres/Supabase client that simulates the constraint, and a note added that final proof requires running the migration in a staging Supabase project.
- **Regression-test plan:** (a) confirmBuySignal/closePositionManually with matching symbol succeeds (no behavior change); (b) a direct insert with a mismatched symbol is rejected — this must be tested against a real Postgres instance (trigger logic can't be meaningfully unit-tested against a mock), so the automated proof is deferred to Batch 3/4 staging validation; a mocked-client unit test can at least verify the app-layer code always sends matching symbol/market (regression guard for the code side).
- **Rollback:** `DROP TRIGGER` / `DROP FUNCTION` — fully reversible, no data loss (trigger only rejects future bad inserts, doesn't touch existing rows).
- **Blast radius:** Isolated (two tables, additive trigger, no existing-row rewrite).
- **Fixable without DB changes?** No — this specific finding requires a database-level control by design (that's the point: it must survive a modified client).
- **Fixable without downtime?** Yes — `CREATE TRIGGER` is instant and non-locking on tables this size.

### Finding 2 — Unauthenticated access to paid-AI-calling routes

- **Severity:** Critical (cost/abuse)
- **Verification status:** Verified in code
- **Evidence:**
  - `app/api/company-report/narrative/route.ts:10-27` — `POST` handler has a rate-limit check and a `bundle.overview` presence check, but no `supabase.auth.getUser()`/session check of any kind before calling `generateNarrative(bundle)` (`lib/companyNarrative.ts:27-78`, which calls `api.anthropic.com` whenever `ANTHROPIC_API_KEY` is set).
  - `app/api/portfolio-research/route.ts:62-124` — same pattern: rate-limited by IP only, then calls Anthropic at line 98 if `apiKey` is set.
- **Affected feature/route:** Company Analysis Report narrative generation; AI Portfolio Agent.
- **Realistic attack scenario:** An anonymous script rotates source IPs (residential proxies, mobile carrier NAT ranges, or just enough distinct addresses) and calls either route repeatedly. Each call that passes rate-limiting triggers one real, billed Anthropic request, with no per-account ceiling and no requirement that the caller ever created an account.
- **Business/user impact:** Direct, unbounded (modulo IP-rotation cost to the attacker) exposure to Anthropic billing with no revenue or account relationship backing it. This is explicitly flagged in the task brief as a top priority to prevent.
- **Safe remediation approach:** Require a valid Supabase session (`Authorization: Bearer <access_token>` from the client, verified server-side with `supabase.auth.getUser(token)`) before executing the Anthropic call in both routes; return `401` otherwise. This is additive — the browser already carries an active session created by the existing login flow. Layer a **per-user** hourly/daily quota on top of the existing per-IP quota (same `lib/rateLimit.ts` abstraction, keyed by `user.id` instead of/alongside IP).
- **Needs:** Code changes only (Batch 1/2) for the auth check itself — no schema change required to require login. A per-user *persistent* quota (surviving across IPs/devices) would benefit from a small counter table (Batch 4, needs migration approval) — but an in-process/Redis-backed per-user quota using the existing `checkRateLimit` abstraction can ship in Batch 1 without any schema change.
- **Regression-test plan:** Unit tests with a mocked Supabase auth client: (a) request with no/invalid token → 401, Anthropic mock never called; (b) request with valid mocked token → proceeds, Anthropic mock called; (c) per-user quota exceeded → 429, Anthropic mock never called.
- **Rollback:** Revert the added auth check — routes return to their current (unauthenticated) behavior. Reversible in one commit.
- **Blast radius:** Isolated to two route files.
- **Fixable without DB changes?** Yes, for the auth requirement itself.
- **Fixable without downtime?** Yes.
- **Behavior change:** **Yes, user-visible** — currently these routes appear to be callable from a logged-out state (e.g., if any page invokes them before a user is confirmed logged in, or if the product intends a logged-out preview). **This needs Zachary's confirmation before Batch 1**: are these two routes ever intentionally called by a logged-out visitor? If the Company Report and Portfolio pages already require login to render (per `app/company-report/page.tsx` and `app/portfolios/page.tsx` gating on `session`), then requiring auth on the API routes matches existing intended usage and closes a server-side gap the UI already assumes is closed.

### Finding 3 — CRON_SECRET accepted via URL query string

- **Severity:** High
- **Verification status:** Verified in code
- **Evidence:**
  - `app/api/cron/live-signals/route.ts:14-19` (`isAuthorized`) and `app/api/cron/portfolio-snapshots/route.ts:15-22` both accept `req.nextUrl.searchParams.get('secret')===secret` as valid, in addition to the `Authorization: Bearer` header.
  - `.github/workflows/live-signals-cron.yml` and `.github/workflows/portfolio-snapshots-cron.yml` both call the endpoint with `?secret=${{ secrets.CRON_SECRET }}` in the URL rather than an `Authorization` header.
- **Affected feature/route:** Both cron endpoints; underlying tables `strategies`, `live_positions`, `trade_notifications`, `portfolios`, `portfolio_holdings`, `portfolio_realized_trades`, `portfolio_snapshots`, `cron_heartbeats` (via service-role client).
- **Realistic attack scenario:** The secret appears in plaintext in any request/access log that captures full URLs (hosting provider logs, any HTTP proxy/CDN logs, browser history if a human ever pastes the URL to test it manually). A leak of `CRON_SECRET` from such a log lets someone trigger these two specific, bounded jobs on demand (not arbitrary access — the routes only do their one defined task) — mainly a cost/availability nuisance (forcing extra Yahoo/market-data fetches and DB writes on demand) rather than a direct data-confidentiality break, since the jobs don't return user data to the caller.
- **Business/user impact:** Low-to-moderate direct impact (no data returned to caller, no arbitrary action), but poor secret hygiene and an easy, zero-cost fix.
- **Safe remediation approach:** (a) Code change: keep `Authorization: Bearer` support, drop the query-param fallback (or keep it only behind an explicit opt-in env flag for local testing). (b) Owner action: update the two GitHub Actions workflow files to send `-H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"` instead of `?secret=...`. The workflow YAML change is a **GitHub Actions / repository file** change — per the autonomy rules, I can *draft* the new YAML locally, but changing files under `.github/workflows/` that affect how CI/CD authenticates is exactly the kind of "GitHub Actions settings" change requiring your explicit approval before I apply it (and it's a `.github/` change either way, which the task's Batch ordering treats as Batch 5 owner/provider territory even though it's technically a text file in the repo).
- **Needs:** Code change (route: stop accepting query param) — Batch 1. Workflow file change — Batch 5 (owner-approved), since it's CI/CD configuration.
- **Regression-test plan:** Unit test: request with only `?secret=` and no header → 401 after the fix (currently 200); request with correct `Authorization: Bearer` header → 200 (unchanged).
- **Rollback:** Revert the route change (re-add query-param support) in one commit; revert the workflow YAML in one commit.
- **Blast radius:** Isolated (2 route files + 2 workflow files).
- **Fixable without DB changes?** Yes.
- **Fixable without downtime?** Yes, but **sequencing matters**: the workflow files must be updated to send the header *before or in the same deploy as* removing query-param support, or the scheduled jobs will start failing with 401 until both sides are updated. Flagged as a coordinated two-sided change in Batch 1/5.

### Finding 4 — No security headers configured

- **Severity:** High (defense-in-depth; no demonstrated active exploit)
- **Verification status:** Verified (absence — no `next.config.js`/`next.config.mjs` exists at all; no header-setting middleware found anywhere in `app/`)
- **Evidence:** `find . -iname "next.config*"` returns nothing; no `middleware.ts` exists; no manual `NextResponse` header-setting for CSP/frame-options found in any route.
- **Affected feature:** Every page and route in the app.
- **Realistic attack scenario:** Absent a CSP, any future XSS (stored or reflected) has an easier time exfiltrating data or loading attacker scripts; absent `X-Frame-Options`/`frame-ancestors`, the login/reset-password pages could be framed for a clickjacking attempt against the auth forms.
- **Business/user impact:** No confirmed active vulnerability today, but this is a standard, near-zero-risk, zero-behavior-change hardening step that meaningfully raises the bar for any future XSS.
- **Safe remediation approach:** Add a `next.config.js` `headers()` function (or minimal `middleware.ts`) setting `Content-Security-Policy` (start with a conservative policy allowing `self` + Supabase's domain + Yahoo/Anthropic fetch origins used server-side only, since those are server-to-server and don't need to be in a browser CSP), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` trimmed to nothing the app doesn't use.
- **Needs:** Code-only change (new/edited `next.config.js`). No DB, no external call, no dependency change.
- **Regression-test plan:** A local build (`npm run build`) plus an automated header-presence check (e.g., a lightweight test hitting the built app locally or asserting the config object shape) — no external calls needed.
- **Rollback:** Delete the added headers block.
- **Blast radius:** Broad in reach (every route) but functionally isolated (adds headers, changes no logic) and low-risk — the main way this could visibly change behavior is if the CSP is too strict and blocks a legitimate inline script/style or a fetch the app depends on, so it needs a real click-through test in Batch 3 before staging.
- **Fixable without DB changes?** Yes.
- **Fixable without downtime?** Yes.

### Finding 5 — AI-generated content rendered without an explicit sanitization step

- **Severity:** Medium-High
- **Verification status:** Verified in code (no sink found today; control gap confirmed)
- **Evidence:** `lib/companyNarrative.ts` returns freeform AI-authored strings (`businessExplanation`, `swot.*`, `newsCommentary[].whyItMatters`, etc.) that are `JSON.parse`d from the model's raw text and returned as-is (`companyNarrative.ts:68`) with no HTML-escaping/sanitization step before being sent to the client. `app/api/portfolio-research/route.ts:106` similarly trusts `h.rationale` (a free string) from the model. I searched `app/` for `dangerouslySetInnerHTML` and any HTML-string-building from these fields and found none — React's default JSX text rendering already escapes strings, so there is **no demonstrated XSS today** as long as these fields are always rendered as plain JSX text (`{narrative.businessExplanation}`) rather than being interpolated into an HTML string or a `dangerouslySetInnerHTML` call anywhere now or in the future.
- **Affected feature:** Company Report narrative; AI Portfolio Agent rationale text.
- **Realistic attack scenario:** Low today (requires someone to introduce a `dangerouslySetInnerHTML`/HTML-string sink later, or a Markdown renderer that isn't escaped). The real exposure is *prompt injection*, not XSS: since the model is given real news headlines/descriptions (`bundle.news`) and insider-transaction text as data, a maliciously-crafted news headline (were Yahoo's feed ever able to carry attacker-controlled text — not something a user can inject today, since `symbol` is the only user input and news comes from Yahoo) could attempt to steer the model's output. Given the prompt explicitly instructs the model to use ONLY the provided JSON and return ONLY JSON in a fixed shape, and the app parses that JSON into fixed, typed fields rather than executing anything the model says, the realistic ceiling of a successful injection is "the model writes a weird sentence in a text field," not code execution or data exfiltration.
- **Business/user impact:** Low today; this is flagged because the audit brief specifically requires addressing "unsafe markdown/HTML rendering" and "direct and indirect prompt injection" even without a demonstrated exploit.
- **Safe remediation approach:** (a) Add an explicit, defense-in-depth sanitization pass (e.g., strip HTML tags / encode) on every AI-authored string field before it's returned by the API, so the guarantee doesn't rely solely on "we always remembered to use plain JSX text." (b) Add a code comment + a lint-style regression test asserting no `dangerouslySetInnerHTML` exists anywhere AI output could reach, so a future change can't silently introduce the sink.
- **Needs:** Code-only change (a small sanitizer utility + applying it in `lib/companyNarrative.ts` and `app/api/portfolio-research/route.ts`). No DB/external call.
- **Regression-test plan:** Unit test feeding a mocked Anthropic response containing `<script>`/HTML in a text field and asserting the sanitizer strips/encodes it before the route returns.
- **Rollback:** Remove the sanitizer call; revert to raw pass-through.
- **Blast radius:** Isolated (2 files + 1 new utility).
- **Fixable without DB changes?** Yes. **Fixable without downtime?** Yes.

### Finding 6 — `yahoo_auth_cache` table has RLS disabled

- **Severity:** Medium
- **Verification status:** Verified in code
- **Evidence:** `supabase/migration_v15_yahoo_auth_cache.sql` creates `public.yahoo_auth_cache` and grants `all` to `service_role` only — there is no `alter table ... enable row level security` statement, unlike every other table in the schema.
- **Affected feature/table:** `public.yahoo_auth_cache` (stores a cached Yahoo Finance session cookie + crumb token — not a user secret, but still a credential-like value the app authenticates outbound requests with).
- **Realistic attack scenario:** Because no `GRANT` was ever issued to `anon` or `authenticated`, PostgREST currently denies both roles at the grant layer regardless of RLS — so this is **not currently exploitable** given today's grants. It's flagged because it's an inconsistency with the rest of the schema (every other table explicitly enables RLS) and because a future migration that adds a broader grant "by analogy with the other tables" could silently reintroduce exposure if RLS were assumed to already be on.
- **Business/user impact:** None today (not exploitable); pure defense-in-depth/consistency fix.
- **Safe remediation approach:** `alter table public.yahoo_auth_cache enable row level security;` with no policies (default-deny for `anon`/`authenticated`, unaffected for `service_role` which bypasses RLS) — this is a pure hardening no-op given current grants, and prevents future "just grant it like the others" changes from being an accidental hole.
- **Needs:** Supabase migration — **database change, requires approval to apply**; file can be authored now.
- **Regression-test plan:** Not unit-testable (RLS is a Postgres-level control); verified by a staging Supabase check confirming `anon`/`authenticated` still get `permission denied` on the table after the change (identical to before).
- **Rollback:** `alter table public.yahoo_auth_cache disable row level security;`
- **Blast radius:** Isolated (1 table, no policy added, no behavior change for `service_role`).
- **Fixable without DB changes?** No (this is itself a DB change). **Fixable without downtime?** Yes.

### Finding 7 — No per-user cost quota on AI-calling routes (see also Finding 2)

- Folded into Finding 2's remediation (per-user quota alongside the auth requirement). Listed separately in the summary table because "authenticated but unbounded" and "unauthenticated" are two independent gaps — fixing auth alone still leaves a logged-in user free to hammer the Anthropic-backed routes from their own account with no ceiling beyond the shared IP-based limiter.

### Finding 8 — `.env.example` is incomplete

- **Severity:** Low (hygiene)
- **Verification status:** Verified
- **Evidence:** `.env.example` lists only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. It omits `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `CRON_SECRET`, all three of which are read via `process.env` in `app/api/cron/*/route.ts`, `lib/yahooAuth.ts`, `app/api/portfolio-research/route.ts`, and `lib/companyNarrative.ts`.
- **Impact:** Makes it easy to stand up a new environment (e.g., a future staging environment) missing a required secret, which fails safe (routes return `500`/skip AI) rather than insecurely, but is worth fixing for operability.
- **Remediation:** Add the three missing variable names (values left blank) with the same one-line comments style already used in the file. **No real secret value is ever added to this file.**
- **Needs:** Code-only (documentation) change. **Blast radius:** Isolated. **Downtime:** None.

---

## C. Remediation batches

### Batch 0 — Owner-only emergency containment actions (outside code; Claude does not perform these)

- **Purpose:** Give you, Zachary, a fast checklist of anything that would need *immediate* dashboard action if a secret had ever leaked — none of the findings above show evidence of an actual leaked secret, so this batch is precautionary, not a response to a confirmed incident.
- **Findings addressed:** Context for Finding 3 (cron secret hygiene) and general secret hygiene.
- **Actions (all yours, all optional/precautionary):**
  1. In the GitHub repo, confirm `CRON_SECRET` is stored only as an Actions secret (Settings → Secrets and variables → Actions), never committed in a file — I did not find it committed anywhere in the current working tree, but a full Git-history scan for secret-looking strings is listed as a Blocker below since I was asked not to search remote history.
  2. If you have any doubt whether `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or `ANTHROPIC_API_KEY` were ever pasted into a commit, a Slack message, a support ticket, or a log you can't fully control, rotate that specific credential in its provider dashboard now (Supabase → Project Settings → API for the service-role key; Anthropic Console → API Keys; and generate a new random value for `CRON_SECRET`, updating both the GitHub Actions secret and the Vercel env var together).
  3. Nothing in this repository suggests an active incident — this step is "cheap insurance," not a reaction to a confirmed exposure.

### Batch 1 — Lowest-risk code-only security fixes (isolated blast radius, no dependency/DB/remote changes)

- **Purpose:** Close the two highest-value, code-only gaps: require auth on the paid-AI routes, stop accepting the cron secret via URL, add security headers, add a defense-in-depth output sanitizer, and complete `.env.example`.
- **Findings addressed:** 2 (auth check portion), 3 (route-side portion — query-param removal), 4, 5, 8.
- **Files expected to change:**
  - `app/api/company-report/narrative/route.ts` — add Supabase session check.
  - `app/api/portfolio-research/route.ts` — add Supabase session check.
  - `app/api/cron/live-signals/route.ts` and `app/api/cron/portfolio-snapshots/route.ts` — remove the `searchParams.get('secret')` fallback, keep header-only auth (**held until the workflow-side header change is ready to ship in the same window — see Batch 5 coordination note**).
  - `lib/companyNarrative.ts`, `app/api/portfolio-research/route.ts` — add a small text-sanitizing helper (new file, e.g. `lib/sanitizeText.ts`) applied to AI-authored string fields before returning them.
  - `next.config.js` (new file) — add a `headers()` function with CSP/frame-options/etc.
  - `.env.example` — add the three missing variable names (no values).
- **Files/settings/data that will NOT change:** Any database table/RLS/schema; any dependency in `package.json`/`package-lock.json`; any Vercel/Supabase/GitHub dashboard setting; any existing user data.
- **Preconditions:** Your confirmation on the Finding 2 behavior-change question (do these two routes need to keep working for logged-out visitors?) before I add the auth check. Your go-ahead on exactly when the cron-secret query-param removal ships relative to the GitHub Actions workflow update (they must land together or the scheduled jobs will 401 in between).
- **Implementation steps (once approved):** minimum-line edits per file as described; no refactors; no renamed exports; no touched files outside this list unless a genuinely necessary import is discovered, in which case I stop and ask before adding it.
- **Automated tests to add/run:** New unit tests (mocked Supabase auth client, mocked `fetch` for Anthropic, mocked rate limiter) for: 401 on missing/invalid session; happy path unchanged; cron 401 on query-param-only request; cron 200 on header-only request; sanitizer strips a `<script>` payload from a mocked AI response; `next.config.js` headers object contains the expected keys (a plain object-shape assertion, no server needed).
- **Local checks that cannot invoke external/paid services:** `npm run build` (Next.js production build — compiles and type-checks; makes no external network calls); `tsc --noEmit` if not already covered by build; the new unit tests, all against mocks.
- **Staging/preview deployment needed?** Not for this batch to be written and tested locally, but a preview deploy is the right place to *confirm* the CSP doesn't break anything real (fonts, inline styles, Supabase client calls) — that's Batch 3.
- **Requires later remote/provider approval?** Yes for two sub-parts: (a) the GitHub Actions workflow header change (Batch 5/owner), which must be sequenced with the cron route change here; (b) nothing else in this batch touches a remote system.
- **Go/no-go criteria:** All new/existing tests green; `npm run build` succeeds; no file outside the approved list touched.
- **Rollback:** `git revert` the batch's commit(s) — every change here is additive/isolated and has no data-migration component, so reverting the commit fully restores prior behavior.
- **Why this won't affect existing production data:** No table is touched; no existing row is read, written, or migrated by this batch.
- **User-visible behavior change?** Yes, specifically: the two AI routes will start rejecting logged-out callers (pending your answer on whether that's intended); the cron routes will reject query-param-only calls (pending workflow-side coordination); CSP could in theory block something if it's ever mis-scoped, which is why Batch 3 staging validation exists before this goes to production.

### Batch 2 — Local security tests and test infrastructure (mocks only)

- **Purpose:** Build durable regression coverage for auth, ownership, ticker-binding (app-layer guard, pending the DB trigger in Batch 4), input validation, and cost controls, using dependency injection/mocks — never a live external call.
- **Findings addressed:** 1 (app-layer regression guard, pending the real DB-level proof in Batch 3/4), 2, 3, 5, 7.
- **Files expected to change:** New test files only, e.g. `lib/__tests__/tradeConfirm.test.ts`, `lib/__tests__/rateLimit.test.ts`, `app/api/__tests__/narrative-auth.test.ts`, `app/api/__tests__/portfolio-research-auth.test.ts`, `app/api/__tests__/cron-auth.test.ts`, `lib/__tests__/sanitizeText.test.ts`. Possibly a `jest.config.js`/test-runner setup file if none exists yet (repository currently has no test runner configured in `package.json` — this needs your sign-off on adding a dev dependency, see note below).
- **Files that will NOT change:** Any production source file beyond what Batch 1 already changed; no database; no dependency other than the test runner itself.
- **Preconditions:** **This repository has no test framework installed today** (`package.json` lists no `jest`/`vitest`/`@testing-library/*`). Per the autonomy rules, adding a new dependency requires your separate, explicit approval even when a verified finding (the need for regression tests) motivates it. I will name the specific minimal package (e.g. `vitest`, chosen for zero-config TypeScript/ESM support and no Babel/webpack setup burden) and wait for your approval before running `npm install`.
- **Implementation steps:** Add the test runner (pending approval) → write tests using mocked `@supabase/supabase-js` clients (a hand-written fake implementing only the `.from().select().eq()...` chain shapes actually used) and a mocked `fetch` for the Anthropic endpoint → assert both the passing and rejecting paths for every finding above.
- **Tests to add:** Enumerated in Batch 1 (they physically live here) plus: mocked-client test proving `confirmBuySignal`/`closePositionManually` never construct a payload whose `symbol`/`market` differs from the strategy record they were given (guards the app-layer half of Finding 1 against regression, while the unbypassable DB-level proof is Batch 3/4's job).
- **Local checks with no external calls:** The entire test suite, by construction (every network boundary — Supabase, Anthropic, Yahoo, Upstash — is mocked).
- **Staging/preview deployment needed?** No.
- **Requires later remote/provider approval?** Only the one-time test-runner dependency install.
- **Go/no-go criteria:** All new tests pass locally with zero network access (verifiable by running with network disabled, or by asserting mocks were called instead of real `fetch`).
- **Rollback:** Delete the test files / revert the dependency addition.
- **Production-data safety:** No production system is touched by definition.
- **User-visible behavior change:** None — tests only.

### Batch 3 — Staging/preview validation plan (files/commands prepared, nothing deployed)

- **Purpose:** Define exactly how Batches 1-2's changes get validated on a real preview deployment before touching production, without me deploying anything myself.
- **Findings addressed:** 2, 3, 4 (CSP real-world check), 1 (partial — see Batch 4 for the actual DB proof).
- **Files expected to change:** A new `STAGING_VALIDATION_CHECKLIST.md` (or similar) at the repo root, listing manual steps; no application code changes beyond what Batches 1-2 already made.
- **Preconditions:** A Vercel Preview deployment must exist for the branch containing Batches 1-2 (an **owner/you action** — I do not deploy). A staging Supabase project (or a disposable branch/schema in an existing non-production Supabase project) is needed to safely test the Finding 1 trigger from Batch 4 without touching production data — **Blocker: does a staging Supabase project already exist?** (see Section F).
- **Implementation steps (documentation only, in this batch):** Write out, step by step: (1) how to hit the preview URL's `/api/company-report/narrative` and `/api/portfolio-research` both logged-out (expect 401) and logged-in (expect normal behavior) using the browser or `curl` with a real session cookie/token you copy from your own logged-in session; (2) how to call the cron endpoints on preview with header-only auth vs. query-param to confirm the 401/200 split; (3) how to click through every page on preview checking the console for CSP violation reports before promoting; (4) how to run the Finding 1 trigger test against a staging Supabase project (see Batch 4).
- **Automated tests to add/run:** None new — this batch is the manual verification layer for Batches 1/2/4's automated tests.
- **Local checks with no external calls:** N/A (this batch is specifically the "now go check it against a real deployment" step) — but note every command *proposed* here is either read-only or targets a non-production environment; nothing in this batch instructs hitting production.
- **Staging/preview deployment needed?** Yes — this is the whole point of the batch, and deploying to preview is itself something I will ask you to approve or perform, per the autonomy rules ("Approve deployment to Vercel preview").
- **Requires later remote/provider approval?** Yes — the actual preview deploy and any staging Supabase action.
- **Go/no-go criteria for promoting past this batch:** Every checklist item passes on preview with zero CSP violations breaking real functionality, both auth-gated routes correctly reject/accept as designed, and the cron auth split behaves as designed.
- **Rollback:** N/A (documentation-only batch; the checklist itself has no runtime effect).
- **Production-data safety:** This batch by design never touches production — it only prepares the checklist and (pending your approval) runs it against preview/staging.
- **User-visible behavior change:** None from this batch itself.

### Batch 4 — Supabase RLS/schema/migration/cron-hardening proposals (files prepared locally, nothing applied)

- **Purpose:** Author the exact SQL for the two database-level fixes (Finding 1's trigger, Finding 6's RLS-enable) as new migration files, ready for your review and, separately, your approval to run in Supabase.
- **Findings addressed:** 1, 6.
- **Files expected to change (all new, additive migration files — nothing existing edited):**
  - `supabase/migration_v31_ticker_binding_guard.sql` — creates a trigger function `public.enforce_strategy_symbol_match()` and attaches `BEFORE INSERT OR UPDATE` triggers on `public.live_positions` and `public.trade_notifications` that, when `strategy_id` is not null, look up `public.strategies.symbol`/`market` for that id and `RAISE EXCEPTION` if the new row's `symbol`/`market` don't match.
  - `supabase/migration_v32_yahoo_cache_rls.sql` — `alter table public.yahoo_auth_cache enable row level security;` (no policies added — matches current no-access-for-anon/authenticated behavior, just makes it RLS-consistent with every other table).
- **Files/settings/data that will NOT change:** No existing table is altered structurally; no existing row is modified; no RLS policy on any *other* table changes; no grant changes.
- **Preconditions:** Your explicit approval to *apply* either file in Supabase (staging first, ideally) — I will only author and locally document these files in this batch, never run them.
- **Implementation steps:** Write the two SQL files with comments matching the existing migration style (see `supabase/migration_v27_live_signals_service_role_grants.sql` for the house style I'm matching). Include an explicit rollback statement as a comment at the top of each file.
- **Tests to add:** A staging-only integration test (documented in Batch 3's checklist, run manually against a staging Supabase project since a Postgres trigger can't be meaningfully unit-tested against a mock) proving: legitimate matching-symbol inserts still succeed; mismatched-symbol inserts now fail with a clear error; the app's existing error-handling (`tradeConfirm.ts` already checks `if(pos)` before using the result) degrades gracefully if the trigger ever rejects an insert (it does — `pos` would be `null`/an error, and the existing code already only acts on a truthy `pos`).
- **Local checks with no external calls:** SQL syntax can be linted locally (no live DB needed to confirm the file parses), but the actual trigger behavior can only be proven against a real Postgres/Supabase instance — flagged as staging-required, not something Batch 4 itself can fully verify.
- **Staging/preview deployment needed?** A staging Supabase project/schema, yes (not a Vercel preview).
- **Requires later remote/provider approval?** Yes — running either migration anywhere, even staging, requires your explicit approval per the autonomy rules ("Running Supabase migrations... requires... explicit approval").
- **Go/no-go criteria:** Staging test in Batch 3's checklist passes cleanly (matching inserts succeed, mismatched inserts are rejected, no existing legitimate flow breaks) before promoting to production.
- **Rollback:** Each file's header comment includes the exact `DROP TRIGGER`/`DROP FUNCTION` or `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` statement to undo it.
- **Why this won't affect existing production data:** Both migrations are purely additive (a new trigger function, an RLS toggle) — no `UPDATE`/`DELETE` on existing rows, no column changes, no data backfill.
- **Whether it needs downtime:** No — both are instant, non-locking DDL at this table size.
- **User-visible behavior change:** Only in the failure case — a client attempting a rule-violating insert (something no legitimate current code path does) would now get a database error instead of silently succeeding. No legitimate user-visible flow changes.

### Batch 5 — Provider/dashboard actions (Vercel, Supabase, GitHub, Anthropic) — manual steps only, nothing performed by me

- **Purpose:** Hand you the exact manual steps for the provider-side pieces no code change can accomplish, plus the GitHub Actions workflow-header change coordinated with Batch 1's cron-route change.
- **Findings addressed:** 3 (workflow-side), plus general provider hygiene.
- **Files expected to change (by you, or by me only after your explicit approval, since these are `.github/` and provider-dashboard changes):** `.github/workflows/live-signals-cron.yml`, `.github/workflows/portfolio-snapshots-cron.yml` — change the `curl` call from `"...?secret=${{ secrets.CRON_SECRET }}"` to `-H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "https://strategylabai.net/api/cron/..."`.
- **Sequencing requirement:** This workflow change and Batch 1's route-side query-param removal must be deployed together (or workflow-first, then route) — if the route stops accepting the query param before the workflow sends the header, the two scheduled jobs will fail (401) for every run in between. I will hold Batch 1's cron-route diff until you confirm you're ready to update the workflow files in the same window, or explicitly accept a short window of expected cron failures.
- **Owner actions covered here (see Section E for the full plain-English list).**
- **Requires later remote/provider approval?** Yes, entirely — this whole batch is provider/CI-configuration by definition.
- **Go/no-go criteria:** Next scheduled run of each workflow (every 5/15 minutes) succeeds with a 200 after the coordinated change.
- **Rollback:** Revert the workflow YAML to the query-param form (and correspondingly keep/restore query-param support in the route) if anything goes wrong.

### Batch 6 — Production rollout, monitoring, and rollback plan (no deployment performed)

- **Purpose:** Define what "ready for production" looks like and how you'd back out, without me deploying.
- **Findings addressed:** All of the above, as the final promotion gate.
- **Go criteria before production:**
  1. Batches 1-2 merged, all local tests green, `npm run build` clean.
  2. Batch 3's preview checklist fully passed (auth gates behave correctly, CSP causes zero real breakage).
  3. Batch 4's two migrations validated on a staging Supabase project per Batch 3's DB checklist.
  4. Batch 5's workflow-header change deployed in the same coordinated window as the route-side query-param removal.
- **Monitoring after production rollout:** Watch Vercel function logs for a spike in `401`s on the two AI routes (would indicate a legitimate logged-out use case was broken — rolls back Batch 1's auth check if so) and on the cron routes (would indicate the workflow-header coordination slipped). Watch Anthropic Console usage dashboard for a drop in unexplained/anonymous-looking request volume (confirms Finding 2's fix is working) without a drop in legitimate logged-in usage.
- **Rollback plan:** Every batch above lists its own single-commit/single-statement rollback; Batch 6 adds no new rollback surface of its own beyond "revert the deploy" if something unexpected breaks in production that staging didn't catch.
- **Production data impact:** None of these batches write, migrate, or delete existing production data at any point — confirmed table-by-table in each finding above.

---

## D. Required special-control review

### 1. Ticker-bound strategies — full trace

- **Creation:** A strategy is created in `app/research/page.tsx:591` with `symbol:symbol.toUpperCase(),market` taken from the research run's own symbol/market (the run itself was created at line 412 with `symbol:symbol.toUpperCase()` from the page's own state, tied to `research_runs.id`). The strategy row's `symbol`/`market` are set once at creation and never updated afterward (only `favorite`/`name` are ever `.update()`d — verified via `grep` across `app/research/page.tsx`).
- **Favoriting:** `toggleFavoriteStrategy` (`app/research/page.tsx:637`) only ever sets `favorite`, never `symbol`/`market`.
- **Signal configuration / scheduled scan:** The cron job (`app/api/cron/live-signals/route.ts:46`) selects `strategies` `where favorite=true`, then (`lib/strategySignals.ts:47`) re-queries per-user favorites `.eq('symbol',symbol).eq('market',market)` — **this path is correctly ticker-scoped, verified**.
- **Live-page scan (browser, while open):** `app/trade-signals/page.tsx:186` loads favorited strategies filtered to `watched.has(key(s.symbol,s.market))` (line 189) — **also correctly ticker-scoped**, and `evaluateSymbolSignals` is only ever called (line 158) with `w.symbol`/`w.market` from the user's own watchlist entry, not from arbitrary input.
- **Alert generation / API handling:** Notifications are written inside `evaluateSymbolSignals` using the `symbol`/`market` parameters that were themselves already scoped correctly above (**Verified — the read/evaluation side of the pipeline is sound**).
- **The bypass path — confirmed:** The gap is specifically at the **write-confirmation** step (`lib/tradeConfirm.ts`, `closePositionManually`), where a `symbol`/`market` value that *should* always equal the strategy's own stored value is passed through client state rather than being re-derived/re-verified against `public.strategies` at write time. Because this write happens over the browser's own Supabase client (not a server route), only a database-level control (Finding 1's trigger, Batch 4) closes it completely.
- **Other paths checked and found NOT bypassable today:**
  - **Crafted API payloads:** No server API route accepts a client-supplied `strategy_id`+`symbol` pair for signal evaluation — the only routes touching these tables are the two cron routes (service-role, server-controlled symbol from the DB) and the client writes covered above.
  - **Direct database calls:** This *is* the confirmed bypass (Finding 1) — closed by the Batch 4 trigger.
  - **Copied strategies / duplicated records:** No "duplicate strategy" or "copy to another ticker" feature exists anywhere in the code I read (`app/research/page.tsx` has no such action).
  - **URL parameters:** No route reads a ticker from a URL param and applies it to an existing strategy_id without the ownership/matching checks above.
  - **Cron jobs:** Covered above — correctly scoped.
  - **Client state:** Confirmed as the actual bypass vector (Finding 1).
  - **Exports/imports:** `app/research/page.tsx` has DOCX *export* functions (`downloadFavoritedLogsDocx`, `downloadFavoritedStrategiesDocx`) — read-only, no import/re-ingestion path exists that could reintroduce a strategy under a different ticker.
- **Required regression tests (see Batch 2/3/4):** App-layer test proving the confirm-flow always sends matching symbol/market (regression guard); DB-layer test on staging proving a deliberately mismatched insert is rejected once Batch 4's trigger is applied (the actual proof the rule can't be bypassed).

### 2. User-resource isolation

- **Enforcement layer:** **Both**, and consistently so — every user-data table (`profiles`, `research_runs`, `strategies`, `run_events`, `capital_events`, `portfolios`, `portfolio_holdings`, `portfolio_log`, `portfolio_snapshots`, `portfolio_realized_trades`, `live_positions`, `trade_notifications`, `watchlist_symbols`, `company_reports`) has RLS enabled with an `auth.uid()=user_id` (or owning-portfolio) policy, **and** the client code consistently filters by `session.user.id` on reads as well (defense-in-depth, not load-bearing given RLS, but consistent).
- **Exception:** `portfolio_snapshots` intentionally has no insert policy for `authenticated` (write-only via service role) — correct by design per its own migration comment.
- **`yahoo_auth_cache`:** Not user-scoped data (a shared technical cache), not a user-isolation concern, but flagged separately as Finding 6 for RLS consistency.
- **Test plan required (Batch 2):** For each table above, a mocked-client test isn't meaningful for RLS itself (RLS is enforced by Postgres, not app code) — the real proof is a staging/preview check (Batch 3) using two real test accounts, confirming account B's session token gets an empty result (not an error, not another user's row) when querying any of account A's resources by a guessed/enumerated id. **This specific cross-account check was not run in this phase** (would require creating test accounts against a live Supabase project, which is exactly the kind of "creating a user account" action requiring your approval) — flagged as a Blocker/staging-required item, not claimed as verified beyond the RLS SQL itself.

### 3. AI / Anthropic agent boundaries

- **Agent tools:** None found. There is no function-calling/tool-use configuration anywhere (`grep` for `anthropic` found only the two prompt-completion call sites already covered). No shell access, no arbitrary file access, no arbitrary DB query construction from AI output, no arbitrary URL fetching driven by AI output.
- **Prompts:** Both prompts (`app/api/portfolio-research/route.ts:97`, `lib/companyNarrative.ts:33`) are fixed server-side strings; the only user-influenced content interpolated into them is the user's own `description` text (portfolio) and real market/news data (company report) — **not** system-prompt text, **not** anything that could redefine the model's instructions (no user text is ever placed before the fixed instruction block in a way that could be mistaken for a new system prompt).
- **Retrieval sources:** Yahoo Finance (fixed host, symbol-templated URL, no user-controlled host) — **no SSRF vector**, confirmed by reading every `fetch(` call in `lib/market.ts`, `lib/companyReport.ts`, `lib/yahooAuth.ts`, `app/api/market/route.ts`: all target `query1.finance.yahoo.com`/`query2.finance.yahoo.com`/`fc.yahoo.com` with the symbol only ever `encodeURIComponent`-escaped into the path/query, never used to construct a different host.
- **Streamed output / stored histories:** No streaming found (`await r.json()` only); AI output is stored in `company_reports.report` (jsonb) and returned once, not accumulated into a growing "conversation history" that could carry cross-user context.
- **Cross-user context leakage:** Not possible today — each Anthropic call is a single, stateless request built fresh from that one request's own data; no shared/global conversation state exists across users or requests.
- **System-prompt leakage:** The prompts are not secret (they're in this repo's source), so "leakage" isn't a meaningful risk here beyond someone reading the open-source code.
- **Unsafe markdown/HTML rendering:** Covered in Finding 5 — no sink found, defense-in-depth sanitizer recommended anyway.
- **Unbounded token/cost use:** Covered in Findings 2/7 — the *number of calls* is unbounded (no auth, no per-user quota); the *size* of each call is already reasonably capped (`buildAiInputBundle` truncates fields; `max_tokens: 2000`/`12000` caps output).
- **Required allowlisting:** Since there are no tools, there's nothing to allowlist in the "tool permissions" sense the audit brief describes — this section of the brief maps to a much smaller surface in this codebase than a full agentic system would have. The one place an allowlist *does* exist and *is* correctly enforced is `app/api/portfolio-research/route.ts:105` (`validSymbols` filter on AI-returned holdings) — verified working.

### 4. Cost and abuse controls

| Route | Auth today | Per-IP limit | Per-user quota | Input size/range limits | Notes |
|---|---|---|---|---|---|
| `/api/market` | None (public data) | 120/min, 2000/hr | None | Fixed symbol/interval/days params, defaulted | Low cost (no paid API); acceptable as-is |
| `/api/company-report` (Edge) | None (public data) | 15/min, 100/hr | None | Single symbol per call | Yahoo-only, no paid API; acceptable, but see narrative below |
| `/api/company-report/narrative` | **None — Finding 2** | 4/min, 20/hr | **None — Finding 7** | Truncated server-side (`buildAiInputBundle`) | **Paid Anthropic call** |
| `/api/portfolio-research` | **None — Finding 2** | 10/min, 60/hr | **None — Finding 7** | Universe capped to 40 symbols, `max_tokens:2000` | **Paid Anthropic call (when key set)** |
| `/api/cron/live-signals`, `/api/cron/portfolio-snapshots` | Shared secret (Finding 3 on transport) | 30/hr | N/A (single caller by design) | Bounded by table contents | Service-role, no user input surface |

- **Idempotency/concurrency:** `tradeConfirm.ts` already uses an atomic claim pattern (`update(...).eq('acknowledged',false)`) to prevent double-confirmation races (verified, already correct — no change needed). Cron routes are naturally idempotent-ish (re-running just re-evaluates current state); a true duplicate-run guard isn't currently present but the heartbeat table plus GitHub Actions' own single-scheduled-run model makes true concurrent duplicate runs unlikely — not flagged as a finding, but worth a Batch-4-adjacent note if you ever move to a scheduler that could double-fire.
- **How to test cost controls without real paid calls:** Every recommended test (Batch 2) mocks `fetch` to `api.anthropic.com` and asserts (a) it's never called when auth/quota checks should block the request, and (b) it's called exactly once per legitimate request — never by making a real call.

### 5. Secrets and logging

- **Server-only boundary:** Confirmed correct — `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in server-only files (API routes under `app/api/`, and `lib/yahooAuth.ts` which is only ever imported by those routes/`lib/market.ts`/`lib/companyReport.ts` running server-side). Neither is ever assigned to a `NEXT_PUBLIC_`-prefixed variable. `CRON_SECRET` is likewise server-only.
- **Redaction in errors/logs:** Several `console.error` calls log full provider responses (`app/api/portfolio-research/route.ts:100,102,110`, `lib/companyNarrative.ts:63-64,71,75`) — I read every one of these and confirmed **none of them logs the API key itself** (they log the Anthropic *response body*, not the request headers), so this is not a secret-leak vector, but response bodies could in principle contain user-supplied `description` text verbatim in server logs (Vercel log retention) — low sensitivity (it's the user's own portfolio description, not a system secret), not flagged as a separate finding.
- **Leak surfaces checked:** No source maps/build output present in this checkout to inspect (not built); Git history was **not** scanned per your instruction that I not rewrite or deep-mine history beyond a local, read-only look — flagged as a Blocker (Section F) if you want that specifically checked; CI logs I *can* see (`.github/workflows/*.yml`) reference the secret only via `${{ secrets.CRON_SECRET }}` (GitHub's own redaction applies); docs (`README.md`) contain no secret values (verified by reading it — 1002 bytes, generic setup instructions only).
- **Anon key vs service-role key:** Confirmed correctly split — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the anon/publishable key) is the only Supabase key in client code (`lib/supabase.ts`), and its safety depends entirely on RLS being correct everywhere, which Section D.2 above addresses. `SUPABASE_SERVICE_ROLE_KEY` never appears in any client-bundled file.

### 6. Web/API protections

- **CORS:** No explicit CORS configuration found anywhere (no `Access-Control-Allow-Origin` header set in any route) — Next.js API routes default to same-origin-only for browser calls unless a header is explicitly added, which none of these routes do, so this is not an open-CORS finding; not flagged.
- **CSRF:** Not applicable in the traditional cookie-session sense — Supabase auth uses bearer-token-style JWTs sent explicitly by the JS client, not ambient cookies automatically attached to cross-site requests, so classic CSRF doesn't apply to the Supabase-direct calls. The Next.js API routes don't use cookie-based session auth either. Not flagged.
- **CSP/clickjacking:** Covered as Finding 4.
- **Cookies:** Supabase JS client manages its own auth storage (default: `localStorage`, not a cookie, per `@supabase/supabase-js` defaults and the `persistSession:true` config in `lib/supabase.ts` with no custom storage override) — no cookie-based session to secure/flag.
- **Redirects/open redirects:** No dynamic redirect-to-user-supplied-URL pattern found anywhere (`reset-password` uses a fixed `router.push('/')`).
- **IDOR/BOLA:** Covered exhaustively in D.1/D.2 — the one confirmed gap is Finding 1; no other IDOR path found (every `.eq('id', ...)` client call is layered under an RLS policy that also checks ownership).
- **XSS:** Covered in Finding 5 — no sink found.
- **SQL injection:** Not applicable — no raw SQL string-building found anywhere in application code; all database access goes through the Supabase JS client's parameterized query builder, and the one raw-SQL function (`get_email_for_username`) takes a single parameter through Postgres's native parameter binding (`$$ select email from public.profiles where lower(username) = lower(uname) limit 1 $$` with `uname` as a bound function argument, not string-concatenated).
- **SSRF:** Covered in D.3 — no user-controlled host anywhere.
- **Path traversal:** No filesystem access driven by user input found anywhere in the app.

### 7. Cron and webhook protections

- **Every scheduled job/cron route found:** `app/api/cron/live-signals/route.ts` (GitHub Actions, every 5 min), `app/api/cron/portfolio-snapshots/route.ts` (GitHub Actions, every 15 min). **No webhooks** (inbound, provider-initiated) exist anywhere in this codebase — no Stripe/payment webhooks (no payment system, consistent with your stated context), no Supabase webhooks, no Anthropic webhooks.
- **Authentication:** Shared-secret header/query-param (Finding 3 covers the transport weakness; the secret-check logic itself, `isAuthorized()`, is correctly implemented — constant-value comparison, checked before any data access).
- **Safe failure mode:** Both routes correctly return early (`401`) before touching the service-role client if unauthorized, and return early (`500` with a clear message) if the service-role env vars are missing — no partial/unsafe execution path found.
- **Public invocation triggering expensive work:** Rate-limited (30/hr) even pre-auth-check (intentionally, per the code's own comment, to throttle guessing attempts) — reasonable given the secret-guessing surface is small (a fixed-length secret) and 30/hr is generous enough for legitimate 5-15 minute schedules while still bounding a brute-force attempt's request volume.
- **Idempotency/concurrency for duplicate execution:** Not explicitly guarded (no advisory lock / "already running" flag), but the actual write operations are naturally idempotent-ish for this data shape (re-evaluating signals or re-snapshotting portfolio returns twice in quick succession produces at most a duplicate data point, not corrupted state) — not flagged as a finding, but worth revisiting if GitHub Actions' scheduler is ever observed double-firing (its own scheduler doesn't guarantee exactly-once, only "on or after" the cron time).

### 8. Financial-data and product integrity

- **Data sources:** Yahoo Finance (free, unauthenticated chart/quoteSummary endpoints) — explicitly disclosed in-code as a "free data source" with `NOT_REPORTED`/`UNAVAILABLE` sentinel values used throughout `lib/companyReport.ts` rather than silently fabricating missing fields — **this is good practice already in place**, verified.
- **Timestamps/time zones:** `dataAsOf`/`priceAsOf` fields are stamped from the actual API response or `new Date().toISOString()` at request time — consistently present, not backdated.
- **Corporate-action handling:** Uses Yahoo's `adjclose` (adjusted close, which accounts for splits/dividends) in `fetchDailyCloses` (`app/api/portfolio-research/route.ts:39`) and presumably in `lib/companyReport.ts`'s candle fetch (not fully re-verified line-by-line for every technical indicator, but the adjusted-close convention is consistently referenced) — reasonable handling, no fabricated adjustment found.
- **Caching:** `lib/yahooAuth.ts`'s crumb/cookie cache is a technical auth-token cache, not a price-data cache — prices are always fetched live (`cache:'no-store'` on every Yahoo fetch call, verified in `app/api/market/route.ts` pattern and `lib/yahooAuth.ts:104`).
- **Missing data / provenance:** Explicit `NOT_REPORTED`/`UNAVAILABLE` sentinels throughout, never a silent zero or fabricated number — this is a meaningfully good existing control worth preserving exactly as-is.
- **Strategy parameters/backtest periods/versions:** `app/research/engine.ts` (not fully read line-by-line in this pass given its size and the time budget for Phase 1, but its exported helpers referenced from `lib/strategySignals.ts` — `clampParamsToSession`, `maxHoldMsFor`, `sessionHoldExpired` — show explicit session-length-aware parameter clamping and hold-time caps) — **flagged as needing a closer, dedicated read in a future pass** focused specifically on look-ahead bias, since I did not verify line-by-line that in-sample/out-of-sample splitting is leak-free; the explanation text generated at `app/research/page.tsx:591` does explicitly disclose "next-bar open fills with slippage/fees" and in-sample vs out-of-sample metrics separately, which is the right shape of disclosure, but a full look-ahead-bias audit of `engine.ts`'s backtest loop is **out of scope of this pass and listed as a Blocker/follow-up below**, not claimed as reviewed.
- **Report citations/source labeling:** Every report field traces to a named, real provider (Yahoo) or is explicitly marked `NOT_REPORTED`/AI-inferred (`brandStrengthInference` is explicitly labeled speculative in the prompt itself, `lib/companyNarrative.ts:44`) — good existing practice.
- **This is treated as product/integrity risk, not a legal conclusion, per your instructions.**

---

## E. Owner action list

| # | Provider | Action | Why | Risk if delayed | Downtime risk | Backup/export/maintenance-window needed? | What to verify afterward | Can Claude prepare it first? | Timing |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GitHub | Update `.github/workflows/live-signals-cron.yml` and `.github/workflows/portfolio-snapshots-cron.yml` to send `CRON_SECRET` via an `Authorization: Bearer` header instead of a `?secret=` query parameter | Closes Finding 3 (secret-in-URL/logs exposure) | Low-moderate; secret stays in logs indefinitely until rotated or fixed | None if sequenced correctly with the route-side change (Batch 5 note) | No backup needed; take a one-time look at the next scheduled run's Actions log after the change to confirm success | The next scheduled run of each workflow returns success (green check) | Yes — I can draft the exact YAML diff now; you or I (with your approval) apply it | Before Batch 1's cron-route change ships (must be coordinated) |
| 2 | Vercel | Confirm `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` are set as **Production** (and Preview, if you want AI features to work on preview deploys) environment variables, and that none of them is accidentally prefixed `NEXT_PUBLIC_` or duplicated into a client-exposed variable | Confirms the server-only boundary this plan relies on is actually configured as assumed | Moderate — if `ANTHROPIC_API_KEY` were ever accidentally set as `NEXT_PUBLIC_ANTHROPIC_API_KEY`, it would be shipped to every browser | None (read-only check) | No | Grep your own Vercel env var list for any `NEXT_PUBLIC_` variable whose name suggests a secret | I can't see your Vercel dashboard — this is yours to check | Immediate |
| 3 | Vercel | Confirm whether `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Upstash) are configured in production | Without them, rate limiting silently degrades to a weaker per-instance-only guarantee (`lib/rateLimit.ts`'s documented fallback) — directly affects how well Findings 2/7's per-IP limits actually hold under a real multi-instance load | Moderate — an attacker distributed across many serverless instances could get a higher effective rate than the stated limit | None | No | Confirm the Upstash integration shows active requests in its own dashboard | N/A (dashboard-only check) | Before relying on Batch 1's rate limits as a real ceiling in production |
| 4 | Supabase | Review the Auth → URL Configuration and Auth → Providers settings to confirm the site URL / redirect URLs are locked to your actual production domain (relevant to the password-reset flow's `PASSWORD_RECOVERY` redirect) | Prevents a misconfigured redirect allowlist from letting a reset link be replayed against an unintended origin | Low today (no evidence of misconfiguration found; this is a standard hygiene check) | None | No | Confirm only your real domain(s) are listed | N/A (dashboard-only check) | Ongoing/next convenient review |
| 5 | Supabase | When ready, apply `supabase/migration_v31_ticker_binding_guard.sql` and `supabase/migration_v32_yahoo_cache_rls.sql` (Batch 4) — **staging first** | Closes Finding 1 (the core business-rule gap) and Finding 6 | High for Finding 1 if left open indefinitely (the longer the client-trust-only enforcement stands, the more "live" data can accumulate under it) | None expected (additive DDL) — validate on staging first regardless | A staging Supabase project/branch to test against first | Run the Batch 3 checklist's DB test: matching insert succeeds, mismatched insert is rejected | Yes — I will author and hand you both files (Batch 4); I will not run them | Staging now, production after a clean staging pass |
| 6 | Anthropic Console | After Batch 1's auth gate ships, watch the usage dashboard for a drop in unauthenticated-looking call volume; consider setting a hard monthly spend cap in the Console's billing settings as a backstop independent of anything in this codebase | A platform-level spend cap is the one control that protects you even if a future code change reintroduces a gap | High if a cap doesn't exist today and a future regression reintroduces Finding 2 | None | No | Confirm a spend cap/alert is configured | N/A (dashboard-only) | Immediate, independent of any code batch |
| 7 | GitHub | Consider enabling secret scanning / push protection on the repository (Settings → Code security) if not already on | Standard safety net catching an accidentally committed secret before it's even pushed | Low today (no evidence of a committed secret found), but cheap insurance | None | No | Confirm the setting shows "enabled" | N/A (dashboard-only) | Immediate |

---

## F. Questions and blockers

1. **Does a staging Supabase project (or a safely disposable branch/schema of an existing one) already exist?** Batches 3/4 assume one is available to validate the Finding 1 trigger and the two AI-route auth changes against real data before production. If none exists, that's a prerequisite to create (your call — provider account action) before those batches can be validated rather than just authored.
2. **Are `/api/company-report/narrative` and `/api/portfolio-research` ever intentionally called by a logged-out visitor** (e.g., a marketing "try it once" flow), or do they only ever get called from pages that already gate on `session` client-side? My read of `app/company-report/page.tsx` and `app/portfolios/page.tsx` suggests both already assume a logged-in user, but I want your confirmation before Batch 1 adds a hard server-side 401 for logged-out callers, since that's the one behavior change in this plan that could affect a real user flow if my read of the page-gating is incomplete.
3. **Is `CRON_SECRET` believed to have ever been committed to Git history, pasted into a ticket/Slack, or otherwise exposed outside GitHub Actions secrets / Vercel env vars?** I did not scan Git history for secret-shaped strings (outside this task's read-only, no-remote-contact scope, and because a meaningful history scan is better done by you or a dedicated secret-scanning tool with awareness of what "looks like" your actual secret). If you want, I can run a **local**, read-only `git log -p` grep for suspicious patterns (no network, no history rewrite) — say the word and I will, but I have not done this yet in this pass.
4. **Are the Upstash `KV_REST_API_URL`/`KV_REST_API_TOKEN` variables actually configured in production today?** (Owner Action #3.) This materially affects how strong Finding 2/7's rate-limit mitigation actually is in practice — a code-only fix without real distributed rate limiting is a weaker guarantee than it looks.
5. **Do you want a dedicated, line-by-line look-ahead-bias/backtest-integrity audit of `app/research/engine.ts` (475 lines) as a follow-up?** Section D.8 flags this as unreviewed at the depth the audit brief calls for; I deliberately did not claim it clean, and it's sizable enough to warrant its own focused pass rather than a rushed read inside this plan.
6. **Which test runner do you want for Batch 2** (`vitest` is my default recommendation — zero-config TypeScript support, no bundler setup — but this is a dependency-install decision requiring your explicit approval either way)?
7. **For Finding 3's sequencing:** do you want me to prepare Batch 1's cron-route diff *now* (held, not committed/applied) so it's ready the instant you update the GitHub Actions workflow files, or wait until after you've made the workflow change to start on the route side?

---

## Confirmation

No application source code, deployment configuration, environment variable, package file, database, external API, remote service, production data, Vercel setting, Supabase setting, GitHub setting, or provider setting was modified while producing this document. The only file created or changed in this phase is this file, `SECURITY_REMEDIATION_PLAN.md`.
