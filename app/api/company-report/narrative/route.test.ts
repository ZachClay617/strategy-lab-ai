import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/serverAuth', () => ({ getAuthedUserId: vi.fn() }))

import { getAuthedUserId } from '@/lib/serverAuth'
import { POST } from './route'

const fakeBundle = {
  overview: { name: 'Test Co', businessSummary: 'Not publicly reported' },
  competitors: [{ revenueGrowth: null, netMargin: null, grossMargin: null }],
  catalysts: { numberOfAnalysts: null, analystTargetMean: null, nextEarningsDate: 'Not publicly reported' },
  technicals: { trend: 'Unavailable' },
}

// A distinct x-forwarded-for per call keeps the existing per-IP rate limit
// from interfering — this test suite is specifically exercising the new
// auth check and per-account daily cap, not the pre-existing IP limiter.
function makeReq(opts: { authed?: boolean; ip?: string; body?: any } = {}) {
  const { authed = false, ip = 'unknown', body = fakeBundle } = opts
  return {
    headers: {
      get: (name: string) => {
        const k = name.toLowerCase()
        if (k === 'authorization') return authed ? 'Bearer test-token' : null
        if (k === 'x-forwarded-for') return ip
        return null
      },
    },
    json: async () => body,
  } as any
}

describe('/api/company-report/narrative auth + cost controls', () => {
  beforeEach(() => {
    vi.mocked(getAuthedUserId).mockReset()
    delete process.env.ANTHROPIC_API_KEY // forces the no-network template fallback path
  })

  it('rejects a request with no logged-in session before calling the AI', async () => {
    vi.mocked(getAuthedUserId).mockResolvedValue(null)
    const fetchSpy = vi.spyOn(global, 'fetch')
    const res = await POST(makeReq({ authed: false, ip: '1.1.1.1' }))
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('allows a logged-in user up to the daily cap, then rejects further calls that same day', async () => {
    vi.mocked(getAuthedUserId).mockResolvedValue('narrative-test-user')
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeReq({ authed: true, ip: `10.0.0.${i}` }))
      expect(res.status).toBe(200)
    }
    const res11 = await POST(makeReq({ authed: true, ip: '10.0.0.99' }))
    expect(res11.status).toBe(429)
  })
})
