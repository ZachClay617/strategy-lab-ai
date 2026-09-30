# Legal Review Memo

Strategy Lab AI — internal launch memo. Do not publish this document.
Updated: September 30, 2026 (supersedes the prior memo; original findings kept below with status)

## 0. Read this first

I am not a lawyer, and no document review by an AI can honestly promise "no gaps" or "fully protected." Legal protection depends on (a) the documents, (b) whether the product actually behaves the way the documents say, (c) your business structure and insurance, and (d) local law that a licensed Massachusetts securities attorney has to confirm. The four documents (Disclaimer, Terms, Privacy, Refund) have now been finalized against the codebase as of September 30, 2026: every bracket has been resolved, and the app has been changed to match them. This memo lists what was done and what still needs YOU or an attorney.

**The single most important point stands: a disclaimer cannot fix a product that behaves like personalized advice.** The product-side risks in Section 1 were mitigated in code and copy, but final sign-off on the publisher's exclusion (Massachusetts G.L. c. 110A § 401(m)(1)(D) and the federal Lowe / Advisers Act § 202(a)(11)(D) line) belongs to a securities attorney — especially for the A-TAMP portfolio tool, which still accepts the user's own description and current holdings as input.

## 1. Product and wording issues (status)

### 1.1 A-TAMP portfolio tool — MITIGATED, ATTORNEY SIGN-OFF STILL REQUIRED BEFORE CHARGING

What changed: the AI prompt no longer says "You are managing a … portfolio for a user"; it now frames the task as generating an example, educational model allocation from a fixed universe. The UI labels the output "AI-generated example for education. Not personalized advice…" (Disclaimer § 16.4) next to the run button and on the proposal, and the button/branding no longer implies management or rebalancing of the user's money. What did NOT change: the tool still sends the user's own description and current holding symbols/weights to the AI. That is the remaining individualized-input risk. Options remain: (a) strip holdings from the input and offer generic themed model portfolios; (b) get an attorney opinion on the current flow; or (c) register as an adviser. Do not launch this feature as a paid feature unmodified without counsel's sign-off.

### 1.2 Trade Signals wording — FIXED

"Tells you exactly when to buy or sell" and similar instruction-style copy was removed from the Trade Signals page and the Home page card. Signals are described as rule-triggered alerts on tickers the user chose, with the § 16.3 short-form notice shown on the page, in the notification center, and on the corner toast. Signals remain mechanical (same rule fires identically for anyone with the same setup).

### 1.3 Branding and profit-promise copy — FIXED

- "A-TAMP" now expands to "Automated Trading Analysis & Monitoring Platform" everywhere (same acronym; "Money Printer" is gone, and so is "A-TAMP IS PRINTING…").
- The simulated Research Capital ($100,000 — the code was already at $100k; the README's "one quintillion" note was stale and is fixed) is now labeled simulated in the UI with the hypothetical-performance short-form notice (§ 16.2) next to the balance and the results log.
- "Costs real money" warnings were reworded to say the feature consumes paid AI/data resources, so they can't be read as implying real trading.

### 1.4 Promises the app didn't keep — FIXED

- **Sign-up consent:** the signup form now has a required, unchecked checkbox with the § 16.6 text and links to all four documents, an 18+ representation, and the acceptance timestamp + document version stored on the profile (migration v31).
- **Footer and banners:** every page shows the site-wide § 16.1 footer with links to /terms, /privacy, /disclaimer, /refunds. Per-feature notices (§ 16.2–16.5) are on Research, Portfolios, Reports, Trade Signals, Notifications, and the toast.
- **Delete-account and export:** Account → Privacy & Legal now has "Export my data" (JSON download of all the user's rows) and "Delete my account" (security-definer SQL function `delete_my_account()`, migration v32; deletion cascades through every user table).
- **Age gate:** covered by the signup checkbox.
- **Support policy:** the documents commit staff to not answering "what should I buy" questions. Keep a canned reply. Suggested text: "We can't give personalized investment advice — Strategy Lab AI is an educational research tool, and no one on our team is a licensed adviser. For decisions about your own money, please consult a licensed professional. See strategylabai.net/disclaimer."

## 2. Security/privacy contradictions (status)

- **Email enumeration via `get_email_for_username()` — FIXED.** Migration v32 revokes anon/authenticated execute on the function. Username login and username password-reset now go through server routes (`/api/auth/login`, `/api/auth/reset-password`) that resolve the username with the service-role key, are rate-limited per IP, and never return the email address to the caller.
- **Cron secret in the URL — FIXED.** Both GitHub Actions workflows now send `Authorization: Bearer $CRON_SECRET`; the query-string fallback was removed from both cron routes.
- **Rate-limiting keys (IP addresses in Upstash) — disclosed in Privacy § 2.2; counters expire with their window (minutes to hours).**
- **Yahoo Finance data — OPEN (business risk).** All Yahoo requests are server-side (confirmed in code; Privacy § 6.2 states it). Yahoo's public endpoints remain unofficial, and its terms restrict commercial use/redistribution. Before charging money, strongly consider a licensed provider (Polygon, Alpaca, Finnhub, Twelve Data) and check its license permits display to paying users.
- **Anthropic terms — reflected as "commercial API terms: not used for training."** Re-confirm in your Anthropic console that this remains true for your account tier, and check retention settings.
- **Supabase/Vercel — ACTION FOR YOU:** confirm data region, sign each vendor's Data Processing Addendum, and confirm backup settings.
- **Gender field — MITIGATED.** Now optional at signup (was required, contradicting the Privacy Policy) and documented as used only for greetings, removable at any time. Consider deleting the field entirely; it is low-value data.
- **Avatar as base64 in profiles — noted in Privacy § 2.1; deleted with the account (cascade).**

## 2b. Security audit (September 30, 2026) — findings and fixes

A full pass over every API route, database migration, and dependency:

- **Shared Yahoo auth cache open to any logged-in user — FIXED.** migration_v4's default privileges silently granted full CRUD on every later table to `authenticated`, and `yahoo_auth_cache` (v15) never enabled row level security — so any account could read or poison the shared upstream session cache. Migration v33 enables RLS and revokes the grants; only the server (service_role) can touch it now.
- **Paid AI endpoints were unauthenticated — FIXED.** Anyone could `curl` `/api/company-report/narrative` or `/api/portfolio-research` and spend Anthropic/market-data money. Both now require a signed-in account (Supabase JWT verified server-side) and are rate-limited per user as well as per IP; request bodies and prompt inputs are size-capped. Logged-out visitors still get the full data-only company report with a sign-in note on the AI sections.
- **Security headers — ADDED** (next.config.ts): Content-Security-Policy (self + the Supabase project only; frame-ancestors 'none'), HSTS with preload, nosniff, X-Frame-Options DENY, strict Referrer-Policy, restrictive Permissions-Policy, and the X-Powered-By header removed.
- **Cron endpoints** — secret now compared in constant time; header-only (query fallback removed in the earlier pass).
- **Input validation** — ticker symbols are format-validated on every market/report route; the names lookup is capped at 30 symbols per request.
- **Secrets** — none in the repository or its full git history (only an empty .env.example was ever committed); `npm audit` reports zero known vulnerabilities; the service-role key is only ever read in server-side code.
- **Row level security** — verified on every user table (owner-scoped policies, snapshot table read-only for users, heartbeats read-only); the only gap was the Yahoo cache above.
- Dead code removed in the same pass (unused CSS blocks, unused state and locals; the codebase now compiles clean under noUnusedLocals/noUnusedParameters).

## 3. Cross-document consistency (re-verified after the rewrite)

- Cancellation: Terms § 7.6 ↔ Refund § 3 (online, at least as easy as signup) — consistent.
- Refund windows: Terms § 7.7 defers to the Refund Policy; the Refund Policy now carries concrete numbers (7-day first purchase, 7-day unused renewal, pro-rata annual within 30 days, 72-hour outage threshold) — consistent; **when you configure Stripe, make the checkout wording match these numbers exactly.**
- Termination refunds: Terms § 20.2 ↔ Refund § 5.6 — consistent.
- Publisher position: Disclaimer § 3 ↔ Terms § 5; Terms § 8 bars reselling Output as advice — consistent.
- AI disclosure: Disclaimer § 7 ↔ Terms § 9.4 ↔ Privacy § 4 (Anthropic, same data flows) — consistent.
- Vendors: Terms § 12 ↔ Privacy § 6.2 ↔ actual stack (Supabase, Vercel, Upstash, Anthropic, Yahoo server-side, GitHub Actions; Stripe named as intended processor) — consistent.
- Age 18+: Terms § 4.1, Disclaimer § 10, Privacy § 10, signup checkbox — consistent.
- Governing law: Massachusetts everywhere; venue Essex County / D. Mass — consistent.
- Simulated capital: $100,000 in Disclaimer § 5, Terms § 6.2, the UI, and the code — consistent.
- Contact addresses: support@ / privacy@ / legal@ / security@ strategylabai.net used consistently across all four documents and the app. **ACTION FOR YOU: create these mailboxes or aliases before launch.**

## 4. Deliberate choices you may want to change

- **Binding arbitration + class waiver + 30-day opt-out (Terms § 24).** Good protection against class actions, but invites mass-arbitration filings and can be attacked as unconscionable. Massachusetts G.L. c. 93A § 9 demand-letter rights are preserved. Attorney should confirm AAA vs JAMS and venue.
- **One-year claims limitation (Terms § 24.9)** — may be unenforceable against consumers in some states; softened with a savings clause, but the attorney may cut it.
- **Liability cap** (greater of 12 months of fees or $100, Terms § 21) — standard; courts may not enforce for gross negligence or statutory claims.
- **7-day windows and pro-rata annual refunds** — business choices that reduce chargebacks; honor them.
- **Privacy rights extended to all U.S. users** (Privacy § 8.2) — one operating standard, simpler than per-state logic.
- **Operating name.** The documents currently name "Strategy Lab AI, a business with its principal place of business in Salem, Massachusetts." **ACTION FOR YOU: form an LLC (or corporation), then replace this phrase in all four documents (and the site pages) with the entity's legal name and registered address.** Until then you are personally liable — this is the single most valuable protective step left.

## 5. Launch checklist (outside the documents)

1. **Form the entity** (Massachusetts LLC), get an EIN and business bank account, then update the operator name/address in all four documents.
2. **Attorney review** by a Massachusetts securities/regulatory attorney: publisher exclusion (state + federal) on the exact A-TAMP and signals flows; whether crypto tickers (BTC-USD) implicate CFTC/CTA rules; arbitration clause; 940 CMR 38.00 cancellation mechanics.
3. **Insurance:** Tech E&O + cyber liability.
4. **DMCA agent:** register with the U.S. Copyright Office (small fee) for safe-harbor protection; the Terms currently point to legal@strategylabai.net.
5. **Mailboxes:** create support@, privacy@, legal@, security@ strategylabai.net.
6. **Data licensing:** replace or license the market-data source before charging money (Section 2).
7. **Stripe setup:** when payments launch, make checkout/receipts match Terms § 7 and the Refund Policy word-for-word; enable Stripe Tax; store consent records (the app already stores terms acceptance timestamp + version at signup).
8. **WISP:** keep a short written information security program (201 CMR 17.00) — the Privacy Policy now asserts one exists, so write it down. I can draft it.
9. **Email compliance:** SPF/DKIM/DMARC on the sending domain; physical mailing address + unsubscribe link in any marketing email (CAN-SPAM). The published documents intentionally list city/state only — a full mailing address is required in marketing email footers and useful for arbitration notices, so add the street address once the entity exists.
10. **Marketing review:** every ad, post, and screenshot must match the Disclaimer — no return promises, no cherry-picked results, no "guaranteed," no "risk-free." Testimonials trigger FTC Endorsement Guides.
11. **Trademark:** search and consider registering "Strategy Lab AI" and "A-TAMP."
12. **Records:** keep an archive of every published version of these documents (git history covers this if you commit each revision).

## 6. Document version log

- v1.0 — September 30, 2026 — first finalized versions; all brackets resolved; app aligned (consent checkbox, footer + per-feature notices, /terms /privacy /disclaimer /refunds pages, export + delete account, username-login privacy fix, cron secret moved to header, A-TAMP renamed, signal copy neutralized, gender optional).
