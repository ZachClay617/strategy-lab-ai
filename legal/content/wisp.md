# Written Information Security Program (WISP)

Strategy Lab AI — internal document. Do not publish.
Adopted: September 30, 2026 · Version 1.0 · Owner: Zach Clay (Data Security Coordinator)
Prepared to satisfy 201 CMR 17.00 (Standards for the Protection of Personal Information of Residents of the Commonwealth of Massachusetts). Review annually and after any material change to the service or a security incident.

## 1. Purpose and Scope

This program describes the administrative, technical, and physical safeguards Strategy Lab AI uses to protect personal information, as required by 201 CMR 17.00 and consistent with the Privacy Policy published at strategylabai.net/privacy. It covers all personal information handled by the service: account email addresses, hashed passwords, optional profile details, user-created financial tracking data (portfolios, holdings, watchlists, signals), legal-acceptance records, IP addresses in logs and rate-limit counters, and — when paid plans launch — billing status records.

"Personal information" under 201 CMR 17.00 (a Massachusetts resident's name combined with SSN, driver's license, or financial account number) is largely NOT collected by the service today: we do not collect government IDs, and we do not store card numbers (a payment processor will). This program nonetheless treats all account and financial-tracking data as protected.

## 2. Data Security Coordinator

The designated employee responsible for this program is Zach Clay (owner). Responsibilities: maintaining this program, reviewing it at least annually, evaluating safeguards after any incident, overseeing vendor compliance, and training anyone who is later given access to systems.

## 3. Where Data Lives (systems inventory)

- **Supabase** — authentication (passwords stored only as salted hashes by Supabase Auth) and the Postgres database holding all user data. Row level security restricts every user table to its owner; tables the browser never needs (the shared market-data auth cache) have no user grants at all.
- **Vercel** — application hosting and server logs (IP address, request metadata).
- **Upstash Redis** — short-lived rate-limit counters keyed by IP or account id.
- **Anthropic (commercial API)** — receives portfolio descriptions/holdings symbols and public company data to generate content; never receives names, emails, or passwords; API inputs/outputs are not used for training under the commercial terms.
- **GitHub** — source code and the scheduled workflow runner (holds the CRON_SECRET as an encrypted Actions secret; receives no user data).
- **Owner's computer** — development copy of the code; no production user data is stored locally. Local `.env.local` holds only the public Supabase URL/publishable key.

## 4. Technical Safeguards

- **Encryption in transit:** the site is HTTPS-only with HSTS (includeSubDomains, preload). All vendor connections (Supabase, Anthropic, Upstash) are TLS.
- **Encryption at rest:** provided by Supabase/Vercel/Upstash managed infrastructure.
- **Access control:** every database table enforces row level security scoped to the owning account. Server-only keys (service role, Anthropic, cron secret) exist solely as server environment variables, never in the browser bundle or repository. Paid AI endpoints require a verified login and per-account daily caps. Scheduled endpoints require a bearer secret compared in constant time.
- **Authentication:** passwords require 8+ characters and are hashed by Supabase Auth; username sign-in resolves privately on the server so email addresses cannot be enumerated; failed sign-ins are rate-limited per IP and return no account-existence information.
- **Application defenses:** security headers including a Content-Security-Policy restricted to the app and its database origin; input validation on all market/report parameters; size caps on AI request payloads; HTML stripped from AI output; server-verified route protection for all logged-in pages; database triggers preventing cross-user strategy references.
- **Monitoring:** Vercel/Supabase logs, cron heartbeat monitoring surfaced in the app, and `npm audit` run as part of maintenance (zero known vulnerabilities at adoption).

## 5. Administrative Safeguards

- **Least data:** the service does not ask for government IDs, brokerage credentials, or card numbers, and the Privacy Policy tells users not to submit them. Optional fields (name, username, gender) can be left blank and removed.
- **Access:** only the owner has production access (Supabase dashboard, Vercel, GitHub). Each uses a strong unique password with two-factor authentication enabled [ACTION: confirm 2FA is on for all three].
- **Personnel:** there are currently no employees or contractors with data access. Before granting any, the coordinator will: require this WISP to be read, grant the minimum role needed, and revoke access immediately on termination.
- **Vendors:** listed in Privacy Policy §6.2. The coordinator confirms each maintains appropriate safeguards (SOC 2 reports where offered) and signs data processing addenda [ACTION: sign Supabase and Vercel DPAs].
- **Records retention:** per Privacy Policy §7. User self-service export and deletion are built into the product; deletion cascades through every user table.
- **Policy consistency:** any new data field, vendor, or feature requires updating the Privacy Policy and this WISP before launch.

## 6. Physical Safeguards

All production data is in managed cloud facilities (the vendors above). The owner's devices use full-disk encryption and auto-lock [ACTION: confirm FileVault + screen lock are enabled], and no production personal data is exported to local files except transiently for support with the user's request.

## 7. Incident Response

1. **Detect & contain:** on suspicion of a breach (vendor notice, anomalous logs, user report), immediately rotate affected secrets (Supabase keys, CRON_SECRET, Anthropic key), revoke sessions if needed, and preserve logs.
2. **Assess:** identify what data, which users, and whether Massachusetts residents' personal information as defined in G.L. c. 93H was involved.
3. **Notify:** if c. 93H applies, notify the Massachusetts Attorney General and the Office of Consumer Affairs and Business Regulation, and affected residents, as soon as practicable and without unreasonable delay — notices must not describe the breach's nature in the resident notice, per c. 93H — and follow other states' laws for their residents. Privacy Policy §11.1 commits to this.
4. **Remediate & document:** fix the root cause, record the incident, the response, and any program changes in this document's revision log.

## 8. Enforcement and Review

Violations of this program by any future personnel are grounds for discipline up to termination. The coordinator reviews this program at least annually (next review: September 2027), whenever business practices change materially, and after any incident.

## Revision log

- v1.0 — September 30, 2026 — initial adoption.
