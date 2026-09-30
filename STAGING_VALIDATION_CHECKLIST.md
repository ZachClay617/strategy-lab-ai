# STAGING_VALIDATION_CHECKLIST.md

**What this file is:** a step-by-step list for testing Batches 1-2's changes on a *practice* version of your site — never your real, live site — before we ever consider touching production. Nothing in this file gets run by me automatically; it's a guide for you (or for us to do together, screen-sharing style, one step at a time) once a practice deployment exists.

**Why a practice version first:** the changes so far (requiring login on two AI features, adding safety headers) are things I'm confident in from reading the code and running local tests, but "confident from reading code" and "proven on the real thing" are different levels of certainty. This is where we close that gap safely.

---

## Step 0 — Do you have a practice version of the site to test on?

This is the one thing I can't check or set up myself (it lives in your Vercel/Supabase accounts, not in this code). Two things would help, in order of how useful they are:

1. **A Vercel "Preview" deployment.** If your GitHub repo is already connected to Vercel (which it sounds like it is, since your site is live there), Vercel likely **already automatically created a preview link** for the branch I've been pushing to (`claude/security-audit-remediation-g21gwt`) — a separate, temporary URL that runs this exact code but is not your real `strategylabai.net` site. To check: log into vercel.com → your project → look for a "Deployments" tab → find the one tied to that branch name → it'll have its own `something.vercel.app` URL.
2. **A practice Supabase database.** This one matters more for Batch 4 (the ticker-binding fix) than for this batch, so we can come back to it then if you don't have one yet.

For *this* batch (Batch 3), the Vercel preview link is what we actually need — it uses your **real, live Supabase database** underneath (previews don't get a separate database automatically), so what we're testing here is "does the code behave correctly," not "does it write anywhere it shouldn't" (we already proved that part with the automated tests in Batch 2, and RLS itself protects your real data either way, per-user, regardless of which URL someone comes in through).

**Tell me the preview URL once you have it (or say you don't have Vercel connected to GitHub at all, and I'll explain that setup instead), and we'll go through the rest of this checklist together, one step at a time — I'll tell you exactly what to click and what you should see.**

---

## Step 1 — Confirm the login requirement works (Finding 2)

**Goal:** prove that the two AI features (Company Report, AI Portfolio Agent) now require you to be logged in, but still work normally for a logged-in user.

1. Open the preview URL in a **normal (not incognito) browser tab where you are NOT logged in** — or just log out first.
2. Go to the Company Report page and try generating a report for any ticker (e.g. AAPL).
   - **Expected:** the report's factual data (price, financials) still loads fine — that part never required login. But the **written AI narrative section specifically** should either fail quietly or show an error, since that's the part now gated behind login.
3. Now log in normally, and try the same thing again.
   - **Expected:** everything works exactly as it did before any of these changes — the written narrative appears normally.
4. Repeat the same idea on the Portfolios page's "AI Portfolio Agent" — try it logged out (should be blocked), then logged in (should work normally).

**If step 2 doesn't show any difference (i.e., it works fine even logged out):** that means something in my auth check isn't working as intended — stop and tell me exactly what you saw, and I'll investigate before we go further.

## Step 2 — Confirm normal daily use isn't accidentally capped (Finding 7)

**Goal:** make sure the new daily limits (15/day for report narratives, 30/day for portfolio research) are generous enough for real use.

1. While logged in, generate a handful of company reports and a couple of portfolio-research runs — however many you'd realistically do in a normal day.
2. **Expected:** you should not hit the "you've reached today's limit" message during normal use.

If you *would* realistically want to generate more than that in a day, tell me and I'll raise the limits — this was my best guess, not a hard rule.

## Step 3 — Confirm the safety headers don't break anything (Finding 4)

**Goal:** the new browser security headers should be invisible to a normal user — if they break something, it'll show up as something visually or functionally wrong, or as a red error in the browser console.

1. Open the preview site.
2. Open your browser's developer console (right-click anywhere → "Inspect" → click the "Console" tab).
3. Click through every page: Home, Research, Portfolios, Company Report, Trade Signals, Notifications, Account.
4. Watch for any red error mentioning "Content-Security-Policy," "refused to,", or "blocked by CSP."

**If you see nothing red and everything looks/works normally:** this step passes.
**If you see a CSP-related error:** tell me exactly what it says (or send a screenshot) and I'll adjust the policy — this is expected to be a quick, safe fix if it happens at all.

## Step 4 — Confirm the cron endpoints still behave as they do today (baseline, no change yet)

**Goal:** just a sanity check that I haven't accidentally changed anything about the background jobs yet (I intentionally left them alone in Batch 1-2 — this step just confirms that's true).

Nothing to click here — this is more of a "read the plan again" checkpoint: the two background jobs (`live-signals`, `portfolio-snapshots`) should be running exactly as they were before any of my changes, since I deliberately didn't touch them. If you want, you can check the "Actions" tab of your GitHub repo and confirm both scheduled workflows are still showing green (successful) runs.

---

## What happens after this checklist passes

Once Steps 1-3 look right to you on the preview link, that's the "go" signal to either:
- Move on to **Batch 4** (the actual database fix for the ticker-binding rule — the one you said matters most), which needs its own practice database to test against, or
- If you're comfortable, start thinking about promoting Batches 1-2 toward production (Batch 6) — though I'd still recommend finishing Batch 4 first, since it's the highest-priority fix.

**I will not deploy anything, promote anything to production, or touch your real Supabase project during this batch or as a result of it — this file is the plan, not an action.**
