import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

// Verifies the caller is a logged-in Supabase user by checking the bearer
// access token they send, using the same public anon/publishable key the
// browser already uses — never the service-role key — so this can only
// confirm "this token belongs to a real logged-in user," never bypass RLS
// or act on anyone's behalf.
export async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// Same check, but reading the session out of the request's cookies instead of
// an Authorization header. Pages fetch some routes (e.g. /api/market) with a
// plain same-origin fetch that carries cookies but no bearer token; this lets
// those routes require a logged-in user without every call site having to be
// rewritten to attach a token.
//
// Read-only on purpose: setAll is a no-op because the middleware in proxy.ts
// owns refreshing and re-issuing the session cookies. As in proxy.ts this uses
// getUser(), which revalidates the token against Supabase rather than trusting
// a cookie that could be stale or forged, and the publishable key, never the
// service-role key.
export async function getCookieUserId(req: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const client = createServerClient(url, key, {
    cookies: {
      getAll() { return req.cookies.getAll() },
      setAll() { /* read-only */ },
    },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

// Accepts either form of proof, bearer token first (cheaper: no cookie jar to
// parse) and falling back to the session cookie.
export async function getRequestUserId(req: NextRequest): Promise<string | null> {
  return (await getAuthedUserId(req)) ?? (await getCookieUserId(req))
}
