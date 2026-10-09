import { describe, it, expect } from 'vitest'
import { readRecoveryLink, EXPIRED_LINK_MESSAGE } from './recoveryLink'

const base = 'https://strategylabai.net/reset-password'

describe('readRecoveryLink', () => {
  it('picks up the session Supabase puts in the hash of an implicit-flow reset link', () => {
    expect(readRecoveryLink(`${base}#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery`))
      .toEqual({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt' })
  })

  it('reports an expired or already-used link in plain language', () => {
    expect(readRecoveryLink(`${base}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`))
      .toEqual({ kind: 'error', message: EXPIRED_LINK_MESSAGE })
  })

  it('passes through other Supabase error descriptions', () => {
    expect(readRecoveryLink(`${base}?error=server_error&error_description=Something+else`))
      .toEqual({ kind: 'error', message: 'Something else' })
  })

  it('handles PKCE (?code=) links', () => {
    expect(readRecoveryLink(`${base}?code=abc`)).toEqual({ kind: 'code', code: 'abc' })
  })

  it('handles token-hash links', () => {
    expect(readRecoveryLink(`${base}?token_hash=th&type=recovery`)).toEqual({ kind: 'token_hash', tokenHash: 'th' })
  })

  it('ignores a token hash for a different link type', () => {
    expect(readRecoveryLink(`${base}?token_hash=th&type=signup`)).toEqual({ kind: 'none' })
  })

  it('returns none when the page was opened without a link', () => {
    expect(readRecoveryLink(base)).toEqual({ kind: 'none' })
    expect(readRecoveryLink(`${base}#access_token=only-half`)).toEqual({ kind: 'none' })
  })
})
