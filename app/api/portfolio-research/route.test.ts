import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/serverAuth', () => ({ getAuthedUserId: vi.fn() }))

import { getAuthedUserId } from '@/lib/serverAuth'
import { POST } from './route'

// The auth check and per-account daily cap both run before the route ever
// reads the request body or fetches market data, so these tests don't need
// a real description/holdings payload or a mocked Yahoo Finance response —
// they're only exercising the gate itself, and a distinct x-forwarded-for
// per call avoids the pre-existing per-IP limiter interfering.
function makeReq(opts: { authed?: boolean; ip?: string } = {}) {
  const { authed = false, ip = 'unknown' } = opts
  return {
    headers: {
      get: (name: string) => {
        const k = name.toLowerCase()
        if (k === 'authorization') return authed ? 'Bearer test-token' : null
        if (k === 'x-forwarded-for') return ip
        return null
      },
    },
    json: async () => ({ description: 'growth tech', holdings: [] }),
  } as any
}

describe('/api/portfolio-research auth + cost controls', () => {
  beforeEach(() => {
    vi.mocked(getAuthedUserId).mockReset()
  })

  it('rejects a request with no logged-in session before touching market data or the AI', async () => {
    vi.mocked(getAuthedUserId).mockResolvedValue(null)
    const fetchSpy = vi.spyOn(global, 'fetch')
    const res = await POST(makeReq({ authed: false, ip: '2.2.2.2' }))
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('enforces a per-account daily cap independent of the per-IP limit', async () => {
    vi.mocked(getAuthedUserId).mockResolvedValue('portfolio-test-user')
    // Once past the auth/quota gate, the route fetches real market data —
    // stub that out so this test never makes a network call, regardless of
    // how many "allowed" iterations run below.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({}) } as any)
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeReq({ authed: true, ip: `10.1.0.${i}` }))
      // Each allowed call proceeds past the gate (to the stubbed market-data
      // fetch above, which yields no usable data) — asserting it's not
      // itself a 401/429 is enough to prove the gate let it through.
      expect([401, 429]).not.toContain(res.status)
    }
    const res31 = await POST(makeReq({ authed: true, ip: '10.1.0.199' }))
    expect(res31.status).toBe(429)
    fetchSpy.mockRestore()
  })
})
