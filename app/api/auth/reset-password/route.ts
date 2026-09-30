import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { escapeLikePattern, isValidUsername, usernameMatches } from '@/lib/username'

// Sends a password-reset email for an account identified by email OR
// username. The username → email lookup happens server-side with the
// service-role key, and the response is identical whether or not an account
// exists, so this route cannot be used to discover email addresses or to
// test which usernames/emails are registered. Note that username existence is
// separately discoverable through the is_username_available RPC the signup
// form calls — that is a known, accepted trade-off, not something this route
// is trying to hide.
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
    // Same three guards as the sign-in route: without them, identifier "%"
    // mails a working password-reset link to whichever account happens to
    // sort first, and "z%" targets one by prefix.
    if (!isValidUsername(identifier)) return NextResponse.json({ message: GENERIC_OK })
    const admin = createClient(url, serviceKey)
    const { data } = await admin.from('profiles').select('username,email').ilike('username', escapeLikePattern(identifier)).limit(1).maybeSingle()
    if (!data?.email || !usernameMatches(data.username, identifier)) return NextResponse.json({ message: GENERIC_OK })
    email = data.email
  }

  // The reset link's destination is pinned to the configured site URL rather
  // than to whichever Host this request arrived on, so a link can never be
  // built pointing at a preview deployment (or anything else that answers to
  // a Host header). Supabase's own Redirect URL allowlist is the backstop.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || req.nextUrl.origin
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await auth.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password` })
  return NextResponse.json({ message: GENERIC_OK })
}
