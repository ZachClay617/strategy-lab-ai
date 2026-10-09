import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

let getUser: () => Promise<unknown>
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: () => getUser() } }),
}))

const { proxy } = await import('./proxy')

const loggedIn = () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })
const loggedOut = () => Promise.resolve({ data: { user: null }, error: null })
const neverAnswers = () => new Promise(() => {})

function visit(path: string) {
  return proxy(new NextRequest(`https://example.test${path}`))
}

describe('proxy — session routing', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  })
  afterEach(() => { process.env = { ...env }; vi.useRealTimers() })

  it('sends a logged-out visitor on a protected page to /login', async () => {
    getUser = loggedOut
    const res = await visit('/home')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.test/login?next=%2Fhome')
  })

  it('sends a logged-in visitor at / to /home', async () => {
    getUser = loggedIn
    const res = await visit('/')
    expect(res.headers.get('location')).toBe('https://example.test/home')
  })

  it('lets a logged-in visitor through to a protected page', async () => {
    getUser = loggedIn
    const res = await visit('/home')
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('proxy — Supabase never answers', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    getUser = neverAnswers
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { process.env = { ...env }; vi.useRealTimers(); vi.restoreAllMocks() })

  it('answers a protected page with a 503 "try again" page instead of hanging', async () => {
    const pending = visit('/home')
    await vi.advanceTimersByTimeAsync(8000)
    const res = await pending
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.text()).toContain('Try again')
  })

  it('does not let the timeout open a protected page', async () => {
    const pending = visit('/portfolios')
    await vi.advanceTimersByTimeAsync(8000)
    const res = await pending
    expect(res.status).toBe(503)
    expect(res.headers.get('x-middleware-next')).toBeNull()
  })

  it('still loads public pages such as /login', async () => {
    const pending = visit('/login')
    await vi.advanceTimersByTimeAsync(8000)
    const res = await pending
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('waits for a slow-but-answering Supabase rather than giving up early', async () => {
    getUser = () => new Promise(resolve => setTimeout(() => resolve({ data: { user: { id: 'u1' } }, error: null }), 7000))
    const pending = visit('/')
    await vi.advanceTimersByTimeAsync(7000)
    const res = await pending
    expect(res.headers.get('location')).toBe('https://example.test/home')
  })
})
