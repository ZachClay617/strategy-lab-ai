# Privacy Policy

Strategy Lab AI · strategylabai.net
Effective Date: September 30, 2026 · Last Updated: September 30, 2026 · Version 1.0

## 1. Who We Are and What This Policy Covers

This Privacy Policy explains how Strategy Lab AI ("Strategy Lab AI," "we," "us," or "our"), located in Salem, Massachusetts, collects, uses, shares, stores, and protects personal information when you visit strategylabai.net or use any related features, tools, emails, notifications, or services (the "Service"). It also explains your choices and rights.

It applies to visitors and registered users. By using the Service, you acknowledge this Policy. If you do not agree, please do not use the Service. This Policy is part of our Terms of Service; capitalized terms not defined here have the meaning given there.

**Who is responsible for your data.** We act as the "controller" (or "business") for personal information described in this Policy. Contact for privacy matters: privacy@strategylabai.net.

**Summary (not a substitute for the full Policy):** We collect what you give us (account details, portfolios, strategies, watchlists), what our systems record when you use the Service, and — when paid plans launch — payment status from our processor. We use it to run the Service, secure it, and communicate with you. We do not sell your personal information, do not share it for cross-context behavioral advertising, and do not run advertising trackers. We use trusted vendors (such as Supabase, Vercel, Upstash, and Anthropic) to operate the Service. You can access, correct, export, and delete your data — including a self-service export and account deletion in Account settings.

## 2. Information We Collect

### 2.1 Information you provide directly

- **Account information:** email address, password (stored only as a salted hash by our authentication provider, never in readable form), and, if you choose, a username.
- **Profile information (optional):** full or display name, profile picture (avatar image you upload, resized and stored with your profile), preferred display currency, and gender (optional, used only for how we address you in greetings; you may leave it blank or remove it at any time).
- **Legal acceptance records:** the date, time, and document versions when you accept our Terms, Privacy Policy, and Disclaimer at signup.
- **Strategy and research data:** the symbols/markets you research, run names, settings and parameters, run history and progress logs, generated strategies, test results, scores, trade lists, equity curves, explanations, capital events, favorites, and reports you save or favorite.
- **Portfolio data:** portfolio names and descriptions (including any plain-language text you write for A-TAMP), holdings (ticker symbols, weights, share counts, entry prices, open dates), closed/realized trades and profit-and-loss records, and periodic portfolio value snapshots.
- **Watchlist and Trade Signal data:** tickers you watch, favorited strategies, positions you record or "confirm" (symbol, entry and exit price, open and close times), and the buy/sell notifications generated for you, including whether you have seen or acknowledged them.
- **Company-report requests:** ticker symbols you request, and reports saved to your account.
- **Communications:** messages you send to support, feedback, survey answers, and related correspondence.
- **Payment and billing information (when paid plans launch):** plan, billing period, subscription status, dates, amounts, billing country/ZIP, tax information, and the last four digits and brand of your card. Full card numbers will be collected and stored by our payment processor, not by us.

### 2.2 Information collected automatically

- **Device and log data:** IP address, browser type and version, device and operating system, referring pages, pages viewed, timestamps, request URLs, error reports, and approximate location derived from IP (city/region/country level).
- **Usage data:** features used, runs started and completed, and similar events needed to operate the Service, enforce usage limits, and diagnose problems. We do not use a separate analytics or tracking tool.
- **Rate-limiting data:** identifiers such as IP address or account ID and request counts, held temporarily in our rate-limiting store (Upstash Redis) to prevent abuse.
- **Session and authentication data:** authentication tokens that keep you logged in, stored in your browser (see Section 5).
- **Scheduler activity:** our scheduled jobs (which check signals and record portfolio snapshots) act on your saved data using a secure server-side process, and record heartbeat/status information. These jobs do not collect anything from your device.

### 2.3 Information from third parties

- **Payment processor (when paid plans launch):** confirmation of payment, subscription status, fraud signals, and limited billing details.
- **Market-data and AI providers:** we receive market data (prices, fundamentals, news) and AI-generated text. This is not personal information about you, but we associate results with your account when you save them.
- **Authentication:** if we add sign-in via Google, Apple, or other identity providers, we will receive basic profile data you authorize. Not currently offered.

### 2.4 Information we do not intentionally collect

We do not ask for, and you should not submit: brokerage or bank account numbers or logins, Social Security or government ID numbers, or passwords for other services. We do not connect to your brokerage. We do not collect precise geolocation, biometrics, health data, or data about children. If you put such information in a free-text field (such as a portfolio description), it is stored and, for AI features, sent to our AI provider, so please don't.

### 2.5 Sensitive information

Under some state laws, certain data is "sensitive." We do not intentionally collect sensitive categories as they are defined (such as racial or ethnic origin, religion, health, sexual orientation, precise geolocation, or government ID). The optional gender field is provided voluntarily; you may leave it blank or remove it. Your account login credentials and financial holdings information are treated as confidential and protected as described in Section 11.

## 3. How We Use Information and Our Legal Bases

We use personal information to:

- **Provide and operate the Service** (create and secure your account, run strategy tests, store your logs and portfolios, fetch market data, generate reports and AI output, send signals and notifications, maintain your dashboard). Legal basis (GDPR/UK, where it applies): performance of a contract.
- **Process payments and manage subscriptions** (when offered), prevent payment fraud, and keep financial records. Legal basis: contract; legal obligation.
- **Communicate with you:** confirmations, password resets, security alerts, billing notices, legal/policy updates, support replies, and (if you opt in or where permitted) product news. Legal basis: contract; legitimate interests; consent for marketing where required.
- **Secure and protect the Service and users:** detect and block abuse, enforce rate limits, investigate incidents, debug errors. Legal basis: legitimate interests; legal obligation.
- **Improve and develop the Service:** understand which features are used, fix bugs, and design new features, using de-identified or aggregated data where practical. Legal basis: legitimate interests.
- **Personalize the Service to you:** showing your data, your favorite strategies, your currency, and briefings summarizing your own activity. We do not use this to give personalized investment recommendations. Legal basis: contract; legitimate interests.
- **Comply with law** and respond to lawful requests; enforce our Terms and protect our rights. Legal basis: legal obligation; legitimate interests.
- **Complete corporate transactions** such as a merger or sale (Section 6.5).

We do not use your personal information to make decisions that produce legal or similarly significant effects about you through solely automated processing. We do not use your User Content to train our own or third-party AI models, and our AI provider's commercial API terms provide that our API inputs and outputs are not used to train its models.

## 4. Artificial Intelligence and Your Data

Some features send limited information to a third-party AI provider (currently Anthropic, PBC) through its commercial API to generate content. Specifically:

- **AI-assisted portfolios (A-TAMP):** the plain-language description you write, the symbols and weights of the portfolio's current holdings, and market data for a preset list of stocks are sent to generate an example portfolio.
- **Company reports:** the ticker's public company data, news headlines, and market data are sent to write summary sections. This generally does not include your personal information.

We do not send your name, email address, or password to the AI provider. Under the provider's commercial API terms, inputs and outputs are not used to train its models by default and are retained for a limited period for abuse monitoring and safety, as the provider states in its policies. AI Output can be wrong (see the Disclaimer). Do not enter sensitive personal information in free-text fields.

## 5. Cookies, Local Storage, and Similar Technologies

Our Service uses a small number of technologies that are strictly necessary to operate it:

- **Authentication tokens** (browser local storage and/or cookies set by Supabase Auth) keep you signed in and secure your session. Without them the Service cannot work.
- **Preferences and state** (for example, which notifications you have seen, or a research run in progress) may be stored in your browser.
- **Web workers and background timers** run in your browser to keep tests running at full speed.

We do not use advertising cookies, cross-site tracking, third-party analytics cookies, session-replay tools, or social-media pixels. If we ever add any, we will update this section, add a consent banner where required, and list them in a cookie table with name, provider, purpose, and lifetime. You can clear or block storage in your browser, but you may be logged out and some features may not function.

**Do Not Track / Global Privacy Control.** Because we don't track you across sites or sell/share data, we do not change our practices based on browser "Do Not Track" signals; we honor Global Privacy Control signals as an opt-out request where applicable law requires.

## 6. How We Share Information

We do not sell your personal information for money, and we do not "share" it for cross-context behavioral advertising. We share information only in the following ways:

### 6.1 Service providers (processors)

We use vendors who process data on our behalf under contracts that limit their use of it.

### 6.2 Vendor list

- **Supabase, Inc.** — authentication, database, and file storage for your account and all saved data.
- **Vercel Inc.** — website hosting, serverless functions, edge network, and server logs (IP address, request data).
- **Upstash, Inc.** — rate-limiting store (request counters keyed to IP/account).
- **Anthropic, PBC** — generative AI (Section 4).
- **Yahoo (Yahoo Finance data)** — public market data. These requests are made by our servers, not your browser, so Yahoo does not receive your IP address or identity from your use of the Service.
- **GitHub, Inc. (GitHub Actions)** — triggers our scheduled server jobs; it does not receive your personal data.
- **Payment processor (when paid plans launch; we intend to use Stripe, Inc.)** — payment processing, fraud prevention, invoicing, tax handling.
- **Email delivery** — transactional emails such as signup confirmation and password reset are currently sent through our authentication provider (Supabase).

If we add a vendor, we will update this list before or promptly after it begins processing personal information.

### 6.3 Legal and safety

We may disclose information if we believe in good faith it is required by law, subpoena, court order, or government request; to enforce our Terms; to detect, prevent, or address fraud, security, or technical issues; or to protect the rights, property, or safety of you, us, or others. We will, where allowed and practical, notify you of requests for your data, and we push back on overbroad requests.

### 6.4 Professional advisors

With lawyers, accountants, auditors, insurers, and similar advisors who are bound by confidentiality.

### 6.5 Business transfers

If we are involved in a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets, your information may be transferred as part of that transaction. We will notify you of a change in ownership or use of your personal information and any choices you may have.

### 6.6 With your direction or consent

When you ask us to share, or otherwise consent.

### 6.7 Aggregated or de-identified data

We may share aggregate or de-identified information that cannot reasonably be used to identify you, and we commit not to re-identify it.

### 6.8 What is not shared

Your portfolios, holdings, and strategies are private to your account. We do not publish them or show them to other users. Nothing on the Service is public unless we tell you.

## 7. Data Retention

We keep personal information only as long as needed for the purposes in this Policy, including to provide the Service, meet legal, tax, and accounting requirements, resolve disputes, and enforce agreements.

- **Account and saved data** (profile, strategies, portfolios, watchlists, positions, notifications): kept while your Account is open. When you delete your Account, this data is deleted immediately by our database (deletion cascades from your account record), and any residual copies are removed within 30 days. Backups are overwritten in the normal course within 90 days.
- **Billing records** (when paid plans launch): kept as required by tax and accounting laws (generally 7 years).
- **Server and security logs:** typically 30–90 days unless needed for an investigation.
- **Rate-limiting counters:** minutes to hours.
- **Support communications:** up to 2 years after resolution.
- **Records needed for legal claims or compliance:** for the applicable period.
- **Inactive accounts:** if unused for 24 months we may email you and then delete the account.
- **AI provider:** retained per the provider's policy (see Section 4).

## 8. Your Rights and Choices

### 8.1 Everyone

- **Access and update:** view and edit most profile data in Account settings.
- **Delete portfolios, strategies, and logs:** available in the Service.
- **Delete your Account and data:** Account → Privacy & Legal → Delete account, or email privacy@strategylabai.net. See Section 7.
- **Export your data:** Account → Privacy & Legal → Export my data downloads a copy of your saved data, or email privacy@strategylabai.net.
- **Marketing emails:** opt out via the link in the email or by contacting us. We will still send transactional and legal messages.
- **Notifications:** you can control in-app and browser notifications in your settings and browser.
- **Cookies/storage:** via browser settings (Section 5).

### 8.2 U.S. state privacy rights

Depending on where you live (for example California, Colorado, Connecticut, Virginia, Utah, Texas, Oregon, Montana, and other states with privacy laws), you may have the right to: (a) know/confirm whether we process your data and to access it; (b) correct inaccuracies; (c) delete; (d) obtain a portable copy; (e) opt out of sale, of targeted advertising or "sharing," and of profiling in furtherance of significant decisions (we do none of these); (f) limit use of sensitive information (we do not use it beyond what is permitted); (g) know the categories of third parties with whom we share data; and (h) not be discriminated against for exercising rights. We extend these rights to all U.S. users as a matter of policy.

**How to exercise:** use the self-service tools in Account settings, or email privacy@strategylabai.net with the subject "Privacy Request." We will verify your identity by matching information to your Account (and may need your Account email and a confirmation link). An authorized agent may submit on your behalf with written permission. We will respond within 45 days (extendable once by 45 days with notice) or sooner if required. There is no fee, except for manifestly excessive requests where allowed. **Appeal:** if we deny a request, you may appeal by replying to our decision or emailing privacy@strategylabai.net with "Appeal"; we will answer within 45–60 days. If your appeal is denied you may contact your state Attorney General (in Massachusetts: the Office of the Attorney General, Consumer Protection Division).

### 8.3 California notice at collection (CCPA/CPRA)

In the past 12 months we have collected these categories: identifiers (email, username, name, IP address); commercial information (portfolio and watchlist records you create; subscription and purchase records when paid plans launch); internet or network activity (usage and log data); geolocation (approximate, from IP); audio/visual (an avatar image you upload); demographic information (optional gender); and sensitive personal information (account log-in credentials). We draw no inferences used to profile you. Sources, purposes, and recipients are described in Sections 2, 3, and 6. We do not sell or share personal information as those terms are defined in California law, and we do not knowingly sell or share the information of anyone under 18. We retain each category as stated in Section 7. Under California's "Shine the Light" law, California residents may request information about disclosures of personal information to third parties for their direct marketing; we make none.

### 8.4 European Economic Area, United Kingdom, and Switzerland

The Service is directed to users in the United States. If GDPR/UK GDPR nonetheless applies to you, you have the rights of access, rectification, erasure, restriction, portability, and objection (including to processing based on legitimate interests and to direct marketing), and to withdraw consent at any time, and the right to complain to your local data-protection authority. We rely on the legal bases in Section 3. **International transfers:** we are based in the United States, and our vendors process data in the United States and other countries. Where required we use lawful transfer mechanisms such as the EU–U.S. Data Privacy Framework (where the vendor is certified) or Standard Contractual Clauses and supplementary measures.

### 8.5 Nevada

Nevada residents may submit an opt-out request regarding "sale" of covered information to privacy@strategylabai.net. We do not sell covered information.

### 8.6 Other regions

If you are in Canada, Australia, or elsewhere with rights under local law, contact us and we will handle requests per that law.

## 9. Communications and Notifications

We send (a) transactional emails (verification, password reset, receipts, security, legal); (b) service notifications (Trade Signals and other alerts you enabled), in-app, browser push, or email; and (c) marketing emails only if permitted or you opted in. We comply with the CAN-SPAM Act (accurate sender info, physical address, easy unsubscribe honored within 10 business days) and similar laws. We do not send text messages unless you separately consent.

## 10. Children

The Service is for adults 18 and older. We do not knowingly collect personal information from anyone under 18. If you believe a child has provided us information, contact privacy@strategylabai.net and we will delete it and close the account.

## 11. Security

We use reasonable administrative, technical, and physical safeguards appropriate to the sensitivity of the data, including encryption in transit (HTTPS/TLS), encryption at rest through our infrastructure providers, hashed passwords, row-level security so that each account can access only its own rows, restricted server-side keys kept out of the browser, rate limiting, secret-protected scheduled endpoints, and access controls. We maintain a written information security program consistent with Massachusetts regulation 201 CMR 17.00, which applies to any business holding Massachusetts residents' personal information. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security. Please use a strong, unique password and protect your device.

### 11.1 Data breach notice

If a breach of security involving your personal information occurs, we will notify you and regulators as required by law, including Massachusetts General Laws chapter 93H (notice to the Attorney General and the Office of Consumer Affairs and Business Regulation, and to affected residents, as soon as practicable and without unreasonable delay) and other state laws.

## 12. International Data Transfers

We and our vendors are located in or process data in the United States and possibly other countries whose privacy laws may differ from yours. By using the Service, you understand your information will be transferred to and processed in the United States. See Section 8.4 for the safeguards we apply to transfers from the EEA/UK/Switzerland.

## 13. Third-Party Links and Services

The Service may link to third-party sites (brokers, data providers, news sources). Their privacy practices are their own; review their policies. Market data is provided by third parties (Section 6).

## 14. Public Areas and Other Users

The Service currently has no public profiles, forums, or social features. If we add any, we will update this Policy, and content you post publicly may be seen by others.

## 15. Financial Privacy

We are not a bank, broker-dealer, or investment adviser and do not believe the Gramm-Leach-Bliley Act privacy rules apply to us. We nonetheless treat portfolio and holdings information you provide as confidential and use it only as described here.

## 16. Changes to This Policy

We may update this Policy. We will post the new version with a revised date, and if changes are material we will notify you by email or in the Service before they take effect, and where required obtain consent. Prior versions are available on request.

## 17. Contact and Complaints

Strategy Lab AI, Salem, Massachusetts. Email: privacy@strategylabai.net. We will try to resolve concerns quickly. You may also contact your local data protection authority or state Attorney General.
