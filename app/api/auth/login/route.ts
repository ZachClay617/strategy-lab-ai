import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

// Signs a user in with either their email or their username. Username →
// email resolution used to happen in the browser through a security-definer
// RPC that any anonymous visitor could call — which let anyone on the
// internet turn a guessed username into that user's email address. The
// lookup now happens here with the service-role key, the resolved email is
// never returned to the caller, and failures are indistinguishable from a
// wrong password so the route can't be used to enumerate accounts.
export const dynamic = 'force-dynamic'

const GENERIC_FAIL = 'Invalid login credentials.'

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('auth-login', clientIp(req), [
    { limit: 10, windowMs: 60_000, label: 'burst' },
    { limit: 40, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!rl.ok) {
    const p = rateLimitedPayload(rl, 'Too many sign-in attempts — please wait a moment and try again.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const body = await req.json().catch(() => null)
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!identifier || !password) return NextResponse.json({ error: 'Enter your email or username and your password.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 })

  let email = identifier
  if (!identifier.includes('@')) {
    if (!serviceKey) return NextResponse.json({ error: 'Username sign-in is not configured. Use your email address.' }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const { data, error } = await admin
      .from('profiles')
      .select('email')
      .ilike('username', identifier)
      .limit(1)
      .maybeSingle()
    if (error || !data?.email) return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    email = data.email
  }

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })

  // The client finishes sign-in with supabase.auth.setSession(...). The email
  // is intentionally not echoed back for username logins.
  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
}
