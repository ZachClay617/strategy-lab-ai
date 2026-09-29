/** @type {import('next').NextConfig} */
// Baseline browser security headers. No route logic changes here — this only
// adds response headers, so it does not affect any page's behavior unless a
// browser actively enforces one of these policies against something the app
// does. The CSP below is intentionally permissive for inline styles/scripts
// (this app uses React inline `style={{...}}` props and Next.js's own
// hydration script) to avoid breaking existing pages — tightening it further
// with nonces/hashes is a follow-up, not done here. Validate on a real
// preview deploy (see SECURITY_REMEDIATION_PLAN.md, Batch 3) before relying
// on this in production.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
