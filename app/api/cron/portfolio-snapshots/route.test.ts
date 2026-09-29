import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

function makeReq(opts: { header?: string; query?: string; ip?: string } = {}) {
  const { header, query, ip = 'unknown' } = opts
  const url = new URL(`https://example.test/api/cron/portfolio-snapshots${query ? `?secret=${query}` : ''}`)
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

describe('/api/cron/portfolio-snapshots — header-only auth (Finding 3)', () => {
  const originalSecret = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 'test-cron-secret' })
  afterEach(() => { process.env.CRON_SECRET = originalSecret })

  it('rejects a request with the secret only in the query string', async () => {
    const res = await GET(makeReq({ query: 'test-cron-secret', ip: '5.5.5.1' }))
    expect(res.status).toBe(401)
  })

  it('rejects a request with no credential at all', async () => {
    const res = await GET(makeReq({ ip: '5.5.5.2' }))
    expect(res.status).toBe(401)
  })

  it('passes the auth check for a correct Authorization header (fails later only on missing Supabase config)', async () => {
    const res = await GET(makeReq({ header: 'Bearer test-cron-secret', ip: '5.5.5.3' }))
    expect(res.status).not.toBe(401)
  })
})
