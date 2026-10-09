// Reads what a password-reset email link put in the /reset-password URL.
//
// The reset email is requested server-side (app/api/auth/reset-password), so
// Supabase sends an implicit-flow link: after verifying, it redirects here
// with the session in the URL hash (#access_token=…&refresh_token=…&type=recovery).
// The app's browser client (lib/supabase.ts, @supabase/ssr) is PKCE-only and
// rejects hash tokens with "Not a valid PKCE flow url", so the reset page has
// to pick them up itself. PKCE (?code=) and token-hash (?token_hash=) links are
// handled too, so changing the email template or flow later keeps working.

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

export const EXPIRED_LINK_MESSAGE = 'This reset link has expired or was already used. Request a new one from the sign-in page.'

export function readRecoveryLink(href: string): RecoveryLink {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = url.searchParams
  const get = (name: string) => hash.get(name) ?? query.get(name)

  if (get('error') || get('error_code') || get('error_description')) {
    // otp_expired covers both "expired" and "already used" (including links
    // opened once by an email provider's link scanner).
    return { kind: 'error', message: get('error_code') === 'otp_expired' ? EXPIRED_LINK_MESSAGE : (get('error_description') || EXPIRED_LINK_MESSAGE) }
  }

  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }

  const code = query.get('code')
  if (code) return { kind: 'code', code }

  const tokenHash = query.get('token_hash')
  if (tokenHash && query.get('type') === 'recovery') return { kind: 'token_hash', tokenHash }

  return { kind: 'none' }
}
