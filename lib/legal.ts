// Single source of truth for the published legal documents' version metadata.
// The markdown sources live in legal/content/*.md and are rendered at
// /terms, /privacy, /disclaimer and /refunds. When any document materially
// changes, bump LEGAL_VERSION (and the dates inside the markdown) so new
// signups record acceptance of the new version.
export const LEGAL_VERSION = '1.0'
export const LEGAL_EFFECTIVE_DATE = 'September 30, 2026'

export const LEGAL_DOCS = [
  { slug: 'terms', file: 'terms.md', title: 'Terms of Service' },
  { slug: 'privacy', file: 'privacy.md', title: 'Privacy Policy' },
  { slug: 'disclaimer', file: 'disclaimer.md', title: 'Investment and Trading Disclaimer' },
  { slug: 'refunds', file: 'refunds.md', title: 'Refund and Cancellation Policy' },
] as const

// Short-form notices from Disclaimer §16, shown next to the features they
// describe. Keep the wording in sync with legal/content/disclaimer.md.
export const NOTICE_BACKTEST =
  'Simulated results using fictional capital. Not real trading. Hypothetical results have inherent limitations, do not reflect actual trading, and are not indicative of future results. Costs, slippage, and taxes may not be fully reflected.'
export const NOTICE_SIGNALS =
  'Automated signal, not a recommendation. We do not know your finances or place trades. Prices may be delayed and signals may be late or missed. You decide and are responsible for any trade.'
export const NOTICE_AI_PORTFOLIO =
  'AI-generated example for education. Not personalized advice and not a recommendation to buy or sell. AI can be wrong. Verify independently and consult a licensed professional.'
export const NOTICE_COMPANY_REPORT =
  'Automated summary of public data with AI-written commentary that may be inaccurate or speculative. Not investment advice. Data may be delayed or incorrect. Verify with official filings.'
export const FOOTER_DISCLAIMER =
  'Strategy Lab AI provides general information and software tools for educational purposes only. It is not investment, tax, or legal advice, and not an offer to buy or sell any security. We are not a registered investment adviser or broker-dealer. Hypothetical and backtested results have limitations and do not guarantee future results. Trading involves risk of loss. You are solely responsible for your own decisions.'
export const SIGNUP_CONSENT_TEXT =
  'I am at least 18. I have read and agree to the Terms of Service, Privacy Policy, and Investment and Trading Disclaimer, and I understand that Strategy Lab AI does not give personalized investment advice and that I am solely responsible for my own trading decisions.'
