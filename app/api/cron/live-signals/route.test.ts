import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

// These routes read process.env.CRON_SECRET and (once authorized) go on to
// create a real Supabase admin client — since NEXT_PUBLIC_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are unset in this test environment, an
// authorized request naturally stops at the "not configured" 500 response
// before any network call, which is enough to prove the auth gate itself.
function makeReq(opts: { header?: string; query?: string; ip?: string } = {}) {
  const { header, query, ip = 'unknown' } = opts
  const url = new URL(`https://example.test/api/cron/live-signals${query ? `?secret=${query}` : ''}`)
  return {
    nextUrl: url,
    headers: {
      get: (name: string) => {
        const k = name.toLowerCase()
        if (k === 'authorization') return header ?? null
        if (k === 'x-forwarded-for') return ip
        return null
      },
    },
  } as any
}

describe('/api/cron/live-signals — header-only auth (Finding 3)', () => {
  const originalSecret = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 'test-cron-secret' })
  afterEach(() => { process.env.CRON_SECRET = originalSecret })

  it('rejects a request with the secret only in the query string', async () => {
    const res = await GET(makeReq({ query: 'test-cron-secret', ip: '4.4.4.1' }))
    expect(res.status).toBe(401)
  })

  it('rejects a request with no credential at all', async () => {
    const res = await GET(makeReq({ ip: '4.4.4.2' }))
    expect(res.status).toBe(401)
  })

  it('passes the auth check for a correct Authorization header (fails later only on missing Supabase config)', async () => {
    const res = await GET(makeReq({ header: 'Bearer test-cron-secret', ip: '4.4.4.3' }))
    expect(res.status).not.toBe(401)
  })
})
