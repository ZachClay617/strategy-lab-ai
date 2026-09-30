import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/serverAuth', () => ({ getAuthedUserId: vi.fn() }))

import { getAuthedUserId } from '@/lib/serverAuth'
import { GET } from './route'

// Owner decision (not just the AI narrative): no report data at all should
// be generated for a logged-out visitor. This proves the gate rejects
// before any Yahoo Finance fetch is attempted.
function makeReq(opts: { authed?: boolean; ip?: string; symbol?: string } = {}) {
  const { authed = false, ip = 'unknown', symbol = 'AAPL' } = opts
  const url = new URL(`https://example.test/api/company-report?symbol=${symbol}`)
  return {
    nextUrl: url,
    headers: {
      get: (name: string) => {
        const k = name.toLowerCase()
        if (k === 'authorization') return authed ? 'Bearer test-token' : null
        if (k === 'x-forwarded-for') return ip
        return null
      },
    },
  } as any
}

describe('/api/company-report requires login', () => {
  beforeEach(() => {
    vi.mocked(getAuthedUserId).mockReset()
  })

  it('rejects a logged-out request before fetching any market data', async () => {
    vi.mocked(getAuthedUserId).mockResolvedValue(null)
    const fetchSpy = vi.spyOn(global, 'fetch')
    const res = await GET(makeReq({ authed: false, ip: '3.3.3.3' }))
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
