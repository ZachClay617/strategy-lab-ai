import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

// Sends a password-reset email for an account identified by email OR
// username. The username → email lookup happens server-side with the
// service-role key, and the response is identical whether or not an account
// exists, so this route cannot be used to discover email addresses or to
// test which usernames/emails are registered.
export const dynamic = 'force-dynamic'

const GENERIC_OK = 'If an account exists for that email or username, a password reset link has been sent.'

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('auth-reset', clientIp(req), [
    { limit: 5, windowMs: 60_000, label: 'burst' },
    { limit: 15, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!rl.ok) {
    const p = rateLimitedPayload(rl, 'Too many reset requests — please wait a moment and try again.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const body = await req.json().catch(() => null)
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
  if (!identifier) return NextResponse.json({ error: 'Enter your email or username first.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 })

  let email = identifier
  if (!identifier.includes('@')) {
    if (!serviceKey) return NextResponse.json({ message: GENERIC_OK })
    const admin = createClient(url, serviceKey)
    const { data } = await admin.from('profiles').select('email').ilike('username', identifier).limit(1).maybeSingle()
    if (!data?.email) return NextResponse.json({ message: GENERIC_OK })
    email = data.email
  }

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await auth.auth.resetPasswordForEmail(email, { redirectTo: `${req.nextUrl.origin}/reset-password` })
  return NextResponse.json({ message: GENERIC_OK })
}
