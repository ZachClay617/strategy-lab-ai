# Strategy Lab AI — Bare-Minimum Checklist to Start Selling

Written September 30, 2026. Ordered — work top to bottom. Items marked ⚠ are the ones where skipping creates real financial or legal exposure. You said you won't use a lawyer and will write/update documents yourself; this list is built around that, but be aware of the one honest caveat at the bottom.

---

## 1. Business foundation (do first — everything else hangs off it)

- [ ] ⚠ Form a Massachusetts LLC (mass.gov, Corporations Division — ~$500 filing, ~1 day online). Until this exists, every refund dispute, chargeback, or angry user is aimed at you personally.
- [ ] Get a free EIN from irs.gov (takes 10 minutes, needed for Stripe and a bank account).
- [ ] Open a business checking account (needed so Stripe payouts don't mix with personal money).
- [ ] Decide your business street address (can be your registered agent's or a mailbox service — it must appear in marketing emails by law, and Stripe will ask for it).
- [ ] Get a quote for Tech E&O + cyber insurance (Vouch, Embroker, or Hiscox do online quotes for small SaaS). You can launch without it, but one lawsuit costs more than years of premiums — treat it as month-one, not someday.

## 2. Update the legal documents yourself (repo: legal/content/*.md)

- [ ] Replace every "Strategy Lab AI, a business with its principal place of business in Salem, Massachusetts" with "<Your LLC Name>, a Massachusetts limited liability company" in all four documents (terms.md, privacy.md, disclaimer.md, refunds.md) and add the street address to the Contact sections.
- [ ] Update "Effective Date / Last Updated" in each changed document.
- [ ] Bump `LEGAL_VERSION` in lib/legal.ts (e.g. '1.0' → '1.1'). This automatically re-prompts every existing user to re-accept — that's your consent audit trail, keep using it on every material change.
- [ ] Commit the change — git history is your archive of every published version (regulators and card networks ask for "the version the customer accepted"; you have it).
- [ ] Your update routine for every future release that changes terms: edit the .md files → update dates → bump LEGAL_VERSION → commit → push.

## 3. Payment infrastructure

- [ ] Create a Stripe account under the LLC (legal name, EIN, business bank account).
- [ ] Build the billing system — the complete step-by-step plan is already written in PAYMENTS_PLAN.md at the repo root (phases, migrations, webhook security, and the "user cannot self-upgrade in devtools" test that defines done). Work it phase by phase; the 🧍 HUMAN phases are Stripe Dashboard clicks only you can do.
- [ ] ⚠ Configure Stripe to match your Refund Policy word-for-word: 7-day full refund on first purchase, 7-day unused-renewal refund, pro-rata annual within 30 days. Mismatch between checkout wording and policy is the #1 reason merchants lose chargebacks.
- [ ] Turn on Stripe Tax (handles sales tax on SaaS per state automatically).
- [ ] Set the statement descriptor to something recognizable ("STRATEGYLAB AI") — unrecognized descriptors cause chargebacks.
- [ ] Fill in Terms of Service §7.1 (plan names, prices, billing periods) and remove the "not currently offered" framing; make the pricing page, checkout, and Terms §7 say identical numbers.

## 4. Email (required before you email any customer)

- [ ] Create the four mailboxes or forwarding aliases: support@, privacy@, legal@, security@ strategylabai.net (your registrar or Cloudflare Email Routing does this free — forward all to your iCloud).
- [ ] Set up SPF, DKIM, and DMARC records on strategylabai.net (your email provider gives you the exact DNS records).
- [ ] Receipts/renewal reminders come from Stripe automatically — verify they're enabled with your logo and support email.
- [ ] If you ever send a marketing email: physical address + working unsubscribe link in the footer, honored within 10 days (CAN-SPAM — this is why item 1 needs a business address).

## 5. Market data (the biggest business risk on this list)

- [ ] ⚠ Before charging money, replace or license the market data. The app currently runs on Yahoo Finance's unofficial endpoints, whose terms prohibit commercial use — they can block you or send a cease-and-desist the week you launch paid plans. Realistic options: Polygon.io (~$29+/mo), Twelve Data, Finnhub, or Alpaca's data API. Check the license tier explicitly permits *displaying data to your paying customers*.
- [ ] After switching, update Privacy Policy §6.2 and Disclaimer §8 (vendor name) — and bump LEGAL_VERSION.

## 6. Compliance mechanics (cheap, do in one afternoon)

- [ ] Register a DMCA agent at dmca.copyright.gov (~$6) — without it you have no copyright safe harbor. Use legal@strategylabai.net.
- [ ] Complete the three [ACTION] items inside legal/6_Written_Information_Security_Program.docx: turn on 2FA for Supabase, Vercel, and GitHub; sign the Supabase and Vercel DPAs (a checkbox in each dashboard); confirm FileVault + screen lock on your Mac.
- [ ] Put a calendar reminder for September 2027: annual WISP + legal-docs review.
- [ ] Trademark search for "Strategy Lab AI" and "A-TAMP" (free at tmsearch.uspto.gov) — you don't have to register yet, but know now if someone else owns the name.

## 7. Product wiring before the first paid customer

- [ ] Build the cancel-subscription button at Account → Billing (part of PAYMENTS_PLAN Phase work). ⚠ Massachusetts and California law: cancelling must be as easy as signing up, online, no email required — the Terms already promise this, so it must exist before the first charge.
- [ ] Decide free-tier limits vs paid (which features, what daily AI caps per tier) and encode them.
- [ ] Set up uptime monitoring (UptimeRobot free tier on strategylabai.net + the two cron heartbeats).
- [ ] Set billing alerts: Anthropic console spend limit, Vercel spend alert, Supabase plan limits — so a traffic spike can't surprise-bill you.

## 8. Launch-week QA (run the whole list with Stripe in test mode)

- [ ] New signup → consent checkbox → gate never appears again → card checkout with Stripe test card 4242… → plan shows active.
- [ ] Open devtools and try to set your own plan in the database — must fail (PAYMENTS_PLAN's definition of done).
- [ ] Cancel online → access continues to period end → no renewal charge.
- [ ] Request refund inside 7 days → refund in Stripe → access ends.
- [ ] Export my data works; Delete my account works and kills the subscription too.
- [ ] Renewal reminder email arrives for an annual test subscription.
- [ ] All four legal pages load logged-out; footer disclaimer on every page.

## 9. Selling rules (every ad, post, screenshot, forever)

- [ ] Never: "guaranteed," "risk-free," profit promises, cherry-picked backtest screenshots without the hypothetical-results disclaimer, or "we tell you what to buy."
- [ ] Always: "Educational content, not investment advice. Hypothetical results. Investing involves risk, including loss." (Disclaimer §16.8 — written to be pasted under posts.)
- [ ] No testimonials until you've read the FTC endorsement rules — they carry extra requirements.
- [ ] Support replies to "what should I buy?" use the canned answer in the Legal Review Memo §1.4 — no exceptions, including from you.

## 10. The honest caveat (read once, then decide)

Everything above you can genuinely do yourself. The one thing self-drafting cannot fully cover: **whether A-TAMP's portfolio tool — which takes a user's own description and holdings — crosses from "publisher" into "investment adviser" under Massachusetts and federal law once money changes hands.** The documents are written to defend the publisher position, and the wording is as clean as it can be, but that classification question is decided by regulators, not by documents. Your two no-lawyer mitigations, either of which meaningfully shrinks the risk: (a) make the AI portfolio input generic (theme only — stop sending the user's current holdings to the model), or (b) keep the feature in the free tier only, so no one is paying for the personalized-looking part. A flat-fee review (typically $1.5–3k, one time) remains the only way to actually settle it — park it on the someday list, but keep it on the list.

---

**Shortest path to first dollar:** 1 → 2 → 3 → 4 → 5, QA (8), launch. Items 6–7 fit in the gaps; item 9 is forever.
