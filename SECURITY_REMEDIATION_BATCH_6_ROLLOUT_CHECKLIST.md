# SECURITY_REMEDIATION_BATCH_6_ROLLOUT_CHECKLIST.md

**This is a plan, not an action.** Nothing in this file deploys anything. It exists so you can decide, with full information, when and how to actually go live — and I will not deploy, merge, or promote anything to your real production site without a separate, explicit "go" from you after reading this.

---

## What "going to production" means here

Your site auto-deploys through Vercel whenever code lands on your `main` branch on GitHub. Everything from Batches 1-5 currently lives on a separate branch (`claude/security-audit-remediation-g21gwt`) that has **not** been merged into `main` yet. "Going to production" = merging that branch into `main`. The moment that happens, Vercel will automatically build and deploy it to your real, live site — there's no separate "are you sure" step after that beyond the merge itself, so the merge **is** the go-live moment.

I just double-checked: this branch sits cleanly on top of your current `main` with no conflicts and nothing from other work lost in between — safe to merge whenever you're ready.

---

## Exactly what goes live when this merges

**Already live in your real database (nothing new happens here on merge):**
- The ticker-binding database rule (migration v31) — already protecting your real data right now, independent of this deploy.
- The yahoo_auth_cache consistency fix (migration v32) — same, already live.

**New with this deploy (code changes):**
1. The Company Report and AI Portfolio Agent features now require login (Batch 1 + the follow-up fix), with daily per-account limits.
2. Standard browser security headers turned on site-wide (Batch 1).
3. A defense-in-depth text filter on AI-written content (Batch 1).
4. The background cron jobs switch to sending their password more safely — **this requires one extra step from you, described below.**

**Not code — just documentation, no live effect either way:**
- The automated test suite (Batch 2) and the staging checklist (Batch 3) don't change how the site behaves; they're for verifying it.

---

## The one extra step this deploy needs: re-check your GitHub Actions secret

Batch 5's cron fix only works if the `CRON_SECRET` value stored in your **GitHub repository's Actions secrets** and the `CRON_SECRET` value stored in your **Vercel project's environment variables** are still the exact same value. They've always needed to match for the old method too, so if your background jobs are working correctly today, they almost certainly still match — this isn't something you need to change, just something worth a 10-second glance at before or right after this deploys:
- GitHub: repo → Settings → Secrets and variables → Actions → confirm `CRON_SECRET` exists.
- Vercel: your project → Settings → Environment Variables → confirm `CRON_SECRET` exists for Production.

If both exist (they should, since the jobs already work today), there's nothing to change. I only flag it because it's the one thing that could cause a visible hiccup (a few missed background checks) if it were somehow out of sync.

---

## Pre-flight checklist (do these before merging)

- [ ] You've clicked through the preview site logged out and logged in and it behaved as expected (we did this in Batch 3 — done ✅).
- [ ] You're comfortable with the daily AI usage limits (15 report narratives/day, 30 portfolio-research runs/day, per account) — tell me now if you want these higher or lower; it's a one-line change either way.
- [ ] You've glanced at the GitHub/Vercel `CRON_SECRET` check above (optional but recommended).
- [ ] You know roughly what time of day you're doing this — early in the day (not right before you're unreachable) is safer, purely so you're around to notice quickly if anything looks off.

---

## How the actual merge happens

Two ways, your choice:

**Option A — I open a Pull Request for you to review and click "Merge" yourself on GitHub.** This is the safer, more visible option for a first startup: you see exactly what's changing, in GitHub's own review interface, and you're the one who clicks the final button. I'd only do this if you ask me to open the PR — I don't create PRs unless asked.

**Option B — you tell me to merge it directly**, and I do it via git commands. Slightly faster, but skips the visual "here's exactly what's changing" review screen GitHub gives you.

**I recommend Option A for this one**, purely because it's your first time doing this and seeing the actual diff laid out clearly is worth the extra minute. Let me know which you'd prefer.

---

## What to watch for in the first 24-48 hours after go-live

| What to check | Where | What "normal" looks like | What would be a problem |
|---|---|---|---|
| Site loads at all | strategylabai.net | Loads normally | Any error page |
| Login still works | Try logging in yourself | Works exactly as before | Can't log in |
| Company Report (logged in) | Generate one report | Works exactly as before, including the AI-written section | AI section missing/errors while logged in |
| Company Report (logged out) | Log out, try to generate | Ticker box/button grayed out with a login message | Anything else |
| AI Portfolio Agent (logged in) | Try it once | Works as before | Errors |
| Background cron jobs | GitHub repo → Actions tab | Green checkmarks, roughly every 5/15 min | Red X's starting right after deploy |
| Browser console errors | Any page, right-click → Inspect → Console | No red CSP-related errors | Red "Content-Security-Policy" / "refused to" errors |
| Trade Signals / favoriting a strategy | Trade Signals page | Works exactly as before | Errors confirming a buy/sell signal |

You don't need to babysit this for 48 hours straight — a check right after deploying, then again a few hours later, then once more the next day is plenty. If the GitHub Actions tab is still green a day later, the cron piece is confirmed working.

---

## Rollback plan if something looks wrong

**If it's the cron jobs specifically (red X's in GitHub Actions right after deploy):** almost certainly means `CRON_SECRET` doesn't match between GitHub and Vercel — fix is to make them match again (copy the value from one into the other), not to revert code.

**If it's anything else (login broken, a page erroring, etc.):** Vercel keeps every previous deployment. The fastest fix is **not** to revert code and redeploy — it's to go to Vercel → Deployments → find the last known-good deployment (the one right before this merge) → click the "..." menu → **"Promote to Production."** This instantly points your live site back at the old, working version, usually within seconds, while we figure out what went wrong at our own pace. This is the single fastest rollback available and doesn't require me to do anything with git at all.

If you'd rather I also prepare the git-level revert (undoing the merge commit itself) as a backup option, I can do that too — just say so.

---

## Go/no-go

**Go** once: the pre-flight checklist above is done, and you're ready to pick Option A or B for the merge.

**No-go / not yet** if: you want to adjust the daily AI limits first, you want to double check the `CRON_SECRET` values first, or you just want more time before your first-ever production deploy — all completely reasonable, no pressure.

---

## Confirmation

Nothing has been deployed, merged, or promoted as a result of writing this file. This is a plan only, waiting on your go-ahead.
