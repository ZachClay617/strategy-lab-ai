# Strategy Lab AI — Business Plan

**Prepared by Zach Clay, Founder**
**Version 1.0 — September 30, 2026**
**Confidential**

---

> ### Before you send this to anyone — read this box first, then delete it
>
> This plan is written from what is actually true about the product and the
> code today. Everywhere a number depends on something only you can confirm,
> I have written it as a clearly-marked assumption instead of inventing it.
> **Fill in or confirm every item below before this document leaves your
> hands.** Sending an investor a plan with a wrong fact in it is worse than
> sending one with a blank in it.
>
> | # | What to confirm | Where it appears |
> |---|---|---|
> | 1 | Legal entity name and formation date (you have not formed the LLC yet) | §2, cover of every doc |
> | 2 | Your current registered user count and how many are active | §1, §12, §13 |
> | 3 | The date you started building Strategy Lab AI | §2 |
> | 4 | Your actual raise amount and instrument — this plan models **$250,000 on a post-money SAFE** | §1, §12 |
> | 5 | Your age / student status and how you want to present it | §11 |
> | 6 | Whether you have picked a market-data vendor yet | §9, §14 |
> | 7 | Any advisor, mentor, or early-customer names you want to list | §11, §15 |
>
> Everything not in that table is drawn from the repository, the legal
> documents, `PAYMENTS_PLAN.md`, or `LAUNCH_CHECKLIST.md`, and is accurate as
> of the date on this cover.

---

### How this document relates to the investor memorandum

There are two documents and they are not the same thing.

**This business plan** is the operating document: how the company works, what
it costs, how it makes money, and what I do on a Tuesday. It is the reference
an investor examines during diligence, and it is the thing I actually run the
company from.

**`INVESTOR_MEMORANDUM.md`** is the investor-facing companion — the long-form
document someone reads after a pitch and before they commit, written to answer
every objection they could raise. Same facts, different job.

Neither is a pitch deck. A deck is twelve slides you present out loud; these
are the documents that get read alone, at night, by someone looking for the
reason to say no.

---

## Table of contents

1. [Executive Summary](#1-executive-summary)
2. [Company Description](#2-company-description)
3. [The Problem](#3-the-problem)
4. [Product and Solution](#4-product-and-solution)
5. [Market Analysis](#5-market-analysis)
6. [Competitive Analysis](#6-competitive-analysis)
7. [Business Model](#7-business-model)
8. [Marketing and Sales Strategy](#8-marketing-and-sales-strategy)
9. [Operations Plan](#9-operations-plan)
10. [Technology and Product Development](#10-technology-and-product-development)
11. [Management and Team](#11-management-and-team)
12. [Financial Plan](#12-financial-plan)
13. [Milestones and Roadmap](#13-milestones-and-roadmap)
14. [Risk Analysis](#14-risk-analysis)
15. [Regulatory and Compliance Position](#15-regulatory-and-compliance-position)
16. [Appendix](#16-appendix)

---

## 1. Executive Summary

**Strategy Lab AI is a research platform that lets an ordinary investor test a
trading idea the way a quantitative fund would — and then refuses to call it
good unless it actually is.**

Most retail traders form an idea ("buy when the 50-day average crosses the
200-day"), look at a chart, decide it looks right, and put money behind it.
There is an enormous gap between that and what a professional does: split the
data, optimise on one half, validate on the half the strategy has never seen,
check that the result is consistent across multiple time windows rather than
driven by one lucky month, and throw the idea away if it fails any of it. That
process is well understood. It is simply not available to a normal person in a
form they can use.

Strategy Lab AI closes that gap. A user describes or configures a strategy,
the platform generates and tests up to a million parameter variations against
ten years of real market data, and then applies a fixed nine-point
qualification gate before any strategy is allowed to be called "qualified."
The thresholds are not cosmetic and they are not adjustable by the user: a
minimum of 50 completed trades, at least 20 of them out-of-sample, positive
out-of-sample expectancy, profit factor at or above 1.15, out-of-sample Sharpe
at or above 0.75, positive out-of-sample return, maximum drawdown at or below
10%, at least 60% of validation windows profitable, and no single window
accounting for more than 60% of total profit. Strategies that fail get a plain
English explanation of exactly which test they failed and by how much.

Around that engine sit three more products that share the same data and the
same discipline:

- **Portfolios** — record what you actually hold, track realised and
  unrealised return separately, and use **A-TAMP**, our AI portfolio
  researcher, to turn a plain-language theme into an example allocation drawn
  from a curated universe of real, liquid, live-priced tickers.
- **Company Reports** — a full equity research report on any public company,
  combining real fundamentals, competitor comparison, insider activity,
  analyst coverage and technicals with an AI-written synthesis that is
  explicitly forbidden from inventing a number it was not given.
- **Trade Signals** — favourite a qualified strategy and a server-side job
  checks it against live prices around the clock, notifying you when its rules
  actually fire. Nothing is ever traded for you.

**The business model is subscription software.** Free tier to try the engine;
**Pro at $29/month or $290/year**; **Elite at $99/month or $990/year**. The
expensive parts of the product — the AI calls — are metered per plan and
enforced in the database, so gross margin cannot silently erode.

**Where we are today.** The product is built and running at
**strategylabai.net**. Four products are live. The complete legal framework
is written and published — terms, privacy policy, investment disclaimer,
refund policy, a legal review memo, and a written information security
program — with a versioned consent gate that re-prompts every user whenever
those documents materially change. Security has been through multiple review
passes; row-level security is enforced on every user table. Billing is fully
specified and not yet implemented. We are pre-revenue by choice: the billing
system, the market-data licence, and the corporate entity are the three things
standing between here and the first dollar, and all three are scoped.

**Competitive advantage.** Three things, in order of durability:

1. **Honest validation as the product.** Every competitor optimises. We
   optimise and then try to break the result. The out-of-sample gate, the
   fold-consistency test, and the refusal to let synthetic data ever qualify
   are the product — not features bolted onto a backtester.
2. **Explanation, not just output.** Every signal, every rejection, and every
   report section is written back to the user in plain English. This is what
   turns a tool into something people learn from, and learning is what keeps
   subscriptions alive past month three.
3. **A compliance posture built in from day one, not retrofitted.** The legal
   documents, the consent versioning, the "we never place a trade" boundary
   and the "this is education, not advice" framing are already in the product.
   In this category that is not paperwork — it is the moat that stops a
   competitor from copying the feature set without also taking on the risk.

**The ask.** I am raising **$250,000 as a pre-seed round on a post-money
SAFE** (amount and instrument to be finalised — see the box at the top). That
capital buys roughly 18 months of runway and is allocated to four things: a
properly licensed commercial market-data feed, a one-time regulatory review
that settles the adviser-classification question for good, the first paid
acquisition experiments, and enough of my own runway to work on this full
time rather than around a class schedule. §12 sets out the full use of funds
and what each dollar is expected to produce.

---

## 2. Company Description

**Company name.** Strategy Lab AI.

**Legal structure.** A Massachusetts limited liability company is being formed.
As of this document's date the business operates as a sole proprietorship,
which is precisely why forming the LLC is the first item on the launch
checklist — until it exists, every refund dispute and every chargeback is
aimed at me personally. *[Confirm entity name and formation date before
sending.]*

**Founder.** Zach Clay, sole founder. I designed, built and operate every part
of the platform: the backtesting engine, the data layer, the AI integrations,
the front end, the infrastructure, and the legal framework. §11 covers this
honestly, including what I am not good at.

**Location.** Salem, Massachusetts. The product is entirely remote and
cloud-hosted; there is no office and no plan for one.

**Mission.** To give an ordinary investor the same intellectual honesty about
their own ideas that a professional fund is required to have — and to explain
every answer in language they can actually act on.

**Vision.** Strategy Lab AI becomes the place a self-directed investor goes
before they put money behind an idea. Not a signal service, not a broker, not
a guru — the step in between having an idea and risking money on it, which
today does not exist for most people.

**Current stage.** Built and operating; pre-revenue; pre-entity. All four
product areas are live at strategylabai.net. Billing is designed in full
(`PAYMENTS_PLAN.md`) but not yet implemented.

**Short-term goals (next 6 months).**

- Form the LLC, obtain an EIN, open business banking, and get Tech E&O and
  cyber insurance quoted and bound.
- Replace the current market-data source with a commercially licensed feed.
- Ship billing end-to-end, including the online cancellation flow that
  Massachusetts and California law require to be as easy as signing up.
- Open a public beta and get the first hundred paying subscribers.
- Get a one-time flat-fee regulatory review of the A-TAMP portfolio feature.

**Long-term goals (3–5 years).**

- Become the default validation layer for self-directed investors, measured by
  qualified strategies produced per month and by paid retention past month 12.
- Extend the same discipline to adjacent asset classes — crypto already works
  through the same data path, options and futures are natural extensions.
- Open the engine through an API so other tools can use our qualification
  gate rather than rebuilding it.
- Reach profitability on subscription revenue alone, without needing a second
  raise to survive.

---

## 3. The Problem

The problem is not that retail investors lack data. They are drowning in it.
The problem is that **nothing between "having an idea" and "risking money"
actually works for them.**

**3.1 Developing a strategy is harder than it looks, and nothing teaches it.**
A trading strategy is a set of rules — entry, exit, position size, what to do
when it goes wrong. Writing those rules down precisely enough to test is
already a skill most people have never been taught. The tools that do exist
assume you arrive already knowing it.

**3.2 Testing manually is slow enough that people skip it.** Checking one
variation of one idea against ten years of data by hand is a weekend. Checking
the thousand variations you would need to know whether your specific
parameters matter, or whether you got lucky, is not something a human does.
So people check one, see a result they like, and stop.

**3.3 Most retail "backtesting" is quietly broken.** This is the real problem.
When someone tunes a strategy until it looks good on their whole price
history, they have not discovered anything — they have memorised the past.
The professional defence against this is out-of-sample validation: hold back
data the strategy never saw, and judge it only on that. Almost no retail tool
enforces it. Many do not offer it. The ones that offer it make it optional,
which in practice means off, because turning it on makes your results worse.

**3.4 The existing professional tools are built for programmers.** The serious
platforms are genuinely powerful and genuinely inaccessible: they expect you
to write Python, understand a data API, manage your own environment, and know
what a Sharpe ratio is before you start. The learning curve is measured in
months, and it filters out exactly the people who most need protection from
their own ideas.

**3.5 Nothing explains *why*.** A chart shows a buy arrow. It does not say
"this fired because the 14-period RSI dropped below 30 while price was still
above its 50-period moving average, which is a pullback inside an uptrend."
Without the why, a user cannot tell a rule they should trust from a rule they
should abandon — so they learn nothing, and they repeat the mistake.

**3.6 The information environment is actively hostile.** The loudest voices in
retail investing are selling certainty: signal groups, screenshot P&Ls,
courses. They are optimised for conversion, not for being right. An honest
tool that sometimes says "your idea failed, here is exactly why" is competing
against a market that never says that.

**What this costs people.** Real money, repeatedly, in ways they never
diagnose — because without validation there is no feedback loop. The strategy
that worked in the backtest and lost in reality teaches nothing if you cannot
see that it only ever worked on the data it was fitted to.

---

## 4. Product and Solution

Strategy Lab AI is four products sharing one data layer, one design system,
and one rule: **never state a number we did not compute from real data, and
never imply a trade is a good idea.**

### 4.1 Research — the strategy engine

The core of the platform.

- **Twelve strategy families**, each a real, named, documented technique:
  Trend Following, Mean Reversion, Breakout, Momentum, Volume Confirmation,
  RSI Regime, Moving Average Cross, MACD Trend, Bollinger Band Reversion,
  Donchian Breakout, VWAP Pullback, and ATR Trend.
- **Up to one million parameter variations per run.** The engine runs in the
  user's own browser, which means the compute cost of a large run is borne by
  the user's machine, not by our infrastructure. This is a deliberate
  architectural choice with a direct margin consequence: research volume does
  not scale our server bill.
- **Up to ten years of real historical daily data**, plus 15-minute, hourly
  and live-tick resolutions.
- **Walk-forward validation, not optional.** Every run splits the data into
  an in-sample portion the strategy is optimised on and an out-of-sample
  portion it has never seen, then additionally evaluates across multiple
  independent validation windows.
- **A nine-point qualification gate** that lives in exactly one place in the
  codebase and cannot be adjusted by the user:

  | # | Test | Threshold |
  |---|------|-----------|
  | 1 | Data integrity | Must pass all mechanical sanity checks |
  | 2 | Data source | Real market data only — synthetic data can never qualify |
  | 3 | Total completed trades | ≥ 50 |
  | 4 | Out-of-sample trades | ≥ 20 |
  | 5 | Out-of-sample expectancy | > $0 per trade |
  | 6 | Out-of-sample profit factor | ≥ 1.15 |
  | 7 | Out-of-sample Sharpe ratio | ≥ 0.75 |
  | 8 | Out-of-sample return | > 0% |
  | 9 | Out-of-sample maximum drawdown | ≤ 10% |
  | 10 | Validation-window consistency | ≥ 60% of windows profitable |
  | 11 | Profit concentration | No single window > 60% of total profit |

  *(Nine tests plus two consistency checks — eleven gates in total. Most
  strategies fail. That is the point.)*

- **A rejection explanation for every failure**, naming the test, the value
  achieved, and the value required. "Out-of-sample Sharpe is 0.41, below the
  required 0.75" teaches something. "Failed" does not.
- **A $100,000 simulated research balance.** It is not real money, the
  platform never places an order, and that boundary is stated in the product,
  in the README, and in the legal documents.
- **A Successful Strategy Log and full Research Run History**, so a user can
  see what they have tried, what survived, and what they already disproved.

### 4.2 Portfolios — tracking and A-TAMP

- **Real position tracking.** Record shares and average cost; buying more of a
  symbol you already hold merges into one position at a share-weighted average
  cost, exactly as a brokerage would. Selling writes a realised trade.
- **Return decomposed honestly.** Total return, unrealised return, realised
  return, and today's return are each shown separately, at the level of the
  whole account, each portfolio, and each individual holding. Selling a
  winner does not make it disappear from your track record.
- **Return over time**, charted from hourly server-side snapshots that keep
  accruing whether or not anyone has the site open, backfilled from daily
  closes for any period before tracking started.
- **A-TAMP** (Automated Trading Analysis & Monitoring Platform) takes a
  plain-language description of what a portfolio is *for* — "aggressive
  growth tech and AI names, willing to accept high volatility" — pulls real
  live and historical prices across a curated universe of **76 liquid US
  tickers**, scores every candidate on real momentum and volatility, and
  proposes an example allocation with a factual, data-cited rationale for each
  position. When an AI key is configured it reasons over that real data; when
  one is not, it falls back to a transparent rules-based screen and *says so*.
  The user reviews and applies or discards. Nothing happens automatically.
- **A full change log** per portfolio: every holding added, edited or removed,
  every AI rebalance with its before-and-after state and per-symbol reasoning.

### 4.3 Company Reports

A complete equity research report on any publicly traded company, assembled
from real data: business overview, competitor comparison with revenue growth
and margin benchmarking, financial health across income, balance sheet and
cash flow, management and ownership including insider transactions, analyst
coverage and price targets, upcoming catalysts, technicals, shareholder
returns, and recent news. On top of that sits an AI-written synthesis —
business explanation, competitive analysis, brand strength, SWOT, and a final
assessment.

The AI is given only the real data bundle and is instructed that if something
is missing it must write exactly "Not publicly reported" or "Data
unavailable." It is not permitted to invent a competitor, an executive, a
number or an event. Reports are saved, searchable and favouritable.

### 4.4 Trade Signals

Favourite a qualified strategy and it is evaluated against live prices —
both in the browser while the page is open and, more importantly, by a
server-side job every five minutes regardless of whether anyone is logged in.
When a rule fires, a notification is created with the strategy, the action,
the price, and a plain-English reason. The user confirms or dismisses it; a
confirmation opens or closes a tracked paper position. **No order is ever
sent anywhere.** A staleness warning tells the user if the background job has
stopped, because a monitoring product that silently stops monitoring is worse
than no monitoring product.

### 4.5 What ties it together

Every number in the product is computed from real market data or clearly
labelled as simulated. Every AI output is constrained to data it was given.
Every page carries the disclaimer. Nothing is ever traded. That consistency
is not a limitation we work around — it is the reason the product can be
trusted at all, and trust is the only durable asset in this category.

---

## 5. Market Analysis

### 5.1 Who the customer is

**Primary: the serious self-directed retail investor.** Manages their own
money through a brokerage account. Has been doing it for at least a year. Has
already lost money on an idea that "looked good," and knows it. Reads, tests
and wants to get better. Typically 25–45. Comfortable with software but not a
programmer. **This is the buyer.**

**Secondary: the aspiring quant.** Younger, technical or semi-technical,
learning systematic trading. Uses us as the on-ramp before Python. High
engagement, more price-sensitive — this is the Free-to-Pro conversion cohort.

**Tertiary: the small advisory practice or investment club.** One to five
people managing money for others or collectively. Needs the portfolio and
report tooling more than the strategy engine. Fewer accounts, higher value —
this is the Elite tier, and eventually the first real enterprise conversation.

**Explicitly not our customer:** day traders looking for signals to copy,
anyone looking for guaranteed returns, and institutions who already have a
Bloomberg terminal and a quant team. We will lose those and should.

### 5.2 Market size

I want to be careful here, because inflated market-size numbers are the
fastest way to lose credibility with someone who does this for a living. So:

- **Top-down context.** Retail participation in US equity markets has grown
  substantially since 2020, and tens of millions of US adults hold a
  self-directed brokerage account. That is the outer boundary, and it is not
  our market — most of those people buy index funds and never think about a
  trading strategy.
- **The realistic addressable market** is the subset who actively research and
  test their own strategies and already pay for tools. The honest proxy for
  this is the paying subscriber base of the existing charting and backtesting
  platforms, which collectively runs into the low millions of paid seats
  globally, at price points from roughly $15 to $60 per month.
- **What I am actually underwriting.** Reaching **10,000 paying subscribers at
  a blended $35/month is approximately $4.2M in annual recurring revenue.** A
  business at that scale is a genuine success and does not require capturing a
  meaningful share of anything. Every projection in §12 is built up from
  conversion and retention assumptions, not down from a market-size number,
  precisely because I do not want the plan to depend on a figure I cannot
  defend.

### 5.3 Trends working in our favour

1. **Retail participation has structurally increased** and has not gone back
   to pre-2020 levels.
2. **AI has reset expectations about explanation.** Users now expect software
   to tell them *why*, in words. Two years ago the per-user cost of doing that
   well was prohibitive; now it is cents.
3. **Backtesting literacy is rising.** Terms like "overfitting" and
   "out-of-sample" have moved from academic papers into retail trading
   discourse. The market is becoming able to understand our differentiator,
   which was not true five years ago.
4. **Distrust of signal sellers is growing.** Every cycle of blown-up signal
   groups makes "here is the validation, judge for yourself" a stronger
   position.
5. **Infrastructure costs have collapsed.** Serverless hosting, managed
   Postgres and pay-per-token AI mean this company can be built and operated
   by one person at a cost that would have required a funded team in 2018.

### 5.4 Trends working against us

1. **Market data is expensive and getting more so**, and the licence terms are
   restrictive. This is the single largest operational risk in the business
   (§14.1).
2. **A prolonged bear market shrinks retail engagement**, and with it the top
   of our funnel.
3. **Regulatory attention on AI-driven financial tools is increasing**, which
   is both a risk and — because it raises the cost of entry — a moat.

---

## 6. Competitive Analysis

The category is real and occupied. Nobody in it is doing what we do, and I
want to be precise about why rather than dismissive about them.

### 6.1 The landscape

| | **Strategy Lab AI** | **TradingView** | **Python / QuantConnect-style** | **Signal & alert services** | **Broker-native tools** |
|---|---|---|---|---|---|
| Typical price | $0 / $29 / $99 per month | ~$15–60/mo | Free–$60+/mo plus data | $50–300/mo | Free with account |
| Strategy testing | Built in, no code | Requires Pine Script | Requires Python | None | Minimal |
| **Enforced out-of-sample validation** | **Yes — mandatory** | No | Possible, entirely manual | No | No |
| Mass parameter search | Up to 1M variations | Limited | Yes, you build it | No | No |
| Plain-English explanation of *why* | Yes, everywhere | No | No | Rarely | No |
| AI company research reports | Yes | No | No | No | Partial |
| AI portfolio construction | Yes (A-TAMP) | No | No | No | Robo-advisor, different product |
| Live rule-based alerting | Yes, server-side | Yes | You build it | Yes | Limited |
| Learning curve | Minutes | Days | Months | None | Minutes |
| Target user | Serious self-directed retail | Chartists | Programmers | Followers | Everyone |

### 6.2 Where each competitor is genuinely better

I would rather an investor hear this from me than discover it themselves.

- **TradingView** has the best charts in the industry, an enormous community,
  and a social layer we do not have and will not build soon. If someone's
  primary need is charting, they should use TradingView.
- **The Python platforms** are more powerful, full stop. Unlimited flexibility,
  any asset class, any logic. If you can write Python and want to build a real
  quant stack, they are the right answer.
- **Broker-native tools** are free and already where the money is.
- **Signal services** solve an emotional need — certainty — that we
  deliberately refuse to serve.

### 6.3 Where we are genuinely better, and why it is defensible

1. **Validation is enforced, not offered.** Every competitor that supports
   out-of-sample testing makes it optional. Making it mandatory is a product
   decision with a business consequence: it makes our results look *worse*
   than a competitor's, and that is exactly the signal serious users are
   looking for. A competitor cannot copy this without breaking the promise
   they have already made to their existing users, whose saved strategies
   would suddenly stop qualifying.
2. **The rejection explanation is the retention mechanic.** Users stay because
   they are learning. A failed test that explains itself is more valuable to
   a user than a passed test that does not, and it is the thing that turns
   month three into month twelve.
3. **Four products, one honest data layer.** Testing, tracking, research and
   monitoring in one place, all computed from the same real prices. Nobody in
   the retail tier does all four.
4. **Compliance as architecture.** The legal framework, the versioned consent
   gate, the never-place-a-trade boundary and the education-not-advice
   framing are already built. A competitor copying our features inherits our
   regulatory surface area without our documentation, and that is a real
   barrier.

### 6.4 The honest competitive risk

The features are not patentable. A well-funded incumbent could build the
qualification gate in a quarter. What they cannot easily do is adopt the
*posture* — because telling your existing users that most of their saved
strategies were never actually validated is a product decision with an
immediate churn cost. Our advantage is that we have no legacy users to
disappoint. That advantage has a shelf life, which is one of the reasons to
raise now and move fast.

---

## 7. Business Model

Subscription software. Three tiers. Every expensive operation is metered and
the meters live in the database, not in code, so pricing can be tuned without
a deployment.

### 7.1 Tiers

| | **Free** | **Pro** | **Elite** |
|---|---|---|---|
| **Price** | $0 | **$29/mo** or **$290/yr** | **$99/mo** or **$990/yr** |
| Annual discount | — | 2 months free | 2 months free |
| Positioning | Try the engine | The real product | Power user / small firm |
| Portfolios | 1 | 10 | 100 |
| Watchlist symbols | 3 | 25 | 150 |
| Favourited strategies (live-monitored) | 2 | 25 | 150 |
| AI company reports / month | 1 | 30 | 200 |
| AI portfolio research runs / month | 0 | 30 | 200 |
| Max variations per research run | 10,000 | 1,000,000 | 1,000,000 |

### 7.2 The reasoning behind each limit

- **Favourited strategies is the load-bearing limit.** Every favourited
  strategy is re-evaluated by the background job every five minutes, forever.
  It is the only limit that creates a permanent, recurring cost per user.
  Free at 2 is deliberate.
- **AI portfolio research is zero on Free.** A-TAMP is the clearest "this is
  the paid product" moment in the app. Giving it away once teaches people it
  is free. One free *company report* is the better taster, because it produces
  a document the user wants to keep and share.
- **Elite is capped at 200, not sold as unlimited.** Never sell unlimited
  against a metered upstream API. 200 AI reports a month at roughly $0.10–0.15
  each is about $25 of AI cost against $99 of revenue — a margin that holds
  even for the heaviest user on the plan.
- **Research variations are capped on Free at 10,000.** This costs us nothing
  — the engine runs in the user's browser — but it is a real, felt limit, and
  it protects the upstream data provider from a free user launching a
  million-variation job.
- **Nothing a user created is ever deleted, hidden or locked when they
  downgrade.** A lapsed Pro user with eight portfolios keeps reading all
  eight; they simply cannot create a ninth until they are back under the Free
  limit. Limits apply on *create*, never on *read*. Deleting a former
  customer's data is how you earn a chargeback and a public complaint.

### 7.3 Unit economics

These are modelled, not measured — we have no paying customers yet, and I
would rather label an assumption than dress it up as data.

| Metric | Assumption | Basis |
|---|---|---|
| Blended ARPU | **$35/month** | Mix of Pro and Elite, monthly and annual |
| Payment processing | ~2.9% + $0.30 | Stripe standard |
| Market data | ~$0.50–2.00 per user/month | Scales with a licensed feed, not linearly |
| AI (Anthropic) | ~$1.50–4.00 per user/month | Metered; Elite worst case ~$25 |
| Hosting & database | ~$0.30–0.80 per user/month | Serverless; research compute is client-side |
| **Gross margin** | **~80–85%** | Typical for metered SaaS; protected by the caps |
| Target CAC | **$60–90** | Blended across organic and paid |
| Assumed monthly churn | **6%** at launch, improving to 4% | Prudent for consumer-adjacent SaaS |
| Implied average lifetime | ~17 months at 6%, ~25 at 4% | |
| **LTV at $35 ARPU, 82% margin, 6% churn** | **~$478** | |
| **LTV:CAC** | **~5–8×** | Healthy; 3× is the usual floor |
| Target payback period | **< 3 months** | |

**The number that matters most is churn, not CAC.** In this category people
sign up in a burst of enthusiasm and leave when they stop learning. That is
why the explanation layer — the rejection reasons, the plain-English signal
descriptions, the report narratives — is a retention investment, not a
feature. It is also why the Successful Strategy Log and Run History exist:
accumulated personal history is the thing that makes leaving expensive.

### 7.4 Future revenue lines (not in the projections)

Listed to show where the business can go, deliberately excluded from §12 so
the plan stands on subscription revenue alone.

- **Enterprise / team tier** for advisory practices and investment clubs:
  seats, shared portfolios, audit trail. Natural extension of Elite.
- **API access** to the qualification engine, sold per call, for other tools
  that want validation without rebuilding it.
- **Educational content** — a structured course built on the platform, sold
  once or bundled into Elite.
- **White-label** for brokers who want a validation layer in their own
  product. Highest value, longest sales cycle, most regulatory complexity.

---

## 8. Marketing and Sales Strategy

Product-led, content-first, self-serve. There is no sales team and there
should not be one until the enterprise tier exists.

### 8.1 The core insight

Our differentiator is inherently content-shaped. "Here is a strategy that
looked fantastic, and here is exactly how it failed out-of-sample" is a piece
of content that is genuinely useful, genuinely interesting, and can only be
produced by our product. Every piece of marketing we make should be a real
result from the real engine. We never need to invent a hook — the engine
generates them.

### 8.2 Channels, in priority order

**1. YouTube (primary).** Long-form is where this audience actually learns.
Format: take a popular strategy from retail trading discourse, test it
properly on the platform, show the result including the failures. Target one
video per week. Every video ends with the platform on screen. This is the
highest-intent, longest-lived channel, and each video keeps working for years.

**2. Reddit (primary, earliest).** r/algotrading, r/investing,
r/Daytrading, r/quant and similar. The rule is absolute: **participate, do
not advertise.** Post genuinely useful analysis; mention the tool only when
asked or when directly relevant, and always disclose that I built it. These
communities detect and punish marketing instantly, and one bad post costs
more than ten good ones earn.

**3. SEO / written content (compounding).** Target the questions people
actually type: "how to backtest a trading strategy," "what is out-of-sample
testing," "is my backtest overfitted," "[strategy name] backtest results." A
structured library of tested strategies with real published results is the
long-term acquisition engine and the cheapest traffic we will ever get.

**4. X / Twitter (velocity).** Short-form results, charts, single findings.
Best channel for reaching people who already speak the language. Low cost,
high frequency, feeds the other channels.

**5. TikTok / Shorts (top of funnel).** 30–60 second "this strategy failed
and here's the one number that proves it" clips. Highest reach, lowest
intent. Useful for awareness, not conversion. Every clip carries the
disclaimer on screen.

**6. Trading communities and Discords (targeted).** Slower, relationship-led,
but the highest-quality users. Worth real time from me personally.

**7. Referral programme (post-launch).** One free month for both sides.
Cheap, and it selects for the users who already understand the product well
enough to explain it.

**8. Paid acquisition (only after organic CAC is known).** I will not spend on
ads until I can measure organic conversion and retention, because without
that baseline I cannot tell whether a paid channel is working or just
expensive. When it starts: small budgets on YouTube pre-roll against
competitor and strategy keywords, and Google Search on high-intent terms.

### 8.3 The conversion funnel

| Stage | What happens | Target |
|---|---|---|
| **Awareness** | Video, post, or search result | — |
| **Visit** | Lands on strategylabai.net | — |
| **Signup** | Free account, username + consent | **8–12%** of visits |
| **Activation** | Completes first research run and sees a real result | **50%** of signups |
| **Habit** | Returns 3+ times in first 14 days | **30%** of activations |
| **Conversion** | Hits a limit that matters and upgrades | **4–6%** of signups |
| **Retention** | Still subscribed at month 6 | **60%+** |
| **Advocacy** | Refers or posts about it | **5%** of paid |

**The conversion moment is deliberately designed.** It is not a paywall
appearing at random. It is the user having a strategy they believe in, wanting
to monitor more than two of them, or having produced a company report they
found genuinely useful and wanting a second one. The limits are set where the
value has already been demonstrated.

### 8.4 Selling rules — permanent, no exceptions

These are not marketing guidelines; they are compliance requirements, and they
apply to me, to any future employee, and to every piece of content forever.

- **Never** use the words "guaranteed" or "risk-free," never promise or
  predict profit, never publish a cherry-picked backtest screenshot without
  the hypothetical-results disclaimer, and never say or imply "we tell you
  what to buy."
- **Always** carry: *"Educational content, not investment advice. Hypothetical
  results. Investing involves risk, including loss."*
- **No testimonials** until the FTC endorsement rules have been reviewed in
  full — they carry requirements most companies get wrong.
- **Every support reply to "what should I buy?"** uses the standard answer in
  the Legal Review Memo. No exceptions, including from me.

---

## 9. Operations Plan

### 9.1 The stack

| Layer | Provider | Purpose |
|---|---|---|
| Hosting / CDN / serverless | **Vercel** | App, API routes, middleware, edge network |
| Database, auth, storage | **Supabase** (managed Postgres) | All user data, row-level security, authentication |
| Rate limiting | **Upstash Redis** | Distributed limits across serverless instances |
| AI | **Anthropic (Claude)** | Report narratives, A-TAMP portfolio reasoning |
| Market data | **Currently Yahoo Finance — being replaced** | Prices, fundamentals, news |
| Scheduled jobs | **GitHub Actions** | Live signal checks (5 min), portfolio snapshots (hourly) |
| Payments | **Stripe** (designed, not yet live) | Subscriptions, tax, invoicing, refunds |
| Source control / CI | **GitHub** | Version control, automated tests |

Every one of these is a managed service with a free or low-cost tier that
scales with usage. There are no servers to patch and no fixed infrastructure
cost that exists before the first user.

### 9.2 Market data — the one that matters

The platform currently reads from Yahoo Finance's unofficial endpoints. **That
is acceptable for a free product and is not acceptable the day we charge
money** — those terms prohibit commercial use, and the realistic downside is
being blocked or receiving a cease-and-desist in launch week. Replacing it is
a blocking item before the first paid customer, not a later optimisation.

Candidate vendors: **Polygon.io** (from ~$29/month), **Twelve Data**,
**Finnhub**, and **Alpaca**. The selection criterion is not price — it is
whether the licence tier explicitly permits *displaying data to our paying
customers*. Several vendors' cheaper tiers do not. The architecture already
isolates every outbound data call behind a single module, so switching vendors
is a contained change rather than a rewrite. The privacy policy and disclaimer
name the vendor and will be updated with a legal-version bump when we switch.

### 9.3 Cost control

- **Every paid operation is metered per plan** and enforced atomically in the
  database, so a user cannot exceed their allowance by racing two requests.
- **A deployment-wide daily ceiling** sits on top of the per-account caps.
  Registration is free and self-serve, so a per-account cap bounds one
  account, not the bill — the global ceiling is the number that bounds what a
  single bad day can cost.
- **Every API route is rate-limited** per IP and per account, in a distributed
  store so the limit is real across serverless instances rather than an
  approximation per instance.
- **The research engine runs in the user's browser.** The most
  compute-intensive thing the product does costs us nothing.
- **Spend alerts** on Anthropic, Vercel and Supabase, so a traffic spike
  cannot produce a surprise invoice.

### 9.4 Customer support

Email-first, from support@strategylabai.net, handled by me. Target: first
response within 24 hours on weekdays. Public documentation and an FAQ reduce
volume. A standing rule: any support question asked twice becomes a
documentation page. Support questions that amount to "what should I buy?" get
the standard compliance answer, always.

### 9.5 Security operations

- Row-level security enforced on every user table; policies bound to the
  authenticated user, and for portfolio-scoped tables to the owning portfolio
  as well.
- No secret is ever exposed to the browser. Service-role keys, the AI key, the
  cron secret and the rate-limit tokens are server-only and verified as such.
- Scheduled jobs authenticate with a shared secret compared in constant time,
  sent as a header rather than a query parameter so it never lands in a log.
- Full security headers: content security policy, HSTS with preload, frame
  denial, referrer policy, permissions policy.
- A written information security program exists as a standing document, with
  an annual review on the calendar.
- Two-factor authentication on every provider account; signed data-processing
  agreements with Supabase and Vercel.

### 9.6 Monitoring

Uptime monitoring on the main domain plus both scheduled-job heartbeats. The
Trade Signals page shows the user directly if background monitoring has gone
stale — a monitoring product that silently stops monitoring is worse than no
monitoring product, so the failure is surfaced to the person affected rather
than buried in a log I might not read.

### 9.7 Billing operations

Stripe handles subscriptions, tax calculation, invoicing, receipts and renewal
reminders. Plan state lives in our database and is written **only** by a
signature-verified Stripe webhook — never by the browser. The definition of
done for the billing system is a specific test: open developer tools, try to
set your own plan, and fail. Cancellation is online, in the account area, with
no email required, because Massachusetts and California law require cancelling
to be as easy as signing up and our own terms already promise it.

---

## 10. Technology and Product Development

### 10.1 Architecture

A Next.js 16 App Router application on Vercel, with Supabase Postgres behind
it. Middleware validates the session server-side before any protected page
renders, so a logged-out visitor is redirected before page content is ever
sent to the browser. API routes carry their own independent authentication.

Three properties are worth an investor's attention:

1. **Client-side compute for the expensive part.** The backtesting engine runs
   in the user's browser. A user running a million-variation search costs us
   nothing. This decouples our largest apparent cost driver from revenue and
   is the main reason the gross margin in §7.3 holds.
2. **Server-side continuity.** Signal checks and portfolio snapshots run on a
   schedule regardless of whether anyone is logged in. The product keeps
   working when the user is asleep, which is what makes it a subscription
   rather than a tool.
3. **One place for every rule.** Qualification thresholds live in exactly one
   module. Plan limits live in exactly one database table. Legal copy lives in
   exactly one set of markdown files with a version constant. This is what
   makes it possible for one person to operate the whole thing without the
   marketing page and the enforcement layer drifting apart — which is the
   classic failure mode for a solo-built SaaS.

### 10.2 The AI systems

Two distinct integrations, both built on the same principle: **the model is
given real data and forbidden from going beyond it.**

- **Company report narrative.** Receives a trimmed bundle of the real report
  data and must write only from it. Missing data must be written as "Not
  publicly reported" or "Data unavailable." The prompt input is capped so cost
  stays flat regardless of how much news or insider activity a company
  happens to have. If no AI key is configured, a deterministic template
  fallback runs and the output says so.
- **A-TAMP portfolio reasoning.** Receives the theme description and real
  computed market statistics for every candidate. It may only select symbols
  from the preset universe; any symbol it invents is filtered out server-side,
  and the weights it returns are re-normalised by us. It is instructed never
  to promise or predict returns and never to phrase anything as advice.

Both are metered per plan, rate-limited per IP, per account and globally, and
both degrade gracefully rather than failing loudly.

### 10.3 Data sources

Live and historical prices across daily, hourly, 15-minute and tick
resolutions; company fundamentals across income statement, balance sheet and
cash flow; analyst coverage and price targets; insider and institutional
ownership; recent news; and a curated 76-symbol universe for portfolio
construction. Crypto works through the same path as equities — the data
provider serves both through one interface, so crypto support required no
separate code.

### 10.4 Security posture

Row-level security on every user table. Authentication validated server-side
against the auth provider on every protected request, never decoded from a
cookie. All secrets server-only. Constant-time secret comparison on scheduled
jobs. Full security header set. Input validation on every route. Rate limiting
everywhere, distributed. Regular structured security review — the most recent
pass produced the fixes recorded in the repository's remediation documents,
including an open-redirect fix on the login flow, a wildcard-injection fix in
the username lookup, authentication added to the market-data proxy, and a
deployment-wide ceiling on paid AI spend.

### 10.5 Scalability

Serverless scales horizontally by default. The database is the only shared
bottleneck, and a managed Postgres instance handles the projected load for
years before sharding is a conversation. The heaviest compute is on the
client. The realistic scaling constraints, in order, are: market-data vendor
rate limits, AI spend, and my own time — not infrastructure.

### 10.6 Development roadmap

**Now → Q1 2027 (the path to revenue)**
- Licensed market-data vendor
- Stripe billing end to end, including online cancellation
- Public beta
- Mobile-responsive audit across every page

**Q2–Q3 2027 (depth)**
- Strategy comparison view — several strategies side by side
- Portfolio benchmarking against an index
- Export: PDF reports, CSV data
- Email alerts for trade signals, not just in-app
- Expanded portfolio universe and sector-level analysis

**Q4 2027 → 2028 (breadth)**
- Native mobile app
- Options and futures support
- Custom strategy builder — user-defined rules beyond the twelve families
- Public API
- Team/enterprise tier

---

## 11. Management and Team

### 11.1 The founder

**Zach Clay — Founder.** I built all of it. Specifically:

- The backtesting engine, including the indicator maths, the execution model,
  the walk-forward validation split, and the qualification gate.
- The data layer, the API routes, the authentication and the security model.
- Both AI integrations, including the prompt constraints that stop the model
  inventing figures.
- The entire front end and design system.
- The infrastructure: hosting, database, scheduled jobs, rate limiting,
  monitoring.
- The legal framework: terms, privacy policy, investment disclaimer, refund
  policy, legal review memo, and written information security program — plus
  the versioned consent mechanism that makes them enforceable.

**What I am responsible for day to day:** product direction, all engineering,
all content and marketing, customer support, vendor relationships, finance,
and compliance.

**What I am not good at, stated plainly:** I have no professional experience
in regulated finance, no formal legal training, and no track record running
paid acquisition. These are the three areas where the plan deliberately buys
outside help rather than pretending I will figure it out. *[Add your age,
student status and any relevant background here in the way you want to present
it.]*

### 11.2 Why solo is currently the right answer

One person shipped four products, a complete legal framework and a security
posture that has survived structured review. At this stage the cost of
coordination would exceed the benefit of an extra pair of hands. Capital is
better spent on a licensed data feed and a regulatory opinion than on a second
engineer who would spend their first month reading the codebase.

This stops being true somewhere around the first few hundred paying
customers, which is exactly when the hires below become necessary.

### 11.3 Hiring plan

In the order the pain will actually arrive:

1. **Content / growth marketer (first hire, ~$50–70k or contract).** The
   bottleneck is not the product; it is that one person cannot ship code and
   publish weekly video, written and social content. This hire has the most
   direct line to revenue.
2. **Customer support (part-time, ~$25–35k).** Once support volume starts
   eating engineering days. Part-time is correct for a long time.
3. **Second engineer (~$90–130k).** When the roadmap is demonstrably limited
   by my hours rather than by my judgement. Mobile and the API are the
   natural first ownership areas.
4. **Compliance / operations (part-time or fractional).** As the user base
   grows and the regulatory surface widens.

### 11.4 Advisors I want, and what they are for

- Someone who has operated a regulated financial product — the single most
  valuable relationship available to this company.
- A consumer-SaaS growth operator who has taken a product from zero to ten
  thousand subscribers.
- A securities attorney on retainer rather than on staff.

*[List any advisors, mentors or early customers you already have here — this
section is much stronger with real names in it.]*

---

## 12. Financial Plan

### 12.1 How to read this section

Every number here is a **projection built from stated assumptions**, not a
measurement. We have no revenue and no paying customers. I have modelled a
base case and stated the assumptions underneath it, because a projection
without its assumptions is a guess wearing a suit.

**Core assumptions**

| Assumption | Value | Why |
|---|---|---|
| Blended ARPU | $35/month | Mix of Pro/Elite, monthly/annual |
| Free → Paid conversion | 5% | Conservative for a self-serve funnel with real limits |
| Monthly churn | 6% Y1 → 4% by Y3 | Prudent for consumer-adjacent SaaS |
| Gross margin | 82% | After data, AI, hosting and payment processing |
| Blended CAC | $75 | Organic-heavy early, paid mixed in later |
| Launch | Q1 2027 | Gated on billing + data licence |

### 12.2 Revenue projection

| | **Y1 (2027)** | **Y2 (2028)** | **Y3 (2029)** | **Y4 (2030)** | **Y5 (2031)** |
|---|---|---|---|---|---|
| Registered users (EOY) | 5,000 | 25,000 | 70,000 | 150,000 | 280,000 |
| Paying subscribers (EOY) | 250 | 1,500 | 4,500 | 10,000 | 18,000 |
| Blended ARPU | $35 | $35 | $37 | $38 | $40 |
| **Exit ARR** | **$105,000** | **$630,000** | **$2.0M** | **$4.6M** | **$8.6M** |
| Recognised revenue | ~$52,000 | ~$370,000 | ~$1.3M | ~$3.2M | ~$6.5M |
| Gross margin | 78% | 81% | 83% | 84% | 85% |

Year 1 revenue is low because launch is mid-year and the first months are
spent learning the funnel rather than pushing it. I would rather show that
than a hockey stick starting in month one.

### 12.3 Expense projection

| | **Y1** | **Y2** | **Y3** | **Y4** | **Y5** |
|---|---|---|---|---|---|
| Market data | $2,400 | $9,600 | $24,000 | $48,000 | $84,000 |
| AI (Anthropic) | $1,800 | $12,000 | $42,000 | $102,000 | $190,000 |
| Hosting & database | $1,200 | $6,000 | $18,000 | $42,000 | $78,000 |
| Payment processing | $1,800 | $12,500 | $44,000 | $108,000 | $220,000 |
| Marketing | $12,000 | $60,000 | $180,000 | $400,000 | $700,000 |
| Salaries (incl. founder) | $60,000 | $160,000 | $420,000 | $900,000 | $1,600,000 |
| Legal & professional | $15,000 | $20,000 | $35,000 | $60,000 | $90,000 |
| Insurance | $3,000 | $5,000 | $9,000 | $15,000 | $24,000 |
| Software & tools | $3,000 | $8,000 | $18,000 | $35,000 | $60,000 |
| **Total** | **$100,200** | **$293,100** | **$790,000** | **$1.71M** | **$3.05M** |
| **Net** | **−$48,000** | **+$77,000** | **+$510,000** | **+$1.49M** | **+$3.45M** |

Year 1 legal spend is deliberately front-loaded: it includes the one-time
regulatory review of the A-TAMP feature, which is the single highest-value
risk reduction available to this company.

### 12.4 SaaS metrics

| Metric | Y1 | Y3 | Y5 |
|---|---|---|---|
| MRR (exit) | $8,750 | $166,000 | $720,000 |
| ARR (exit) | $105,000 | $2.0M | $8.6M |
| Monthly churn | 6% | 5% | 4% |
| Average customer lifetime | ~17 mo | ~20 mo | ~25 mo |
| CAC | $75 | $85 | $95 |
| LTV (gross-margin basis) | ~$478 | ~$615 | ~$850 |
| **LTV:CAC** | **6.4×** | **7.2×** | **8.9×** |
| CAC payback | 2.6 mo | 2.9 mo | 3.1 mo |
| Gross margin | 78% | 83% | 85% |

### 12.5 The raise and use of funds

**Raising $250,000 as a pre-seed round on a post-money SAFE.**
*[Confirm the amount, the instrument and the valuation cap before sending.]*

| Use | Amount | What it buys |
|---|---|---|
| **Founder salary — 18 months** | **$90,000** | Full-time focus. This is the highest-leverage line in the table: the single largest constraint on this company today is that it is built around a class schedule. |
| **Market data licence — 24 months** | **$25,000** | Removes the largest operational risk in the business and unblocks charging money at all. |
| **Legal & regulatory** | **$30,000** | The one-time flat-fee review of the adviser-classification question, entity formation, and a securities attorney on retainer. |
| **Marketing & content** | **$50,000** | Equipment, editing, and the first paid acquisition experiments once organic CAC is known. |
| **Infrastructure & AI (18 months)** | **$20,000** | Runway for usage growth ahead of revenue. |
| **Insurance (Tech E&O + cyber)** | **$10,000** | Bound in month one, not someday. |
| **Contract help** | **$15,000** | Design, video editing, and specialist engineering as needed. |
| **Reserve** | **$10,000** | Because something always. |
| **Total** | **$250,000** | ~18 months of runway to a default-alive business |

**What the money is expected to produce.** By month 18: a licensed data feed,
a settled regulatory position, billing live, the first 1,000–1,500 paying
subscribers, measured CAC and retention across at least three channels, and
either profitability or a metrics base that makes a seed round
straightforward. The plan does not depend on a second raise to survive —
§12.3 shows the business turning net-positive in Year 2 on these assumptions.

### 12.6 Break-even

At 82% gross margin and a fixed cost base of roughly $8,300/month in Year 1,
break-even is approximately **290 paying subscribers**, which the base case
reaches near the end of Year 1. At a leaner Year 1 cost base — no contract
help, minimal marketing — break-even falls to roughly **170 subscribers**,
which is the floor the company can operate at indefinitely if growth is slower
than modelled.

---

## 13. Milestones and Roadmap

Measurable, dated, and honest about what gates what.

### Q4 2026 — Foundation
- [ ] Massachusetts LLC formed, EIN obtained, business banking opened
- [ ] Tech E&O and cyber insurance quoted and bound
- [ ] Market-data vendor selected and licensed
- [ ] Legal documents updated to the entity name; legal version bumped
- [ ] Stripe account live under the entity; billing system built and tested
- [ ] Online cancellation flow shipped
- **Exit criterion: the product can legally and technically take money.**

### Q1 2027 — Public beta
- [ ] Public beta opens
- [ ] First paying subscriber
- [ ] 1,000 registered users
- [ ] Content engine running: 1 video + 2 written pieces per week
- [ ] First 25 paying subscribers
- **Exit criterion: conversion rate and week-4 retention measured, not guessed.**

### Q2 2027 — Product-market fit signal
- [ ] 5,000 registered users
- [ ] 150 paying subscribers (~$5,250 MRR)
- [ ] Monthly churn measured and below 8%
- [ ] Two acquisition channels with known CAC
- [ ] Regulatory review completed and acted on
- **Exit criterion: at least one channel where LTV:CAC exceeds 3×.**

### Q3 2027 — Scale the working channel
- [ ] 12,000 registered users
- [ ] 400 paying subscribers (~$14,000 MRR)
- [ ] First hire: content/growth
- [ ] Paid acquisition running profitably
- [ ] Email alerts and export shipped
- **Exit criterion: growth no longer dependent on my personal posting.**

### Q4 2027 — Default alive
- [ ] 25,000 registered users
- [ ] 1,000 paying subscribers (~$35,000 MRR)
- [ ] Operationally break-even
- [ ] Mobile app in development
- **Exit criterion: the company survives without new capital.**

### 2028 — Expansion
- [ ] 4,500 paying subscribers, ~$2M ARR
- [ ] Mobile app launched
- [ ] Options support
- [ ] Team/enterprise tier
- [ ] Public API in beta

### 2029–2031 — Category position
- [ ] 18,000 paying subscribers, ~$8.6M ARR
- [ ] Recognised as the standard for honest retail strategy validation
- [ ] Profitable, growing, and not dependent on any single channel

---

## 14. Risk Analysis

Each risk below has a likelihood, an impact, and a specific mitigation. I have
put the ones that could actually end the company first.

### 14.1 Market-data licensing — **High likelihood, high impact**

**The risk.** The platform currently reads Yahoo Finance's unofficial
endpoints, whose terms prohibit commercial use. Charging money while relying
on them invites being blocked or receiving a cease-and-desist, and the product
does not function without price data.

**Mitigation.**
- Replace the feed with a properly licensed commercial vendor **before the
  first paid customer**. This is a blocking launch item, not a later task.
- Verify the licence tier explicitly permits displaying data to paying
  customers — several vendors' cheap tiers do not.
- The architecture already isolates every outbound data call behind one
  module, so switching vendors is a contained change.
- Maintain a tested secondary vendor so a single provider failure is a
  configuration change, not an outage.
- Budget for data cost to rise with scale; §12.3 models it growing
  faster than revenue in the early years.

### 14.2 Regulatory classification — **Medium likelihood, high impact**

**The risk.** A-TAMP takes a user's own description and, historically, their
current holdings. There is a genuine question about whether that crosses from
"publisher" into "investment adviser" under Massachusetts and federal law once
money changes hands. Documents defend the publisher position; classification
is decided by regulators, not by documents.

**Mitigation.**
- **Commission the one-time flat-fee legal review.** Budgeted in §12.5 as the
  highest-value risk reduction available.
- Two interim mitigations, either of which meaningfully shrinks the exposure:
  make the AI portfolio input generic — theme only, stop sending the user's
  current holdings — or keep the feature in the free tier so nobody is paying
  for the personalised-looking part.
- Never place a trade, never custody assets, never take discretion. These
  boundaries are architectural, not policy.
- Every output is framed as an example, educational and explicitly not
  advice, in the product and in the legal documents.
- The versioned consent gate provides a real audit trail of exactly which
  document version each user accepted.

### 14.3 AI cost escalation — **Medium likelihood, medium impact**

**Mitigation.** Every AI operation is metered per plan and enforced in the
database; a deployment-wide daily ceiling bounds total spend regardless of how
many accounts exist; Elite is capped at 200 calls rather than sold as
unlimited; prompt inputs are trimmed server-side so per-call cost is flat;
spend alerts are set at the provider. If per-token pricing rises materially,
the caps are database values and can be adjusted without a deployment.

### 14.4 Customer acquisition cost — **Medium likelihood, high impact**

**Mitigation.** Organic-first by design — content is the primary channel
precisely because our differentiator is content-shaped. No paid spend until
organic conversion and retention are measured, so we can tell a working
channel from an expensive one. Referral programme to lower blended CAC. If CAC
proves structurally higher than modelled, the response is to raise ARPU
through the Elite and team tiers rather than to spend into a bad number.

### 14.5 Backtest results not translating to live markets — **High likelihood, medium impact**

**This is the most intellectually honest risk in the document.** A strategy
that passes every test can still lose money. Markets change; past behaviour
does not bind future behaviour.

**Mitigation.** This risk is addressed by *positioning*, because it cannot be
engineered away. We do not sell profit. We sell validation, understanding and
discipline. The qualification gate exists to reduce the chance a user acts on
a result that was never real in the first place — which is a genuine service
whether or not any particular strategy then works. Every screen states that
results are hypothetical and investing involves risk of loss. We will never
publish a testimonial implying otherwise, and no employee will ever be
permitted to.

### 14.6 Security and privacy — **Low likelihood, high impact**

**Mitigation.** Row-level security on every user table. Server-side session
validation. No secrets in the browser. Rate limiting everywhere. Full security
header set. Constant-time comparison on scheduled-job secrets. A standing
written information security program with an annual review. Regular structured
security review — the most recent pass is recorded in the repository. Cyber
insurance bound in month one. Signed data-processing agreements with every
processor.

### 14.7 Competition from an incumbent — **Medium likelihood, medium impact**

**Mitigation.** Move fast while the window is open. Deepen the explanation
layer, which is the hardest part to copy well. Build accumulated personal
history — strategy logs, run history, saved reports — that makes switching
expensive. Lean on the compliance posture, which an incumbent copying our
features would have to build from scratch. Accept that the features are not
defensible and that the posture and the trust are.

### 14.8 Market downturn — **Medium likelihood, medium impact**

**Mitigation.** The product is about validation and risk management, which is
arguably *more* relevant in a downturn than in a bull market — the messaging
shifts rather than breaks. The cost base is variable and serverless. The
company can operate indefinitely at roughly 170 subscribers on a lean cost
base (§12.6).

### 14.9 Technical failure — **Low likelihood, medium impact**

**Mitigation.** Managed services with their own redundancy. Automated tests in
CI. Uptime monitoring on the domain and both scheduled jobs. The Trade Signals
page surfaces a stale background job directly to the affected user. Failures
degrade gracefully — the AI paths fall back to deterministic output and say
so rather than erroring.

### 14.10 Key-person risk — **High likelihood, high impact**

**The honest version: I am the only person who understands this system.** If I
am unavailable the company stops.

**Mitigation.** The codebase is heavily documented — architectural decisions
are written down in the code itself, not carried in my head. Infrastructure is
managed services with documented configuration. The hiring plan brings a
second engineer in before this becomes acute. Beyond that, this risk is real
and is not fully mitigable at this stage, and any investor should price it in.

---

## 15. Regulatory and Compliance Position

Worth its own section, because in this category it is a core part of the
business rather than an administrative afterthought.

### 15.1 What we are

An educational software publisher. We provide tools and information. We do not
provide personalised investment advice, we do not manage money, we do not
custody assets, we do not execute trades, and we do not take discretion over
anyone's account.

### 15.2 How that is enforced in the product

- **No order is ever placed anywhere.** There is no brokerage integration and
  no code path that could place one.
- **Research capital is simulated** — a $100,000 balance that is not real
  money, stated in the product and the README.
- **Every AI output is framed as an example**, is forbidden from predicting
  returns, and is forbidden from phrasing anything as advice about what a
  person should do.
- **The disclaimer appears on every page**, not just in a footer link.
- **A consent gate** requires acceptance of the terms, privacy policy and
  investment disclaimer at signup, and re-prompts every existing user whenever
  those documents materially change — producing a real, per-user audit trail
  of exactly which version each person accepted.

### 15.3 The published framework

Six documents, written and live: Investment and Trading Disclaimer, Terms of
Service, Privacy Policy, Refund and Cancellation Policy, a Legal Review Memo,
and a Written Information Security Program. All are versioned, and git history
is the archive of every published version — which is exactly what regulators
and card networks ask for when they want "the version the customer accepted."

### 15.4 Open items

- **The adviser-classification question on A-TAMP** (§14.2) — the one thing
  self-drafting cannot settle, and the reason a flat-fee review is budgeted.
- **DMCA agent registration** — a ~$6 filing without which there is no
  copyright safe harbour.
- **Refund policy alignment with Stripe** — checkout wording must match the
  published policy word for word; mismatch is the leading cause of lost
  chargebacks.
- **Trademark search** on "Strategy Lab AI" and "A-TAMP" — not registration
  yet, but knowing now if someone else owns the name.
- **Annual review** of the security program and legal documents, on the
  calendar for September 2027.

---

## 16. Appendix

### A. Qualification thresholds — the complete gate

Reproduced in full because it is the product. All values live in one module
and are not user-adjustable.

| Gate | Requirement | Rationale |
|---|---|---|
| Data integrity | All mechanical sanity checks pass | Rejects impossible metrics before anything else runs |
| Data source | Real market data only | Synthetic data can never qualify, at any threshold |
| Total trades | ≥ 50 | Below this, results are noise |
| Out-of-sample trades | ≥ 20 | Validation needs its own sample size |
| OOS expectancy | > $0 per trade | Must make money per trade on unseen data |
| OOS profit factor | ≥ 1.15 | Gross profit must exceed gross loss with margin |
| OOS Sharpe | ≥ 0.75 | Return must be reasonable relative to volatility |
| OOS return | > 0% | Must be positive on data it never saw |
| OOS max drawdown | ≤ 10% | Bounds the worst peak-to-trough loss |
| Window consistency | ≥ 60% of validation windows profitable | Catches strategies that worked in one regime |
| Profit concentration | No window > 60% of total profit | Catches a single lucky period carrying the result |

### B. The twelve strategy families

Trend Following · Mean Reversion · Breakout · Momentum · Volume Confirmation ·
RSI Regime · Moving Average Cross · MACD Trend · Bollinger Band Reversion ·
Donchian Breakout · VWAP Pullback · ATR Trend

Each is a real, named technique with documented entry and exit rules, and each
is described to the user in plain English with its actual parameters
substituted in — for example: *"Mean Reversion buys when Wilder's RSI(14)
drops below 30, betting on a bounce back toward the average, and sells once
RSI climbs back above 70."*

### C. Technical architecture summary

```
Browser (Next.js 16 App Router, React)
  ├── Research engine — runs client-side, up to 1M variations
  ├── Live charts, portfolio views, reports
  └── Session cookie, validated server-side on every request
        │
        ▼
Vercel Edge Middleware ── validates session before any page renders
        │
        ▼
API routes (serverless)
  ├── /api/market            — market data proxy, authenticated, rate limited
  ├── /api/company-report    — report assembly from real data
  ├── /api/.../narrative     — Anthropic, metered per plan + global ceiling
  ├── /api/portfolio-research— A-TAMP, metered per plan + global ceiling
  ├── /api/auth/*            — username→email resolution, service-role, rate limited
  └── /api/cron/*            — shared-secret, constant-time compare, header-only
        │
        ▼
Supabase Postgres — row-level security on every user table
Upstash Redis    — distributed rate limiting
Anthropic        — AI narrative and portfolio reasoning
Market data      — licensed vendor (in migration)

GitHub Actions
  ├── Live signal checks   — every 5 minutes
  └── Portfolio snapshots  — hourly
```

### D. Product surface

| Product | What it does | Status |
|---|---|---|
| Research | Strategy generation, backtesting, walk-forward validation, qualification | Live |
| Portfolios | Position tracking, realised/unrealised return, A-TAMP AI construction | Live |
| Company Reports | Full equity research with AI synthesis | Live |
| Trade Signals | Live rule monitoring, server-side, with notifications | Live |
| Notification Centre | Signal confirmation, position tracking | Live |
| Account | Profile, settings, data export, account deletion | Live |
| Billing | Subscriptions, plans, cancellation | Designed, not built |

### E. Glossary

**Backtest** — running a strategy against historical data to see how it would
have performed.
**Out-of-sample** — data the strategy was never optimised on; the only honest
test.
**Overfitting** — tuning a strategy until it fits the past so closely that it
has learned noise rather than anything real.
**Walk-forward validation** — repeatedly optimising on one period and testing
on the next, to check the result holds across time rather than in one window.
**Sharpe ratio** — return relative to volatility; higher is better risk-adjusted
performance.
**Profit factor** — gross profit divided by gross loss; above 1.0 is
profitable, 1.15 is our floor.
**Expectancy** — average profit or loss per trade.
**Maximum drawdown** — the largest peak-to-trough decline in account value.
**Realised return** — gain or loss already locked in by selling.
**Unrealised return** — paper gain or loss on positions still held.
**MRR / ARR** — monthly / annual recurring revenue.
**CAC** — customer acquisition cost.
**LTV** — lifetime value of a customer.
**Churn** — the rate at which subscribers cancel.

### F. Supporting documents

| Document | Location | Contents |
|---|---|---|
| Confidential Investor Memorandum | `INVESTOR_MEMORANDUM.md` | The investor-facing companion to this plan — same facts, written to be read by someone deciding whether to fund it |
| Payments implementation plan | `PAYMENTS_PLAN.md` | Complete phase-by-phase billing build, migrations, webhook security |
| Launch checklist | `LAUNCH_CHECKLIST.md` | Ordered list of everything required before charging money |
| Security remediation records | `SECURITY_REMEDIATION_*.md` | Findings and fixes from each structured security review |
| Legal framework | `legal/content/*.md` | Terms, privacy, disclaimer, refunds, review memo, security program |
| Database schema and migrations | `supabase/*.sql` | Full schema, row-level security policies, every migration |

---

*Strategy Lab AI provides general information and software tools for
educational purposes only. It is not investment, tax, or legal advice, and not
an offer to buy or sell any security. Hypothetical and backtested results have
inherent limitations and do not represent actual trading. Investing involves
risk, including the possible loss of principal.*

**© 2026 Strategy Lab AI. Confidential.**
